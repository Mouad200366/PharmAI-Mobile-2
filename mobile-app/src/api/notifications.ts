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
  | 'delivery_offer_available'

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

export type DevicePlatform = 'android' | 'ios'

export interface UserDeviceRegistrationPayload {
  device_id: string
  platform: DevicePlatform
  push_token?: string | null
  app_version?: string
  is_primary?: boolean
}

export interface UserDevice {
  id: number
  user_id: number
  device_id: string
  platform: DevicePlatform
  push_token: string | null
  app_version: string
  is_active: boolean
  is_primary: boolean
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface UserDeviceDeactivationPayload {
  device_id: string
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

  registerDevice: (data: UserDeviceRegistrationPayload) =>
    client.post<UserDevice>(
      '/notifications/devices/register/',
      data,
    ),

  deactivateDevice: (data: UserDeviceDeactivationPayload) =>
    client.post<UserDevice>(
      '/notifications/devices/deactivate/',
      data,
    ),
}