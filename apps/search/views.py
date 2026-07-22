from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .serializers import MedicineSearchQuerySerializer
from .services.medicine_search import search_medicines_near


class MedicineSearchView(APIView):
    """GET /api/search/?q=&lat=&lng=&radius=&limit="""

    permission_classes = (permissions.AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = 'search'

    def get(self, request):
        params = MedicineSearchQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        data = params.validated_data
        results = search_medicines_near(
            query=data['q'],
            latitude=data['lat'],
            longitude=data['lng'],
            radius_m=data.get('radius', 5000),
            limit=data.get('limit', 50),
            open_now=data.get('open_now', False),
            night_only=data.get('night_only', False),
        )
        return Response({'results': results})
