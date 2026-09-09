from django.urls import path

from . import views

from apps.delivery.incident_control_views import (
    DeliveryIncidentFinalizeReturnView,
    DeliveryIncidentIssueReturnVerificationView,
    DeliveryIncidentReleasePrePickupView,
    DeliveryIncidentRequireReturnView,
    DeliveryIncidentResolveContinueView,
)

from apps.delivery.incident_views import (
    CurrentDeliveryIncidentView,
    DeliveryIncidentReportView,
    DeliveryIncidentReturnVerifyView,
    DeliveryIncidentStartReturnView,
)

from apps.delivery.financial_views import (
    CashSettlementHistoryView,
    CashSummaryView,
    EarningsHistoryView,
    EarningsSummaryView,
)



from apps.delivery.application_review_views import (
    DeliveryApplicationApproveView,
    DeliveryApplicationDetailView,
    DeliveryApplicationPendingListView,
    DeliveryApplicationRejectView,
)

urlpatterns = [
    path(
        'applications/me/',
        views.DeliveryApplicationMeView.as_view(),
        name='delivery-application-me',
    ),
    path(
        'applications/pending/',
        DeliveryApplicationPendingListView.as_view(),
        name='delivery-application-pending-list',
    ),
    path(
        'applications/<int:application_id>/',
        DeliveryApplicationDetailView.as_view(),
        name='delivery-application-detail',
    ),
    path(
        'applications/<int:application_id>/approve/',
        DeliveryApplicationApproveView.as_view(),
        name='delivery-application-approve',
    ),
    path(
        'applications/<int:application_id>/reject/',
        DeliveryApplicationRejectView.as_view(),
        name='delivery-application-reject',
    ),
    path('me/', views.MeView.as_view(), name='delivery-me'),
    path('online/', views.OnlineView.as_view(), name='delivery-online'),
    path('location/', views.LocationView.as_view(), name='delivery-location'),
    path(
        'offers/current/',
        views.CurrentOfferView.as_view(),
        name='delivery-offer-current',
    ),
    path(
        'offers/<int:offer_id>/accept/',
        views.OfferAcceptView.as_view(),
        name='delivery-offer-accept',
    ),
    path(
        'offers/<int:offer_id>/decline/',
        views.OfferDeclineView.as_view(),
        name='delivery-offer-decline',
    ),

    path(
        'orders/<int:order_id>/delivery-pin/issue/',
        views.PatientDeliveryPinIssueView.as_view(),
        name='delivery-pin-issue',
    ),

    path(
        'earnings/summary/',
        EarningsSummaryView.as_view(),
        name='delivery-earnings-summary',
    ),
    path(
        'earnings/history/',
        EarningsHistoryView.as_view(),
        name='delivery-earnings-history',
    ),
    path(
        'cash/summary/',
        CashSummaryView.as_view(),
        name='delivery-cash-summary',
    ),
    path(
        'cash/settlements/',
        CashSettlementHistoryView.as_view(),
        name='delivery-cash-settlements',
    ),

    path(
        'orders/<int:order_id>/incidents/report/',
        DeliveryIncidentReportView.as_view(),
        name='delivery-incident-report',
    ),
    path(
        'orders/<int:order_id>/incidents/current/',
        CurrentDeliveryIncidentView.as_view(),
        name='delivery-incident-current',
    ),
    path(
        'incidents/<int:incident_id>/return/start/',
        DeliveryIncidentStartReturnView.as_view(),
        name='delivery-incident-return-start',
    ),
    path(
        'incidents/<int:incident_id>/return/verify/',
        DeliveryIncidentReturnVerifyView.as_view(),
        name='delivery-incident-return-verify',
    ),

    path(
        'incidents/<int:incident_id>/resolve-continue/',
        DeliveryIncidentResolveContinueView.as_view(),
        name='delivery-incident-resolve-continue',
    ),
    path(
        'incidents/<int:incident_id>/require-return/',
        DeliveryIncidentRequireReturnView.as_view(),
        name='delivery-incident-require-return',
    ),
    path(
        'incidents/<int:incident_id>/release-pre-pickup/',
        DeliveryIncidentReleasePrePickupView.as_view(),
        name='delivery-incident-release-pre-pickup',
    ),
    path(
        'incidents/<int:incident_id>/return-verification/issue/',
        DeliveryIncidentIssueReturnVerificationView.as_view(),
        name='delivery-incident-return-verification-issue',
    ),
    path(
        'incidents/<int:incident_id>/finalize-return/',
        DeliveryIncidentFinalizeReturnView.as_view(),
        name='delivery-incident-finalize-return',
    ),
    path(
    'active-count/',
    views.ActiveDeliveryAgentsCountView.as_view(),
    name='delivery-active-count',
),

]