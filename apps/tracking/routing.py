from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r'^ws/orders/(?P<order_id>\d+)/$',
        consumers.OrderTrackingConsumer.as_asgi(),
    ),
    re_path(
        r'^ws/orders/(?P<order_id>\d+)/chat/$',
        consumers.OrderChatConsumer.as_asgi(),
    ),
    re_path(
        r'^ws/delivery/location/$',
        consumers.AgentLocationConsumer.as_asgi(),
    ),
]
