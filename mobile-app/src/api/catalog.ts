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
}

export interface SearchParams {
  q: string
  lat?: number
  lng?: number
  radius?: number
  limit?: number
}

export const catalogApi = {
  search: (params: SearchParams) => client.get<Medicine[]>('/search/', { params }),

  list: (params?: { page?: number; search?: string }) =>
    client.get<{ results: Medicine[]; count: number }>('/medicines/', { params }),

  detail: (id: number) => client.get<Medicine>(`/medicines/${id}/`),
}
