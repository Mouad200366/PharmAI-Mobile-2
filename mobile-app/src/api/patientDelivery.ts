import client from './client'

export interface PatientDeliveryPinResponse {
  pin: string
  expires_at: string
}

export const patientDeliveryApi = {
  issuePin: (orderId: number) =>
    client.post<PatientDeliveryPinResponse>(
      `/delivery/orders/${orderId}/delivery-pin/issue/`,
    ),
}
