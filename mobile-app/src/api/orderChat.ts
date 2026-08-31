import client from './client'
import {
  createOrderChatSocket,
  parseOrderChatEvent,
  type OrderChatMessageEvent,
} from './orderRealtime'

export interface OrderChatHistoryMessage {
  id: number
  order: number
  sender: number
  sender_name: string
  content: string
  read_at: string | null
  created_at: string
}

export interface OrderChatMessage {
  id: number
  order_id: number
  sender_id: number
  sender_name?: string
  content: string
  created_at: string
}

export async function fetchOrderChatHistory(
  orderId: number,
): Promise<OrderChatMessage[]> {
  const response = await client.get<OrderChatHistoryMessage[]>(
    `/orders/${orderId}/messages/`,
  )

  return response.data.map((message) => ({
    id: message.id,
    order_id: message.order,
    sender_id: message.sender,
    sender_name: message.sender_name,
    content: message.content,
    created_at: message.created_at,
  }))
}

export function openOrderChatSocket(
  orderId: number,
  accessToken: string,
) {
  return createOrderChatSocket(orderId, accessToken)
}

export function parseLiveOrderChatMessage(
  rawData: unknown,
): OrderChatMessage | null {
  const event: OrderChatMessageEvent | null =
    parseOrderChatEvent(rawData)

  if (!event) {
    return null
  }

  return {
    id: event.id,
    order_id: event.order_id,
    sender_id: event.sender_id,
    content: event.content,
    created_at: event.created_at,
  }
}
