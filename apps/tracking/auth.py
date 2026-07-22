"""JWT auth for websocket connections.

Browsers can't easily set headers on `WebSocket()` constructions, so the
standard pattern is `?token=<access_jwt>` in the query string. This middleware
decodes that, looks up the user, and assigns `scope['user']` before the
consumer runs.
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import UntypedToken


@database_sync_to_async
def _user_from_token(token: str):
    from apps.users.models import User

    try:
        validated = UntypedToken(token)
    except (InvalidToken, TokenError):
        return AnonymousUser()
    user_id = validated.get('user_id')
    if not user_id:
        return AnonymousUser()
    try:
        return User.objects.get(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        token = None
        query_string = scope.get('query_string', b'').decode()
        if query_string:
            params = parse_qs(query_string)
            token_list = params.get('token') or []
            if token_list:
                token = token_list[0]
        scope['user'] = await _user_from_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    """Convenience wrapper analogous to channels.auth.AuthMiddlewareStack."""
    return JWTAuthMiddleware(inner)
