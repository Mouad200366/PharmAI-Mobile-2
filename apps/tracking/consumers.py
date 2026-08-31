"""WebSocket consumers for live order tracking, chat, and delivery events.

All consumers authenticate via the JWTAuthMiddleware (see auth.py). They expect
scope["user"] to be populated by the middleware.
"""

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.utils import timezone

from apps.orders.models import Order


ORDER_GROUP = 'order_{order_id}'
CHAT_GROUP = 'chat_{order_id}'
DELIVERY_EVENTS_GROUP = 'delivery_events_{user_id}'


def _order_group(order_id) -> str:
    return ORDER_GROUP.format(order_id=order_id)


def _chat_group(order_id) -> str:
    return CHAT_GROUP.format(order_id=order_id)


def _delivery_events_group(user_id) -> str:
    return DELIVERY_EVENTS_GROUP.format(user_id=user_id)


# --- Delivery agent events ---------------------------------------------------

class DeliveryEventsConsumer(AsyncJsonWebsocketConsumer):
    """`/ws/delivery/events/` — lightweight delivery-agent event stream.

    This socket intentionally sends only small event notifications. The mobile
    client must refetch the authoritative state through REST after receiving an
    event.

    Examples:
    - offer_available  -> refetch /delivery/offers/current/
    - offer_expired    -> refetch /delivery/offers/current/
    - offer_cancelled  -> refetch /delivery/offers/current/
    - assignment_updated -> refetch the active order
    """

    async def connect(self):
        user = self.scope['user']

        if not user.is_authenticated:
            await self.close(code=4401)
            return

        if not user.is_delivery:
            await self.close(code=4403)
            return

        self.group = _delivery_events_group(user.id)
        await self.channel_layer.group_add(
            self.group,
            self.channel_name,
        )
        await self.accept()

        await self.send_json({
            'type': 'connected',
        })

    async def disconnect(self, code):
        if hasattr(self, 'group'):
            await self.channel_layer.group_discard(
                self.group,
                self.channel_name,
            )

    async def delivery_offer_available(self, event):
        await self.send_json({
            'type': 'offer_available',
            'offer_id': event['offer_id'],
        })

    async def delivery_offer_expired(self, event):
        await self.send_json({
            'type': 'offer_expired',
            'offer_id': event['offer_id'],
        })

    async def delivery_offer_cancelled(self, event):
        await self.send_json({
            'type': 'offer_cancelled',
            'offer_id': event['offer_id'],
        })

    async def delivery_assignment_updated(self, event):
        await self.send_json({
            'type': 'assignment_updated',
            'order_id': event['order_id'],
        })


# --- Order tracking ----------------------------------------------------------

class OrderTrackingConsumer(AsyncJsonWebsocketConsumer):
    """`/ws/orders/{order_id}/` — live status + agent location.

    Payloads are role-filtered before being sent to the client:
    - customer: agent location, status, ETA — no pharmacy info
    - pharmacy: agent distance/ETA only
    - agent: full payload
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

        initial_location = await self._current_location_payload()
        if initial_location is not None:
            await self.location_update({
                'payload': initial_location,
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

    @database_sync_to_async
    def _current_location_payload(self):
        from apps.delivery.models import DeliveryAgentProfile
        from apps.orders.constants import OrderStatus
        from apps.search.services.eta import estimate_eta_minutes

        order = (
            Order.objects
            .filter(
                pk=self.order_id,
                delivery_location__isnull=False,
                status__in=(
                    OrderStatus.AWAITING_AGENT,
                    OrderStatus.PICKED_UP,
                    OrderStatus.OUT_FOR_DELIVERY,
                ),
            )
            .first()
        )

        if order is None or order.delivery_agent_id is None:
            return None

        profile = (
            DeliveryAgentProfile.objects
            .filter(user_id=order.delivery_agent_id)
            .first()
        )

        if profile is None or not profile.has_fresh_location():
            return None

        tracked_order = (
            Order.objects
            .filter(pk=order.id)
            .annotate(
                distance=Distance(
                    'delivery_location',
                    profile.current_location,
                ),
            )
            .first()
        )

        if tracked_order is None or tracked_order.distance is None:
            return None

        distance_m = round(tracked_order.distance.m)

        return {
            'order_id': tracked_order.id,
            'agent_latitude': profile.current_location.y,
            'agent_longitude': profile.current_location.x,
            'distance_to_customer_m': distance_m,
            'eta_minutes': estimate_eta_minutes(distance_m),
            'status': tracked_order.status,
            'location_updated_at': (
                profile.location_updated_at.isoformat()
                if profile.location_updated_at
                else None
            ),
        }

    @staticmethod
    def _resolve_role(user, order) -> str:
        if user.is_staff:
            return 'admin'
        if order.customer_id == user.id:
            return 'customer'
        if order.delivery_agent_id == user.id:
            return 'agent'
        return 'pharmacy'

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

        await self.send_json({
            'type': 'location_update',
            **payload,
        })


# --- Order chat --------------------------------------------------------------

class OrderChatConsumer(AsyncJsonWebsocketConsumer):
    """`/ws/orders/{order_id}/chat/` — customer ↔ agent only."""

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

        if order.customer_id == user.id or order.delivery_agent_id == user.id:
            return order
        if user.is_staff:
            return order
        return None

    @database_sync_to_async
    def _persist(self, sender_id: int, content: str):
        from apps.orders.models import ChatMessage

        msg = ChatMessage.objects.create(
            order_id=self.order_id,
            sender_id=sender_id,
            content=content,
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

        payload = await self._persist(
            self.scope['user'].id,
            text[:2000],
        )

        await self.channel_layer.group_send(
            self.group,
            {
                'type': 'chat_message',
                'payload': payload,
            },
        )

    async def chat_message(self, event):
        await self.send_json({
            'type': 'message',
            **event['payload'],
        })


# --- Agent location push -----------------------------------------------------

class AgentLocationConsumer(AsyncJsonWebsocketConsumer):
    """`/ws/delivery/location/` — agent pushes their current location."""

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
            await self.send_json({
                'type': 'error',
                'message': 'invalid payload',
            })
            return

        active_order_payload = await self._update_location_and_lookup_active(
            self.scope['user'].id,
            lat,
            lng,
        )

        if active_order_payload is not None:
            await self.channel_layer.group_send(
                _order_group(active_order_payload['order_id']),
                {
                    'type': 'location_update',
                    'payload': active_order_payload,
                },
            )

        await self.send_json({
            'type': 'ack',
        })

    @database_sync_to_async
    def _update_location_and_lookup_active(
        self,
        user_id: int,
        lat: float,
        lng: float,
    ):
        from apps.delivery.models import DeliveryAgentProfile
        from apps.orders.constants import OrderStatus
        from apps.search.services.eta import estimate_eta_minutes

        profile, _ = DeliveryAgentProfile.objects.get_or_create(
            user_id=user_id,
        )
        profile.current_location = Point(lng, lat, srid=4326)
        profile.location_updated_at = timezone.now()
        profile.save(
            update_fields=(
                'current_location',
                'location_updated_at',
                'updated_at',
            )
        )

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
            .annotate(
                distance=Distance(
                    'delivery_location',
                    profile.current_location,
                )
            )
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