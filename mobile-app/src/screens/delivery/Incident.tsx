import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import * as Location from 'expo-location'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Icon from '../../components/ui/Icon'
import ReturnQrScanner from '../../components/delivery/ReturnQrScanner'
import {
  deliveryApi,
  type DeliveryIncident,
  type DeliveryIncidentReason,
  type DeliveryIncidentStatus,
  type DeliveryOrder,
} from '../../api/delivery'
import { firstError } from '../../api/errors'
import type {
  DeliveryMainStackParamList,
} from '../../navigation/types'

const INCIDENT_REFRESH_INTERVAL_MS = 5_000
const MAX_DETAILS_LENGTH = 2_000

const palette = {
  navy: '#0B1B63',
  blue: '#0D4EEB',
  brightBlue: '#168BEE',
  cyan: '#18C7D9',
  cyanDark: '#059AA9',
  blueSoft: '#EEF5FF',
  cyanSoft: '#E8FAFC',
  surface: '#F7FAFF',
  white: '#FFFFFF',
  text: '#0C1C4C',
  secondary: '#667085',
  muted: '#98A2B3',
  border: '#E7EDF7',
  warning: '#B76E00',
  warningBg: '#FFF8E7',
  warningBorder: '#F5D999',
  success: '#15803D',
  successBg: '#EAF8EF',
  danger: '#B42318',
  dangerBg: '#FEF3F2',
  dangerBorder: '#F5C2BE',
} as const

const REPORTABLE_ORDER_STATUSES = new Set([
  'awaiting_agent',
  'picked_up',
  'out_for_delivery',
])

const reasonOptions: Array<{
  value: DeliveryIncidentReason
  label: string
  description: string
  icon: string
}> = [
  {
    value: 'customer_unreachable',
    label: 'Client injoignable',
    description: 'Impossible de joindre le client.',
    icon: 'person_off',
  },
  {
    value: 'customer_refused',
    label: 'Client refuse la livraison',
    description: 'Le client ne souhaite pas recevoir la commande.',
    icon: 'block',
  },
  {
    value: 'wrong_address',
    label: 'Adresse incorrecte',
    description: 'L’adresse fournie ne permet pas la remise.',
    icon: 'location_off',
  },
  {
    value: 'payment_issue',
    label: 'Problème de paiement',
    description: 'Le paiement empêche la finalisation.',
    icon: 'payments',
  },
  {
    value: 'delivery_pin_issue',
    label: 'Problème de PIN client',
    description: 'Le PIN de livraison ne peut pas être validé.',
    icon: 'pin',
  },
  {
    value: 'package_damaged',
    label: 'Colis endommagé',
    description: 'Le colis présente un dommage visible.',
    icon: 'inventory',
  },
  {
    value: 'package_missing',
    label: 'Colis manquant',
    description: 'Un colis ou élément attendu est absent.',
    icon: 'inventory_2',
  },
  {
    value: 'vehicle_problem',
    label: 'Problème de transport',
    description: 'Un problème temporaire empêche de continuer.',
    icon: 'two_wheeler',
  },
  {
    value: 'agent_emergency',
    label: 'Urgence du livreur',
    description: 'Une urgence personnelle empêche la poursuite.',
    icon: 'emergency',
  },
  {
    value: 'unsafe_situation',
    label: 'Situation dangereuse',
    description: 'La situation présente un risque de sécurité.',
    icon: 'warning',
  },
  {
    value: 'other',
    label: 'Autre',
    description: 'Une autre situation bloque la livraison.',
    icon: 'more_horiz',
  },
]

const reasonLabels = Object.fromEntries(
  reasonOptions.map((item) => [item.value, item.label]),
) as Record<DeliveryIncidentReason, string>

const statusLabels: Record<DeliveryIncidentStatus, string> = {
  open: 'En cours d’examen',
  resolved_continue: 'Résolu — poursuivre',
  return_required: 'Retour requis',
  returning: 'Retour en cours',
  returned: 'Retour vérifié',
  resolved: 'Clôturé',
}

function orderStageLabel(status: string) {
  switch (status) {
    case 'awaiting_agent':
      return 'Retrait pharmacie'
    case 'picked_up':
      return 'Colis récupéré'
    case 'out_for_delivery':
      return 'En cours de livraison'
    default:
      return status.replaceAll('_', ' ')
  }
}

function incidentStatusDescription(status: DeliveryIncidentStatus) {
  switch (status) {
    case 'open':
      return 'Le signalement a été enregistré et attend une décision.'
    case 'resolved_continue':
      return 'L’incident a été résolu. La livraison peut reprendre.'
    case 'return_required':
      return 'Un retour du colis à la pharmacie a été demandé.'
    case 'returning':
      return 'Le retour vers la pharmacie est actuellement en cours.'
    case 'returned':
      return 'Le retour a été vérifié à la pharmacie.'
    case 'resolved':
      return 'Cet incident est clôturé.'
  }
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DeliveryIncidentScreen() {
  const insets = useSafeAreaInsets()
  const navigation =
    useNavigation<NativeStackNavigationProp<DeliveryMainStackParamList>>()
  const route =
    useRoute<RouteProp<DeliveryMainStackParamList, 'Incident'>>()

  const orderId = route.params.orderId

  const [order, setOrder] = useState<DeliveryOrder | null>(null)
  const [incident, setIncident] = useState<DeliveryIncident | null>(null)
  const [selectedReason, setSelectedReason] =
    useState<DeliveryIncidentReason | null>(null)
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [startingReturn, setStartingReturn] = useState(false)
  const [returnPin, setReturnPin] = useState('')
  const [verifyingReturn, setVerifyingReturn] = useState(false)
  const [returnQrScannerVisible, setReturnQrScannerVisible] = useState(false)
  const [error, setError] = useState('')
  const [reportError, setReportError] = useState('')
  const [returnError, setReturnError] = useState('')
  const [returnVerificationError, setReturnVerificationError] = useState('')

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setLoading(true)
    }

    const [orderResult, incidentResult] = await Promise.allSettled([
      deliveryApi.activeOrder(),
      deliveryApi.currentIncident(orderId),
    ])

    let nextError = ''

    if (orderResult.status === 'fulfilled') {
      const activeOrder = orderResult.value.data
      setOrder(activeOrder?.id === orderId ? activeOrder : null)
    } else {
      nextError = firstError(orderResult.reason)
    }

    if (incidentResult.status === 'fulfilled') {
      setIncident(incidentResult.value.data.incident)
    } else if (!nextError) {
      nextError = firstError(incidentResult.reason)
    }

    setError(nextError)
    setLoading(false)
  }, [orderId])

  useFocusEffect(
    useCallback(() => {
      void load(true)

      const interval = setInterval(() => {
        void load(false)
      }, INCIDENT_REFRESH_INTERVAL_MS)

      return () => {
        clearInterval(interval)
      }
    }, [load]),
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await load(false)
    setRefreshing(false)
  }, [load])

  const canReport =
    order !== null
    && REPORTABLE_ORDER_STATUSES.has(order.status)
    && incident === null

  const handleReport = useCallback(async () => {
    if (!canReport || !selectedReason || reporting) {
      return
    }

    setReporting(true)
    setReportError('')

    try {
      const response = await deliveryApi.reportIncident(
        orderId,
        {
          reason: selectedReason,
          details: details.trim(),
        },
      )

      setIncident(response.data)
      setSelectedReason(null)
      setDetails('')
    } catch (requestError) {
      setReportError(firstError(requestError))
    } finally {
      setReporting(false)
    }
  }, [
    canReport,
    details,
    orderId,
    reporting,
    selectedReason,
  ])

  const handleStartReturn = useCallback(async () => {
    if (
      !incident
      || incident.status !== 'return_required'
      || startingReturn
    ) {
      return
    }

    setStartingReturn(true)
    setReturnError('')

    try {
      const response = await deliveryApi.startIncidentReturn(
        incident.id,
      )

      setIncident(response.data)
    } catch (requestError) {
      setReturnError(firstError(requestError))
    } finally {
      setStartingReturn(false)
    }
  }, [incident, startingReturn])

  const verifyReturnCredential = useCallback(async (
    method: 'pin' | 'qr',
    credential: string,
  ) => {
    if (
      !incident
      || incident.status !== 'returning'
      || verifyingReturn
    ) {
      return
    }

    setReturnVerificationError('')
    setVerifyingReturn(true)

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync()

      if (permission.status !== 'granted') {
        setReturnVerificationError(
          'La permission de localisation est nécessaire pour vérifier le retour.',
        )
        return
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      const response = await deliveryApi.verifyIncidentReturn(
        incident.id,
        {
          method,
          credential,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
      )

      setIncident(response.data)
      setReturnPin('')
      setReturnVerificationError('')
    } catch (requestError) {
      setReturnVerificationError(firstError(requestError))
    } finally {
      setVerifyingReturn(false)
    }
  }, [incident, verifyingReturn])

  const handleVerifyReturnPin = useCallback(async () => {
    const credential = returnPin.trim()

    if (!/^\d{6}$/.test(credential)) {
      setReturnVerificationError(
        'Le PIN de retour doit contenir exactement 6 chiffres.',
      )
      return
    }

    await verifyReturnCredential('pin', credential)
  }, [returnPin, verifyReturnCredential])

  const handleVerifyReturnQr = useCallback(async (
    credential: string,
  ) => {
    setReturnQrScannerVisible(false)
    await verifyReturnCredential('qr', credential)
  }, [verifyReturnCredential])

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View
        pointerEvents="none"
        style={[
          styles.statusBarGuard,
          { height: insets.top },
        ]}
      />

      <LinearGradient
        colors={[palette.navy, palette.blue, palette.brightBlue]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.hero,
          { paddingTop: insets.top + 14 },
        ]}
      >
        <View style={styles.heroTopRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow_back" size={22} color={palette.white} />
          </Pressable>

          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>SÉCURITÉ & ASSISTANCE</Text>
            <Text style={styles.heroTitle}>Incident de livraison</Text>
            <Text style={styles.heroSubtitle}>Commande #{orderId}</Text>
          </View>

          <View style={styles.heroIcon}>
            <Icon
              name="health_and_safety"
              size={24}
              color={palette.white}
            />
          </View>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator size="large" color={palette.blue} />
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 30 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={palette.blue}
            />
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <Pressable
              style={styles.errorCard}
              onPress={() => void load(true)}
            >
              <Icon name="error" size={19} color={palette.danger} />
              <View style={styles.flex}>
                <Text style={styles.errorTitle}>
                  Impossible d’actualiser la situation
                </Text>
                <Text style={styles.errorText}>{error}</Text>
                <Text style={styles.retryText}>Appuyez pour réessayer</Text>
              </View>
            </Pressable>
          ) : null}

          <View style={styles.orderCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconBlue}>
                <Icon name="inventory_2" size={20} color={palette.blue} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardEyebrow}>LIVRAISON CONCERNÉE</Text>
                <Text style={styles.cardTitle}>Commande #{orderId}</Text>
              </View>
            </View>

            {order ? (
              <>
                <View style={styles.divider} />

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Pharmacie</Text>
                  <Text style={styles.infoValue} numberOfLines={2}>
                    {order.pharmacy_name}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Étape actuelle</Text>
                  <Text style={styles.infoValue}>
                    {orderStageLabel(order.status)}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Destination</Text>
                  <Text style={styles.infoValue} numberOfLines={2}>
                    {order.delivery_address}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.mutedText}>
                Cette commande n’est plus la livraison active du compte.
              </Text>
            )}
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>ÉTAT</Text>
            <Text style={styles.sectionTitle}>Incident actuel</Text>
          </View>

          {incident ? (
            <View style={styles.incidentCard}>
              <View style={styles.incidentHeader}>
                <View style={styles.statusIcon}>
                  <Icon
                    name={
                      incident.status === 'return_required'
                      || incident.status === 'returning'
                        ? 'assignment_return'
                        : 'schedule'
                    }
                    size={21}
                    color={
                      incident.status === 'return_required'
                      || incident.status === 'returning'
                        ? palette.warning
                        : palette.blue
                    }
                  />
                </View>

                <View style={styles.flex}>
                  <Text style={styles.incidentReason}>
                    {reasonLabels[incident.reason]}
                  </Text>
                  <Text
                    style={[
                      styles.statusLabel,
                      (
                        incident.status === 'return_required'
                        || incident.status === 'returning'
                      ) && styles.statusLabelWarning,
                    ]}
                  >
                    {statusLabels[incident.status]}
                  </Text>
                </View>
              </View>

              <Text style={styles.statusDescription}>
                {incidentStatusDescription(incident.status)}
              </Text>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Étape signalée</Text>
                <Text style={styles.infoValue}>
                  {orderStageLabel(incident.reported_order_status)}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Signalé le</Text>
                <Text style={styles.infoValue}>
                  {formatDateTime(incident.created_at)}
                </Text>
              </View>

              {incident.details ? (
                <View style={styles.detailsBox}>
                  <Text style={styles.detailsLabel}>Détails envoyés</Text>
                  <Text style={styles.detailsText}>{incident.details}</Text>
                </View>
              ) : null}

              {incident.resolution_note ? (
                <View style={styles.resolutionBox}>
                  <View style={styles.resolutionHeader}>
                    <Icon
                      name="support_agent"
                      size={18}
                      color={palette.cyanDark}
                    />
                    <Text style={styles.resolutionLabel}>
                      Instruction reçue
                    </Text>
                  </View>
                  <Text style={styles.resolutionText}>
                    {incident.resolution_note}
                  </Text>
                </View>
              ) : null}

              {incident.status === 'return_required' ? (
                <View style={styles.returnActionCard}>
                  <View style={styles.returnActionHeader}>
                    <View style={styles.returnActionIcon}>
                      <Icon
                        name="local_pharmacy"
                        size={20}
                        color={palette.warning}
                      />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.returnActionTitle}>
                        Retour à la pharmacie requis
                      </Text>
                      <Text style={styles.returnActionText}>
                        Ramenez le colis à la pharmacie d’origine avant toute
                        autre action sur cette livraison.
                      </Text>
                    </View>
                  </View>

                  {order ? (
                    <View style={styles.returnDestination}>
                      <View style={styles.returnDestinationRow}>
                        <Icon
                          name="storefront"
                          size={18}
                          color={palette.blue}
                        />
                        <View style={styles.flex}>
                          <Text style={styles.returnDestinationLabel}>
                            Pharmacie de retour
                          </Text>
                          <Text style={styles.returnDestinationName}>
                            {order.pharmacy_name}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.returnDestinationAddress}>
                        {order.pharmacy_address}
                      </Text>
                    </View>
                  ) : null}

                  {returnError ? (
                    <View style={styles.returnErrorCard}>
                      <Icon
                        name="error"
                        size={18}
                        color={palette.danger}
                      />
                      <Text style={styles.returnErrorText}>
                        {returnError}
                      </Text>
                    </View>
                  ) : null}

                  <Pressable
                    disabled={startingReturn}
                    style={({ pressed }) => [
                      styles.startReturnButton,
                      startingReturn && styles.startReturnButtonDisabled,
                      pressed
                        && !startingReturn
                        && styles.startReturnButtonPressed,
                    ]}
                    onPress={() => void handleStartReturn()}
                  >
                    {startingReturn ? (
                      <ActivityIndicator
                        size="small"
                        color={palette.white}
                      />
                    ) : (
                      <Icon
                        name="assignment_return"
                        size={20}
                        color={palette.white}
                      />
                    )}
                    <Text style={styles.startReturnButtonText}>
                      {startingReturn
                        ? 'Démarrage du retour…'
                        : 'Commencer le retour à la pharmacie'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {incident.status === 'returning' ? (
                <View style={styles.returningCard}>
                  <View style={styles.returningTopRow}>
                    <View style={styles.returningIcon}>
                      <Icon
                        name="route"
                        size={21}
                        color={palette.cyanDark}
                      />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.returningTitle}>
                        Retour en cours
                      </Text>
                      <Text style={styles.returningText}>
                        À la pharmacie, faites vérifier la remise avec le
                        QR code ou le PIN de retour fourni par le personnel.
                      </Text>
                    </View>
                  </View>

                  {order ? (
                    <View style={styles.returningDestination}>
                      <Text style={styles.returningDestinationLabel}>
                        Destination
                      </Text>
                      <Text style={styles.returningDestinationName}>
                        {order.pharmacy_name}
                      </Text>
                      <Text style={styles.returningDestinationAddress}>
                        {order.pharmacy_address}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.returnVerificationCard}>
                    <View style={styles.returnVerificationHeader}>
                      <View style={styles.returnVerificationIcon}>
                        <Icon
                          name="verified"
                          size={20}
                          color={palette.blue}
                        />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.returnVerificationTitle}>
                          Vérifier le retour
                        </Text>
                        <Text style={styles.returnVerificationText}>
                          Saisissez le PIN à 6 chiffres ou scannez le QR
                          de retour de la pharmacie.
                        </Text>
                      </View>
                    </View>

                    <TextInput
                      value={returnPin}
                      onChangeText={(value) => {
                        setReturnPin(
                          value
                            .replace(/\D/g, '')
                            .slice(0, 6),
                        )
                        setReturnVerificationError('')
                      }}
                      editable={!verifyingReturn}
                      keyboardType="number-pad"
                      maxLength={6}
                      placeholder="PIN de retour"
                      placeholderTextColor={palette.muted}
                      style={styles.returnPinInput}
                    />

                    <Pressable
                      disabled={verifyingReturn}
                      style={({ pressed }) => [
                        styles.verifyReturnPinButton,
                        verifyingReturn
                          && styles.returnVerifyButtonDisabled,
                        pressed
                          && !verifyingReturn
                          && styles.returnVerifyButtonPressed,
                      ]}
                      onPress={() => void handleVerifyReturnPin()}
                    >
                      {verifyingReturn ? (
                        <ActivityIndicator
                          size="small"
                          color={palette.white}
                        />
                      ) : (
                        <Icon
                          name="pin"
                          size={19}
                          color={palette.white}
                        />
                      )}
                      <Text style={styles.verifyReturnPinButtonText}>
                        {verifyingReturn
                          ? 'Vérification…'
                          : 'Valider le PIN de retour'}
                      </Text>
                    </Pressable>

                    <View style={styles.returnVerifySeparator}>
                      <View style={styles.returnVerifySeparatorLine} />
                      <Text style={styles.returnVerifySeparatorText}>OU</Text>
                      <View style={styles.returnVerifySeparatorLine} />
                    </View>

                    <Pressable
                      disabled={verifyingReturn}
                      style={styles.returnQrButton}
                      onPress={() => {
                        setReturnVerificationError('')
                        setReturnQrScannerVisible(true)
                      }}
                    >
                      <Icon
                        name="qr_code_scanner"
                        size={20}
                        color={palette.blue}
                      />
                      <Text style={styles.returnQrButtonText}>
                        Scanner le QR de retour
                      </Text>
                    </Pressable>

                    {returnVerificationError ? (
                      <View style={styles.returnVerificationErrorCard}>
                        <Icon
                          name="error"
                          size={18}
                          color={palette.danger}
                        />
                        <Text style={styles.returnVerificationErrorText}>
                          {returnVerificationError}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {incident.status === 'returned' ? (
                <View style={styles.returnedCard}>
                  <View style={styles.returnedIcon}>
                    <Icon
                      name="check_circle"
                      size={23}
                      color={palette.success}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.returnedTitle}>
                      Retour vérifié
                    </Text>
                    <Text style={styles.returnedText}>
                      La pharmacie a confirmé la réception du colis.
                      L’incident attend maintenant sa clôture finale.
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyIncidentCard}>
              <LinearGradient
                colors={[palette.blueSoft, palette.cyanSoft]}
                style={styles.emptyIncidentIcon}
              >
                <Icon name="verified_user" size={27} color={palette.blue} />
              </LinearGradient>

              <View style={styles.flex}>
                <Text style={styles.emptyIncidentTitle}>
                  Aucun incident en cours
                </Text>
                <Text style={styles.emptyIncidentText}>
                  Vous pouvez signaler un problème si la livraison ne peut pas
                  continuer normalement.
                </Text>
              </View>
            </View>
          )}

          {!incident ? (
            <>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionEyebrow}>SIGNALER</Text>
                <Text style={styles.sectionTitle}>
                  Que se passe-t-il ?
                </Text>
              </View>

              {!canReport ? (
                <View style={styles.lockedCard}>
                  <Icon name="lock" size={20} color={palette.muted} />
                  <View style={styles.flex}>
                    <Text style={styles.lockedTitle}>
                      Signalement indisponible
                    </Text>
                    <Text style={styles.lockedText}>
                      Un incident peut être signalé uniquement sur votre
                      livraison active pendant le retrait, après récupération
                      du colis ou pendant la livraison.
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.reasonList}>
                    {reasonOptions.map((item) => {
                      const selected = selectedReason === item.value

                      return (
                        <Pressable
                          key={item.value}
                          style={[
                            styles.reasonCard,
                            selected && styles.reasonCardSelected,
                          ]}
                          onPress={() => {
                            setSelectedReason(item.value)
                            setReportError('')
                          }}
                        >
                          <View
                            style={[
                              styles.reasonIcon,
                              selected && styles.reasonIconSelected,
                            ]}
                          >
                            <Icon
                              name={item.icon}
                              size={19}
                              color={
                                selected
                                  ? palette.white
                                  : palette.blue
                              }
                            />
                          </View>

                          <View style={styles.flex}>
                            <Text
                              style={[
                                styles.reasonTitle,
                                selected && styles.reasonTitleSelected,
                              ]}
                            >
                              {item.label}
                            </Text>
                            <Text style={styles.reasonDescription}>
                              {item.description}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.radioOuter,
                              selected && styles.radioOuterSelected,
                            ]}
                          >
                            {selected ? (
                              <View style={styles.radioInner} />
                            ) : null}
                          </View>
                        </Pressable>
                      )
                    })}
                  </View>

                  <View style={styles.detailsCard}>
                    <View style={styles.detailsHeader}>
                      <View>
                        <Text style={styles.detailsInputTitle}>
                          Détails supplémentaires
                        </Text>
                        <Text style={styles.detailsOptional}>
                          Optionnel
                        </Text>
                      </View>
                      <Text style={styles.detailsCount}>
                        {details.length}/{MAX_DETAILS_LENGTH}
                      </Text>
                    </View>

                    <TextInput
                      value={details}
                      onChangeText={setDetails}
                      maxLength={MAX_DETAILS_LENGTH}
                      multiline
                      textAlignVertical="top"
                      placeholder="Expliquez brièvement la situation…"
                      placeholderTextColor={palette.muted}
                      style={styles.detailsInput}
                    />
                  </View>

                  {reportError ? (
                    <View style={styles.reportErrorCard}>
                      <Icon name="error" size={18} color={palette.danger} />
                      <Text style={styles.reportErrorText}>
                        {reportError}
                      </Text>
                    </View>
                  ) : null}

                  <Pressable
                    disabled={!selectedReason || reporting}
                    style={({ pressed }) => [
                      styles.submitButton,
                      (!selectedReason || reporting)
                        && styles.submitButtonDisabled,
                      pressed
                        && selectedReason
                        && !reporting
                        && styles.submitButtonPressed,
                    ]}
                    onPress={() => void handleReport()}
                  >
                    {reporting ? (
                      <ActivityIndicator size="small" color={palette.white} />
                    ) : (
                      <Icon name="report_problem" size={20} color={palette.white} />
                    )}
                    <Text style={styles.submitButtonText}>
                      {reporting
                        ? 'Envoi en cours…'
                        : 'Signaler cet incident'}
                    </Text>
                  </Pressable>

                  <Text style={styles.submitHint}>
                    Le serveur empêchera automatiquement les doublons
                    d’incident non résolus.
                  </Text>
                </>
              )}
            </>
          ) : null}

          <View style={styles.safetyCard}>
            <View style={styles.safetyIcon}>
              <Icon name="shield" size={19} color={palette.warning} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.safetyTitle}>Traçabilité</Text>
              <Text style={styles.safetyText}>
                Le motif, les détails et le statut affichés sont enregistrés
                par le backend pour la commande concernée.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      <ReturnQrScanner
        visible={returnQrScannerVisible}
        onClose={() => setReturnQrScannerVisible(false)}
        onScanned={(credential) => {
          void handleVerifyReturnQr(credential)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  flex: {
    flex: 1,
  },
  statusBarGuard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: palette.navy,
  },
  hero: {
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: '#CFE7FF',
  },
  heroTitle: {
    marginTop: 3,
    fontSize: 23,
    fontWeight: '900',
    color: palette.white,
  },
  heroSubtitle: {
    marginTop: 3,
    fontSize: 11,
    color: '#DDEAFF',
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(24,199,217,0.24)',
  },
  loadingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
  },
  loadingText: {
    fontSize: 12,
    color: palette.secondary,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  errorCard: {
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: palette.dangerBg,
    borderWidth: 1,
    borderColor: palette.dangerBorder,
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.danger,
  },
  errorText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: palette.danger,
  },
  retryText: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '900',
    color: palette.blue,
  },
  orderCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  cardIconBlue: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.blueSoft,
  },
  cardEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    color: palette.blue,
  },
  cardTitle: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '900',
    color: palette.text,
  },
  divider: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 5,
  },
  infoLabel: {
    width: 105,
    fontSize: 10,
    fontWeight: '800',
    color: palette.muted,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    color: palette.text,
  },
  mutedText: {
    marginTop: 13,
    fontSize: 11,
    lineHeight: 17,
    color: palette.secondary,
  },
  sectionHeading: {
    marginTop: 23,
    marginBottom: 10,
  },
  sectionEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    color: palette.blue,
  },
  sectionTitle: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '900',
    color: palette.text,
  },
  incidentCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
  },
  incidentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  statusIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.warningBg,
  },
  incidentReason: {
    fontSize: 14,
    fontWeight: '900',
    color: palette.text,
  },
  statusLabel: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '900',
    color: palette.blue,
  },
  statusLabelWarning: {
    color: palette.warning,
  },
  statusDescription: {
    marginTop: 13,
    fontSize: 11,
    lineHeight: 17,
    color: palette.secondary,
  },
  detailsBox: {
    marginTop: 12,
    borderRadius: 15,
    padding: 12,
    backgroundColor: palette.blueSoft,
  },
  detailsLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: palette.blue,
  },
  detailsText: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 17,
    color: palette.text,
  },
  resolutionBox: {
    marginTop: 12,
    borderRadius: 15,
    padding: 12,
    backgroundColor: palette.cyanSoft,
  },
  resolutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  resolutionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: palette.cyanDark,
  },
  resolutionText: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 17,
    color: palette.text,
  },
  emptyIncidentCard: {
    minHeight: 112,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyIncidentIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIncidentTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: palette.text,
  },
  emptyIncidentText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
    color: palette.secondary,
  },
  lockedCard: {
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    backgroundColor: '#F3F5F8',
    borderWidth: 1,
    borderColor: palette.border,
  },
  lockedTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.text,
  },
  lockedText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 16,
    color: palette.secondary,
  },
  reasonList: {
    gap: 9,
  },
  reasonCard: {
    minHeight: 68,
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
  },
  reasonCardSelected: {
    borderColor: palette.blue,
    backgroundColor: palette.blueSoft,
  },
  reasonIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.blueSoft,
  },
  reasonIconSelected: {
    backgroundColor: palette.blue,
  },
  reasonTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.text,
  },
  reasonTitleSelected: {
    color: palette.blue,
  },
  reasonDescription: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: palette.secondary,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#C9D2E2',
  },
  radioOuterSelected: {
    borderColor: palette.blue,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.blue,
  },
  detailsCard: {
    marginTop: 14,
    borderRadius: 20,
    padding: 14,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailsInputTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.text,
  },
  detailsOptional: {
    marginTop: 2,
    fontSize: 9,
    color: palette.muted,
  },
  detailsCount: {
    fontSize: 9,
    color: palette.muted,
  },
  detailsInput: {
    minHeight: 110,
    marginTop: 11,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 12,
    lineHeight: 18,
    color: palette.text,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  reportErrorCard: {
    marginTop: 12,
    borderRadius: 15,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: palette.dangerBg,
    borderWidth: 1,
    borderColor: palette.dangerBorder,
  },
  reportErrorText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    color: palette.danger,
  },
  submitButton: {
    marginTop: 14,
    minHeight: 52,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: palette.blue,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: palette.white,
  },
  submitHint: {
    marginTop: 8,
    paddingHorizontal: 4,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 14,
    color: palette.muted,
  },
  returnActionCard: {
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    backgroundColor: palette.warningBg,
    borderWidth: 1,
    borderColor: palette.warningBorder,
  },
  returnActionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  returnActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0BE',
  },
  returnActionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#8B5A00',
  },
  returnActionText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 16,
    color: '#7A5B1A',
  },
  returnDestination: {
    marginTop: 12,
    borderRadius: 15,
    padding: 12,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: '#F0DAA9',
  },
  returnDestinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  returnDestinationLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: palette.muted,
  },
  returnDestinationName: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '900',
    color: palette.text,
  },
  returnDestinationAddress: {
    marginTop: 8,
    fontSize: 10,
    lineHeight: 15,
    color: palette.secondary,
  },
  returnErrorCard: {
    marginTop: 11,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: palette.dangerBg,
    borderWidth: 1,
    borderColor: palette.dangerBorder,
  },
  returnErrorText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    color: palette.danger,
  },
  startReturnButton: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: palette.warning,
  },
  startReturnButtonDisabled: {
    opacity: 0.55,
  },
  startReturnButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  startReturnButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.white,
  },
  returningCard: {
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    backgroundColor: palette.cyanSoft,
    borderWidth: 1,
    borderColor: '#BEEDEF',
  },
  returningTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  returningIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D6F5F6',
  },
  returningTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.cyanDark,
  },
  returningText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 16,
    color: palette.secondary,
  },
  returningDestination: {
    marginTop: 12,
    borderRadius: 15,
    padding: 12,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: '#CDEDEF',
  },
  returningDestinationLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: palette.cyanDark,
  },
  returningDestinationName: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '900',
    color: palette.text,
  },
  returningDestinationAddress: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 15,
    color: palette.secondary,
  },
  returnVerificationCard: {
    marginTop: 13,
    borderRadius: 16,
    padding: 12,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: '#CDEDEF',
  },
  returnVerificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  returnVerificationIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.blueSoft,
  },
  returnVerificationTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.text,
  },
  returnVerificationText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: palette.secondary,
  },
  returnPinInput: {
    height: 52,
    marginTop: 12,
    borderRadius: 15,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 5,
    textAlign: 'center',
    color: palette.text,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  verifyReturnPinButton: {
    minHeight: 49,
    marginTop: 10,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: palette.blue,
  },
  verifyReturnPinButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.white,
  },
  returnVerifyButtonDisabled: {
    opacity: 0.55,
  },
  returnVerifyButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  returnVerifySeparator: {
    marginVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  returnVerifySeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: palette.border,
  },
  returnVerifySeparatorText: {
    fontSize: 9,
    fontWeight: '900',
    color: palette.muted,
  },
  returnQrButton: {
    minHeight: 48,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: palette.blueSoft,
    borderWidth: 1,
    borderColor: '#D6E5FF',
  },
  returnQrButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.blue,
  },
  returnVerificationErrorCard: {
    marginTop: 10,
    borderRadius: 13,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: palette.dangerBg,
    borderWidth: 1,
    borderColor: palette.dangerBorder,
  },
  returnVerificationErrorText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    color: palette.danger,
  },
  returnedCard: {
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: palette.successBg,
    borderWidth: 1,
    borderColor: '#BFE6CA',
  },
  returnedIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D9F2E1',
  },
  returnedTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.success,
  },
  returnedText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 16,
    color: palette.secondary,
  },
  safetyCard: {
    marginTop: 20,
    borderRadius: 17,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: palette.warningBg,
    borderWidth: 1,
    borderColor: palette.warningBorder,
  },
  safetyIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0BE',
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
