"""WebSocket consumers for live order tracking, chat, and agent location.

All consumers authenticate via the `JWTAuthMiddleware` (see auth.py) — they
expect `scope['user']` to be set by the middleware. Anonymous users are closed
with code 4401 (custom: "auth required").
"""
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.orders.models import Order

ORDER_GROUP = 'order_{order_id}'
CHAT_GROUP = 'chat_{order_id}'


def _order_group(order_id) -> str:
    return ORDER_GROUP.format(order_id=order_id)


def _chat_group(order_id) -> str:
    return CHAT_GROUP.format(order_id=order_id)


# --- Order tracking ----------------------------------------------------------

class OrderTrackingConsumer(AsyncJsonWebsocketConsumer):
    """`/ws/orders/{order_id}/` — live status + agent location.

    Payloads are role-filtered before being sent to the client:
    - customer:   agent location, status, ETA — no pharmacy info
    - pharmacy:   agent distance/ETA only
    - agent:      full payload
    - admin/staff: full payload
    """

    async def connect(self):
        user = self.scope['user']
        if not user.is_authenticated:
            await self.close(code=4401)
            return

        self.order_id = int(self.scope['url_route']['kwargs']['order_id'])
        order = await self._authorize(user, self.order_id)
        if order is None:
            await self.close(code=4403)
            return

        self.order = order
        self.role = self._resolve_role(user, order)
        self.group = _order_group(self.order_id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({
            'type': 'connected',
            'order_id': self.order_id,
            'role': self.role,
        })

    async def disconnect(self, code):
        if hasattr(self, 'group'):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    @database_sync_to_async
    def _authorize(self, user, order_id):
        try:
            order = Order.objects.select_related('pharmacy').get(pk=order_id)
        except Order.DoesNotExist:
            return None
        if user.is_staff:
            return order
        if order.customer_id == user.id:
            return order
        if order.delivery_agent_id == user.id:
            return order
        if order.pharmacy and order.pharmacy.owner_id == user.id:
            return order
        return None

    @staticmethod
    def _resolve_role(user, order) -> str:
        if user.is_staff:
            return 'admin'
        if order.customer_id == user.id:
            return 'customer'
        if order.delivery_agent_id == user.id:
            return 'agent'
        return 'pharmacy'

    # --- Group event handlers (called by broadcast service) ---

    async def order_status_change(self, event):
        await self.send_json({
            'type': 'status_change',
            'order_id': self.order_id,
            'status': event['status'],
        })

    async def location_update(self, event):
        payload = dict(event['payload'])
        if self.role == 'customer':
            payload.pop('pharmacy_address', None)
            payload.pop('pharmacy_phone', None)
        elif self.role == 'pharmacy':
            payload = {
                'distance_to_customer_m': payload.get('distance_to_customer_m'),
                'eta_minutes': payload.get('eta_minutes'),
            }
        await self.send_json({'type': 'location_update', **payload})


# --- Order chat --------------------------------------------------------------

class OrderChatConsumer(AsyncJsonWebsocketConsumer):
    """`/ws/orders/{order_id}/chat/` — customer ↔ agent only.

    Messages are persisted to `ChatMessage` and rebroadcast to the group so
    every connected participant sees them. The HTTP fallback for history lives
    at `/api/orders/{id}/messages/`.
    """

    async def connect(self):
        user = self.scope['user']
        if not user.is_authenticated:
            await self.close(code=4401)
            return

        self.order_id = int(self.scope['url_route']['kwargs']['order_id'])
        order = await self._authorize(user, self.order_id)
        if order is None:
            await self.close(code=4403)
            return

        self.group = _chat_group(self.order_id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, 'group'):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    @database_sync_to_async
    def _authorize(self, user, order_id):
        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist:
            return None
        # Chat is customer ↔ agent only. Pharmacy + admin can lurk if they need
        # support context (they're already authorised on the order itself).
        if order.customer_id == user.id or order.delivery_agent_id == user.id:
            return order
        if user.is_staff:
            return order
        return None

    @database_sync_to_async
    def _persist(self, sender_id: int, content: str):
        from apps.orders.models import ChatMessage
        msg = ChatMessage.objects.create(
            order_id=self.order_id, sender_id=sender_id, content=content,
        )
        return {
            'id': msg.id,
            'order_id': self.order_id,
            'sender_id': sender_id,
            'content': content,
            'created_at': msg.created_at.isoformat(),
        }

    async def receive_json(self, content, **kwargs):
        text = (content or {}).get('content', '').strip()
        if not text:
            return
        payload = await self._persist(self.scope['user'].id, text[:2000])
        await self.channel_layer.group_send(self.group, {
            'type': 'chat_message', 'payload': payload,
        })

    async def chat_message(self, event):
        await self.send_json({'type': 'message', **event['payload']})


# --- Agent location push -----------------------------------------------------

class AgentLocationConsumer(AsyncJsonWebsocketConsumer):
    """`/ws/delivery/location/` — agent pushes their current location.

    Updates `DeliveryAgentProfile.current_location` and broadcasts to the group
    of any active order assigned to this agent. Expected client payload every
    10–15s: `{"latitude": float, "longitude": float}`.
    """

    async def connect(self):
        user = self.scope['user']
        if not user.is_authenticated or not user.is_delivery:
            await self.close(code=4403)
            return
        await self.accept()

    async def receive_json(self, content, **kwargs):
        try:
            lat = float(content['latitude'])
            lng = float(content['longitude'])
        except (KeyError, TypeError, ValueError):
            await self.send_json({'type': 'error', 'message': 'invalid payload'})
            return
        active_order_payload = await self._update_location_and_lookup_active(
            self.scope['user'].id, lat, lng,
        )
        if active_order_payload is not None:
            await self.channel_layer.group_send(
                _order_group(active_order_payload['order_id']),
                {'type': 'location_update', 'payload': active_order_payload},
            )
        await self.send_json({'type': 'ack'})

    @database_sync_to_async
    def _update_location_and_lookup_active(self, user_id: int, lat: float, lng: float):
        from apps.delivery.models import DeliveryAgentProfile
        from apps.orders.constants import OrderStatus
        from apps.search.services.eta import estimate_eta_minutes

        profile, _ = DeliveryAgentProfile.objects.get_or_create(user_id=user_id)
        profile.current_location = Point(lng, lat, srid=4326)
        profile.location_updated_at = timezone.now()
        profile.is_online = True
        profile.save(update_fields=(
            'current_location', 'location_updated_at', 'is_online', 'updated_at',
        ))

        active = (
            Order.objects
            .filter(
                delivery_agent_id=user_id,
                status__in=(
                    OrderStatus.AWAITING_AGENT,
                    OrderStatus.PICKED_UP,
                    OrderStatus.OUT_FOR_DELIVERY,
                ),
            )
            .annotate(distance=Distance('delivery_location', profile.current_location))
            .first()
        )
        if active is None:
            return None
        distance_m = round(active.distance.m)
        return {
            'order_id': active.id,
            'agent_latitude': lat,
            'agent_longitude': lng,
            'distance_to_customer_m': distance_m,
            'eta_minutes': estimate_eta_minutes(distance_m),
            'status': active.status,
        }
