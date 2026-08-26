import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import * as Location from 'expo-location'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Icon from '../../components/ui/Icon'
import PickupQrScanner from '../../components/delivery/PickupQrScanner'
import DeliveryNavigationMap from '../../components/delivery/DeliveryNavigationMap'
import {
  deliveryApi,
  type DeliveryAgentProfile,
  type DeliveryEarningHistoryItem,
  type DeliveryOffer,
  type DeliveryOrder,
} from '../../api/delivery'
import { firstError } from '../../api/errors'
import { notificationsApi } from '../../api/notifications'
import {
  usersApi,
  type UserProfile,
} from '../../api/users'
import type { DeliveryTabParamList } from '../../navigation/types'
import { colors } from '../../theme/colors'

const OFFER_REFRESH_INTERVAL_MS = 2_000
const ACTIVE_ORDER_REFRESH_INTERVAL_MS = 5_000
const NOTIFICATION_REFRESH_INTERVAL_MS = 30_000
const DASHBOARD_REFRESH_INTERVAL_MS = 60_000
const PROFILE_REFRESH_INTERVAL_MS = 60_000

const homePalette = {
  brandBlue: '#0B43D5',
  brandBlueDark: '#052A95',
  brandCyan: '#12C9D3',
  brandCyanDark: '#059AA9',
  softBlue: '#EEF5FF',
  softCyan: '#EAFDFE',
  screen: '#F5F8FD',
  cardBorder: '#E4EBF7',
  warningBg: '#FFF9E8',
  warning: '#C47A00',
} as const

function statusLabel(status: string) {
  switch (status) {
    case 'awaiting_agent':
      return 'Direction pharmacie'
    case 'picked_up':
      return 'Colis récupéré'
    case 'out_for_delivery':
      return 'En cours de livraison'
    default:
      return status.replaceAll('_', ' ')
  }
}

function paymentLabel(method: string) {
  return method === 'cash' ? 'Espèces' : 'Carte / en ligne'
}

function compactPaymentLabel(method: string) {
  return method === 'cash' ? 'Espèces' : 'Carte'
}

function workStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return 'Actif'
    case 'suspended':
      return 'Suspendu'
    default:
      return status.replaceAll('_', ' ')
  }
}

function isSameLocalDay(value: string, reference = new Date()) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  return (
    date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate()
  )
}

function formatStatAmount(
  value: string | number | null | undefined,
) {
  const amount = Number(value ?? 0)

  return Number.isFinite(amount)
    ? amount.toFixed(2)
    : '0.00'
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatActivityTime(value: string | null) {
  if (!value) {
    return 'Activité récente'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Activité récente'
  }

  const now = new Date()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  if (isSameLocalDay(value, now)) {
    return `Aujourd’hui ${hours}:${minutes}`
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${day}/${month} · ${hours}:${minutes}`
}

function activeStage(status: string) {
  switch (status) {
    case 'awaiting_agent':
      return 0
    case 'picked_up':
      return 1
    case 'out_for_delivery':
      return 2
    default:
      return 0
  }
}

function DeliveryProgress({ status }: { status: string }) {
  const stage = activeStage(status)
  const labels = ['Pharmacie', 'Pris en charge', 'Livraison']

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressTrack}>
        {labels.map((label, index) => {
          const reached = index <= stage
          const isCurrent = index === stage

          return (
            <View key={label} style={styles.progressItem}>
              <View style={styles.progressRow}>
                {index > 0 ? (
                  <View
                    style={[
                      styles.progressLine,
                      index <= stage && styles.progressLineReached,
                    ]}
                  />
                ) : null}

                <View
                  style={[
                    styles.progressDot,
                    reached && styles.progressDotReached,
                    isCurrent && styles.progressDotCurrent,
                  ]}
                >
                  {index < stage ? (
                    <Icon name="check" size={15} color={colors.white} />
                  ) : (
                    <Text
                      style={[
                        styles.progressNumber,
                        reached && styles.progressNumberReached,
                      ]}
                    >
                      {index + 1}
                    </Text>
                  )}
                </View>

                {index < labels.length - 1 ? (
                  <View
                    style={[
                      styles.progressLine,
                      index < stage && styles.progressLineReached,
                    ]}
                  />
                ) : null}
              </View>

              <Text
                numberOfLines={1}
                style={[
                  styles.progressLabel,
                  reached && styles.progressLabelReached,
                ]}
              >
                {label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

export default function DeliveryHome() {
  const insets = useSafeAreaInsets()

  const navigation =
    useNavigation<BottomTabNavigationProp<DeliveryTabParamList>>()

  const [user, setUser] = useState<UserProfile | null>(null)
  const [profile, setProfile] =
    useState<DeliveryAgentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [togglingOnline, setTogglingOnline] = useState(false)

  const [offer, setOffer] = useState<DeliveryOffer | null>(null)
  const [offerSecondsRemaining, setOfferSecondsRemaining] = useState(0)
  const [offerError, setOfferError] = useState('')
  const [offerAction, setOfferAction] =
    useState<'accept' | 'decline' | null>(null)
  const [offerMessage, setOfferMessage] = useState('')

  const [activeOrder, setActiveOrder] =
    useState<DeliveryOrder | null>(null)
  const [activeOrderError, setActiveOrderError] = useState('')

  const [todayDeliveries, setTodayDeliveries] = useState(0)
  const [todayEarnings, setTodayEarnings] = useState('0')
  const [pendingEarnings, setPendingEarnings] = useState(0)
  const [outstandingCash, setOutstandingCash] = useState('0')
  const [earningsCurrency, setEarningsCurrency] = useState('MAD')
  const [cashCurrency, setCashCurrency] = useState('MAD')
  const [unreadCount, setUnreadCount] = useState(0)
  const [recentEarning, setRecentEarning] =
    useState<DeliveryEarningHistoryItem | null>(null)

  const [pickupPin, setPickupPin] = useState('')
  const [pickupError, setPickupError] = useState('')
  const [verifyingPickup, setVerifyingPickup] = useState(false)
  const [qrScannerVisible, setQrScannerVisible] = useState(false)

  const [startingDelivery, setStartingDelivery] = useState(false)
  const [startDeliveryError, setStartDeliveryError] = useState('')

  const [deliveryPin, setDeliveryPin] = useState('')
  const [cashConfirmed, setCashConfirmed] = useState(false)
  const [completingDelivery, setCompletingDelivery] = useState(false)
  const [completionError, setCompletionError] = useState('')
  const [completionMessage, setCompletionMessage] = useState('')

  const loadProfile = useCallback(async () => {
    setError('')

    try {
      const [userResult, deliveryResult] = await Promise.allSettled([
        usersApi.me(),
        deliveryApi.me(),
      ])

      if (userResult.status === 'fulfilled') {
        setUser(userResult.value.data)
      }

      if (deliveryResult.status === 'fulfilled') {
        setProfile(deliveryResult.value.data)
      } else {
        setError(
          firstError(deliveryResult.reason)
          || 'Impossible de charger votre statut livreur.',
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadOffer = useCallback(async () => {
    try {
      const { data } = await deliveryApi.currentOffer()

      setOffer(data.offer)
      setOfferSecondsRemaining(
        data.offer?.seconds_remaining ?? 0,
      )
      setOfferError('')
    } catch (err: unknown) {
      setOfferError(firstError(err))
    }
  }, [])

  const loadActiveOrder = useCallback(async () => {
    try {
      const { data } = await deliveryApi.activeOrder()
      setActiveOrder(data)
      setActiveOrderError('')
    } catch (err: unknown) {
      setActiveOrderError(firstError(err))
    }
  }, [])

  const loadDashboardStats = useCallback(async () => {
    const [
      summaryResult,
      earningsResult,
      deliveriesResult,
      cashResult,
    ] = await Promise.allSettled([
      deliveryApi.earningsSummary(),
      deliveryApi.earningsHistory(),
      deliveryApi.deliveryHistory(),
      deliveryApi.cashSummary(),
    ])

    if (summaryResult.status === 'fulfilled') {
      setTodayEarnings(summaryResult.value.data.today_earned)
      setEarningsCurrency(summaryResult.value.data.currency || 'MAD')
    }

    if (earningsResult.status === 'fulfilled') {
      const earningHistory = earningsResult.value.data

      const pendingAmount = earningHistory
        .filter((item) => item.status === 'pending')
        .reduce((total, item) => {
          const amount = Number(item.amount)
          return Number.isFinite(amount)
            ? total + amount
            : total
        }, 0)

      const completedEarnings = earningHistory
        .filter((item) => (
          item.status === 'earned'
          || item.status === 'paid'
        ))
        .sort((left, right) => {
          const leftDate = new Date(
            left.earned_at ?? left.created_at,
          ).getTime()
          const rightDate = new Date(
            right.earned_at ?? right.created_at,
          ).getTime()

          const safeLeft = Number.isFinite(leftDate)
            ? leftDate
            : 0
          const safeRight = Number.isFinite(rightDate)
            ? rightDate
            : 0

          return safeRight - safeLeft
        })

      setPendingEarnings(pendingAmount)
      setRecentEarning(completedEarnings[0] ?? null)
    }

    if (deliveriesResult.status === 'fulfilled') {
      const now = new Date()

      const deliveredToday = deliveriesResult.value.data.filter(
        (order) => (
          order.status === 'delivered'
          && isSameLocalDay(
            order.updated_at || order.created_at,
            now,
          )
        ),
      ).length

      setTodayDeliveries(deliveredToday)
    }

    if (cashResult.status === 'fulfilled') {
      setOutstandingCash(
        cashResult.value.data.outstanding_cash,
      )
      setCashCurrency(
        cashResult.value.data.currency || 'MAD',
      )
    }
  }, [])

  const loadUnreadCount = useCallback(async () => {
    try {
      const { data } = await notificationsApi.unreadCount()
      setUnreadCount(data.unread_count)
    } catch {
      // Keep the last known badge count. Notifications remain accessible.
    }
  }, [])

  const refreshHome = useCallback(async () => {
    setRefreshing(true)

    try {
      await Promise.allSettled([
        loadProfile(),
        loadOffer(),
        loadActiveOrder(),
        loadDashboardStats(),
        loadUnreadCount(),
      ])
    } finally {
      setRefreshing(false)
    }
  }, [
    loadActiveOrder,
    loadDashboardStats,
    loadOffer,
    loadProfile,
    loadUnreadCount,
  ])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void loadProfile()
      void loadOffer()
      void loadActiveOrder()
      void loadDashboardStats()
      void loadUnreadCount()

      const offerInterval = setInterval(() => {
        void loadOffer()
      }, OFFER_REFRESH_INTERVAL_MS)

      const activeOrderInterval = setInterval(() => {
        void loadActiveOrder()
      }, ACTIVE_ORDER_REFRESH_INTERVAL_MS)

      const notificationInterval = setInterval(() => {
        void loadUnreadCount()
      }, NOTIFICATION_REFRESH_INTERVAL_MS)

      const dashboardInterval = setInterval(() => {
        void loadDashboardStats()
      }, DASHBOARD_REFRESH_INTERVAL_MS)

      const profileInterval = setInterval(() => {
        void loadProfile()
      }, PROFILE_REFRESH_INTERVAL_MS)

      return () => {
        clearInterval(offerInterval)
        clearInterval(activeOrderInterval)
        clearInterval(notificationInterval)
        clearInterval(dashboardInterval)
        clearInterval(profileInterval)
      }
    }, [
      loadActiveOrder,
      loadDashboardStats,
      loadOffer,
      loadProfile,
      loadUnreadCount,
    ]),
  )

  useEffect(() => {
    if (offer === null) {
      setOfferSecondsRemaining(0)
      return
    }

    const timer = setInterval(() => {
      setOfferSecondsRemaining((current) =>
        Math.max(0, current - 1),
      )
    }, 1_000)

    return () => {
      clearInterval(timer)
    }
  }, [offer?.id])

  useEffect(() => {
    if (
      offer !== null
      && offerSecondsRemaining === 0
      && offerAction === null
    ) {
      void loadOffer()
    }
  }, [
    loadOffer,
    offer?.id,
    offerAction,
    offerSecondsRemaining,
  ])

  useEffect(() => {
    const status = activeOrder?.status

    if (status !== 'awaiting_agent') {
      setPickupPin('')
      setPickupError('')
      setQrScannerVisible(false)
    }

    if (status !== 'picked_up') {
      setStartDeliveryError('')
    }

    if (status !== 'out_for_delivery') {
      setDeliveryPin('')
      setCashConfirmed(false)
      setCompletionError('')
    }

    if (activeOrder !== null) {
      setCompletionMessage('')
    }
  }, [
    activeOrder?.id,
    activeOrder?.status,
  ])

  const isOnline = profile?.is_online ?? false
  const canWork = profile?.can_work ?? false
  const greetingName = (
    user?.first_name?.trim()
    || user?.full_name?.trim().split(/\s+/)[0]
    || ''
  )

  const handleOpenOfferMap = useCallback(async () => {
    if (offer === null) {
      return
    }

    const latitude = offer.pharmacy_latitude
    const longitude = offer.pharmacy_longitude

    if (
      typeof latitude !== 'number'
      || typeof longitude !== 'number'
    ) {
      Alert.alert(
        'Carte indisponible',
        'Les coordonnées de la pharmacie ne sont pas disponibles.',
      )
      return
    }

    const url =
      'https://www.google.com/maps/search/'
      + `?api=1&query=${latitude},${longitude}`

    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert(
        'Carte indisponible',
        'Impossible d’ouvrir la carte pour le moment.',
      )
    }
  }, [offer])

  const handleToggleOnline = useCallback(async () => {
    if (profile === null || togglingOnline) {
      return
    }

    setActionError('')
    setTogglingOnline(true)

    try {
      if (profile.is_online) {
        const { data } = await deliveryApi.setOnline({
          is_online: false,
        })

        setProfile(data)
        return
      }

      if (!profile.can_work) {
        setActionError(
          'Votre compte doit être approuvé et actif avant de passer en ligne.',
        )
        return
      }

      const permission =
        await Location.requestForegroundPermissionsAsync()

      if (permission.status !== 'granted') {
        setActionError(
          'La permission de localisation est nécessaire pour passer en ligne.',
        )
        return
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      const { data } = await deliveryApi.setOnline({
        is_online: true,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      })

      setProfile(data)
      void loadOffer()
    } catch (err: unknown) {
      setActionError(firstError(err))
    } finally {
      setTogglingOnline(false)
    }
  }, [loadOffer, profile, togglingOnline])

  const handleAcceptOffer = useCallback(async () => {
    if (
      offer === null
      || offerAction !== null
      || offerSecondsRemaining <= 0
    ) {
      return
    }

    setOfferError('')
    setOfferMessage('')
    setOfferAction('accept')

    try {
      await deliveryApi.acceptOffer(offer.id)

      setOffer(null)
      setOfferSecondsRemaining(0)
      setOfferMessage(
        'Offre acceptée. Votre livraison est maintenant active.',
      )

      await loadActiveOrder()
    } catch (err: unknown) {
      setOfferError(firstError(err))
      void loadOffer()
    } finally {
      setOfferAction(null)
    }
  }, [
    loadActiveOrder,
    loadOffer,
    offer,
    offerAction,
    offerSecondsRemaining,
  ])

  const handleDeclineOffer = useCallback(async () => {
    if (
      offer === null
      || offerAction !== null
      || offerSecondsRemaining <= 0
    ) {
      return
    }

    setOfferError('')
    setOfferMessage('')
    setOfferAction('decline')

    try {
      await deliveryApi.declineOffer(offer.id)

      setOffer(null)
      setOfferSecondsRemaining(0)
      setOfferMessage(
        'Offre refusée. Vous restez disponible pour une prochaine offre.',
      )
    } catch (err: unknown) {
      setOfferError(firstError(err))
      void loadOffer()
    } finally {
      setOfferAction(null)
    }
  }, [
    loadOffer,
    offer,
    offerAction,
    offerSecondsRemaining,
  ])

  const handleVerifyPickupPin = useCallback(async () => {
    if (
      activeOrder === null
      || activeOrder.status !== 'awaiting_agent'
      || verifyingPickup
    ) {
      return
    }

    const credential = pickupPin.trim()

    if (!/^\d{6}$/.test(credential)) {
      setPickupError('Le PIN de retrait doit contenir exactement 6 chiffres.')
      return
    }

    setPickupError('')
    setVerifyingPickup(true)

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync()

      if (permission.status !== 'granted') {
        setPickupError(
          'La permission de localisation est nécessaire pour confirmer le retrait.',
        )
        return
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      const { data } = await deliveryApi.verifyPickup(
        activeOrder.id,
        {
          method: 'pin',
          credential,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
      )

      setActiveOrder(data)
      setPickupPin('')
      setPickupError('')
    } catch (err: unknown) {
      setPickupError(firstError(err))
      void loadActiveOrder()
    } finally {
      setVerifyingPickup(false)
    }
  }, [
    activeOrder,
    loadActiveOrder,
    pickupPin,
    verifyingPickup,
  ])

  const handleVerifyPickupQr = useCallback(async (
    credential: string,
  ) => {
    if (
      activeOrder === null
      || activeOrder.status !== 'awaiting_agent'
      || verifyingPickup
    ) {
      setQrScannerVisible(false)
      return
    }

    setQrScannerVisible(false)
    setPickupError('')
    setVerifyingPickup(true)

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync()

      if (permission.status !== 'granted') {
        setPickupError(
          'La permission de localisation est nécessaire pour confirmer le retrait.',
        )
        return
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      const { data } = await deliveryApi.verifyPickup(
        activeOrder.id,
        {
          method: 'qr',
          credential,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
      )

      setActiveOrder(data)
      setPickupPin('')
      setPickupError('')
    } catch (err: unknown) {
      setPickupError(firstError(err))
      void loadActiveOrder()
    } finally {
      setVerifyingPickup(false)
    }
  }, [
    activeOrder,
    loadActiveOrder,
    verifyingPickup,
  ])

  const handleStartDelivery = useCallback(async () => {
    if (
      activeOrder === null
      || activeOrder.status !== 'picked_up'
      || startingDelivery
    ) {
      return
    }

    setStartDeliveryError('')
    setStartingDelivery(true)

    try {
      const { data } = await deliveryApi.startDelivery(
        activeOrder.id,
      )

      setActiveOrder(data)
    } catch (err: unknown) {
      setStartDeliveryError(firstError(err))
      void loadActiveOrder()
    } finally {
      setStartingDelivery(false)
    }
  }, [
    activeOrder,
    loadActiveOrder,
    startingDelivery,
  ])

  const handleCompleteDelivery = useCallback(async () => {
    if (
      activeOrder === null
      || activeOrder.status !== 'out_for_delivery'
      || completingDelivery
    ) {
      return
    }

    const pin = deliveryPin.trim()

    if (!/^\d{6}$/.test(pin)) {
      setCompletionError(
        'Le PIN client doit contenir exactement 6 chiffres.',
      )
      return
    }

    const isCashOrder = activeOrder.payment_method === 'cash'

    if (isCashOrder && !cashConfirmed) {
      setCompletionError(
        'Confirmez la réception du paiement en espèces avant de terminer la livraison.',
      )
      return
    }

    setCompletionError('')
    setCompletionMessage('')
    setCompletingDelivery(true)

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync()

      if (permission.status !== 'granted') {
        setCompletionError(
          'La permission de localisation est nécessaire pour confirmer la livraison.',
        )
        return
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      await deliveryApi.completeDelivery(
        activeOrder.id,
        {
          pin,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          cash_confirmed: isCashOrder
            ? cashConfirmed
            : false,
        },
      )

      setDeliveryPin('')
      setCashConfirmed(false)
      setActiveOrder(null)
      setCompletionMessage(
        'Livraison confirmée avec succès.',
      )

      await Promise.allSettled([
        loadActiveOrder(),
        loadDashboardStats(),
        loadUnreadCount(),
      ])
    } catch (err: unknown) {
      setCompletionError(firstError(err))
      void loadActiveOrder()
    } finally {
      setCompletingDelivery(false)
    }
  }, [
    activeOrder,
    cashConfirmed,
    completingDelivery,
    deliveryPin,
    loadActiveOrder,
    loadDashboardStats,
    loadUnreadCount,
  ])

  if (loading && profile === null) {
    return (
      <View style={styles.centerState}>
        <StatusBar style="light" />
        <View
          pointerEvents="none"
          style={[
            styles.statusBarGuard,
            { height: insets.top },
          ]}
        />
        <ActivityIndicator size="large" color={homePalette.brandBlue} />
        <Text style={styles.centerStateText}>
          Chargement de votre espace livreur…
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View
        pointerEvents="none"
        style={[
          styles.statusBarGuard,
          { height: insets.top },
        ]}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refreshHome()
            }}
            tintColor={homePalette.brandBlue}
            colors={[homePalette.brandBlue]}
          />
        }
      >
      <LinearGradient
        colors={[homePalette.brandBlueDark, homePalette.brandBlue, '#1198E8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.mockHero}
      >
        <View style={styles.mockHeroGlow} />

        <View style={styles.mockHeroRow}>
          <View style={styles.mockHeroCopy}>
            <Text style={styles.mockHeroTitle}>
              Bonjour{greetingName ? `, ${greetingName}` : ''} 👋
            </Text>
            <Text style={styles.mockHeroSubtitle}>
              {isOnline
                ? 'Prêt pour de nouvelles livraisons ?'
                : 'Passez en ligne pour recevoir des livraisons.'}
            </Text>
          </View>

          <View style={styles.mockHeroActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ouvrir les notifications"
              style={styles.mockNotificationButton}
              onPress={() => {
                navigation.navigate('Notifications')
              }}
            >
              <Icon
                name="notifications_none"
                size={23}
                color={colors.white}
              />

              {unreadCount > 0 ? (
                <View style={styles.mockNotificationBadge}>
                  <Text style={styles.mockNotificationBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            <View style={styles.mockOnlinePill}>
              <View
                style={[
                  styles.mockOnlineDot,
                  !isOnline && styles.mockOnlineDotOffline,
                ]}
              />
              <Text style={styles.mockOnlineText}>
                {isOnline ? 'En ligne' : 'Hors ligne'}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.mockBody}>
        <View style={styles.mockStatsCard}>
          <View style={styles.mockStatsTitleRow}>
            <Icon
              name="bar_chart"
              size={18}
              color={homePalette.brandBlue}
            />
            <Text style={styles.mockStatsTitle}>Statistiques du jour</Text>
          </View>

          <View style={styles.mockStatsGrid}>
            <View style={styles.mockStatCell}>
              <View style={styles.mockStatIconBlue}>
                <Icon
                  name="local_shipping"
                  size={18}
                  color={homePalette.brandBlue}
                />
              </View>
              <Text style={styles.mockStatValue}>{todayDeliveries}</Text>
              <Text style={styles.mockStatLabel}>Livraisons</Text>
              <Text style={styles.mockStatHint}>terminées</Text>
            </View>

            <View style={styles.mockStatDivider} />

            <View style={styles.mockStatCell}>
              <View style={styles.mockStatIconCyan}>
                <Icon
                  name="payments"
                  size={18}
                  color={homePalette.brandCyanDark}
                />
              </View>
              <Text style={styles.mockStatValue}>
                {formatStatAmount(todayEarnings)}
              </Text>
              <Text style={styles.mockStatLabel}>Gains</Text>
              <Text style={styles.mockStatHint}>
                {earningsCurrency} aujourd’hui
              </Text>
            </View>

            <View style={styles.mockStatDivider} />

            <View style={styles.mockStatCell}>
              <View style={styles.mockStatIconBlue}>
                <Icon
                  name="schedule"
                  size={18}
                  color={homePalette.brandBlue}
                />
              </View>
              <Text style={styles.mockStatValue}>
                {formatStatAmount(pendingEarnings)}
              </Text>
              <Text style={styles.mockStatLabel}>Gains</Text>
              <Text style={styles.mockStatHint}>
                {earningsCurrency} en attente
              </Text>
            </View>

            <View style={styles.mockStatDivider} />

            <View style={styles.mockStatCell}>
              <View style={styles.mockStatIconCyan}>
                <Icon
                  name="account_balance_wallet"
                  size={18}
                  color={homePalette.brandCyanDark}
                />
              </View>
              <Text style={styles.mockStatValue}>
                {formatStatAmount(outstandingCash)}
              </Text>
              <Text style={styles.mockStatLabel}>Espèces</Text>
              <Text style={styles.mockStatHint}>
                {cashCurrency} à remettre
              </Text>
            </View>
          </View>
        </View>

        {error ? (
          <Pressable
            style={styles.errorCard}
            onPress={() => {
              setLoading(true)
              void loadProfile()
            }}
          >
            <Icon name="error" size={20} color={colors.error} />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>
                Impossible de charger votre profil
              </Text>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.retryText}>Appuyez pour réessayer</Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.mockStatusCard}>
          <View style={styles.mockStatusMain}>
            <View style={styles.mockStatusCopy}>
              <View style={styles.mockStatusLabelRow}>
                <Icon
                  name="signal_cellular_alt"
                  size={16}
                  color={isOnline
                    ? homePalette.brandCyanDark
                    : colors.textMuted}
                />
                <Text style={styles.mockStatusLabel}>Statut</Text>
              </View>

              <Text
                style={[
                  styles.mockStatusValue,
                  isOnline && styles.mockStatusValueOnline,
                ]}
              >
                {isOnline ? 'En ligne' : 'Hors ligne'}
              </Text>

              <Text style={styles.mockStatusDescription}>
                {canWork
                  ? isOnline
                    ? 'Vous recevez les nouvelles offres'
                    : 'Activez votre disponibilité pour recevoir des offres'
                  : 'Votre compte n’est pas disponible pour les livraisons'}
              </Text>
            </View>

            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Disponibilité pour recevoir des livraisons"
              accessibilityState={{ checked: isOnline }}
              style={[
                styles.mockSwitch,
                isOnline && styles.mockSwitchOn,
                (
                  togglingOnline
                  || (!isOnline && !canWork)
                ) && styles.controlDisabled,
              ]}
              onPress={() => {
                void handleToggleOnline()
              }}
              disabled={
                togglingOnline
                || (!isOnline && !canWork)
              }
            >
              {togglingOnline ? (
                <ActivityIndicator
                  size="small"
                  color={colors.white}
                />
              ) : (
                <View
                  style={[
                    styles.mockSwitchKnob,
                    isOnline && styles.mockSwitchKnobOn,
                  ]}
                />
              )}
            </Pressable>
          </View>

          {actionError ? (
            <View style={styles.inlineError}>
              <Icon name="error" size={17} color={colors.error} />
              <Text style={styles.inlineErrorText}>{actionError}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.mockSectionHeader}>
          <Text style={styles.mockSectionTitle}>Offre en cours</Text>
          {offer ? (
            <View style={styles.mockNewOfferPill}>
              <Text style={styles.mockNewOfferText}>Nouvelle offre</Text>
            </View>
          ) : null}
        </View>

        {offer ? (
          <View style={styles.mockOfferCard}>
            <LinearGradient
              colors={['#F4F9FF', '#EDF8FF', '#EAFBFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.mockOfferInner}
            >
              <View style={styles.mockOfferTopRow}>
                <View>
                  <Text style={styles.mockOfferAmount}>
                    {offer.earning_amount} MAD
                  </Text>
                  <Text style={styles.mockOfferDistance}>
                    Commande #{offer.order_id}
                  </Text>
                </View>

                <View style={styles.mockOfferTimer}>
                  <Text style={styles.mockOfferTimerLabel}>Expire dans</Text>
                  <View style={styles.mockOfferTimerValueRow}>
                    <Icon
                      name="timer"
                      size={17}
                      color={homePalette.brandBlue}
                    />
                    <Text style={styles.mockOfferTimerValue}>
{formatCountdown(offerSecondsRemaining)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.mockRouteArea}>
                <View style={styles.mockRouteRail}>
                  <View style={styles.mockRouteDotCyan} />
                  <View style={styles.mockRouteLine} />
                  <View style={styles.mockRouteDotBlue} />
                </View>

                <View style={styles.mockRouteContent}>
                  <View style={styles.mockRouteStop}>
                    <Text style={styles.mockRouteTitle}>
                      {offer.pharmacy_name}
                    </Text>
                    <Text style={styles.mockRouteAddress}>
                      {offer.pharmacy_address}
                    </Text>
                  </View>

                  <View style={styles.mockRouteStop}>
                    <Text style={styles.mockRouteTitle}>Client</Text>
                    <Text style={styles.mockRouteAddress}>
                      Adresse disponible après acceptation
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={styles.mockMapButton}
                  onPress={() => {
                    void handleOpenOfferMap()
                  }}
                >
                  <Icon
                    name="navigation"
                    size={20}
                    color={homePalette.brandBlue}
                  />
                  <Text style={styles.mockMapButtonText}>
                    Voir sur{'\n'}la carte
                  </Text>
                </Pressable>
              </View>

              <View style={styles.mockOfferMetaRow}>
                <View style={styles.mockOfferMetaPill}>
                  <Icon
                    name="inventory_2"
                    size={15}
                    color={homePalette.brandBlue}
                  />
                  <Text style={styles.mockOfferMetaText}>
                    {offer.package_count} colis
                  </Text>
                </View>

                <View style={styles.mockOfferMetaPill}>
                  <Icon
                    name="payments"
                    size={15}
                    color={homePalette.brandCyanDark}
                  />
                  <Text style={styles.mockOfferMetaText}>
                    {paymentLabel(offer.payment_method)}
                  </Text>
                </View>
              </View>

              {offerError ? (
                <View style={styles.inlineError}>
                  <Icon name="error" size={17} color={colors.error} />
                  <Text style={styles.inlineErrorText}>{offerError}</Text>
                </View>
              ) : null}

              <View style={styles.mockOfferActions}>
                <Pressable
                  style={[
                    styles.mockDeclineButton,
                    (
                      offerAction !== null
                      || offerSecondsRemaining <= 0
                    ) && styles.controlDisabled,
                  ]}
                  onPress={() => {
                    void handleDeclineOffer()
                  }}
                  disabled={
                    offerAction !== null
                    || offerSecondsRemaining <= 0
                  }
                >
                  {offerAction === 'decline' ? (
                    <ActivityIndicator
                      size="small"
                      color={homePalette.brandBlue}
                    />
                  ) : (
                    <>
                      <Icon
                        name="close"
                        size={18}
                        color={homePalette.brandBlue}
                      />
                      <Text style={styles.mockDeclineText}>Refuser</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={[
                    styles.mockAcceptShell,
                    (
                      offerAction !== null
                      || offerSecondsRemaining <= 0
                    ) && styles.controlDisabled,
                  ]}
                  onPress={() => {
                    void handleAcceptOffer()
                  }}
                  disabled={
                    offerAction !== null
                    || offerSecondsRemaining <= 0
                  }
                >
                  <LinearGradient
                    colors={[homePalette.brandBlue, '#087AD9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.mockAcceptButton}
                  >
                    {offerAction === 'accept' ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.white}
                      />
                    ) : (
                      <>
                        <Text style={styles.mockAcceptText}>Accepter</Text>
                        <Icon
                          name="check"
                          size={18}
                          color={colors.white}
                        />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </LinearGradient>
          </View>
        ) : (
          <View style={styles.offerEmptyCard}>
            <View style={styles.emptyIconShell}>
              <Icon
                name={isOnline ? 'radar' : 'wifi_off'}
                size={27}
                color={isOnline
                  ? homePalette.brandBlue
                  : colors.textMuted}
              />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.offerEmptyTitle}>
                {isOnline
                  ? 'En attente d’une nouvelle offre'
                  : 'Passez en ligne pour recevoir des offres'}
              </Text>
              <Text style={styles.offerEmptyText}>
                {isOnline
                  ? 'Les nouvelles demandes apparaîtront automatiquement ici.'
                  : 'Votre position sera utilisée pour rechercher les livraisons proches.'}
              </Text>
            </View>
          </View>
        )}

        {offerMessage ? (
          <View style={styles.successBanner}>
            <Icon
              name="check_circle"
              size={18}
              color={homePalette.brandCyanDark}
            />
            <Text style={styles.successBannerText}>{offerMessage}</Text>
          </View>
        ) : null}

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionEyebrow}>MISSION</Text>
          <Text style={styles.sectionTitle}>Livraison active</Text>
        </View>
      </View>

      {activeOrder ? (
        <View style={styles.activeOrderCard}>
          <View style={styles.activeOrderHeader}>
            <View style={styles.activeOrderTitleGroup}>
              <LinearGradient
                colors={[homePalette.softBlue, homePalette.softCyan]}
                style={styles.activeOrderIcon}
              >
                <Icon
                  name="inventory_2"
                  size={23}
                  color={homePalette.brandBlue}
                />
              </LinearGradient>

              <View style={styles.activeOrderTitleText}>
                <Text style={styles.activeOrderEyebrow}>
                  COMMANDE #{activeOrder.id}
                </Text>
                <Text style={styles.activeOrderPharmacy}>
                  {activeOrder.pharmacy_name}
                </Text>
              </View>
            </View>

            <View style={styles.activeOrderStatusBadge}>
              <View style={styles.statusPulse} />
              <Text style={styles.activeOrderStatusText}>
                {statusLabel(activeOrder.status)}
              </Text>
            </View>
          </View>

          <DeliveryProgress status={activeOrder.status} />

          <View style={styles.routeCard}>
            <View style={styles.routeStop}>
              <View style={styles.routeIconPharmacy}>
                <Icon
                  name="local_pharmacy"
                  size={18}
                  color={homePalette.brandCyanDark}
                />
              </View>
              <View style={styles.routeText}>
                <Text style={styles.routeLabel}>Pharmacie</Text>
                <Text style={styles.routeValue}>
                  {activeOrder.pharmacy_address}
                </Text>
              </View>
            </View>

            <View style={styles.routeConnector}>
              <View style={styles.routeConnectorLine} />
            </View>

            <View style={styles.routeStop}>
              <View style={styles.routeIconCustomer}>
                <Icon
                  name="location_on"
                  size={18}
                  color={homePalette.brandBlue}
                />
              </View>
              <View style={styles.routeText}>
                <Text style={styles.routeLabel}>Destination client</Text>
                <Text style={styles.routeValue}>
                  {activeOrder.delivery_address}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.activeOrderInfoGrid}>
            <View style={styles.activeOrderInfoBox}>
              <Icon name="phone" size={16} color={homePalette.brandBlue} />
              <Text style={styles.activeOrderInfoLabel}>Client</Text>
              <Text style={styles.activeOrderInfoValue} numberOfLines={1}>
                {activeOrder.customer_phone || '—'}
              </Text>
            </View>

            <View style={styles.activeOrderInfoBox}>
              <Icon name="payments" size={16} color={homePalette.brandBlue} />
              <Text style={styles.activeOrderInfoLabel}>Paiement</Text>
              <Text style={styles.activeOrderInfoValue} numberOfLines={1}>
                {compactPaymentLabel(activeOrder.payment_method)}
              </Text>
            </View>

            <View style={styles.activeOrderInfoBox}>
              <Icon name="receipt_long" size={16} color={homePalette.brandBlue} />
              <Text style={styles.activeOrderInfoLabel}>Total</Text>
              <Text style={styles.activeOrderInfoValue} numberOfLines={1}>
                {activeOrder.grand_total} MAD
              </Text>
            </View>
          </View>

          {activeOrder.notes ? (
            <View style={styles.notesBox}>
              <Icon name="sticky_note_2" size={18} color={homePalette.brandBlue} />
              <View style={styles.notesCopy}>
                <Text style={styles.notesLabel}>Note de livraison</Text>
                <Text style={styles.notesText}>{activeOrder.notes}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.mapShell}>
            <DeliveryNavigationMap
              status={activeOrder.status}
              agentLatitude={profile?.latitude ?? null}
              agentLongitude={profile?.longitude ?? null}
              pharmacyLatitude={activeOrder.pharmacy_latitude}
              pharmacyLongitude={activeOrder.pharmacy_longitude}
              pharmacyName={activeOrder.pharmacy_name}
              pharmacyAddress={activeOrder.pharmacy_address}
              customerLatitude={activeOrder.delivery_latitude}
              customerLongitude={activeOrder.delivery_longitude}
              customerAddress={activeOrder.delivery_address}
              height={260}
              variant="brand"
            />
          </View>

          {activeOrder.status === 'awaiting_agent' ? (
            <View style={styles.nextActionCard}>
              <View style={styles.nextActionHeader}>
                <View style={styles.nextActionIcon}>
                  <Icon
                    name="vpn_key"
                    size={20}
                    color={homePalette.brandBlue}
                  />
                </View>
                <View style={styles.nextActionHeaderText}>
                  <Text style={styles.nextActionEyebrow}>PROCHAINE ÉTAPE</Text>
                  <Text style={styles.nextActionTitle}>Confirmer le retrait</Text>
                  <Text style={styles.nextActionSubtitle}>
                    Scannez le QR de la pharmacie ou saisissez le PIN à 6 chiffres.
                  </Text>
                </View>
              </View>

              <Pressable
                style={[
                  styles.qrPickupButton,
                  verifyingPickup && styles.controlDisabled,
                ]}
                onPress={() => {
                  setPickupError('')
                  setQrScannerVisible(true)
                }}
                disabled={verifyingPickup}
              >
                <View style={styles.qrIconShell}>
                  <Icon
                    name="qr_code_scanner"
                    size={21}
                    color={homePalette.brandBlue}
                  />
                </View>
                <View style={styles.qrButtonCopy}>
                  <Text style={styles.qrPickupButtonText}>Scanner le QR</Text>
                  <Text style={styles.qrPickupButtonHint}>
                    Méthode recommandée
                  </Text>
                </View>
                <Icon
                  name="chevron_right"
                  size={22}
                  color={homePalette.brandBlue}
                />
              </Pressable>

              <View style={styles.pickupDivider}>
                <View style={styles.pickupDividerLine} />
                <Text style={styles.pickupDividerText}>OU AVEC LE PIN</Text>
                <View style={styles.pickupDividerLine} />
              </View>

              <TextInput
                style={styles.pinInput}
                value={pickupPin}
                onChangeText={(value) => {
                  const digits = value.replace(/\D/g, '').slice(0, 6)
                  setPickupPin(digits)
                  if (pickupError) {
                    setPickupError('')
                  }
                }}
                placeholder="• • • • • •"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!verifyingPickup}
                maxLength={6}
              />

              {pickupError ? (
                <View style={styles.inlineError}>
                  <Icon name="error" size={17} color={colors.error} />
                  <Text style={styles.inlineErrorText}>{pickupError}</Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.primaryButtonShell,
                  (
                    verifyingPickup
                    || pickupPin.trim().length !== 6
                  ) && styles.controlDisabled,
                ]}
                onPress={() => {
                  void handleVerifyPickupPin()
                }}
                disabled={
                  verifyingPickup
                  || pickupPin.trim().length !== 6
                }
              >
                <LinearGradient
                  colors={[homePalette.brandBlue, '#087AD9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
                  {verifyingPickup ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Icon name="check_circle" size={20} color={colors.white} />
                  )}
                  <Text style={styles.primaryButtonText}>
                    {verifyingPickup
                      ? 'Vérification…'
                      : 'Confirmer le retrait'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : null}

          {activeOrder.status === 'picked_up' ? (
            <View style={styles.nextActionCard}>
              <View style={styles.nextActionHeader}>
                <View style={styles.nextActionIcon}>
                  <Icon
                    name="navigation"
                    size={20}
                    color={homePalette.brandBlue}
                  />
                </View>
                <View style={styles.nextActionHeaderText}>
                  <Text style={styles.nextActionEyebrow}>PROCHAINE ÉTAPE</Text>
                  <Text style={styles.nextActionTitle}>Démarrer la livraison</Text>
                  <Text style={styles.nextActionSubtitle}>
                    Le colis est récupéré. Démarrez le trajet lorsque vous quittez la pharmacie.
                  </Text>
                </View>
              </View>

              {startDeliveryError ? (
                <View style={styles.inlineError}>
                  <Icon name="error" size={17} color={colors.error} />
                  <Text style={styles.inlineErrorText}>{startDeliveryError}</Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.primaryButtonShell,
                  startingDelivery && styles.controlDisabled,
                ]}
                onPress={() => {
                  void handleStartDelivery()
                }}
                disabled={startingDelivery}
              >
                <LinearGradient
                  colors={[homePalette.brandBlue, '#087AD9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
                  {startingDelivery ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Icon name="delivery_dining" size={21} color={colors.white} />
                  )}
                  <Text style={styles.primaryButtonText}>
                    {startingDelivery
                      ? 'Démarrage…'
                      : 'Démarrer la livraison'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : null}

          {activeOrder.status === 'out_for_delivery' ? (
            <View style={styles.nextActionCard}>
              <View style={styles.nextActionHeader}>
                <View style={styles.nextActionIcon}>
                  <Icon
                    name="person_pin_circle"
                    size={20}
                    color={homePalette.brandBlue}
                  />
                </View>
                <View style={styles.nextActionHeaderText}>
                  <Text style={styles.nextActionEyebrow}>DERNIÈRE ÉTAPE</Text>
                  <Text style={styles.nextActionTitle}>Remise au client</Text>
                  <Text style={styles.nextActionSubtitle}>
                    Demandez le PIN à 6 chiffres du client pour confirmer la remise.
                  </Text>
                </View>
              </View>

              <TextInput
                style={styles.pinInput}
                value={deliveryPin}
                onChangeText={(value) => {
                  const digits = value.replace(/\D/g, '').slice(0, 6)
                  setDeliveryPin(digits)
                  if (completionError) {
                    setCompletionError('')
                  }
                }}
                placeholder="• • • • • •"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!completingDelivery}
                maxLength={6}
              />

              {activeOrder.payment_method === 'cash' ? (
                <Pressable
                  style={[
                    styles.cashConfirmationRow,
                    cashConfirmed && styles.cashConfirmationRowChecked,
                  ]}
                  onPress={() => {
                    if (!completingDelivery) {
                      setCashConfirmed((current) => !current)
                      setCompletionError('')
                    }
                  }}
                  disabled={completingDelivery}
                >
                  <View
                    style={[
                      styles.cashCheckbox,
                      cashConfirmed && styles.cashCheckboxChecked,
                    ]}
                  >
                    {cashConfirmed ? (
                      <Icon name="check" size={16} color={colors.white} />
                    ) : null}
                  </View>

                  <View style={styles.cashConfirmationText}>
                    <Text style={styles.cashConfirmationTitle}>
                      Paiement en espèces reçu
                    </Text>
                    <Text style={styles.cashConfirmationSubtitle}>
                      Cochez uniquement après avoir reçu le montant du client.
                    </Text>
                  </View>
                </Pressable>
              ) : (
                <View style={styles.cardPaymentNotice}>
                  <View style={styles.cardPaymentIcon}>
                    <Icon
                      name="credit_card"
                      size={18}
                      color={homePalette.brandCyanDark}
                    />
                  </View>
                  <View style={styles.cardPaymentCopy}>
                    <Text style={styles.cardPaymentTitle}>
                      Paiement déjà géré en ligne
                    </Text>
                    <Text style={styles.cardPaymentNoticeText}>
                      Aucune collecte d’espèces n’est nécessaire.
                    </Text>
                  </View>
                </View>
              )}

              {completionError ? (
                <View style={styles.inlineError}>
                  <Icon name="error" size={17} color={colors.error} />
                  <Text style={styles.inlineErrorText}>{completionError}</Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.primaryButtonShell,
                  (
                    completingDelivery
                    || deliveryPin.length !== 6
                    || (
                      activeOrder.payment_method === 'cash'
                      && !cashConfirmed
                    )
                  ) && styles.controlDisabled,
                ]}
                onPress={() => {
                  void handleCompleteDelivery()
                }}
                disabled={
                  completingDelivery
                  || deliveryPin.length !== 6
                  || (
                    activeOrder.payment_method === 'cash'
                    && !cashConfirmed
                  )
                }
              >
                <LinearGradient
                  colors={[homePalette.brandBlue, '#087AD9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
                  {completingDelivery ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Icon name="done_all" size={21} color={colors.white} />
                  )}
                  <Text style={styles.primaryButtonText}>
                    {completingDelivery
                      ? 'Confirmation…'
                      : 'Confirmer la livraison'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.activeEmptyCard}>
          <LinearGradient
            colors={[homePalette.softBlue, homePalette.softCyan]}
            style={styles.activeEmptyIcon}
          >
            <Icon
              name="inventory_2"
              size={28}
              color={homePalette.brandBlue}
            />
          </LinearGradient>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>Aucune livraison active</Text>
            <Text style={styles.emptyText}>
              Acceptez une offre pour démarrer votre prochaine mission.
            </Text>
          </View>
        </View>
      )}

      {completionMessage ? (
        <View style={styles.successBanner}>
          <Icon
            name="check_circle"
            size={19}
            color={homePalette.brandCyanDark}
          />
          <Text style={styles.successBannerText}>{completionMessage}</Text>
        </View>
      ) : null}

      {activeOrderError ? (
        <Pressable
          style={styles.errorCard}
          onPress={() => {
            void loadActiveOrder()
          }}
        >
          <Icon name="error" size={18} color={colors.error} />
          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>Livraison non actualisée</Text>
            <Text style={styles.errorText}>{activeOrderError}</Text>
            <Text style={styles.retryText}>Appuyez pour réessayer</Text>
          </View>
        </Pressable>
      ) : null}


        <View style={styles.mockSectionHeader}>
          <Text style={styles.mockSectionTitle}>Activité récente</Text>
          <Pressable
            onPress={() => {
              navigation.navigate('Deliveries')
            }}
          >
            <Text style={styles.mockSeeAll}>Voir tout</Text>
          </Pressable>
        </View>

        {recentEarning ? (
          <View style={styles.mockRecentCard}>
            <View style={styles.mockRecentIcon}>
              <Icon
                name="check"
                size={20}
                color={colors.white}
              />
            </View>

            <View style={styles.mockRecentCopy}>
              <Text style={styles.mockRecentOrder}>
                #{recentEarning.order_id}
              </Text>
              <Text style={styles.mockRecentMeta}>
                Livré · {formatActivityTime(
                  recentEarning.earned_at ?? recentEarning.created_at,
                )}
              </Text>
            </View>

            <Text style={styles.mockRecentAmount}>
              {formatStatAmount(recentEarning.amount)} {recentEarning.currency}
            </Text>

            <Icon
              name="chevron_right"
              size={20}
              color={colors.textMuted}
            />
          </View>
        ) : (
          <View style={styles.mockRecentEmpty}>
            <Text style={styles.mockRecentEmptyText}>
              Aucune activité récente.
            </Text>
          </View>
        )}

      {activeOrder ? (
        <View style={styles.safetyCard}>
          <View style={styles.safetyIcon}>
            <Icon name="verified_user" size={19} color={homePalette.warning} />
          </View>
          <View style={styles.safetyCopy}>
            <Text style={styles.safetyTitle}>Rappel important</Text>
            <Text style={styles.safetyText}>
              Vérifiez toujours la commande et les codes de confirmation avant de valider une étape.
            </Text>
          </View>
        </View>
      ) : null}

      </View>

      </ScrollView>

      <PickupQrScanner
        visible={qrScannerVisible}
        onClose={() => {
          setQrScannerVisible(false)
        }}
        onScanned={(credential) => {
          void handleVerifyPickupQr(credential)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: homePalette.screen,
  },

  statusBarGuard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: homePalette.brandBlueDark,
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: homePalette.screen,
  },

  centerStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  screen: {
    flex: 1,
    backgroundColor: homePalette.screen,
  },

  content: {
    paddingBottom: 36,
  },

  mockHero: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 238,
    paddingTop: 58,
    paddingHorizontal: 24,
    paddingBottom: 76,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },

  mockHeroGlow: {
    position: 'absolute',
    top: -90,
    right: -55,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(18, 201, 211, 0.16)',
  },

  mockHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },

  mockHeroCopy: {
    flex: 1,
    paddingTop: 2,
  },

  mockHeroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: -0.6,
  },

  mockHeroSubtitle: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
  },

  mockHeroActions: {
    alignItems: 'flex-end',
    gap: 10,
  },

  mockNotificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },


  mockNotificationBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF233C',
    borderWidth: 2,
    borderColor: colors.white,
  },

  mockNotificationBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.white,
  },

  mockOnlinePill: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },

  mockOnlineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: homePalette.brandCyan,
  },

  mockOnlineDotOffline: {
    backgroundColor: '#B9C5DC',
  },

  mockOnlineText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.white,
  },

  mockBody: {
    paddingHorizontal: 18,
  },

  mockStatsCard: {
    marginTop: -52,
    borderRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 17,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
    shadowColor: '#102B61',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },

  mockStatsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 15,
  },

  mockStatsTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  mockStatsGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  mockStatCell: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },

  mockStatDivider: {
    width: 1,
    marginHorizontal: 4,
    backgroundColor: '#E9EEF7',
  },

  mockStatIconBlue: {
    width: 33,
    height: 33,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F1FF',
  },

  mockStatIconCyan: {
    width: 33,
    height: 33,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5FBFC',
  },

  mockStatValue: {
    marginTop: 9,
    fontSize: 17,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  mockStatLabel: {
    marginTop: 7,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },

  mockStatHint: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },

  mockStatusCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
    shadowColor: '#102B61',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 13,
    elevation: 2,
  },

  mockStatusMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  mockStatusCopy: {
    flex: 1,
  },

  mockStatusLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  mockStatusLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: homePalette.brandCyanDark,
  },

  mockStatusValue: {
    marginTop: 5,
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  mockStatusValueOnline: {
    color: homePalette.brandCyanDark,
  },

  mockStatusDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  mockSwitch: {
    width: 58,
    height: 34,
    borderRadius: 17,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: '#DCE5F3',
  },

  mockSwitchOn: {
    backgroundColor: homePalette.brandBlue,
  },

  mockSwitchKnob: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    shadowColor: '#09276A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },

  mockSwitchKnobOn: {
    alignSelf: 'flex-end',
  },

  mockSectionHeader: {
    marginTop: 24,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  mockSectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  mockNewOfferPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#E8F6FF',
  },

  mockNewOfferText: {
    fontSize: 10,
    fontWeight: '900',
    color: homePalette.brandBlue,
  },

  mockOfferCard: {
    borderRadius: 19,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D7E7FA',
    shadowColor: '#102B61',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },

  mockOfferInner: {
    padding: 16,
  },

  mockOfferTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },

  mockOfferAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: homePalette.brandBlue,
    letterSpacing: -0.5,
  },

  mockOfferDistance: {
    marginTop: 4,
    fontSize: 11,
    color: colors.textSecondary,
  },

  mockOfferTimer: {
    alignItems: 'flex-end',
  },

  mockOfferTimerLabel: {
    fontSize: 10,
    color: colors.textSecondary,
  },

  mockOfferTimerValueRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  mockOfferTimerValue: {
    fontSize: 20,
    fontWeight: '900',
    color: homePalette.brandBlue,
    fontVariant: ['tabular-nums'],
  },

  mockRouteArea: {
    marginTop: 17,
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  mockRouteRail: {
    width: 18,
    alignItems: 'center',
    paddingTop: 5,
    paddingBottom: 7,
  },

  mockRouteDotCyan: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: homePalette.brandCyan,
  },

  mockRouteLine: {
    width: 2,
    flex: 1,
    minHeight: 36,
    marginVertical: 3,
    backgroundColor: '#C8D9EC',
  },

  mockRouteDotBlue: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: homePalette.brandBlue,
  },

  mockRouteContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingLeft: 7,
    paddingRight: 10,
  },

  mockRouteStop: {
    minHeight: 44,
  },

  mockRouteTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  mockRouteAddress: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },

  mockMapButton: {
    width: 82,
    minHeight: 92,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#D9E6F7',
  },

  mockMapButtonText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    textAlign: 'center',
    color: homePalette.brandBlue,
  },

  mockOfferMetaRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },

  mockOfferMetaPill: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },

  mockOfferMetaText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  mockOfferActions: {
    marginTop: 15,
    flexDirection: 'row',
    gap: 10,
  },

  mockDeclineButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: homePalette.brandBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },

  mockDeclineText: {
    fontSize: 13,
    fontWeight: '900',
    color: homePalette.brandBlue,
  },

  mockAcceptShell: {
    flex: 1.25,
    borderRadius: 13,
    overflow: 'hidden',
  },

  mockAcceptButton: {
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  mockAcceptText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.white,
  },

  mockSeeAll: {
    fontSize: 11,
    fontWeight: '800',
    color: homePalette.brandBlue,
  },

  mockRecentCard: {
    minHeight: 70,
    padding: 13,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
  },

  mockRecentIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.brandCyanDark,
  },

  mockRecentCopy: {
    flex: 1,
  },

  mockRecentOrder: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  mockRecentMeta: {
    marginTop: 3,
    fontSize: 10,
    color: colors.textSecondary,
  },

  mockRecentAmount: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  mockRecentEmpty: {
    minHeight: 62,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
  },

  mockRecentEmptyText: {
    fontSize: 11,
    color: colors.textMuted,
  },

  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    padding: 22,
    minHeight: 178,
    marginBottom: 14,
    shadowColor: homePalette.brandBlueDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },

  heroGlow: {
    position: 'absolute',
    top: -65,
    right: -55,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(18, 201, 211, 0.24)',
  },

  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },

  heroCopy: {
    flex: 1,
  },

  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#BEEFF4',
  },

  heroTitle: {
    marginTop: 7,
    fontSize: 28,
    fontWeight: '900',
    color: colors.white,
  },

  heroSubtitle: {
    marginTop: 7,
    maxWidth: 270,
    fontSize: 13,
    lineHeight: 19,
    color: '#DCEBFF',
  },

  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },

  heroStatusPill: {
    marginTop: 22,
    alignSelf: 'flex-start',
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },

  heroStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },

  heroStatusDotOnline: {
    backgroundColor: '#5BF2D8',
  },

  heroStatusDotOffline: {
    backgroundColor: '#D3D9E5',
  },

  heroStatusText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.white,
  },

  errorCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.errorBg,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.error,
  },

  errorText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: colors.errorText,
  },

  retryText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: homePalette.brandBlue,
  },

  statsCard: {
    marginTop: 14,
    borderRadius: 22,
    padding: 17,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
    shadowColor: '#142850',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },

  cardEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: colors.textMuted,
  },

  statsRow: {
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  statIconBlue: {
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.softBlue,
  },

  statIconCyan: {
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.softCyan,
  },

  statText: {
    flex: 1,
  },

  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  statLabel: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textSecondary,
  },

  statDivider: {
    width: 1,
    marginHorizontal: 12,
    backgroundColor: homePalette.cardBorder,
  },

  statusCard: {
    marginTop: 14,
    borderRadius: 22,
    padding: 17,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
  },

  statusMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  statusIconShell: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.softCyan,
  },

  statusCopy: {
    flex: 1,
  },

  statusLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.textMuted,
  },

  statusValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  statusValueOnline: {
    color: homePalette.brandCyanDark,
  },

  statusDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  onlineSwitch: {
    width: 58,
    height: 34,
    borderRadius: 999,
    padding: 4,
    justifyContent: 'center',
    backgroundColor: '#D8DEE8',
  },

  onlineSwitchOn: {
    backgroundColor: homePalette.brandBlue,
  },

  switchKnob: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },

  switchKnobOn: {
    alignSelf: 'flex-end',
  },

  workStatusRow: {
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: homePalette.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  workStatusText: {
    flex: 1,
    fontSize: 11,
    color: colors.textSecondary,
  },

  workStatusTextSuspended: {
    color: colors.error,
    fontWeight: '700',
  },

  inlineError: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  inlineErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },

  sectionHeadingRow: {
    marginTop: 27,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },

  sectionEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: homePalette.brandCyanDark,
  },

  sectionTitle: {
    marginTop: 2,
    fontSize: 19,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  liveBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E9FFF9',
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#18B981',
  },

  liveText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0B8E65',
    letterSpacing: 0.6,
  },

  offerCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D7E8FF',
    shadowColor: '#123B80',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },

  offerAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: homePalette.brandCyan,
  },

  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },

  offerTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  offerIcon: {
    width: 45,
    height: 45,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.softBlue,
  },

  offerTitleText: {
    flex: 1,
  },

  offerEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    color: homePalette.brandCyanDark,
  },

  offerPharmacy: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: colors.errorBg,
  },

  countdownLabel: {
    fontSize: 8,
    color: colors.error,
  },

  countdownText: {
    marginTop: 1,
    fontSize: 14,
    fontWeight: '900',
    color: colors.error,
  },

  offerAddressRow: {
    marginTop: 17,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  smallRouteIcon: {
    width: 31,
    height: 31,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.softCyan,
  },

  offerAddressCopy: {
    flex: 1,
  },

  offerAddressLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  offerAddress: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  offerStats: {
    marginTop: 17,
    flexDirection: 'row',
    gap: 8,
  },

  offerStatPrimary: {
    flex: 1.25,
    minHeight: 66,
    justifyContent: 'center',
    borderRadius: 16,
    padding: 11,
    backgroundColor: homePalette.softBlue,
  },

  offerStat: {
    flex: 1,
    minHeight: 66,
    justifyContent: 'center',
    borderRadius: 16,
    padding: 10,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
  },

  offerStatLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.textMuted,
  },

  offerEarning: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '900',
    color: homePalette.brandBlue,
  },

  offerStatValue: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  offerActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },

  declineButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: homePalette.brandBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.surfaceLowest,
  },

  declineButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: homePalette.brandBlue,
  },

  acceptButtonShell: {
    flex: 1.35,
    borderRadius: 16,
    overflow: 'hidden',
  },

  acceptButton: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  acceptButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.white,
  },

  controlDisabled: {
    opacity: 0.48,
  },

  offerEmptyCard: {
    minHeight: 108,
    borderRadius: 22,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
  },

  emptyIconShell: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.softBlue,
  },

  emptyCopy: {
    flex: 1,
  },

  offerEmptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  offerEmptyText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  successBanner: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 16,
    padding: 13,
    backgroundColor: homePalette.softCyan,
    borderWidth: 1,
    borderColor: '#BCEFF1',
  },

  successBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: homePalette.brandCyanDark,
  },

  activeOrderCard: {
    borderRadius: 24,
    padding: 17,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
    shadowColor: '#142850',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },

  activeOrderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },

  activeOrderTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  activeOrderIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  activeOrderTitleText: {
    flex: 1,
  },

  activeOrderEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: colors.textMuted,
  },

  activeOrderPharmacy: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  activeOrderStatusBadge: {
    maxWidth: 135,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: homePalette.softBlue,
  },

  statusPulse: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: homePalette.brandCyan,
  },

  activeOrderStatusText: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '900',
    color: homePalette.brandBlue,
    textAlign: 'center',
  },

  progressCard: {
    marginTop: 17,
    borderRadius: 17,
    paddingHorizontal: 8,
    paddingVertical: 13,
    backgroundColor: '#FAFCFF',
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
  },

  progressTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  progressItem: {
    flex: 1,
    alignItems: 'center',
  },

  progressRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#DDE5F0',
  },

  progressLineReached: {
    backgroundColor: homePalette.brandBlue,
  },

  progressDot: {
    width: 29,
    height: 29,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF1F5',
    borderWidth: 1,
    borderColor: '#E2E7EF',
  },

  progressDotReached: {
    backgroundColor: homePalette.brandBlue,
    borderColor: homePalette.brandBlue,
  },

  progressDotCurrent: {
    shadowColor: homePalette.brandBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 7,
    elevation: 3,
  },

  progressNumber: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textMuted,
  },

  progressNumberReached: {
    color: colors.white,
  },

  progressLabel: {
    marginTop: 7,
    fontSize: 8,
    color: colors.textMuted,
    textAlign: 'center',
  },

  progressLabelReached: {
    fontWeight: '800',
    color: colors.textPrimary,
  },

  routeCard: {
    marginTop: 16,
    borderRadius: 17,
    padding: 13,
    backgroundColor: '#FAFCFF',
  },

  routeStop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  routeIconPharmacy: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.softCyan,
  },

  routeIconCustomer: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.softBlue,
  },

  routeText: {
    flex: 1,
  },

  routeLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.textMuted,
  },

  routeValue: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  routeConnector: {
    height: 18,
    marginLeft: 15,
    justifyContent: 'center',
  },

  routeConnectorLine: {
    width: 2,
    height: 18,
    backgroundColor: '#C9D7EA',
  },

  activeOrderInfoGrid: {
    marginTop: 13,
    flexDirection: 'row',
    gap: 8,
  },

  activeOrderInfoBox: {
    flex: 1,
    minHeight: 79,
    borderRadius: 15,
    padding: 10,
    backgroundColor: homePalette.softBlue,
  },

  activeOrderInfoLabel: {
    marginTop: 7,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },

  activeOrderInfoValue: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  notesBox: {
    marginTop: 13,
    borderRadius: 15,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
  },

  notesCopy: {
    flex: 1,
  },

  notesLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },

  notesText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  mapShell: {
    marginTop: 15,
    overflow: 'hidden',
    borderRadius: 18,
  },

  nextActionCard: {
    marginTop: 16,
    borderRadius: 19,
    padding: 15,
    backgroundColor: '#F9FBFF',
    borderWidth: 1,
    borderColor: '#DCE8F8',
  },

  nextActionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  nextActionIcon: {
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.softBlue,
  },

  nextActionHeaderText: {
    flex: 1,
  },

  nextActionEyebrow: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: homePalette.brandCyanDark,
  },

  nextActionTitle: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  nextActionSubtitle: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  qrPickupButton: {
    marginTop: 15,
    minHeight: 62,
    borderWidth: 1,
    borderColor: '#BCD4F8',
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceLowest,
  },

  qrIconShell: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: homePalette.softBlue,
  },

  qrButtonCopy: {
    flex: 1,
  },

  qrPickupButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: homePalette.brandBlue,
  },

  qrPickupButtonHint: {
    marginTop: 2,
    fontSize: 9,
    color: colors.textMuted,
  },

  pickupDivider: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  pickupDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#DDE5F0',
  },

  pickupDividerText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textMuted,
  },

  pinInput: {
    marginTop: 14,
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: '#C9D8EC',
    borderRadius: 16,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 5,
    textAlign: 'center',
    color: homePalette.brandBlue,
    backgroundColor: colors.surfaceLowest,
  },

  primaryButtonShell: {
    marginTop: 14,
    borderRadius: 16,
    overflow: 'hidden',
  },

  primaryButton: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  primaryButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.white,
  },

  cashConfirmationRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderRadius: 16,
    padding: 13,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
  },

  cashConfirmationRowChecked: {
    backgroundColor: homePalette.softCyan,
    borderColor: '#A9E8EB',
  },

  cashCheckbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: homePalette.brandBlue,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
  },

  cashCheckboxChecked: {
    backgroundColor: homePalette.brandBlue,
  },

  cashConfirmationText: {
    flex: 1,
  },

  cashConfirmationTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  cashConfirmationSubtitle: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: colors.textSecondary,
  },

  cardPaymentNotice: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    padding: 13,
    backgroundColor: homePalette.softCyan,
  },

  cardPaymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
  },

  cardPaymentCopy: {
    flex: 1,
  },

  cardPaymentTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: homePalette.brandCyanDark,
  },

  cardPaymentNoticeText: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 14,
    color: colors.textSecondary,
  },

  activeEmptyCard: {
    minHeight: 105,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: homePalette.cardBorder,
  },

  activeEmptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  emptyText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  safetyCard: {
    marginTop: 18,
    borderRadius: 17,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: homePalette.warningBg,
    borderWidth: 1,
    borderColor: '#FBE6A8',
  },

  safetyIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3C6',
  },

  safetyCopy: {
    flex: 1,
  },

  safetyTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#8B5A00',
  },

  safetyText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: '#7A5B1A',
  },
})
