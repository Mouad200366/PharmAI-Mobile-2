import client from './client'

export interface Medicine {
  id: number
  name: string
  generic_name: string
  description: string
  manufacturer: string
  requires_prescription: boolean
  image: string | null
  is_active: boolean

  // Pricing and stock information
  min_price: string | null
  currency: string
  is_available: boolean
  available_pharmacies_count: number
  total_available_quantity: number

  created_at?: string
  updated_at?: string
}

export interface SearchParams {
  q: string
  lat?: number
  lng?: number
  radius?: number
  limit?: number
}

export const catalogApi = {
  search: (params: SearchParams) =>
    client.get<Medicine[]>('/search/', {
      params,
    }),

  list: (params?: {
    page?: number
    search?: string
    ordering?: string
    requires_prescription?: boolean
  }) =>
    client.get<{
      results: Medicine[]
      count: number
      next?: string | null
      previous?: string | null
    }>('/medicines/', {
      params,
    }),

  detail: (id: number) =>
    client.get<Medicine>(
      `/medicines/${id}/`,
    ),
}