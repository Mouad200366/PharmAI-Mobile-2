import client from './client'

export type Gender = 'M' | 'F' | 'O'
export type OTPPurpose = 'signup' | 'login' | 'password_reset'

export interface SignUpPayload {
  phone: string
  cin: string
  first_name: string
  last_name: string
  date_of_birth: string
  gender: Gender
  password: string
  password_confirm: string
  email?: string
}

export interface TokenPair {
  access: string
  refresh: string
  user_id: number
}

export const authApi = {
  signUp: (data: SignUpPayload) => client.post<{ detail: string }>('/auth/signup/', data),

  requestOTP: (phone: string, purpose: OTPPurpose = 'signup') =>
    client.post<{ detail: string }>('/auth/request-otp/', { phone, purpose }),

  verifyOTP: (phone: string, code: string, purpose: OTPPurpose = 'signup') =>
    client.post<TokenPair>('/auth/verify-otp/', { phone, code, purpose }),

  login: (phone: string, password: string) =>
    client.post<TokenPair>('/auth/login/', { phone, password }),

  logout: (refresh: string) => client.post<{ detail: string }>('/auth/logout/', { refresh }),

  passwordChange: (old_password: string, new_password: string) =>
    client.post<{ detail: string }>('/users/password/change/', { old_password, new_password }),
}
