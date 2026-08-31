import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import type { MainStackParamList } from '../../navigation/types'
import {
  ordersApi,
  STATUS_COLOR,
  STATUS_LABELS,
  type Order,
  type OrderStatus,
  type PrescriptionMode,
} from '../../api/orders'
import {
  catalogApi,
  type Medicine,
} from '../../api/catalog'
import { firstError } from '../../api/errors'
import {
  createOrderTrackingSocket,
  parseOrderTrackingEvent,
  type OrderLocationUpdateEvent,
} from '../../api/orderRealtime'
import { useCartStore } from '../../store/cartStore'
import { tokenStorage } from '../../store/tokenStorage'
import Icon from '../../components/ui/Icon'
import PatientDeliveryPinCard from '../../components/patient/PatientDeliveryPinCard'
import PatientDeliveryIncidentCard from '../../components/patient/PatientDeliveryIncidentCard'
import PatientLiveDeliveryCard from '../../components/patient/PatientLiveDeliveryCard'
import PatientAssignedCourierCard from '../../components/patient/PatientAssignedCourierCard'
import PatientOrderChatCard from '../../components/patient/PatientOrderChatCard'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<
  MainStackParamList,
  'OrderDetail'
>

type ProgressStep = {
  key: string
  label: string
  description: string
  icon: string
}

type PreparedCartItem = {
  medicine: Medicine
  quantity: number
}

const CANCELLABLE_STATUSES: OrderStatus[] = [
  'pending_payment',
  'pending_review',
  'accepted',
  'preparing',
]

const REORDERABLE_STATUSES: OrderStatus[] = [
  'delivered',
  'cancelled',
  'rejected',
  'failed',
]

const TERMINAL_PROBLEM_STATUSES: OrderStatus[] = [
  'cancelled',
  'rejected',
  'failed',
]

const PROGRESS_STEPS: ProgressStep[] = [
  {
    key: 'received',
    label: 'Reçue',
    description: 'Validation de la commande et de l’ordonnance.',
    icon: 'receipt_long',
  },
  {
    key: 'preparing',
    label: 'Préparation',
    description: 'La pharmacie rassemble vos médicaments.',
    icon: 'inventory_2',
  },
  {
    key: 'ready',
    label: 'Prête',
    description: 'La commande attend sa prise en charge.',
    icon: 'local_pharmacy',
  },
  {
    key: 'delivery',
    label: 'En livraison',
    description: 'Votre commande se dirige vers votre adresse.',
    icon: 'local_shipping',
  },
  {
    key: 'delivered',
    label: 'Livrée',
    description: 'La livraison a été finalisée.',
    icon: 'check_circle',
  },
]

const STAGE_BY_STATUS: Partial<Record<OrderStatus, number>> = {
  pending_payment: 0,
  pending_review: 0,
  accepted: 0,
  preparing: 1,
  ready_for_pickup: 2,
  awaiting_agent: 2,
  picked_up: 3,
  out_for_delivery: 3,
  delivered: 4,
}

const STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  pending_payment: 'Votre commande attend la confirmation du paiement.',
  pending_review: 'La pharmacie vérifie les produits et les informations de votre ordonnance.',
  rejected: 'La pharmacie n’a pas pu accepter cette commande.',
  accepted: 'Votre commande a été acceptée et sera bientôt préparée.',
  preparing: 'La pharmacie prépare actuellement vos médicaments.',
  ready_for_pickup: 'Votre commande est prête à être remise au service de livraison.',
  awaiting_agent: 'Un livreur disponible est recherché pour votre commande.',
  picked_up: 'Le livreur a récupéré votre commande à la pharmacie.',
  out_for_delivery: 'Votre commande est en route vers votre adresse.',
  delivered: 'Votre commande a été livrée avec succès.',
  cancelled: 'Cette commande a été annulée.',
  failed: 'Cette commande n’a pas pu être finalisée.',
}

const PRESCRIPTION_MODE_LABELS: Record<PrescriptionMode, string> = {
  none: 'Aucune ordonnance',
  photo: 'Ordonnance envoyée en photo',
  pickup: 'Ordonnance à présenter à la livraison',
}

const PRESCRIPTION_STATUS_CONFIG = {
  pending: {
    label: 'En cours de vérification',
    icon: 'schedule',
    color: '#a16207',
    background: '#fefce8',
  },
  approved: {
    label: 'Ordonnance approuvée',
    icon: 'verified',
    color: colors.success,
    background: colors.successBg,
  },
  rejected: {
    label: 'Ordonnance refusée',
    icon: 'error',
    color: colors.error,
    background: colors.errorBg,
  },
} as const

export default function OrderDetail({
  route,
  navigation,
}: Props) {
  const { id } = route.params
  const hasLoadedOnce = useRef(false)
  const realtimeReloadingRef = useRef(false)

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    })
  }, [navigation])

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [liveTracking, setLiveTracking] =
    useState<OrderLocationUpdateEvent | null>(null)

  const cartItems = useCartStore((state) => state.items)
  const addItem = useCartStore((state) => state.addItem)
  const clearCart = useCartStore((state) => state.clearCart)

  const loadOrder = useCallback(async () => {
    try {
      const response = await ordersApi.detail(id)
      setOrder(response.data)
      setLoadError(null)
    } catch (error) {
      setLoadError(getLoadErrorMessage(error))
    }
  }, [id])

  const reloadFromRealtime = useCallback(async () => {
    if (realtimeReloadingRef.current) {
      return
    }

    realtimeReloadingRef.current = true

    try {
      await loadOrder()
    } finally {
      realtimeReloadingRef.current = false
    }
  }, [loadOrder])

  useFocusEffect(
    useCallback(() => {
      let active = true
      let socket: WebSocket | null = null
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null

      if (!hasLoadedOnce.current) {
        setLoading(true)
      }

      void loadOrder().finally(() => {
        if (!active) {
          return
        }

        hasLoadedOnce.current = true
        setLoading(false)
      })

      const scheduleReconnect = () => {
        if (!active || reconnectTimer !== null) {
          return
        }

        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          void connectRealtime()
        }, 3000)
      }

      const connectRealtime = async () => {
        const accessToken = await tokenStorage.getAccessToken()

        if (!active || !accessToken) {
          return
        }

        try {
          const nextSocket = createOrderTrackingSocket(
            id,
            accessToken,
          )

          socket = nextSocket

          nextSocket.onmessage = (event) => {
            if (!active) {
              return
            }

            const realtimeEvent =
              parseOrderTrackingEvent(event.data)

            if (!realtimeEvent) {
              return
            }

            if (
              realtimeEvent.type === 'status_change'
              && realtimeEvent.order_id === id
            ) {
              // Reflect the new status immediately for a responsive UI.
              // Then reload the order so status_history and any related
              // server-side changes remain the source of truth.
              setOrder((currentOrder) =>
                currentOrder
                  ? {
                      ...currentOrder,
                      status: realtimeEvent.status,
                    }
                  : currentOrder,
              )

              void reloadFromRealtime()
            }

            if (realtimeEvent.type === 'location_update') {
              setLiveTracking(realtimeEvent)

              if (realtimeEvent.status) {
                setOrder((currentOrder) =>
                  currentOrder
                    ? {
                        ...currentOrder,
                        status: realtimeEvent.status!,
                      }
                    : currentOrder,
                )
              }
            }
          }

          nextSocket.onerror = () => {
            // onclose schedules the retry. Keep websocket failures
            // non-blocking because HTTP refresh remains available.
          }

          nextSocket.onclose = () => {
            if (socket === nextSocket) {
              socket = null
            }

            scheduleReconnect()
          }
        } catch {
          scheduleReconnect()
        }
      }

      void connectRealtime()

      return () => {
        active = false

        if (reconnectTimer !== null) {
          clearTimeout(reconnectTimer)
        }

        if (socket) {
          socket.close()
        }
      }
    }, [
      id,
      loadOrder,
      reloadFromRealtime,
    ]),
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadOrder()
    setRefreshing(false)
  }, [loadOrder])

  const handleRetry = useCallback(async () => {
    setLoading(true)
    await loadOrder()
    setLoading(false)
  }, [loadOrder])

  const confirmCancel = useCallback(() => {
    if (!order || cancelling) {
      return
    }

    Alert.alert(
      'Annuler cette commande ?',
      'Cette action ne peut pas être annulée. La pharmacie sera informée immédiatement.',
      [
        {
          text: 'Garder la commande',
          style: 'cancel',
        },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: () => {
            void handleCancel()
          },
        },
      ],
    )
  }, [cancelling, order])

  const handleCancel = useCallback(async () => {
    if (!order) {
      return
    }

    setCancelling(true)

    try {
      const response = await ordersApi.cancel(order.id)
      setOrder(response.data)

      Alert.alert(
        'Commande annulée',
        'La commande a été annulée avec succès.',
      )
    } catch (error) {
      Alert.alert(
        'Annulation impossible',
        getActionErrorMessage(
          error,
          'Cette commande ne peut plus être annulée pour le moment.',
        ),
      )
    } finally {
      setCancelling(false)
    }
  }, [order])

  const addPreparedItemsToCart = useCallback(
    (
      preparedItems: PreparedCartItem[],
      mode: 'replace' | 'merge',
    ) => {
      if (mode === 'replace') {
        clearCart()
      }

      preparedItems.forEach(({ medicine, quantity }) => {
        addItem(medicine, quantity)
      })

      navigation.navigate('Cart')
    },
    [addItem, clearCart, navigation],
  )

  const handleReorder = useCallback(async () => {
    if (!order || reordering) {
      return
    }

    setReordering(true)

    try {
      const preparedItems = await Promise.all(
        order.items.map(async (item) => {
          const response = await catalogApi.detail(item.medicine)

          return {
            medicine: response.data,
            quantity: item.quantity,
          }
        }),
      )

      if (preparedItems.length === 0) {
        Alert.alert(
          'Commande vide',
          'Aucun médicament ne peut être ajouté au panier.',
        )
        return
      }

      const unavailableCount = preparedItems.filter(
        ({ medicine }) => !medicine.is_available,
      ).length

      const continueToCart = (
        mode: 'replace' | 'merge',
      ) => {
        addPreparedItemsToCart(preparedItems, mode)

        if (unavailableCount > 0) {
          setTimeout(() => {
            Alert.alert(
              'Disponibilité mise à jour',
              `${unavailableCount} médicament${unavailableCount > 1 ? 's sont' : ' est'} actuellement indisponible${unavailableCount > 1 ? 's' : ''}. Vérifiez le panier avant de continuer.`,
            )
          }, 350)
        }
      }

      if (cartItems.length === 0) {
        continueToCart('replace')
        return
      }

      const cartQuantity = cartItems.reduce(
        (total, item) => total + item.quantity,
        0,
      )

      Alert.alert(
        'Votre panier contient déjà des articles',
        `Le panier contient ${cartQuantity} article${cartQuantity > 1 ? 's' : ''}. Souhaitez-vous ajouter les médicaments de cette commande ou remplacer le panier ?`,
        [
          {
            text: 'Annuler',
            style: 'cancel',
          },
          {
            text: 'Ajouter',
            onPress: () => continueToCart('merge'),
          },
          {
            text: 'Remplacer',
            style: 'destructive',
            onPress: () => continueToCart('replace'),
          },
        ],
      )
    } catch (error) {
      Alert.alert(
        'Impossible de préparer le panier',
        getActionErrorMessage(
          error,
          'Les informations actuelles de certains médicaments n’ont pas pu être chargées. Réessayez dans un instant.',
        ),
      )
    } finally {
      setReordering(false)
    }
  }, [
    addPreparedItemsToCart,
    cartItems,
    order,
    reordering,
  ])

  if (loading) {
    return <LoadingState />
  }

  if (!order) {
    return (
      <ErrorState
        message={
          loadError ??
          'Cette commande est introuvable ou n’est plus accessible.'
        }
        onRetry={handleRetry}
        onBack={() => navigation.goBack()}
      />
    )
  }

  const statusColors = STATUS_COLOR[order.status]
  const canCancel = CANCELLABLE_STATUSES.includes(order.status)
  const canReorder = REORDERABLE_STATUSES.includes(order.status)
  const isProblemStatus = TERMINAL_PROBLEM_STATUSES.includes(order.status)
  const currentStage = STAGE_BY_STATUS[order.status] ?? -1
  const showCourierIdentity =
    !order.delivery_incident &&
    Boolean(order.delivery_agent_name) &&
    (
      order.status === 'awaiting_agent' ||
      order.status === 'picked_up' ||
      order.status === 'out_for_delivery'
    )
  const showPin =
    !order.delivery_incident &&
    order.status === 'out_for_delivery'
  const showChat = showCourierIdentity

  const hasLiveDistance =
    typeof liveTracking?.distance_to_customer_m === 'number' &&
    Number.isFinite(liveTracking.distance_to_customer_m)
  const hasLiveEta =
    typeof liveTracking?.eta_minutes === 'number' &&
    Number.isFinite(liveTracking.eta_minutes)
  const liveDeliveryActive =
    !order.delivery_incident &&
    (
      order.status === 'picked_up' ||
      order.status === 'out_for_delivery'
    )

  return (
    <SafeAreaView
      style={styles.exactSafeArea}
      edges={['top']}
    >
      <StatusBar style="light" />

      <ScrollView
        style={styles.exactScreen}
        contentContainerStyle={styles.exactContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#FFFFFF"
            colors={['#073BDF']}
          />
        }
      >
        <LinearGradient
          colors={['#00236F', '#073BDF', '#087DFF', '#10D1D0']}
          start={{ x: 0.02, y: 0.08 }}
          end={{ x: 1, y: 0.92 }}
          style={styles.exactHeader}
        >
          <View style={styles.exactHeaderOrbLarge} />
          <View style={styles.exactHeaderOrbSmall} />

          <View style={styles.exactNavRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retour"
              style={({ pressed }) => [
                styles.exactNavButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => navigation.goBack()}
            >
              <Icon
                name="arrow_back"
                size={22}
                color="#FFFFFF"
              />
            </Pressable>

            <Text style={styles.exactNavTitle}>
              Détail de la commande
            </Text>

            <View style={styles.exactNavButton}>
              <Icon
                name="headset_mic"
                size={21}
                color="#FFFFFF"
              />
            </View>
          </View>

          <View style={styles.exactOrderRow}>
            <View style={styles.exactOrderCopy}>
              <Text style={styles.exactOrderTitle}>
                Commande #{order.id}
              </Text>
              <Text style={styles.exactOrderDate}>
                Passée le {formatDateTime(order.created_at)}
              </Text>
            </View>

            <View
              style={[
                styles.exactStatusBadge,
                { backgroundColor: statusColors.bg },
              ]}
            >
              <View
                style={[
                  styles.exactStatusBadgeDot,
                  { backgroundColor: statusColors.text },
                ]}
              />
              <Text
                style={[
                  styles.exactStatusBadgeText,
                  { color: statusColors.text },
                ]}
                numberOfLines={1}
              >
                {STATUS_LABELS[order.status]}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.exactSheet}>
          {loadError ? (
            <InlineError
              message={loadError}
              onRetry={handleRefresh}
            />
          ) : null}

          <View
            style={[
              styles.exactStatusCard,
              isProblemStatus && styles.exactProblemStatusCard,
            ]}
          >
            <View style={styles.exactStatusTop}>
              <View
                style={[
                  styles.exactStatusIcon,
                  isProblemStatus && styles.exactProblemIcon,
                  order.status === 'delivered' && styles.exactDeliveredIcon,
                ]}
              >
                <Icon
                  name={getStatusIcon(order.status)}
                  size={31}
                  color={
                    isProblemStatus
                      ? colors.error
                      : order.status === 'delivered'
                        ? colors.success
                        : '#073BDF'
                  }
                />
              </View>

              <View style={styles.exactStatusCopy}>
                <Text style={styles.exactStatusKicker}>
                  Statut actuel
                </Text>
                <Text style={styles.exactStatusTitle}>
                  {STATUS_LABELS[order.status]}
                </Text>
                <Text style={styles.exactStatusDescription}>
                  {STATUS_DESCRIPTIONS[order.status]}
                </Text>

                {hasLiveEta || hasLiveDistance ? (
                  <View style={styles.exactLiveFacts}>
                    {hasLiveDistance ? (
                      <View style={styles.exactLiveFact}>
                        <Icon
                          name="route"
                          size={14}
                          color="#073BDF"
                        />
                        <Text style={styles.exactLiveFactText}>
                          {formatDistance(
                            liveTracking?.distance_to_customer_m,
                          )}
                        </Text>
                      </View>
                    ) : null}

                    {hasLiveEta ? (
                      <View style={styles.exactLiveFact}>
                        <Icon
                          name="schedule"
                          size={14}
                          color="#073BDF"
                        />
                        <Text style={styles.exactLiveFactText}>
                          {Math.max(
                            1,
                            Math.round(liveTracking?.eta_minutes ?? 0),
                          )} min
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>

            {!isProblemStatus ? (
              <>
                <View style={styles.exactProgressDivider} />
                <OrderProgressOverview
                  currentStage={currentStage}
                  status={order.status}
                />
              </>
            ) : null}
          </View>

          {isProblemStatus ? (
            <ProblemDetails order={order} />
          ) : null}

          {order.delivery_incident ? (
            <PatientDeliveryIncidentCard
              incident={order.delivery_incident}
            />
          ) : null}

          {!order.delivery_incident && liveDeliveryActive ? (
            <PatientLiveDeliveryCard
              status={order.status}
              tracking={liveTracking}
              deliveryLatitude={order.delivery_latitude}
              deliveryLongitude={order.delivery_longitude}
            />
          ) : null}

          {!order.delivery_incident && showCourierIdentity && order.delivery_agent_name ? (
            <PatientAssignedCourierCard
              name={order.delivery_agent_name}
            />
          ) : null}

          {!order.delivery_incident && showPin ? (
            <PatientDeliveryPinCard orderId={order.id} />
          ) : null}

          {!order.delivery_incident && showChat && order.delivery_agent_name ? (
            <PatientOrderChatCard
              courierName={order.delivery_agent_name}
              onPress={() => {
                navigation.navigate('OrderChat', {
                  orderId: order.id,
                  peerLabel: order.delivery_agent_name ?? 'Livreur',
                })
              }}
            />
          ) : null}

          <View style={styles.exactSection}>
            <View style={styles.exactSectionHeading}>
              <Text style={styles.exactSectionTitle}>
                Articles commandés ({getTotalQuantity(order)})
              </Text>
            </View>

            <View style={styles.exactItemsCard}>
              {order.items.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.exactItemRow,
                    index > 0 && styles.exactItemRowBorder,
                  ]}
                >
                  <View style={styles.exactItemIcon}>
                    <Icon
                      name="medication"
                      size={21}
                      color="#073BDF"
                    />
                  </View>

                  <View style={styles.exactItemCopy}>
                    <Text style={styles.exactItemName} numberOfLines={2}>
                      {item.medicine_name}
                    </Text>
                    <Text style={styles.exactItemMeta}>
                      {item.quantity} × {formatPrice(item.unit_price)}
                    </Text>
                  </View>

                  <Text style={styles.exactItemTotal}>
                    {formatPrice(item.line_total)}
                  </Text>
                </View>
              ))}

              <View style={styles.exactPriceSummary}>
                <PriceLine
                  label="Sous-total"
                  value={formatPrice(order.items_total)}
                />
                <PriceLine
                  label="Frais de livraison"
                  value={formatPrice(order.delivery_fee)}
                />

                <View style={styles.exactTotalRow}>
                  <Text style={styles.exactTotalLabel}>Total</Text>
                  <Text style={styles.exactTotalValue}>
                    {formatPrice(order.grand_total)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.exactInfoCard}>
            <SectionHeader
              icon="local_shipping"
              title="Livraison et paiement"
              subtitle="Informations validées pour cette commande."
            />

            <InformationRow
              icon="location_on"
              label="Adresse de livraison"
              value={order.delivery_address}
              multiline
            />

            <InformationRow
              icon="payments"
              label="Mode de paiement"
              value={
                order.payment_method === 'cash'
                  ? 'Paiement en espèces à la livraison'
                  : 'Paiement par carte'
              }
            />

            <InformationRow
              icon="event"
              label="Date de commande"
              value={formatDateTime(order.created_at)}
            />
          </View>

          <PrescriptionCard order={order} />

          {order.notes.trim() ? (
            <View style={styles.exactInfoCard}>
              <SectionHeader
                icon="notes"
                title="Note de la commande"
              />
              <View style={styles.notesContainer}>
                <Text style={styles.notesText}>
                  {order.notes.trim()}
                </Text>
              </View>
            </View>
          ) : null}

          {(canCancel || canReorder) ? (
            <View style={styles.exactActionsCard}>
              <Text style={styles.exactSectionTitle}>
                Actions disponibles
              </Text>

              {canReorder ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryAction,
                    styles.exactPrimaryAction,
                    pressed && styles.buttonPressed,
                    reordering && styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    void handleReorder()
                  }}
                  disabled={reordering}
                >
                  {reordering ? (
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                    />
                  ) : (
                    <Icon
                      name="shopping_cart"
                      size={19}
                      color="#FFFFFF"
                    />
                  )}
                  <Text style={styles.primaryActionText}>
                    {reordering
                      ? 'Préparation du panier…'
                      : 'Ajouter à nouveau au panier'}
                  </Text>
                </Pressable>
              ) : null}

              {canCancel ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.cancelAction,
                    styles.exactCancelAction,
                    pressed && styles.buttonPressed,
                    cancelling && styles.buttonDisabled,
                  ]}
                  onPress={confirmCancel}
                  disabled={cancelling}
                >
                  {cancelling ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.error}
                    />
                  ) : (
                    <Icon
                      name="cancel"
                      size={19}
                      color={colors.error}
                    />
                  )}
                  <Text style={styles.cancelActionText}>
                    {cancelling
                      ? 'Annulation…'
                      : 'Annuler la commande'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function LoadingState() {
  return (
    <View style={styles.centeredScreen}>
      <View style={styles.centeredIconContainer}>
        <Icon
          name="receipt_long"
          size={30}
          color={colors.primary}
        />
      </View>
      <ActivityIndicator
        size="large"
        color={colors.primary}
      />
      <Text style={styles.centeredTitle}>
        Chargement de la commande
      </Text>
      <Text style={styles.centeredText}>
        Nous récupérons les dernières informations.
      </Text>
    </View>
  )
}

function ErrorState({
  message,
  onRetry,
  onBack,
}: {
  message: string
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <View style={styles.centeredScreen}>
      <View
        style={[
          styles.centeredIconContainer,
          styles.centeredErrorIconContainer,
        ]}
      >
        <Icon
          name="receipt_long"
          size={32}
          color={colors.error}
        />
      </View>

      <Text style={styles.centeredTitle}>
        Impossible d’ouvrir la commande
      </Text>
      <Text style={styles.centeredText}>
        {message}
      </Text>

      <Pressable
        style={styles.retryButton}
        onPress={onRetry}
      >
        <Icon
          name="refresh"
          size={18}
          color={colors.white}
        />
        <Text style={styles.retryButtonText}>
          Réessayer
        </Text>
      </Pressable>

      <Pressable
        style={styles.secondaryBackButton}
        onPress={onBack}
      >
        <Icon
          name="arrow_back"
          size={17}
          color={colors.primary}
        />
        <Text style={styles.secondaryBackButtonText}>
          Retour aux commandes
        </Text>
      </Pressable>
    </View>
  )
}

function InlineError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <View style={styles.inlineError}>
      <Icon
        name="cloud_off"
        size={19}
        color={colors.error}
      />
      <Text style={styles.inlineErrorText}>
        {message}
      </Text>
      <Pressable onPress={onRetry}>
        <Text style={styles.inlineErrorAction}>
          Réessayer
        </Text>
      </Pressable>
    </View>
  )
}

function SectionLabel({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle?: string
}) {
  return (
    <View style={styles.mockupSectionLabel}>
      <Text style={styles.mockupSectionEyebrow}>
        {eyebrow}
      </Text>
      <Text style={styles.mockupSectionTitle}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.mockupSectionSubtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}


function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: string
  title: string
  subtitle?: string
}) {
  return (
    <View style={styles.literalInfoHeader}>
      <View style={styles.literalInfoHeaderIcon}>
        <Icon
          name={icon}
          size={18}
          color="#073BDF"
        />
      </View>
      <View style={styles.literalInfoHeaderCopy}>
        <Text style={styles.literalInfoHeaderTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.literalInfoHeaderSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function OrderProgressOverview({
  currentStage,
  status,
}: {
  currentStage: number
  status: OrderStatus
}) {
  return (
    <View style={styles.literalProgress}>
      {PROGRESS_STEPS.map((step, index) => {
        const state = getProgressState(
          index,
          currentStage,
          status,
        )
        const completed = state === 'completed'
        const current = state === 'current'
        const lineActive =
          status === 'delivered' ||
          index < currentStage

        return (
          <View
            key={step.key}
            style={styles.literalProgressStep}
          >
            <View style={styles.literalProgressRail}>
              {index > 0 ? (
                <View
                  style={[
                    styles.literalProgressLine,
                    (
                      status === 'delivered' ||
                      index <= currentStage
                    ) &&
                      styles.literalProgressLineActive,
                  ]}
                />
              ) : (
                <View style={styles.literalProgressSpacer} />
              )}

              <View
                style={[
                  styles.literalProgressDot,
                  (completed || current) &&
                    styles.literalProgressDotActive,
                  current &&
                    styles.literalProgressDotCurrent,
                ]}
              >
                {completed ? (
                  <Icon
                    name="check"
                    size={11}
                    color="#FFFFFF"
                  />
                ) : current ? (
                  <View style={styles.literalProgressCenter} />
                ) : (
                  <Icon
                    name={step.icon}
                    size={10}
                    color="#9AA7B9"
                  />
                )}
              </View>

              {index < PROGRESS_STEPS.length - 1 ? (
                <View
                  style={[
                    styles.literalProgressLine,
                    lineActive &&
                      styles.literalProgressLineActive,
                  ]}
                />
              ) : (
                <View style={styles.literalProgressSpacer} />
              )}
            </View>

            <Text
              style={[
                styles.literalProgressLabel,
                current &&
                  styles.literalProgressLabelCurrent,
              ]}
              numberOfLines={2}
            >
              {step.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function TrackingCard({
  status,
}: {
  status: OrderStatus
}) {
  const waitingForDelivery =
    status === 'ready_for_pickup' ||
    status === 'awaiting_agent'

  if (
    status === 'picked_up' ||
    status === 'out_for_delivery' ||
    status === 'delivered' ||
    TERMINAL_PROBLEM_STATUSES.includes(status)
  ) {
    return null
  }

  return (
    <View style={styles.literalPreDelivery}>
      <View style={styles.literalPreDeliveryIcon}>
        <Icon
          name={
            waitingForDelivery
              ? 'person_search'
              : 'location_searching'
          }
          size={19}
          color="#073BDF"
        />
      </View>

      <View style={styles.literalPreDeliveryCopy}>
        <Text style={styles.literalPreDeliveryTitle}>
          {waitingForDelivery
            ? 'Attribution du livreur'
            : 'Suivi en direct à venir'}
        </Text>
        <Text style={styles.literalPreDeliveryText}>
          {waitingForDelivery
            ? 'La carte s’activera dès qu’un livreur prendra en charge la commande.'
            : 'La carte s’activera lorsque la commande entrera en phase de livraison.'}
        </Text>
      </View>
    </View>
  )
}

function ProblemDetails({
  order,
}: {
  order: Order
}) {
  const rejectionReason =
    order.prescription?.rejection_reason?.trim()

  return (
    <View style={[styles.exactInfoCard, styles.problemCard]}>
      <SectionHeader
        icon="info"
        title="Informations sur cette commande"
      />

      <Text style={styles.problemCardText}>
        {order.status === 'rejected'
          ? 'La commande a été rejetée pendant la vérification.'
          : order.status === 'failed'
            ? 'La livraison ou le traitement de cette commande n’a pas pu être terminé.'
            : 'La commande a été annulée avant sa livraison.'}
      </Text>

      {rejectionReason ? (
        <View style={styles.rejectionReasonContainer}>
          <Text style={styles.rejectionReasonLabel}>
            Motif communiqué
          </Text>
          <Text style={styles.rejectionReasonText}>
            {rejectionReason}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function InformationRow({
  icon,
  label,
  value,
  multiline = false,
}: {
  icon: string
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <View style={styles.literalInformationRow}>
      <View style={styles.literalInformationIcon}>
        <Icon
          name={icon}
          size={17}
          color="#073BDF"
        />
      </View>

      <View style={styles.literalInformationCopy}>
        <Text style={styles.literalInformationLabel}>
          {label}
        </Text>
        <Text
          style={styles.literalInformationValue}
          numberOfLines={multiline ? undefined : 2}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

function PrescriptionCard({
  order,
}: {
  order: Order
}) {
  if (order.prescription_mode === 'none') {
    return (
      <View style={styles.exactInfoCard}>
        <SectionHeader
          icon="description"
          title="Ordonnance"
        />
        <InformationRow
          icon="check_circle"
          label="Mode sélectionné"
          value={PRESCRIPTION_MODE_LABELS.none}
        />
      </View>
    )
  }

  if (order.prescription_mode === 'pickup') {
    return (
      <View style={styles.exactInfoCard}>
        <SectionHeader
          icon="description"
          title="Ordonnance"
          subtitle="Conservez l’original disponible lors de la livraison."
        />
        <InformationRow
          icon="assignment_ind"
          label="Mode sélectionné"
          value={PRESCRIPTION_MODE_LABELS.pickup}
        />
      </View>
    )
  }

  const prescriptionStatus =
    order.prescription?.status ?? 'pending'
  const config =
    PRESCRIPTION_STATUS_CONFIG[prescriptionStatus]

  return (
    <View style={styles.exactInfoCard}>
      <SectionHeader
        icon="description"
        title="Ordonnance"
        subtitle={PRESCRIPTION_MODE_LABELS.photo}
      />

      <View
        style={[
          styles.prescriptionStatus,
          { backgroundColor: config.background },
        ]}
      >
        <Icon
          name={config.icon}
          size={20}
          color={config.color}
        />
        <Text
          style={[
            styles.prescriptionStatusText,
            { color: config.color },
          ]}
        >
          {config.label}
        </Text>
      </View>

      {order.prescription?.verified_at ? (
        <Text style={styles.prescriptionVerifiedAt}>
          Vérifiée le {formatDateTime(order.prescription.verified_at)}
        </Text>
      ) : null}

      {order.prescription?.rejection_reason?.trim() ? (
        <View style={styles.rejectionReasonContainer}>
          <Text style={styles.rejectionReasonLabel}>
            Motif du refus
          </Text>
          <Text style={styles.rejectionReasonText}>
            {order.prescription.rejection_reason.trim()}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function PriceLine({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View style={styles.literalPriceLine}>
      <Text style={styles.literalPriceLineLabel}>
        {label}
      </Text>
      <Text style={styles.literalPriceLineValue}>
        {value}
      </Text>
    </View>
  )
}

function getProgressState(
  stepIndex: number,
  currentStage: number,
  status: OrderStatus,
): 'completed' | 'current' | 'upcoming' {
  if (status === 'delivered') {
    return 'completed'
  }

  if (stepIndex < currentStage) {
    return 'completed'
  }

  if (stepIndex === currentStage) {
    return 'current'
  }

  return 'upcoming'
}

function getStatusIcon(status: OrderStatus) {
  const icons: Record<OrderStatus, string> = {
    pending_payment: 'payments',
    pending_review: 'fact_check',
    rejected: 'cancel',
    accepted: 'task_alt',
    preparing: 'inventory_2',
    ready_for_pickup: 'local_pharmacy',
    awaiting_agent: 'person_search',
    picked_up: 'two_wheeler',
    out_for_delivery: 'local_shipping',
    delivered: 'check_circle',
    cancelled: 'cancel',
    failed: 'error',
  }

  return icons[status]
}

function getTotalQuantity(order: Order) {
  return order.items.reduce(
    (total, item) => total + item.quantity,
    0,
  )
}

function formatDistance(
  value: number | null | undefined,
) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return 'Distance indisponible'
  }

  if (value < 1000) {
    return `${Math.max(0, Math.round(value))} m`
  }

  return `${(Math.max(0, value) / 1000)
    .toFixed(1)
    .replace('.', ',')} km`
}


function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Date indisponible'
  }

  const day = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const time = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${day} à ${time}`
}

function formatPrice(value: string | number) {
  const numberValue = Number(value)

  if (Number.isNaN(numberValue)) {
    return `${value} MAD`
  }

  return `${numberValue
    .toFixed(2)
    .replace('.', ',')} MAD`
}

function getLoadErrorMessage(error: unknown) {
  const axiosLikeError = error as {
    response?: unknown
    message?: string
  }

  if (!axiosLikeError.response) {
    return 'Impossible de contacter le serveur. Vérifiez la connexion au backend puis réessayez.'
  }

  return getActionErrorMessage(
    error,
    'Impossible de charger cette commande.',
  )
}

function getActionErrorMessage(
  error: unknown,
  fallback: string,
) {
  const extracted = firstError(error)

  if (
    extracted === 'Une erreur est survenue. Réessayez.' ||
    extracted === 'Une erreur est survenue.'
  ) {
    return fallback
  }

  return extracted
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFF',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 44,
    gap: 16,
  },

  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
    backgroundColor: '#F7FAFF',
  },
  centeredIconContainer: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#D7E6F8',
    borderRadius: 20,
    backgroundColor: '#EEF5FF',
  },
  centeredErrorIconContainer: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  centeredTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    color: '#0B1F4D',
  },
  centeredText: {
    maxWidth: 330,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: '#657791',
  },
  retryButton: {
    minWidth: 154,
    minHeight: 46,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#073BDF',
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  secondaryBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryBackButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#073BDF',
  },

  orderHero: {
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    borderRadius: 28,

    shadowColor: '#073BDF',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5,
  },
  heroGlowLarge: {
    position: 'absolute',
    top: -110,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  heroGlowSmall: {
    position: 'absolute',
    right: 140,
    bottom: -120,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: '#D9F9FF',
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: -0.6,
    color: '#FFFFFF',
  },
  heroStatusPill: {
    maxWidth: '42%',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.70)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.91)',
  },
  heroStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  heroStatusText: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
  },
  heroDescription: {
    maxWidth: 330,
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#F0FBFF',
  },
  heroUpdateRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroUpdateText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: '#E9F9FF',
  },
  heroLiveStrip: {
    minHeight: 74,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.91)',
  },
  heroLiveIcon: {
    width: 43,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#EAF3FF',
  },
  heroLiveContent: {
    flex: 1,
    minWidth: 0,
  },
  heroLiveTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  heroLiveText: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: '#657791',
  },
  heroLivePulse: {
    width: 11,
    height: 11,
    borderWidth: 3,
    borderColor: '#D8FAFF',
    borderRadius: 6,
    backgroundColor: '#10D1D0',
  },

  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#991B1B',
  },
  inlineErrorAction: {
    fontSize: 11,
    fontWeight: '900',
    color: '#D92D20',
  },

  progressCard: {
    paddingHorizontal: 14,
    paddingTop: 15,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: '#DCE8F7',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',

    shadowColor: '#12366F',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionEyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1.0,
    color: '#087DFF',
  },
  sectionHeadingTitle: {
    marginTop: 2,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: '#0B1F4D',
  },
  sectionHeadingSubtitle: {
    marginTop: 4,
    maxWidth: 330,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
    color: '#657791',
  },
  stepPill: {
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: '#EEF5FF',
  },
  stepPillText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    color: '#073BDF',
  },
  progressOverview: {
    marginTop: 18,
    flexDirection: 'row',
  },
  progressOverviewStep: {
    flex: 1,
    alignItems: 'center',
  },
  progressOverviewRail: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressOverviewConnector: {
    flex: 1,
    height: 3,
    backgroundColor: '#DDE7F2',
  },
  progressOverviewConnectorActive: {
    backgroundColor: '#087DFF',
  },
  progressOverviewConnectorSpacer: {
    flex: 1,
    height: 3,
    backgroundColor: 'transparent',
  },
  progressOverviewDot: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#DDE7F2',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  progressOverviewDotActive: {
    borderColor: '#087DFF',
    backgroundColor: '#087DFF',
  },
  progressOverviewDotCurrent: {
    borderColor: '#087DFF',
    backgroundColor: '#FFFFFF',
  },
  progressOverviewCurrentCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10D1D0',
  },
  progressOverviewLabel: {
    minHeight: 28,
    marginTop: 7,
    paddingHorizontal: 2,
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: '700',
    textAlign: 'center',
    color: '#8491A8',
  },
  progressOverviewLabelCurrent: {
    color: '#073BDF',
    fontWeight: '900',
  },

  deliverySection: {
    gap: 12,
  },
  securitySection: {
    gap: 12,
  },
  prioritySection: {
    gap: 12,
  },
  sectionHeadingBlock: {
    paddingHorizontal: 2,
  },

  trackingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BCECF4',
    borderRadius: 18,
    backgroundColor: '#ECFCFF',
  },
  trackingIconContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  trackingContent: {
    flex: 1,
  },
  trackingTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: '#073BDF',
  },
  trackingDescription: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 16,
    fontWeight: '600',
    color: '#657791',
  },

  card: {
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 15,
    gap: 14,
    borderWidth: 1,
    borderColor: '#DCE8F7',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',

    shadowColor: '#12366F',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.045,
    shadowRadius: 9,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  sectionHeaderIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8E8FF',
    borderRadius: 12,
    backgroundColor: '#EEF5FF',
  },
  sectionHeaderTextContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
    color: '#657791',
  },

  itemsList: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6EDF7',
    borderRadius: 15,
    backgroundColor: '#FBFDFF',
  },
  itemRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  itemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E6EDF7',
  },
  itemIconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#EEF5FF',
  },
  itemInformation: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  itemCalculation: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: '#657791',
  },
  itemTotal: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: '#073BDF',
  },
  priceDivider: {
    height: 1,
    backgroundColor: '#E6EDF7',
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLineLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#657791',
  },
  priceLineValue: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    color: '#0B1F4D',
  },
  totalRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E6EDF7',
  },
  totalLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  totalValue: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: '#073BDF',
  },

  informationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F8FBFF',
  },
  informationIconContainer: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#EEF5FF',
  },
  informationTextContainer: {
    flex: 1,
  },
  informationLabel: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#8491A8',
  },
  informationValue: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700',
    color: '#0B1F4D',
  },

  prescriptionStatus: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 13,
  },
  prescriptionStatusText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
  },
  prescriptionVerifiedAt: {
    fontSize: 10,
    lineHeight: 14,
    color: '#657791',
  },
  rejectionReasonContainer: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 13,
    backgroundColor: '#FFF7F7',
  },
  rejectionReasonLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#D92D20',
  },
  rejectionReasonText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
    color: '#991B1B',
  },

  problemCard: {
    borderColor: '#FECACA',
  },
  problemCardText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#657791',
  },

  notesContainer: {
    padding: 13,
    borderWidth: 1,
    borderColor: '#E6EDF7',
    borderRadius: 13,
    backgroundColor: '#F8FBFF',
  },
  notesText: {
    fontSize: 11,
    lineHeight: 18,
    color: '#0B1F4D',
  },

  actionsCard: {
    gap: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#DCE8F7',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  actionsHeading: {
    marginBottom: 2,
  },
  actionsTitle: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  primaryAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#073BDF',

    shadowColor: '#073BDF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cancelAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
  },
  cancelActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#D92D20',
  },
  buttonPressed: {
    opacity: 0.80,
  },
  buttonDisabled: {
    opacity: 0.60,
  },

  mockupSafeArea: {
    flex: 1,
    backgroundColor: '#00236F',
  },
  mockupScreen: {
    flex: 1,
    backgroundColor: '#F7FAFF',
  },
  mockupContent: {
    paddingBottom: 42,
    backgroundColor: '#F7FAFF',
  },
  mockupHeader: {
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  mockupHeaderGlowLarge: {
    position: 'absolute',
    top: -110,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  mockupHeaderGlowSmall: {
    position: 'absolute',
    bottom: -105,
    left: 190,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  mockupNavRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mockupNavButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  mockupNavTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
    color: '#FFFFFF',
  },
  mockupNavShield: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  mockupOrderHeaderRow: {
    marginTop: 19,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  mockupOrderHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  mockupOrderNumber: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: -0.45,
    color: '#FFFFFF',
  },
  mockupOrderDate: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#EAF9FF',
  },
  mockupHeaderStatusBadge: {
    maxWidth: 135,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  mockupHeaderStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  mockupHeaderStatusText: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    textAlign: 'center',
  },

  mockupBody: {
    gap: 15,
    marginTop: -4,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  mockupStatusCard: {
    paddingHorizontal: 15,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#D7E6F8',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',

    shadowColor: '#12366F',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  mockupProblemStatusCard: {
    borderColor: '#FECACA',
  },
  mockupDeliveredStatusCard: {
    borderColor: '#BBF7D0',
  },
  mockupStatusTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mockupStatusIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#EEF5FF',
  },
  mockupProblemStatusIcon: {
    backgroundColor: '#FFF0F0',
  },
  mockupDeliveredStatusIcon: {
    backgroundColor: '#EAF8F1',
  },
  mockupStatusCopy: {
    flex: 1,
    minWidth: 0,
  },
  mockupStatusLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: '#8491A8',
  },
  mockupStatusTitle: {
    marginTop: 2,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: '#0B1F4D',
  },
  mockupStatusDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '600',
    color: '#657791',
  },
  mockupLiveFacts: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  mockupLiveFact: {
    minHeight: 27,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: '#EEF5FF',
  },
  mockupLiveFactText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    color: '#073BDF',
  },
  mockupProgressBlock: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E6EDF7',
  },

  mockupSection: {
    gap: 10,
  },
  mockupSectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  mockupSectionLabel: {
    flex: 1,
    minWidth: 0,
  },
  mockupSectionEyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1.05,
    color: '#087DFF',
  },
  mockupSectionTitle: {
    marginTop: 2,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: '#0B1F4D',
  },
  mockupSectionSubtitle: {
    marginTop: 3,
    maxWidth: 330,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
    color: '#657791',
  },
  mockupLiveBadge: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: '#EAF8F1',
  },
  mockupLiveBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#12B981',
  },
  mockupLiveBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    color: '#087A55',
  },
  mockupLiveCardFrame: {
    overflow: 'hidden',
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#D8E8FF',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',

    shadowColor: '#12366F',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },

  mockupCourierCard: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#DDE8F5',
    borderRadius: 19,
    backgroundColor: '#FFFFFF',

    shadowColor: '#12366F',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  mockupCourierAvatar: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#EEF5FF',
  },
  mockupCourierCopy: {
    flex: 1,
    minWidth: 0,
  },
  mockupCourierLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: '#8491A8',
  },
  mockupCourierName: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  mockupCourierVerifiedRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mockupCourierVerifiedText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: '#657791',
  },
  mockupCourierChatButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#EEF5FF',
  },
  mockupPinFrame: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CDEEE4',
    borderRadius: 20,
    backgroundColor: '#F4FCF8',
  },
  mockupChatAction: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#D8E8FF',
    borderRadius: 18,
    backgroundColor: '#F8FBFF',
  },
  mockupChatActionIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#EEF5FF',
  },
  mockupChatActionCopy: {
    flex: 1,
    minWidth: 0,
  },
  mockupChatActionTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: '#073BDF',
  },
  mockupChatActionText: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: '#657791',
  },

  mockupItemsCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DDE8F5',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',

    shadowColor: '#12366F',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.055,
    shadowRadius: 10,
    elevation: 2,
  },
  mockupItemRow: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  mockupItemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E7EEF7',
  },
  mockupItemIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#EEF5FF',
  },
  mockupItemInformation: {
    flex: 1,
    minWidth: 0,
  },
  mockupItemName: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  mockupItemCalculation: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: '#657791',
  },
  mockupItemTotal: {
    maxWidth: 110,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textAlign: 'right',
    color: '#0B1F4D',
  },
  mockupPriceDivider: {
    height: 1,
    marginHorizontal: 13,
    backgroundColor: '#E7EEF7',
  },
  mockupPriceSummary: {
    gap: 9,
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 14,
    backgroundColor: '#FAFCFF',
  },
  mockupTotalRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: '#DDE8F5',
  },
  mockupTotalLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  mockupTotalValue: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: '#073BDF',
  },

  mockupInfoCard: {
    borderRadius: 20,
    borderColor: '#DDE8F5',
    backgroundColor: '#FFFFFF',

    shadowColor: '#12366F',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.045,
    shadowRadius: 9,
    elevation: 1,
  },
  mockupActionsCard: {
    gap: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#DDE8F5',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  mockupPrimaryAction: {
    backgroundColor: '#073BDF',
  },

  literalSafeArea: {
    flex: 1,
    backgroundColor: '#00236F',
  },
  literalScreen: {
    flex: 1,
    backgroundColor: '#F7FAFF',
  },
  literalContent: {
    paddingBottom: 42,
    backgroundColor: '#F7FAFF',
  },
  literalHeader: {
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 30,
  },
  literalHeaderOrbLarge: {
    position: 'absolute',
    right: -72,
    bottom: -110,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  literalHeaderOrbSmall: {
    position: 'absolute',
    top: 38,
    right: 125,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(255,255,255,0.065)',
  },
  literalNavRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  literalNavButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  literalNavTitle: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
    color: '#FFFFFF',
  },
  literalHeaderOrderRow: {
    marginTop: 15,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  literalHeaderOrderCopy: {
    flex: 1,
    minWidth: 0,
  },
  literalHeaderOrderTitle: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.55,
    color: '#FFFFFF',
  },
  literalHeaderOrderDate: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#E8F8FF',
  },
  literalHeaderBadge: {
    maxWidth: 134,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 12,
  },
  literalHeaderBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  literalHeaderBadgeText: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
  },

  literalBody: {
    marginTop: -18,
    gap: 14,
    paddingHorizontal: 12,
  },
  literalStatusCard: {
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 15,
    borderWidth: 1,
    borderColor: '#D8E5F5',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',

    shadowColor: '#0B3474',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 4,
  },
  literalProblemCard: {
    borderColor: '#FECACA',
  },
  literalDeliveredCard: {
    borderColor: '#BBF7D0',
  },
  literalStatusHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
  },
  literalStatusIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D7E7FF',
    borderRadius: 20,
    backgroundColor: '#EEF5FF',
  },
  literalStatusIconProblem: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF2F2',
  },
  literalStatusIconDelivered: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  literalStatusCopy: {
    flex: 1,
    minWidth: 0,
  },
  literalStatusKicker: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#71809A',
  },
  literalStatusTitle: {
    marginTop: 2,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: '#0B1F4D',
  },
  literalStatusDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#526684',
  },
  literalEtaRow: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  literalEtaFact: {
    minHeight: 29,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: '#EEF5FF',
  },
  literalEtaFactText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    color: '#073BDF',
  },
  literalDivider: {
    height: 1,
    marginTop: 14,
    backgroundColor: '#E5ECF5',
  },

  literalProgress: {
    marginTop: 15,
    flexDirection: 'row',
  },
  literalProgressStep: {
    flex: 1,
    alignItems: 'center',
  },
  literalProgressRail: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  literalProgressLine: {
    flex: 1,
    height: 3,
    backgroundColor: '#DCE5F1',
  },
  literalProgressLineActive: {
    backgroundColor: '#0B5CFF',
  },
  literalProgressSpacer: {
    flex: 1,
    height: 3,
    backgroundColor: 'transparent',
  },
  literalProgressDot: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#D7E1ED',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  literalProgressDotActive: {
    borderColor: '#0B5CFF',
    backgroundColor: '#0B5CFF',
  },
  literalProgressDotCurrent: {
    borderColor: '#0B5CFF',
    backgroundColor: '#FFFFFF',
  },
  literalProgressCenter: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#10D1D0',
  },
  literalProgressLabel: {
    minHeight: 24,
    marginTop: 7,
    paddingHorizontal: 2,
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: '700',
    textAlign: 'center',
    color: '#7B899E',
  },
  literalProgressLabelCurrent: {
    fontWeight: '900',
    color: '#073BDF',
  },

  literalPreDelivery: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#BCECF4',
    borderRadius: 15,
    backgroundColor: '#ECFCFF',
  },
  literalPreDeliveryIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  literalPreDeliveryCopy: {
    flex: 1,
    minWidth: 0,
  },
  literalPreDeliveryTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: '#073BDF',
  },
  literalPreDeliveryText: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: '#657791',
  },

  literalSectionBlock: {
    gap: 10,
  },
  literalSectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: -0.25,
    color: '#0B1F4D',
  },
  literalSectionSubtitle: {
    marginTop: 2,
    maxWidth: 320,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
    color: '#657791',
  },
  literalPanelHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  literalPanelTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  literalPanelSubtitle: {
    marginTop: 2,
    maxWidth: 260,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: '#657791',
  },
  literalLivePill: {
    minHeight: 27,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: '#EAFBF4',
  },
  literalLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#12B981',
  },
  literalLiveText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    color: '#087A55',
  },
  literalDeliveryPanel: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D8E5F5',
    borderRadius: 19,
    backgroundColor: '#FFFFFF',

    shadowColor: '#0B3474',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.055,
    shadowRadius: 10,
    elevation: 2,
  },

  literalCourierCard: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#DDE8F5',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  literalCourierAvatar: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#EEF5FF',
  },
  literalCourierCopy: {
    flex: 1,
    minWidth: 0,
  },
  literalCourierLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: '#71809A',
  },
  literalCourierName: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  literalVerifiedRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  literalVerifiedText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: '#087DFF',
  },
  literalRoundAction: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#EEF5FF',
  },
  literalPinFrame: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CDEFE2',
    borderRadius: 18,
    backgroundColor: '#F0FBF6',
  },
  literalChatTile: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#CFE0FF',
    borderRadius: 16,
    backgroundColor: '#F7FAFF',
  },
  literalChatTileIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#EEF5FF',
  },
  literalChatTileCopy: {
    flex: 1,
    minWidth: 0,
  },
  literalChatTileTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: '#073BDF',
  },
  literalChatTileText: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: '#657791',
  },

  literalItemsPanel: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCE8F5',
    borderRadius: 19,
    backgroundColor: '#FFFFFF',

    shadowColor: '#0B3474',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.045,
    shadowRadius: 8,
    elevation: 1,
  },
  literalItemRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  literalItemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E7EDF6',
  },
  literalItemIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#EEF5FF',
  },
  literalItemCopy: {
    flex: 1,
    minWidth: 0,
  },
  literalItemName: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  literalItemMeta: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: '#657791',
  },
  literalItemTotal: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  literalPriceBox: {
    gap: 9,
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 13,
    borderTopWidth: 1,
    borderTopColor: '#DCE8F5',
    backgroundColor: '#F3F8FF',
  },
  literalPriceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  literalPriceLineLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#657791',
  },
  literalPriceLineValue: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    color: '#0B1F4D',
  },
  literalTotalRow: {
    minHeight: 35,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#D3E0EF',
  },
  literalTotalLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  literalTotalValue: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: '#073BDF',
  },

  literalInfoPanel: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCE8F5',
    borderRadius: 19,
    backgroundColor: '#FFFFFF',

    shadowColor: '#0B3474',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  literalInfoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  literalInfoHeaderIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8E8FF',
    borderRadius: 12,
    backgroundColor: '#EEF5FF',
  },
  literalInfoHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  literalInfoHeaderTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  literalInfoHeaderSubtitle: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: '#657791',
  },
  literalInformationRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: '#F8FBFF',
  },
  literalInformationIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#EEF5FF',
  },
  literalInformationCopy: {
    flex: 1,
    minWidth: 0,
  },
  literalInformationLabel: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    color: '#8491A8',
  },
  literalInformationValue: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    color: '#0B1F4D',
  },

  literalActionsPanel: {
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCE8F5',
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
  },
  literalPrimaryAction: {
    borderRadius: 14,
    backgroundColor: '#073BDF',
  },
  literalCancelAction: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#FFF5F5',
  },

  exactSafeArea: {
    flex: 1,
    backgroundColor: '#00236F',
  },
  exactScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  exactContent: {
    paddingBottom: 38,
    backgroundColor: '#FFFFFF',
  },
  exactHeader: {
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 32,
  },
  exactHeaderOrbLarge: {
    position: 'absolute',
    right: -78,
    bottom: -118,
    width: 275,
    height: 275,
    borderRadius: 138,
    backgroundColor: 'rgba(255,255,255,0.105)',
  },
  exactHeaderOrbSmall: {
    position: 'absolute',
    top: 42,
    right: 116,
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  exactNavRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exactNavButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  exactNavTitle: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    textAlign: 'center',
    color: '#FFFFFF',
  },
  exactOrderRow: {
    marginTop: 15,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  exactOrderCopy: {
    flex: 1,
    minWidth: 0,
  },
  exactOrderTitle: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  exactOrderDate: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#E8F8FF',
  },
  exactStatusBadge: {
    maxWidth: 132,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 12,
  },
  exactStatusBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  exactStatusBadgeText: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
  },
  exactSheet: {
    marginTop: -16,
    gap: 13,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  exactStatusCard: {
    paddingHorizontal: 15,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#D8E5F5',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',

    shadowColor: '#0B3474',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.09,
    shadowRadius: 13,
    elevation: 3,
  },
  exactProblemStatusCard: {
    borderColor: '#FECACA',
  },
  exactStatusTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
  },
  exactStatusIcon: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D7E7FF',
    borderRadius: 21,
    backgroundColor: '#EEF5FF',
  },
  exactProblemIcon: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF2F2',
  },
  exactDeliveredIcon: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  exactStatusCopy: {
    flex: 1,
    minWidth: 0,
  },
  exactStatusKicker: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#71809A',
  },
  exactStatusTitle: {
    marginTop: 2,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: -0.25,
    color: '#0B1F4D',
  },
  exactStatusDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#526684',
  },
  exactLiveFacts: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  exactLiveFact: {
    minHeight: 29,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: '#EEF5FF',
  },
  exactLiveFactText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    color: '#073BDF',
  },
  exactProgressDivider: {
    height: 1,
    marginTop: 14,
    backgroundColor: '#E4ECF5',
  },
  exactSection: {
    gap: 8,
  },
  exactSectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  exactSectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    letterSpacing: -0.25,
    color: '#0B1F4D',
  },
  exactItemsCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCE8F5',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  exactItemRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exactItemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E7EDF6',
  },
  exactItemIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#EEF5FF',
  },
  exactItemCopy: {
    flex: 1,
    minWidth: 0,
  },
  exactItemName: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  exactItemMeta: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: '#657791',
  },
  exactItemTotal: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  exactPriceSummary: {
    gap: 9,
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 13,
    borderTopWidth: 1,
    borderTopColor: '#DCE8F5',
    backgroundColor: '#F1F7FF',
  },
  exactTotalRow: {
    minHeight: 35,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#D3E0EF',
  },
  exactTotalLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  exactTotalValue: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: '#073BDF',
  },
  exactInfoCard: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCE8F5',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  exactActionsCard: {
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCE8F5',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  exactPrimaryAction: {
    borderRadius: 13,
    backgroundColor: '#073BDF',
  },
  exactCancelAction: {
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: '#FFF5F5',
  }
})
