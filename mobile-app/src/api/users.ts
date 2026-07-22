import client from './client'

export type Gender = 'M' | 'F'

export interface UserProfile {
  id: number
  phone: string
  first_name: string
  last_name: string
  email: string
  cin: string
  gender: Gender
  date_of_birth: string | null
  avatar: string | null
}

export interface UpdateProfilePayload {
  first_name?: string
  last_name?: string
  email?: string
  date_of_birth?: string
  gender?: Gender
}

export const usersApi = {
  me: () => client.get<UserProfile>('/users/me/'),

  updateMe: (data: UpdateProfilePayload) => client.patch<UserProfile>('/users/me/', data),

  // React Native equivalent of the web's File-based upload: pass a local
  // asset URI (e.g. from expo-image-picker) instead of a browser File.
  uploadAvatar: (uri: string, filename = 'avatar.jpg', mimeType = 'image/jpeg') => {
    const form = new FormData()
    // @ts-expect-error React Native's FormData accepts this shape for file uploads
    form.append('avatar', { uri, name: filename, type: mimeType })
    return client.patch<UserProfile>('/users/me/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
