import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'


// Show incoming push notifications even while PharmAI is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

import {
  notificationsApi,
  type DevicePlatform,
} from '../api/notifications'
import { firstError } from '../api/errors'

const DEVICE_ID_KEY = 'pharmaai_installation_device_id'
const ANDROID_CHANNEL_ID = 'default'

export type PushRegistrationStatus =
  | 'registered'
  | 'unsupported_platform'
  | 'physical_device_required'
  | 'missing_project_id'
  | 'permission_denied'
  | 'failed'

export interface PushRegistrationResult {
  status: PushRegistrationStatus
  deviceId?: string
  pushToken?: string
  error?: string
}

function getExpoProjectId() {
  const constants = Constants as typeof Constants & {
    easConfig?: {
      projectId?: string | null
    } | null
  }

  const easProjectId = constants.easConfig?.projectId

  if (typeof easProjectId === 'string' && easProjectId.trim()) {
    return easProjectId.trim()
  }

  const extra = Constants.expoConfig?.extra as
    | {
        eas?: {
          projectId?: unknown
        }
      }
    | undefined

  const configProjectId = extra?.eas?.projectId

  return (
    typeof configProjectId === 'string'
    && configProjectId.trim()
  )
    ? configProjectId.trim()
    : null
}

function createInstallationId(platform: DevicePlatform) {
  const timestamp = Date.now().toString(36)
  const randomA = Math.random().toString(36).slice(2, 12)
  const randomB = Math.random().toString(36).slice(2, 12)

  return `pharmaai-${platform}-${timestamp}-${randomA}${randomB}`
}

async function getOrCreateDeviceId(
  platform: DevicePlatform,
) {
  const existing = await SecureStore.getItemAsync(
    DEVICE_ID_KEY,
  )

  if (existing?.trim()) {
    return existing.trim()
  }

  const created = createInstallationId(platform)

  await SecureStore.setItemAsync(
    DEVICE_ID_KEY,
    created,
  )

  return created
}

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== 'android') {
    return
  }

  await Notifications.setNotificationChannelAsync(
    ANDROID_CHANNEL_ID,
    {
      name: 'Notifications PharmAI',
      importance: Notifications.AndroidImportance.HIGH,
    },
  )
}

async function ensureNotificationPermission() {
  const current =
    await Notifications.getPermissionsAsync()

  if (current.status === 'granted') {
    return true
  }

  const requested =
    await Notifications.requestPermissionsAsync()

  return requested.status === 'granted'
}

export async function registerPushDevice():
  Promise<PushRegistrationResult> {
  if (
    Platform.OS !== 'android'
    && Platform.OS !== 'ios'
  ) {
    return {
      status: 'unsupported_platform',
    }
  }

  if (!Device.isDevice) {
    return {
      status: 'physical_device_required',
    }
  }

  const projectId = getExpoProjectId()

  if (!projectId) {
    return {
      status: 'missing_project_id',
      error:
        'Expo/EAS projectId is not configured.',
    }
  }

  const platform = Platform.OS as DevicePlatform
  try {
    await ensureAndroidNotificationChannel()
    const hasPermission =
      await ensureNotificationPermission()

    if (!hasPermission) {
      return {
        status: 'permission_denied',
      }
    }
    const deviceId =
      await getOrCreateDeviceId(platform)
    const tokenResponse =
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })

    const pushToken = tokenResponse.data.trim()

    if (!pushToken) {
      return {
        status: 'failed',
        deviceId,
        error: 'Expo returned an empty push token.',
      }
    }
    await notificationsApi.registerDevice({
      device_id: deviceId,
      platform,
      push_token: pushToken,
      app_version:
        Constants.expoConfig?.version ?? '',
      is_primary: true,
    })

    return {
      status: 'registered',
      deviceId,
      pushToken,
    }
  } catch (error: unknown) {
    return {
      status: 'failed',
      error:
        firstError(error)
        || 'Push device registration failed.',
    }
  }
}

export async function getInstallationDeviceId() {
  if (
    Platform.OS !== 'android'
    && Platform.OS !== 'ios'
  ) {
    return null
  }

  return SecureStore.getItemAsync(
    DEVICE_ID_KEY,
  )
}
