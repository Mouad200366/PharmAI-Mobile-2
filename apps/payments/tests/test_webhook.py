"""Tests for the Stripe webhook dispatcher.

The dispatcher itself is signature-agnostic (signature verification happens
in the view); these tests just verify idempotency and the success/failure
state transitions.
"""
import pytest

from apps.orders.constants import OrderStatus, PaymentMethod, PrescriptionMode
from apps.orders.services.place_order import place_order
from apps.payments.constants import PaymentStatus
from apps.payments.models import ProcessedStripeEvent
from apps.payments.services.webhook import handle_stripe_event

pytestmark = pytest.mark.django_db


def _make_card_order(patient, stock):
    return place_order(
        customer=patient,
        items=[{'medicine': stock.medicine_id, 'quantity': 1}],
        delivery_address='X', latitude=33.5731, longitude=-7.5898,
        prescription_mode=PrescriptionMode.NONE,
        payment_method=PaymentMethod.CARD,
    )


def _intent_event(*, event_id: str, intent_id: str, type_: str):
    return {
        'id': event_id,
        'type': type_,
        'data': {'object': {'id': intent_id}},
    }


def test_succeeded_marks_paid_and_advances_order(patient, pharmacy, stock):
    order = _make_card_order(patient, stock)
    order.payment.provider_payment_id = 'pi_test_succeeded'
    order.payment.status = PaymentStatus.PROCESSING
    order.payment.save()

    event = _intent_event(
        event_id='evt_succ_1',
        intent_id='pi_test_succeeded',
        type_='payment_intent.succeeded',
    )
    processed = handle_stripe_event(event)
    assert processed is True

    order.refresh_from_db()
    assert order.payment.status == PaymentStatus.PAID
    assert order.payment.paid_at is not None
    # Order auto-advances out of PENDING_PAYMENT.
    assert order.status == OrderStatus.ACCEPTED


def test_failed_cancels_order_and_refunds_stock(patient, pharmacy, stock):
    initial_qty = stock.quantity
    order = _make_card_order(patient, stock)
    order.payment.provider_payment_id = 'pi_test_failed'
    order.payment.save()

    stock.refresh_from_db()
    assert stock.quantity == initial_qty - 1

    event = _intent_event(
        event_id='evt_fail_1',
        intent_id='pi_test_failed',
        type_='payment_intent.payment_failed',
    )
    handle_stripe_event(event)

    order.refresh_from_db()
    stock.refresh_from_db()
    assert order.status == OrderStatus.CANCELLED
    assert order.payment.status == PaymentStatus.FAILED
    assert stock.quantity == initial_qty  # restored


def test_idempotency_dedupes_duplicate_event_ids(patient, pharmacy, stock):
    """Stripe retries on 5xx — same event ID must not be processed twice."""
    order = _make_card_order(patient, stock)
    order.payment.provider_payment_id = 'pi_test_dedup'
    order.payment.save()

    event = _intent_event(
        event_id='evt_dedup_1',
        intent_id='pi_test_dedup',
        type_='payment_intent.succeeded',
    )

    first = handle_stripe_event(event)
    second = handle_stripe_event(event)

    assert first is True
    assert second is False  # short-circuit on duplicate
    assert ProcessedStripeEvent.objects.filter(event_id='evt_dedup_1').count() == 1


def test_unknown_event_type_is_ignored_but_logged_as_processed(patient):
    """Stripe sends many event types we don't care about — must not crash."""
    event = _intent_event(
        event_id='evt_unknown_1',
        intent_id='pi_x',
        type_='customer.created',
    )
    assert handle_stripe_event(event) is True
    assert ProcessedStripeEvent.objects.filter(event_id='evt_unknown_1').exists()


def test_succeeded_for_unknown_intent_does_not_crash(patient):
    """If the PaymentIntent ID isn't in our DB, swallow gracefully."""
    event = _intent_event(
        event_id='evt_no_match',
        intent_id='pi_nonexistent',
        type_='payment_intent.succeeded',
    )
    # Should not raise.
    assert handle_stripe_event(event) is True
