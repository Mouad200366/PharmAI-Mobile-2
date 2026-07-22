from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def healthz(request):
    """Liveness/readiness probe.

    Checks DB connectivity. Returns 200 OK on success, 503 with the error
    message on any failure. Designed for k8s probes / load balancer health
    checks — keep this fast and side-effect-free.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except Exception as exc:  # noqa: BLE001 — health check surfaces any failure
        return JsonResponse({'ok': False, 'error': str(exc)}, status=503)
    return JsonResponse({'ok': True})
