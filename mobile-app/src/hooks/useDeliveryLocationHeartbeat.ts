import { useEffect, useRef } from 'react'
import * as Location from 'expo-location'

import { deliveryApi } from '../api/delivery'

const ONLINE_STATE_CHECK_MS = 30_000
const LOCATION_HEARTBEAT_MS = 60_000
const MIN_MOVEMENT_METERS = 25

export function useDeliveryLocationHeartbeat() {
  const latestLocationRef =
    useRef<Location.LocationObject | null>(null)

  const subscriptionRef =
    useRef<Location.LocationSubscription | null>(null)

  const isOnlineRef = useRef(false)
  const sendingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let statusTimer: ReturnType<typeof setInterval> | null = null
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null

    function stopWatcher() {
      subscriptionRef.current?.remove()
      subscriptionRef.current = null
      latestLocationRef.current = null
    }

    async function sendLatestLocation() {
      if (
        cancelled
        || !isOnlineRef.current
        || sendingRef.current
      ) {
        return
      }

      sendingRef.current = true

      try {
        let location = latestLocationRef.current

        if (location === null) {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })

          latestLocationRef.current = location
        }

        await deliveryApi.updateLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        })
      } catch {
        // Location heartbeat is best-effort. A temporary GPS/network
        // failure must not crash or block the Delivery-Agent navigator.
      } finally {
        sendingRef.current = false
      }
    }

    async function ensureWatcher() {
      if (
        cancelled
        || !isOnlineRef.current
        || subscriptionRef.current !== null
      ) {
        return
      }

      const permission =
        await Location.getForegroundPermissionsAsync()

      if (permission.status !== 'granted') {
        return
      }

      try {
        const initialLocation =
          await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })

        if (cancelled || !isOnlineRef.current) {
          return
        }

        latestLocationRef.current = initialLocation
        await sendLatestLocation()

        subscriptionRef.current =
          await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: MIN_MOVEMENT_METERS,
              timeInterval: LOCATION_HEARTBEAT_MS,
            },
            (location) => {
              latestLocationRef.current = location
            },
          )
      } catch {
        // The next status/heartbeat cycle will retry automatically.
      }
    }

    async function syncOnlineState() {
      try {
        const { data } = await deliveryApi.me()

        if (cancelled) {
          return
        }

        isOnlineRef.current = data.is_online

        if (!data.is_online) {
          stopWatcher()
          return
        }

        await ensureWatcher()
      } catch {
        // Keep the previous local tracking state on transient API errors.
      }
    }

    void syncOnlineState()

    statusTimer = setInterval(() => {
      void syncOnlineState()
    }, ONLINE_STATE_CHECK_MS)

    heartbeatTimer = setInterval(() => {
      void sendLatestLocation()
    }, LOCATION_HEARTBEAT_MS)

    return () => {
      cancelled = true

      if (statusTimer !== null) {
        clearInterval(statusTimer)
      }

      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer)
      }

      stopWatcher()
    }
  }, [])
}
