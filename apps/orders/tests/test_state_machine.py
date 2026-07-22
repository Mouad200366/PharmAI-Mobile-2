"""Pure-Python unit tests for the order state machine. No DB required."""
from types import SimpleNamespace

import pytest
from rest_framework.exceptions import ValidationError

from apps.orders.constants import OrderStatus
from apps.orders.services.state_machine import (
    ACTIVE_AGENT_STATUSES,
    TRANSITIONS,
    can_transition,
    transition,
)


def _fake_order(status):
    """Lightweight stand-in for an Order — state_machine only needs `.status`
    and `.save()`. Avoids DB setup for pure-logic tests."""
    saved = []
    obj = SimpleNamespace(status=status, save=lambda **kwargs: saved.append(kwargs))
    obj._saved = saved
    return obj


# --- TRANSITIONS table integrity ---------------------------------------------

def test_every_status_appears_in_transitions_table():
    """Each declared OrderStatus must have an entry — even terminal ones (empty set)."""
    table_keys = set(TRANSITIONS.keys())
    declared = {s.value for s in OrderStatus}
    assert declared.issubset(table_keys), (
        f'Missing from TRANSITIONS: {declared - table_keys}'
    )


def test_terminal_statuses_have_no_outbound_transitions():
    for terminal in (
        OrderStatus.DELIVERED, OrderStatus.REJECTED,
        OrderStatus.CANCELLED, OrderStatus.FAILED,
    ):
        assert TRANSITIONS[terminal] == set(), (
            f'{terminal} should be terminal; got {TRANSITIONS[terminal]}'
        )


def test_active_agent_statuses_constant_matches_state_machine():
    """Defensive: if someone changes ACTIVE_AGENT_STATUSES the busy-agent
    detection in agent_selection breaks silently. Keep them in sync."""
    expected = (
        OrderStatus.AWAITING_AGENT,
        OrderStatus.PICKED_UP,
        OrderStatus.OUT_FOR_DELIVERY,
    )
    assert ACTIVE_AGENT_STATUSES == expected


# --- can_transition / transition -------------------------------------------

def test_can_transition_returns_true_for_legal_move():
    order = _fake_order(OrderStatus.PENDING_REVIEW)
    assert can_transition(order, OrderStatus.ACCEPTED)
    assert can_transition(order, OrderStatus.REJECTED)


def test_can_transition_returns_false_for_illegal_move():
    order = _fake_order(OrderStatus.PENDING_REVIEW)
    assert not can_transition(order, OrderStatus.DELIVERED)
    assert not can_transition(order, OrderStatus.PICKED_UP)


def test_transition_advances_status_on_legal_move():
    order = _fake_order(OrderStatus.ACCEPTED)
    transition(order, OrderStatus.PREPARING)
    assert order.status == OrderStatus.PREPARING
    assert len(order._saved) == 1
    assert order._saved[0]['update_fields'] == ('status', 'updated_at')


def test_transition_raises_on_illegal_move():
    order = _fake_order(OrderStatus.DELIVERED)
    with pytest.raises(ValidationError):
        transition(order, OrderStatus.ACCEPTED)


def test_transition_save_false_skips_persist():
    order = _fake_order(OrderStatus.ACCEPTED)
    transition(order, OrderStatus.PREPARING, save=False)
    assert order.status == OrderStatus.PREPARING
    assert order._saved == []


# --- Card-payment additions (Phase 5) ---------------------------------------

def test_pending_payment_can_advance_to_review_or_accepted():
    """Webhook drives PENDING_PAYMENT forward; both branches must be allowed."""
    targets = TRANSITIONS[OrderStatus.PENDING_PAYMENT]
    assert OrderStatus.PENDING_REVIEW in targets
    assert OrderStatus.ACCEPTED in targets
    assert OrderStatus.CANCELLED in targets
