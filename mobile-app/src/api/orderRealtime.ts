import { WS_BASE_URL } from '../config/env'
import type { OrderStatus } from './orders'

export type OrderTrackingRole =
  | 'customer'
  | 'pharmacy'
  | 'agent'
  | 'admin'

export interface OrderTrackingConnectedEvent {
  type: 'connected'
  order_id: number
  role: OrderTrackingRole
}

export interface OrderStatusChangeEvent {
  type: 'status_change'
  order_id: number
  status: OrderStatus
}

export interface OrderLocationUpdateEvent {
  type: 'location_update'
  agent_latitude?: number | null
  agent_longitude?: number | null
  distance_to_customer_m?: number | null
  eta_minutes?: number | null
  status?: OrderStatus
  location_updated_at?: string | null
}

export type OrderTrackingEvent =
  | OrderTrackingConnectedEvent
  | OrderStatusChangeEvent
  | OrderLocationUpdateEvent

export interface OrderChatMessage {
  id: number
  order_id: number
  sender_id: number
  content: string
  created_at: string
}

export interface OrderChatMessageEvent extends OrderChatMessage {
  type: 'message'
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}

function createAuthenticatedUrl(
  path: string,
  accessToken: string,
) {
  const normalizedPath = path.startsWith('/')
    ? path
    : `/${path}`

  return `${normalizeBaseUrl(WS_BASE_URL)}${normalizedPath}?token=${encodeURIComponent(accessToken)}`
}

export function createOrderTrackingSocket(
  orderId: number,
  accessToken: string,
) {
  return new WebSocket(
    createAuthenticatedUrl(
      `/orders/${orderId}/`,
      accessToken,
    ),
  )
}

export function createOrderChatSocket(
  orderId: number,
  accessToken: string,
) {
  return new WebSocket(
    createAuthenticatedUrl(
      `/orders/${orderId}/chat/`,
      accessToken,
    ),
  )
}

export function parseOrderTrackingEvent(
  rawData: unknown,
): OrderTrackingEvent | null {
  const parsed = parseJsonObject(rawData)

  if (!parsed || typeof parsed.type !== 'string') {
    return null
  }

  if (
    parsed.type === 'connected' &&
    isFiniteNumber(parsed.order_id) &&
    isTrackingRole(parsed.role)
  ) {
    return {
      type: 'connected',
      order_id: parsed.order_id,
      role: parsed.role,
    }
  }

  if (
    parsed.type === 'status_change' &&
    isFiniteNumber(parsed.order_id) &&
    isOrderStatus(parsed.status)
  ) {
    return {
      type: 'status_change',
      order_id: parsed.order_id,
      status: parsed.status,
    }
  }

  if (parsed.type === 'location_update') {
    return {
      type: 'location_update',
      agent_latitude: optionalNumber(parsed.agent_latitude),
      agent_longitude: optionalNumber(parsed.agent_longitude),
      distance_to_customer_m: optionalNumber(
        parsed.distance_to_customer_m,
      ),
      eta_minutes: optionalNumber(parsed.eta_minutes),
      status: isOrderStatus(parsed.status)
        ? parsed.status
        : undefined,
      location_updated_at: optionalString(
        parsed.location_updated_at,
      ),
    }
  }

  return null
}

export function parseOrderChatEvent(
  rawData: unknown,
): OrderChatMessageEvent | null {
  const parsed = parseJsonObject(rawData)

  if (
    !parsed ||
    parsed.type !== 'message' ||
    !isFiniteNumber(parsed.id) ||
    !isFiniteNumber(parsed.order_id) ||
    !isFiniteNumber(parsed.sender_id) ||
    typeof parsed.content !== 'string' ||
    typeof parsed.created_at !== 'string'
  ) {
    return null
  }

  return {
    type: 'message',
    id: parsed.id,
    order_id: parsed.order_id,
    sender_id: parsed.sender_id,
    content: parsed.content,
    created_at: parsed.created_at,
  }
}

function parseJsonObject(
  rawData: unknown,
): Record<string, unknown> | null {
  if (typeof rawData !== 'string') {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(rawData)

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null
    }

    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function optionalNumber(value: unknown) {
  if (value === null) {
    return null
  }

  return isFiniteNumber(value)
    ? value
    : undefined
}

function optionalString(value: unknown) {
  if (value === null) {
    return null
  }

  return typeof value === 'string'
    ? value
    : undefined
}

function isTrackingRole(
  value: unknown,
): value is OrderTrackingRole {
  return (
    value === 'customer' ||
    value === 'pharmacy' ||
    value === 'agent' ||
    value === 'admin'
  )
}

const ORDER_STATUSES: OrderStatus[] = [
  'pending_payment',
  'pending_review',
  'rejected',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'awaiting_agent',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'failed',
]

function isOrderStatus(
  value: unknown,
): value is OrderStatus {
  return (
    typeof value === 'string' &&
    ORDER_STATUSES.includes(value as OrderStatus)
  )
}