import client from './client'

export interface Notification {
  id: number
  title: string
  body: string
  is_read: boolean
  created_at: string
}

export const notificationsApi = {
  list: (params?: { page?: number }) =>
    client.get<{ results: Notification[]; count: number }>('/notifications/', { params }),

  markRead: (id: number) => client.post(`/notifications/${id}/mark_read/`),

  markAllRead: () => client.post('/notifications/mark_all_read/'),

  unreadCount: () => client.get<{ count: number }>('/notifications/unread_count/'),
}
