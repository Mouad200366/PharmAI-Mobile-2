import client from './client'

export type OrderStatus =
  | 'pending_payment' | 'pending_review' | 'rejected' | 'accepted'
  | 'preparing' | 'ready_for_pickup' | 'awaiting_agent' | 'picked_up'
  | 'out_for_delivery' | 'delivered' | 'cancelled' | 'failed'

export type PrescriptionMode = 'none' | 'photo' | 'pickup'
export type PaymentMethod = 'cash' | 'card'

export type CustomerDeliveryIncidentStatus =
  | 'open'
  | 'return_required'
  | 'returning'
  | 'returned'

export interface CustomerDeliveryIncident {
  id: number
  status: CustomerDeliveryIncidentStatus
  created_at: string
  updated_at: string
}

export interface PrescriptionPhotoUpload {
  uri: string
  name: string
  type: string
}

export interface OrderItem {
  id: number
  medicine: number
  medicine_name: string
  quantity: number
  unit_price: string
  line_total: string
}

export interface Prescription {
  id: number
  photo: string | null
  status: 'pending' | 'approved' | 'rejected'
  rejection_reason: string
  verified_at: string | null
}

export interface OrderStatusHistoryEntry {
  id: number
  status: OrderStatus
  created_at: string
}

export interface Order {
  id: number
  status: OrderStatus
  prescription_mode: PrescriptionMode
  payment_method: PaymentMethod
  delivery_address: string
  delivery_latitude: number | null
  delivery_longitude: number | null
  items: OrderItem[]
  prescription: Prescription | null
  status_history: OrderStatusHistoryEntry[]
  delivery_incident: CustomerDeliveryIncident | null
  delivery_agent_name: string | null
  items_total: string
  delivery_fee: string
  grand_total: string
  notes: string
  created_at: string
  updated_at: string
}

export interface CreateOrderPayload {
  items: { medicine: number; quantity: number }[]
  delivery_address: string
  latitude: number
  longitude: number
  prescription_mode: PrescriptionMode
  payment_method: PaymentMethod
  prescription_photo?: PrescriptionPhotoUpload | null
  notes?: string
}

// NOTE: kept in French to match the existing backend-facing web app and the
// Moroccan patient audience. Swap for an i18n lookup later if the mobile
// app needs multi-language support.
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Paiement en attente',
  pending_review: 'En attente de vérification',
  rejected: 'Rejetée',
  accepted: 'Acceptée',
  preparing: 'En préparation',
  ready_for_pickup: 'Prête pour livraison',
  awaiting_agent: 'En attente de livreur',
  picked_up: 'Récupérée',
  out_for_delivery: 'En livraison',
  delivered: 'Livrée',
  cancelled: 'Annulée',
  failed: 'Échouée',
}

// Hex pairs (text, background) instead of Tailwind class strings — the
// mobile UI layer maps these directly to style objects / a Badge component.
export const STATUS_COLOR: Record<OrderStatus, { text: string; bg: string }> = {
  pending_payment: { text: '#c2410c', bg: '#fff7ed' },
  pending_review: { text: '#a16207', bg: '#fefce8' },
  rejected: { text: '#dc2626', bg: '#fef2f2' },
  accepted: { text: '#2563eb', bg: '#eff6ff' },
  preparing: { text: '#1d4ed8', bg: '#eff6ff' },
  ready_for_pickup: { text: '#9333ea', bg: '#faf5ff' },
  awaiting_agent: { text: '#7e22ce', bg: '#faf5ff' },
  picked_up: { text: '#0d9488', bg: '#f0fdfa' },
  out_for_delivery: { text: '#0f766e', bg: '#f0fdfa' },
  delivered: { text: '#15803d', bg: '#f0fdf4' },
  cancelled: { text: '#6b7280', bg: '#f3f4f6' },
  failed: { text: '#b91c1c', bg: '#fef2f2' },
}

const ACTIVE_STATUSES: OrderStatus[] = [
  'pending_payment', 'pending_review', 'accepted', 'preparing',
  'ready_for_pickup', 'awaiting_agent', 'picked_up', 'out_for_delivery',
]

export const isActiveOrder = (status: OrderStatus) => ACTIVE_STATUSES.includes(status)

export const ordersApi = {
  list: (params?: { status?: string }) => client.get<Order[]>('/orders/', { params }),

  detail: (id: number) => client.get<Order>(`/orders/${id}/`),

  create: (data: CreateOrderPayload) => {
    if (!data.prescription_photo) {
      const {
        prescription_photo: _prescriptionPhoto,
        ...jsonPayload
      } = data

      return client.post<Order>('/orders/', jsonPayload)
    }

    const form = new FormData()

    form.append('items', JSON.stringify(data.items))
    form.append('delivery_address', data.delivery_address)
    form.append('latitude', String(data.latitude))
    form.append('longitude', String(data.longitude))
    form.append('prescription_mode', data.prescription_mode)
    form.append('payment_method', data.payment_method)

    if (data.notes) {
      form.append('notes', data.notes)
    }

    form.append(
      'prescription_photo',
      {
        uri: data.prescription_photo.uri,
        name: data.prescription_photo.name,
        type: data.prescription_photo.type,
      } as unknown as Blob,
    )

    return client.post<Order>(
      '/orders/',
      form,
      {
        // Let React Native/Axios generate the multipart boundary.
        headers: {
          'Content-Type': undefined,
        },
      },
    )
  },

  cancel: (id: number) => client.post<Order>(`/orders/${id}/cancel/`),

  reorder: (id: number) => client.post<Order>(`/orders/${id}/reorder/`),

  messages: (id: number) => client.get(`/orders/${id}/messages/`),
}