import client from './client'

export interface Address {
  id: number
  label: string
  street: string
  city: string
  postal_code: string
  latitude: number | null
  longitude: number | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface CreateAddressPayload {
  label: string
  street: string
  city: string
  postal_code?: string
  latitude?: number
  longitude?: number
  is_default?: boolean
}

export const addressesApi = {
  list: () => client.get<{ results: Address[]; count: number }>('/addresses/'),

  create: (data: CreateAddressPayload) => client.post<Address>('/addresses/', data),

  update: (id: number, data: Partial<CreateAddressPayload>) =>
    client.patch<Address>(`/addresses/${id}/`, data),

  delete: (id: number) => client.delete(`/addresses/${id}/`),

  setDefault: (id: number) => client.post<Address>(`/addresses/${id}/set_default/`),
}
