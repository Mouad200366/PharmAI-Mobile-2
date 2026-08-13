import client from './client'

export type Gender = 'M' | 'F'
export type UserRole = 'patient' | 'pharmacist' | 'delivery' | 'admin'

export interface UserProfile {
  id: number
  phone: string
  email: string
  cin: string
  first_name: string
  last_name: string
  full_name: string
  date_of_birth: string | null
  gender: Gender
  avatar: string | null
  role: UserRole
  is_phone_verified: boolean
  date_joined: string
}

export interface UpdateProfilePayload {
  first_name?: string
  last_name?: string
  email?: string
  date_of_birth?: string
  gender?: Gender
}

export interface AvatarUpload {
  uri: string
  name: string
  type: string
}

export const usersApi = {
  me: () =>
    client.get<UserProfile>('/users/me/'),

  updateMe: (data: UpdateProfilePayload) =>
    client.patch<UserProfile>('/users/me/', data),

  uploadAvatar: (avatar: AvatarUpload) => {
    const form = new FormData()

    // React Native FormData accepts a local file descriptor with uri/name/type.
    // The browser FormData type definitions do not include this React Native
    // shape, so the cast is intentionally local to this append call.
    form.append(
      'avatar',
      {
        uri: avatar.uri,
        name: avatar.name,
        type: avatar.type,
      } as unknown as Blob,
    )

    return client.patch<UserProfile>(
      '/users/me/',
      form,
      {
        // The shared Axios client defaults to application/json.
        // Unset that default for FormData so React Native can add the
        // correct multipart boundary automatically.
        headers: {
          'Content-Type': undefined,
        },
      },
    )
  },

  removeAvatar: () =>
    client.patch<UserProfile>(
      '/users/me/',
      { avatar: null },
    ),
}