import client from './client'

export interface DeliveryAgentProfile {
  id: number
  work_status: string
  can_work: boolean
  is_online: boolean
  latitude: number | null
  longitude: number | null
  location_updated_at: string | null
  approved_at: string | null
  suspended_at: string | null
  suspension_reason: string
}

export interface DeliveryOffer {
  id: number
  order_id: number
  status: string
  expires_at: string
  seconds_remaining: number
  earning_amount: string
  pharmacy_name: string
  pharmacy_address: string
  pharmacy_latitude: number | null
  pharmacy_longitude: number | null
  payment_method: string
  package_count: number
}

export interface DeliveryOrder {
  id: number
  status: string
  prescription_mode: string
  payment_method: string

  pharmacy: number
  pharmacy_name: string
  pharmacy_address: string
  pharmacy_phone: string
  pharmacy_latitude: number | null
  pharmacy_longitude: number | null

  customer_phone: string

  delivery_address: string
  delivery_latitude: number | null
  delivery_longitude: number | null

  items: unknown[]
  items_total: string
  delivery_fee: string
  grand_total: string

  notes: string
  created_at: string
  updated_at: string
}

export type PickupVerificationMethod = 'qr' | 'pin'

export interface PickupVerificationPayload {
  method: PickupVerificationMethod
  credential: string
  latitude: number
  longitude: number
}

export interface DeliveryCompletionPayload {
  pin: string
  latitude: number
  longitude: number
  cash_confirmed?: boolean
}

export type DeliveryEarningStatus =
  | 'pending'
  | 'earned'
  | 'paid'
  | 'cancelled'

export interface DeliveryEarningsSummary {
  today_earned: string
  total_earned: string
  total_paid: string
  currency: string
}

export interface DeliveryEarningHistoryItem {
  id: number
  order_id: number
  amount: string
  currency: string
  status: DeliveryEarningStatus
  earned_at: string | null
  paid_at: string | null
  created_at: string
}
export interface DeliveryCashSummary {
  outstanding_cash: string
  currency: string
}

export type CashSettlementStatus =
  | 'pending'
  | 'completed'
  | 'cancelled'

export interface CashSettlementHistoryItem {
  id: number
  amount: string
  currency: string
  status: CashSettlementStatus
  completed_at: string | null
  note: string
  created_at: string
}

export interface OnlineTogglePayload {
  is_online: boolean
  latitude?: number
  longitude?: number
}

export interface LocationUpdatePayload {
  latitude: number
  longitude: number
}

export interface CurrentOfferResponse {
  offer: DeliveryOffer | null
}

export const deliveryApi = {
  activeOrder: () =>
    client.get<DeliveryOrder | null>(
      '/orders/active/',
    ),


  deliveryHistory: () =>
    client.get<DeliveryOrder[]>(
      '/orders/history/',
    ),

  earningsSummary: () =>
    client.get<DeliveryEarningsSummary>(
      '/delivery/earnings/summary/',
    ),

  earningsHistory: () =>
    client.get<DeliveryEarningHistoryItem[]>(
      '/delivery/earnings/history/',
    ),
    cashSummary: () =>
    client.get<DeliveryCashSummary>(
      '/delivery/cash/summary/',
    ),

  cashSettlements: () =>
    client.get<CashSettlementHistoryItem[]>(
      '/delivery/cash/settlements/',
    ),
  me: () =>
    client.get<DeliveryAgentProfile>(
      '/delivery/me/',
    ),

  setOnline: (
    data: OnlineTogglePayload,
  ) =>
    client.post<DeliveryAgentProfile>(
      '/delivery/online/',
      data,
    ),

  updateLocation: (
    data: LocationUpdatePayload,
  ) =>
    client.post<DeliveryAgentProfile>(
      '/delivery/location/',
      data,
    ),

  currentOffer: () =>
    client.get<CurrentOfferResponse>(
      '/delivery/offers/current/',
    ),

  completeDelivery: (
    orderId: number,
    data: DeliveryCompletionPayload,
  ) =>
    client.post<DeliveryOrder>(
      `/orders/${orderId}/delivery/complete/`,
      data,
    ),

  startDelivery: (
    orderId: number,
  ) =>
    client.post<DeliveryOrder>(
      `/orders/${orderId}/delivery/start/`,
    ),

  verifyPickup: (
    orderId: number,
    data: PickupVerificationPayload,
  ) =>
    client.post<DeliveryOrder>(
      `/orders/${orderId}/delivery/pickup/verify/`,
      data,
    ),

  acceptOffer: (
    offerId: number,
  ) =>
    client.post<DeliveryOffer>(
      `/delivery/offers/${offerId}/accept/`,
    ),

  declineOffer: (
    offerId: number,
  ) =>
    client.post<DeliveryOffer>(
      `/delivery/offers/${offerId}/decline/`,
    ),
}
