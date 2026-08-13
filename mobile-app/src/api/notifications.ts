import client from './client'

export type NotificationType =
  | 'order_placed'
  | 'order_status_changed'
  | 'order_delivered'
  | 'order_cancelled'
  | 'prescription_approved'
  | 'prescription_rejected'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'agent_assigned'

export interface NotificationPayload {
  order_id?: number | string
  status?: string
  amount?: string
  [key: string]: unknown
}

export interface Notification {
  id: number
  type: NotificationType
  title: string
  body: string
  payload: NotificationPayload
  read_at: string | null
  is_read: boolean
  created_at: string
}

export interface NotificationListParams {
  page?: number
  page_size?: number
  unread?: boolean
  type?: NotificationType
}

export interface PaginatedNotifications {
  count: number
  next: string | null
  previous: string | null
  results: Notification[]
}

export interface MarkAllReadResponse {
  marked_read: number
}

export interface UnreadCountResponse {
  unread_count: number
}

export function getNotificationOrderId(
  notification: Notification,
): number | null {
  const rawOrderId = notification.payload?.order_id

  if (typeof rawOrderId === 'number' && Number.isInteger(rawOrderId)) {
    return rawOrderId > 0 ? rawOrderId : null
  }

  if (typeof rawOrderId === 'string') {
    const parsedOrderId = Number(rawOrderId)

    if (Number.isInteger(parsedOrderId) && parsedOrderId > 0) {
      return parsedOrderId
    }
  }

  return null
}

export const notificationsApi = {
  list: (params?: NotificationListParams) =>
    client.get<PaginatedNotifications>('/notifications/', {
      params,
    }),

  markRead: (id: number) =>
    client.post<Notification>(`/notifications/${id}/read/`),

  markAllRead: () =>
    client.post<MarkAllReadResponse>('/notifications/read_all/'),

  unreadCount: () =>
    client.get<UnreadCountResponse>('/notifications/unread_count/'),
}