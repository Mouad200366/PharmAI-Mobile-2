import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'

import Icon from '../../components/ui/Icon'
import PickupQrScanner from '../../components/delivery/PickupQrScanner'
import DeliveryNavigationMap from '../../components/delivery/DeliveryNavigationMap'
import {
  deliveryApi,
  type DeliveryAgentProfile,
  type DeliveryOffer,
  type DeliveryOrder,
} from '../../api/delivery'
import { firstError } from '../../api/errors'
import { colors } from '../../theme/colors'

const OFFER_REFRESH_INTERVAL_MS = 2_000
const ACTIVE_ORDER_REFRESH_INTERVAL_MS = 5_000

function statusLabel(status: string) {
  switch (status) {
    case 'awaiting_agent':
      return 'En attente du livreur'
    case 'picked_up':
      return 'Colis récupéré'
    case 'out_for_delivery':
      return 'En cours de livraison'
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

function formatStatAmount(value: string) {
  const amount = Number(value)

  return Number.isFinite(amount)
    ? amount.toFixed(2)
    : value
}

export default function DeliveryHome() {
  const [profile, setProfile] =
    useState<DeliveryAgentProfile | null>(null)
  const [loading, setLoading] = useState(true)
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
      const { data } = await deliveryApi.me()
      setProfile(data)
    } catch (err: unknown) {
      setError(firstError(err))
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

  const loadTodayStats = useCallback(async () => {
    try {
      const [
        summaryResponse,
        historyResponse,
      ] = await Promise.all([
        deliveryApi.earningsSummary(),
        deliveryApi.earningsHistory(),
      ])

      const now = new Date()
      const deliveredToday = historyResponse.data.filter((item) => (
        (item.status === 'earned' || item.status === 'paid')
        && item.earned_at !== null
        && isSameLocalDay(item.earned_at, now)
      )).length

      setTodayDeliveries(deliveredToday)
      setTodayEarnings(summaryResponse.data.today_earned)
    } catch {
      // The Home dashboard stats are secondary information.
      // Keep the last known values if this small summary request fails.
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void loadProfile()
      void loadOffer()
      void loadActiveOrder()
      void loadTodayStats()

      const offerInterval = setInterval(() => {
        void loadOffer()
      }, OFFER_REFRESH_INTERVAL_MS)

      const activeOrderInterval = setInterval(() => {
        void loadActiveOrder()
      }, ACTIVE_ORDER_REFRESH_INTERVAL_MS)

      return () => {
        clearInterval(offerInterval)
        clearInterval(activeOrderInterval)
      }
    }, [
      loadActiveOrder,
      loadOffer,
      loadProfile,
      loadTodayStats,
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

  const isOnline = profile?.is_online ?? false
  const canWork = profile?.can_work ?? false

  const currentStatusLabel = isOnline
    ? 'En ligne'
    : 'Hors ligne'

  const workLabel = canWork
    ? 'Compte prêt à travailler'
    : 'Compte indisponible'

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

      void loadActiveOrder()
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
  ])

  if (loading && profile === null) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />
        <Text style={styles.centerStateText}>
          Chargement de votre espace livreur…
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            Espace livreur
          </Text>
          <Text style={styles.title}>
            Bonjour 👋
          </Text>
          <Text style={styles.subtitle}>
            Gérez votre disponibilité et vos livraisons depuis un seul endroit.
          </Text>
        </View>

        <View style={styles.avatar}>
          <Icon
            name="delivery_dining"
            size={28}
            color={colors.primary}
          />
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
          <Icon
            name="error"
            size={20}
            color={colors.error}
          />
          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>
              Impossible de charger votre profil
            </Text>
            <Text style={styles.errorText}>
              {error}
            </Text>
            <Text style={styles.retryText}>
              Appuyez pour réessayer
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View style={styles.statusCard}>
        <View style={styles.statusTopRow}>
          <View style={styles.statusIdentity}>
            <View
              style={[
                styles.statusDot,
                isOnline
                  ? styles.onlineDot
                  : styles.offlineDot,
              ]}
            />

            <View>
              <Text style={styles.statusLabel}>
                Statut actuel
              </Text>
              <Text style={styles.statusValue}>
                {currentStatusLabel}
              </Text>
            </View>
          </View>

          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        <Text style={styles.statusDescription}>
          {workLabel}
          {profile?.work_status
            ? ` · ${profile.work_status}`
            : ''}
        </Text>

        <Pressable
          style={[
            styles.primaryAction,
            (
              togglingOnline
              || (!isOnline && !canWork)
            ) && styles.primaryActionDisabled,
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
            <Icon
              name="power_settings_new"
              size={20}
              color={colors.white}
            />
          )}

          <Text style={styles.primaryActionText}>
            {togglingOnline
              ? 'Mise à jour…'
              : isOnline
                ? 'Passer hors ligne'
                : 'Passer en ligne'}
          </Text>
        </Pressable>

        {actionError ? (
          <View style={styles.actionError}>
            <Icon
              name="error"
              size={17}
              color={colors.error}
            />
            <Text style={styles.actionErrorText}>
              {actionError}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>
        Offre actuelle
      </Text>

      {offer ? (
        <View style={styles.offerCard}>
          <View style={styles.offerHeader}>
            <View style={styles.offerTitleGroup}>
              <View style={styles.offerIcon}>
                <Icon
                  name="local_shipping"
                  size={22}
                  color={colors.primary}
                />
              </View>

              <View>
                <Text style={styles.offerEyebrow}>
                  Nouvelle livraison
                </Text>
                <Text style={styles.offerPharmacy}>
                  {offer.pharmacy_name}
                </Text>
              </View>
            </View>

            <View style={styles.countdownBadge}>
              <Icon
                name="timer"
                size={16}
                color={colors.error}
              />
              <Text style={styles.countdownText}>
                {offerSecondsRemaining}s
              </Text>
            </View>
          </View>

          <View style={styles.offerAddressRow}>
            <Icon
              name="location_on"
              size={18}
              color={colors.textSecondary}
            />
            <Text style={styles.offerAddress}>
              {offer.pharmacy_address}
            </Text>
          </View>

          <View style={styles.offerStats}>
            <View style={styles.offerStat}>
              <Text style={styles.offerStatLabel}>
                Gain
              </Text>
              <Text style={styles.offerStatValue}>
                {offer.earning_amount} MAD
              </Text>
            </View>

            <View style={styles.offerStat}>
              <Text style={styles.offerStatLabel}>
                Colis
              </Text>
              <Text style={styles.offerStatValue}>
                {offer.package_count}
              </Text>
            </View>

            <View style={styles.offerStat}>
              <Text style={styles.offerStatLabel}>
                Paiement
              </Text>
              <Text style={styles.offerStatValue}>
                {offer.payment_method}
              </Text>
            </View>
          </View>

          {offerError ? (
            <View style={styles.offerErrorRow}>
              <Icon
                name="error"
                size={17}
                color={colors.error}
              />
              <Text style={styles.offerErrorText}>
                {offerError}
              </Text>
            </View>
          ) : null}

          <View style={styles.offerActions}>
            <Pressable
              style={[
                styles.declineButton,
                (
                  offerAction !== null
                  || offerSecondsRemaining <= 0
                ) && styles.offerButtonDisabled,
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
                  color={colors.error}
                />
              ) : (
                <Text style={styles.declineButtonText}>
                  Refuser
                </Text>
              )}
            </Pressable>

            <Pressable
              style={[
                styles.acceptButton,
                (
                  offerAction !== null
                  || offerSecondsRemaining <= 0
                ) && styles.offerButtonDisabled,
              ]}
              onPress={() => {
                void handleAcceptOffer()
              }}
              disabled={
                offerAction !== null
                || offerSecondsRemaining <= 0
              }
            >
              {offerAction === 'accept' ? (
                <ActivityIndicator
                  size="small"
                  color={colors.white}
                />
              ) : (
                <>
                  <Icon
                    name="check"
                    size={19}
                    color={colors.white}
                  />
                  <Text style={styles.acceptButtonText}>
                    Accepter
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.offerEmptyCard}>
          <Icon
            name={isOnline ? 'radar' : 'wifi_off'}
            size={30}
            color={colors.textMuted}
          />
          <Text style={styles.offerEmptyTitle}>
            {isOnline
              ? 'En attente d’une offre'
              : 'Passez en ligne pour recevoir des offres'}
          </Text>
          <Text style={styles.offerEmptyText}>
            {isOnline
              ? 'Les nouvelles demandes apparaîtront automatiquement ici.'
              : 'Votre position sera utilisée pour rechercher les livraisons proches.'}
          </Text>
        </View>
      )}

      {offerMessage ? (
        <View style={styles.offerMessage}>
          <Icon
            name="check_circle"
            size={18}
            color={colors.secondary}
          />
          <Text style={styles.offerMessageText}>
            {offerMessage}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        Livraison active
      </Text>

      {activeOrder ? (
        <View style={styles.activeOrderCard}>
          <View style={styles.activeOrderHeader}>
            <View style={styles.activeOrderTitleGroup}>
              <View style={styles.activeOrderIcon}>
                <Icon
                  name="inventory_2"
                  size={22}
                  color={colors.primary}
                />
              </View>

              <View style={styles.activeOrderTitleText}>
                <Text style={styles.activeOrderEyebrow}>
                  Commande #{activeOrder.id}
                </Text>
                <Text style={styles.activeOrderPharmacy}>
                  {activeOrder.pharmacy_name}
                </Text>
              </View>
            </View>

            <View style={styles.activeOrderStatusBadge}>
              <Text style={styles.activeOrderStatusText}>
                {statusLabel(activeOrder.status)}
              </Text>
            </View>
          </View>

          <View style={styles.deliveryStep}>
            <Icon
              name="local_pharmacy"
              size={19}
              color={colors.primary}
            />
            <View style={styles.deliveryStepText}>
              <Text style={styles.deliveryStepLabel}>
                Pharmacie
              </Text>
              <Text style={styles.deliveryStepValue}>
                {activeOrder.pharmacy_address}
              </Text>
            </View>
          </View>

          <View style={styles.deliveryRouteLine} />

          <View style={styles.deliveryStep}>
            <Icon
              name="location_on"
              size={19}
              color={colors.secondary}
            />
            <View style={styles.deliveryStepText}>
              <Text style={styles.deliveryStepLabel}>
                Destination client
              </Text>
              <Text style={styles.deliveryStepValue}>
                {activeOrder.delivery_address}
              </Text>
            </View>
          </View>

          <View style={styles.activeOrderInfoGrid}>
            <View style={styles.activeOrderInfoBox}>
              <Text style={styles.activeOrderInfoLabel}>
                Client
              </Text>
              <Text style={styles.activeOrderInfoValue}>
                {activeOrder.customer_phone || '—'}
              </Text>
            </View>

            <View style={styles.activeOrderInfoBox}>
              <Text style={styles.activeOrderInfoLabel}>
                Paiement
              </Text>
              <Text style={styles.activeOrderInfoValue}>
                {activeOrder.payment_method}
              </Text>
            </View>

            <View style={styles.activeOrderInfoBox}>
              <Text style={styles.activeOrderInfoLabel}>
                Total
              </Text>
              <Text style={styles.activeOrderInfoValue}>
                {activeOrder.grand_total} MAD
              </Text>
            </View>
          </View>

          {activeOrder.notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>
                Note
              </Text>
              <Text style={styles.notesText}>
                {activeOrder.notes}
              </Text>
            </View>
          ) : null}

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
          />

          {activeOrder.status === 'awaiting_agent' ? (
            <View style={styles.pickupSection}>
              <View style={styles.pickupSectionHeader}>
                <Icon
                  name="vpn_key"
                  size={19}
                  color={colors.primary}
                />
                <View style={styles.pickupSectionHeaderText}>
                  <Text style={styles.pickupSectionTitle}>
                    Vérifier le retrait
                  </Text>
                  <Text style={styles.pickupSectionSubtitle}>
                    Entrez le PIN fourni par la pharmacie.
                  </Text>
                </View>
              </View>

              <Pressable
                style={[
                  styles.qrPickupButton,
                  verifyingPickup && styles.pickupButtonDisabled,
                ]}
                onPress={() => {
                  setPickupError('')
                  setQrScannerVisible(true)
                }}
                disabled={verifyingPickup}
              >
                <Icon
                  name="qr_code_scanner"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.qrPickupButtonText}>
                  Scanner le QR de la pharmacie
                </Text>
              </Pressable>

              <View style={styles.pickupDivider}>
                <View style={styles.pickupDividerLine} />
                <Text style={styles.pickupDividerText}>
                  ou utiliser le PIN
                </Text>
                <View style={styles.pickupDividerLine} />
              </View>

              <TextInput
                style={styles.pickupInput}
                value={pickupPin}
                onChangeText={(value) => {
                  const digits = value.replace(/\D/g, '').slice(0, 6)
                  setPickupPin(digits)
                  if (pickupError) {
                    setPickupError('')
                  }
                }}
                placeholder="PIN de retrait"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!verifyingPickup}
                maxLength={6}
              />

              {pickupError ? (
                <View style={styles.pickupErrorRow}>
                  <Icon
                    name="error"
                    size={17}
                    color={colors.error}
                  />
                  <Text style={styles.pickupErrorText}>
                    {pickupError}
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.pickupButton,
                  (
                    verifyingPickup
                    || pickupPin.trim().length !== 6
                  ) && styles.pickupButtonDisabled,
                ]}
                onPress={() => {
                  void handleVerifyPickupPin()
                }}
                disabled={
                  verifyingPickup
                  || pickupPin.trim().length !== 6
                }
              >
                {verifyingPickup ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.white}
                  />
                ) : (
                  <Icon
                    name="check_circle"
                    size={19}
                    color={colors.white}
                  />
                )}

                <Text style={styles.pickupButtonText}>
                  {verifyingPickup
                    ? 'Vérification…'
                    : 'Confirmer le retrait'}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {activeOrder.status === 'picked_up' ? (
            <View style={styles.startDeliverySection}>
              <View style={styles.startDeliveryHeader}>
                <Icon
                  name="navigation"
                  size={20}
                  color={colors.primary}
                />
                <View style={styles.startDeliveryHeaderText}>
                  <Text style={styles.startDeliveryTitle}>
                    Colis récupéré
                  </Text>
                  <Text style={styles.startDeliverySubtitle}>
                    Lorsque vous quittez la pharmacie, démarrez la livraison vers le client.
                  </Text>
                </View>
              </View>

              {startDeliveryError ? (
                <View style={styles.startDeliveryErrorRow}>
                  <Icon
                    name="error"
                    size={17}
                    color={colors.error}
                  />
                  <Text style={styles.startDeliveryErrorText}>
                    {startDeliveryError}
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.startDeliveryButton,
                  startingDelivery
                    && styles.startDeliveryButtonDisabled,
                ]}
                onPress={() => {
                  void handleStartDelivery()
                }}
                disabled={startingDelivery}
              >
                {startingDelivery ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.white}
                  />
                ) : (
                  <Icon
                    name="delivery_dining"
                    size={20}
                    color={colors.white}
                  />
                )}

                <Text style={styles.startDeliveryButtonText}>
                  {startingDelivery
                    ? 'Démarrage…'
                    : 'Démarrer la livraison'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {activeOrder.status === 'out_for_delivery' ? (
            <View style={styles.completionSection}>
              <View style={styles.completionHeader}>
                <Icon
                  name="person_pin_circle"
                  size={20}
                  color={colors.primary}
                />
                <View style={styles.completionHeaderText}>
                  <Text style={styles.completionTitle}>
                    Remise au client
                  </Text>
                  <Text style={styles.completionSubtitle}>
                    Demandez au client son PIN à 6 chiffres pour confirmer la remise.
                  </Text>
                </View>
              </View>

              <TextInput
                style={styles.completionPinInput}
                value={deliveryPin}
                onChangeText={(value) => {
                  const digitsOnly = value.replace(/\D/g, '')
                  setDeliveryPin(digitsOnly)

                  if (completionError) {
                    setCompletionError('')
                  }
                }}
                placeholder="PIN client à 6 chiffres"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!completingDelivery}
                maxLength={6}
              />

              {activeOrder.payment_method === 'cash' ? (
                <Pressable
                  style={styles.cashConfirmationRow}
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
                      cashConfirmed
                        && styles.cashCheckboxChecked,
                    ]}
                  >
                    {cashConfirmed ? (
                      <Icon
                        name="check"
                        size={16}
                        color={colors.white}
                      />
                    ) : null}
                  </View>

                  <View style={styles.cashConfirmationText}>
                    <Text style={styles.cashConfirmationTitle}>
                      Paiement en espèces reçu
                    </Text>
                    <Text style={styles.cashConfirmationSubtitle}>
                      Confirmez uniquement après avoir reçu le montant du client.
                    </Text>
                  </View>
                </Pressable>
              ) : (
                <View style={styles.cardPaymentNotice}>
                  <Icon
                    name="credit_card"
                    size={18}
                    color={colors.secondary}
                  />
                  <Text style={styles.cardPaymentNoticeText}>
                    Paiement par carte / en ligne
                  </Text>
                </View>
              )}

              {completionError ? (
                <View style={styles.completionErrorRow}>
                  <Icon
                    name="error"
                    size={17}
                    color={colors.error}
                  />
                  <Text style={styles.completionErrorText}>
                    {completionError}
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.completeDeliveryButton,
                  (
                    completingDelivery
                    || deliveryPin.length !== 6
                    || (
                      activeOrder.payment_method === 'cash'
                      && !cashConfirmed
                    )
                  ) && styles.completeDeliveryButtonDisabled,
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
                {completingDelivery ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.white}
                  />
                ) : (
                  <Icon
                    name="done_all"
                    size={20}
                    color={colors.white}
                  />
                )}

                <Text style={styles.completeDeliveryButtonText}>
                  {completingDelivery
                    ? 'Confirmation…'
                    : 'Confirmer la livraison'}
                </Text>
              </Pressable>
            </View>
          ) : null}

        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Icon
            name="inventory_2"
            size={32}
            color={colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            Aucune livraison en cours
          </Text>
          <Text style={styles.emptyText}>
            Votre prochaine livraison apparaîtra ici dès qu'une offre sera acceptée.
          </Text>
        </View>
      )}

      {completionMessage ? (
        <View style={styles.completionSuccess}>
          <Icon
            name="check_circle"
            size={19}
            color={colors.secondary}
          />
          <Text style={styles.completionSuccessText}>
            {completionMessage}
          </Text>
        </View>
      ) : null}

      {activeOrderError ? (
        <Pressable
          style={styles.activeOrderError}
          onPress={() => {
            void loadActiveOrder()
          }}
        >
          <Icon
            name="error"
            size={17}
            color={colors.error}
          />
          <Text style={styles.activeOrderErrorText}>
            {activeOrderError} · Appuyez pour réessayer.
          </Text>
        </Pressable>
      ) : null}

      <PickupQrScanner
        visible={qrScannerVisible}
        onClose={() => {
          setQrScannerVisible(false)
        }}
        onScanned={(credential) => {
          void handleVerifyPickupQr(credential)
        }}
      />

      <Text style={styles.sectionTitle}>
        Aujourd'hui
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Icon
            name="local_shipping"
            size={22}
            color={colors.primary}
          />
          <Text style={styles.statValue}>
            {todayDeliveries}
          </Text>
          <Text style={styles.statLabel}>
            Livraisons
          </Text>
        </View>

        <View style={styles.statCard}>
          <Icon
            name="payments"
            size={22}
            color={colors.primary}
          />
          <Text style={styles.statValue}>
            {formatStatAmount(todayEarnings)} MAD
          </Text>
          <Text style={styles.statLabel}>
            Gains
          </Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: colors.surface,
  },

  centerStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 32,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 24,
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },

  subtitle: {
    marginTop: 8,
    maxWidth: 280,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.surfaceLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.errorBg,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.error,
  },

  errorText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },

  retryText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },

  statusCard: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: 24,
    padding: 20,
    marginBottom: 28,
  },

  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  statusIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  onlineDot: {
    backgroundColor: colors.secondary,
  },

  offlineDot: {
    backgroundColor: colors.textMuted,
  },

  statusLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },

  statusValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.outlineVariant,
  },

  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
  },

  statusDescription: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },

  primaryAction: {
    marginTop: 18,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  primaryActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },

  primaryActionDisabled: {
    opacity: 0.55,
  },

  actionError: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  actionErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },

  sectionTitle: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 12,
  },

  offerCard: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
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
    gap: 12,
  },

  offerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  offerEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
    textTransform: 'uppercase',
  },

  offerPharmacy: {
    marginTop: 3,
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },

  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.errorBg,
  },

  countdownText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.error,
  },

  offerAddressRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  offerAddress: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },

  offerStats: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 8,
  },

  offerStat: {
    flex: 1,
    borderRadius: 15,
    padding: 11,
    backgroundColor: colors.surface,
  },

  offerStatLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },

  offerStatValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },

  offerErrorRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  offerErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },

  offerActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },

  declineButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },

  declineButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.error,
  },

  acceptButton: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  acceptButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },

  offerButtonDisabled: {
    opacity: 0.5,
  },

  offerEmptyCard: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },

  offerEmptyTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },

  offerEmptyText: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  offerMessage: {
    marginTop: -8,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#f0fdfa',
  },

  offerMessageText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.secondary,
  },

  activeOrderCard: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
  },

  activeOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 18,
  },

  activeOrderTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  activeOrderIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  activeOrderTitleText: {
    flex: 1,
  },

  activeOrderEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  activeOrderPharmacy: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
  },

  activeOrderStatusBadge: {
    maxWidth: 125,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.outlineVariant,
  },

  activeOrderStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    textAlign: 'center',
  },

  deliveryStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  deliveryStepText: {
    flex: 1,
  },

  deliveryStepLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  deliveryStepValue: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.primary,
  },

  deliveryRouteLine: {
    width: 2,
    height: 18,
    marginLeft: 8,
    marginVertical: 3,
    backgroundColor: colors.outlineVariant,
  },

  activeOrderInfoGrid: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 8,
  },

  activeOrderInfoBox: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    backgroundColor: colors.surface,
  },

  activeOrderInfoLabel: {
    fontSize: 9,
    color: colors.textMuted,
  },

  activeOrderInfoValue: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },

  notesBox: {
    marginTop: 14,
    borderRadius: 14,
    padding: 12,
    backgroundColor: colors.surface,
  },

  notesLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  notesText: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },

  pickupSection: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingTop: 18,
  },

  pickupSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },

  pickupSectionHeaderText: {
    flex: 1,
  },

  pickupSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },

  pickupSectionSubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  qrPickupButton: {
    marginTop: 14,
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surfaceLowest,
  },

  qrPickupButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },

  pickupDivider: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  pickupDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.outlineVariant,
  },

  pickupDividerText: {
    fontSize: 10,
    color: colors.textMuted,
  },

  pickupInput: {
    marginTop: 14,
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 15,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.surface,
  },

  pickupErrorRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  pickupErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },

  pickupButton: {
    marginTop: 14,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  pickupButtonDisabled: {
    opacity: 0.5,
  },

  pickupButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },

  startDeliverySection: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingTop: 18,
  },

  startDeliveryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },

  startDeliveryHeaderText: {
    flex: 1,
  },

  startDeliveryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },

  startDeliverySubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  startDeliveryErrorRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  startDeliveryErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },

  startDeliveryButton: {
    marginTop: 14,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  startDeliveryButtonDisabled: {
    opacity: 0.5,
  },

  startDeliveryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },

  completionSection: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingTop: 18,
  },

  completionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },

  completionHeaderText: {
    flex: 1,
  },

  completionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },

  completionSubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  completionPinInput: {
    marginTop: 14,
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 15,
    paddingHorizontal: 14,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 3,
    color: colors.primary,
    backgroundColor: colors.surface,
  },

  cashConfirmationRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderRadius: 15,
    padding: 13,
    backgroundColor: colors.surface,
  },

  cashCheckbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
  },

  cashCheckboxChecked: {
    backgroundColor: colors.primary,
  },

  cashConfirmationText: {
    flex: 1,
  },

  cashConfirmationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
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
    gap: 8,
    borderRadius: 15,
    padding: 13,
    backgroundColor: colors.surface,
  },

  cardPaymentNoticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
  },

  completionErrorRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  completionErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },

  completeDeliveryButton: {
    marginTop: 14,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  completeDeliveryButtonDisabled: {
    opacity: 0.5,
  },

  completeDeliveryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },

  completionSuccess: {
    marginTop: -8,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 16,
    padding: 13,
    backgroundColor: '#f0fdfa',
  },

  completionSuccessText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: colors.secondary,
  },

  activeOrderError: {
    marginTop: -8,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.errorBg,
  },

  activeOrderErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },

  emptyCard: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },

  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceLowest,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },

  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },

  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
})
