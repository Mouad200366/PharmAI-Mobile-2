import { useCallback, useRef, useState } from 'react'
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
} from '../../api/orderRealtime'
import { useCartStore } from '../../store/cartStore'
import { tokenStorage } from '../../store/tokenStorage'
import Icon from '../../components/ui/Icon'
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
    label: 'Commande reçue',
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
    label: 'Prête pour livraison',
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

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reordering, setReordering] = useState(false)

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.eyebrow}>COMMANDE</Text>
          <Text style={styles.orderTitle}>#{order.id}</Text>
          <Text style={styles.orderDate}>
            Passée le {formatDateTime(order.created_at)}
          </Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusColors.bg },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: statusColors.text },
            ]}
          />
          <Text
            style={[
              styles.statusBadgeText,
              { color: statusColors.text },
            ]}
          >
            {STATUS_LABELS[order.status]}
          </Text>
        </View>
      </View>

      {loadError ? (
        <InlineError
          message={loadError}
          onRetry={handleRefresh}
        />
      ) : null}

      <View
        style={[
          styles.statusHero,
          isProblemStatus && styles.problemHero,
          order.status === 'delivered' && styles.successHero,
        ]}
      >
        <View
          style={[
            styles.statusHeroIcon,
            isProblemStatus && styles.problemHeroIcon,
            order.status === 'delivered' && styles.successHeroIcon,
          ]}
        >
          <Icon
            name={getStatusIcon(order.status)}
            size={28}
            color={
              isProblemStatus
                ? colors.error
                : order.status === 'delivered'
                  ? colors.success
                  : colors.primary
            }
          />
        </View>

        <View style={styles.statusHeroContent}>
          <Text style={styles.statusHeroTitle}>
            {STATUS_LABELS[order.status]}
          </Text>
          <Text style={styles.statusHeroDescription}>
            {STATUS_DESCRIPTIONS[order.status]}
          </Text>
          <Text style={styles.lastUpdateText}>
            Dernière mise à jour : {formatDateTime(order.updated_at)}
          </Text>
        </View>
      </View>

      {!isProblemStatus ? (
        <View style={styles.card}>
          <SectionHeader
            icon="timeline"
            title="Progression de la commande"
            subtitle="Les étapes sont mises à jour par la pharmacie et le livreur."
          />

          <View style={styles.timelineContainer}>
            {PROGRESS_STEPS.map((step, index) => (
              <ProgressTimelineItem
                key={step.key}
                step={step}
                index={index}
                isLast={index === PROGRESS_STEPS.length - 1}
                state={getProgressState(index, currentStage, order.status)}
              />
            ))}
          </View>
        </View>
      ) : (
        <ProblemDetails order={order} />
      )}

      <TrackingCard status={order.status} />

      <View style={styles.card}>
        <SectionHeader
          icon="medication"
          title="Médicaments"
          subtitle={`${getTotalQuantity(order)} article${getTotalQuantity(order) > 1 ? 's' : ''} dans cette commande`}
        />

        <View style={styles.itemsList}>
          {order.items.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.itemRow,
                index > 0 && styles.itemRowBorder,
              ]}
            >
              <View style={styles.itemIconContainer}>
                <Icon
                  name="medication"
                  size={20}
                  color={colors.primary}
                />
              </View>

              <View style={styles.itemInformation}>
                <Text style={styles.itemName}>
                  {item.medicine_name}
                </Text>
                <Text style={styles.itemCalculation}>
                  {item.quantity} × {formatPrice(item.unit_price)}
                </Text>
              </View>

              <Text style={styles.itemTotal}>
                {formatPrice(item.line_total)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.priceDivider} />

        <PriceLine
          label="Sous-total"
          value={formatPrice(order.items_total)}
        />
        <PriceLine
          label="Frais de livraison"
          value={formatPrice(order.delivery_fee)}
        />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {formatPrice(order.grand_total)}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <SectionHeader
          icon="local_shipping"
          title="Livraison et paiement"
          subtitle="Informations utilisées lors de la validation de la commande."
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
        <View style={styles.card}>
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

      <View style={styles.card}>
        <SectionHeader
          icon="forum"
          title="Suivi et messagerie"
          subtitle="La carte en temps réel et le chat seront connectés dans la prochaine étape."
        />

        <View style={styles.futureFeatureRow}>
          <View style={styles.futureFeatureIcon}>
            <Icon
              name="map"
              size={20}
              color={colors.primary}
            />
          </View>
          <View style={styles.futureFeatureTextContainer}>
            <Text style={styles.futureFeatureTitle}>
              Aucune information fictive
            </Text>
            <Text style={styles.futureFeatureText}>
              Cette page affiche uniquement les données réellement disponibles dans votre commande.
            </Text>
          </View>
        </View>
      </View>

      {(canCancel || canReorder) ? (
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>
            Actions disponibles
          </Text>

          {canReorder ? (
            <Pressable
              style={({ pressed }) => [
                styles.primaryAction,
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
                  color={colors.white}
                />
              ) : (
                <Icon
                  name="shopping_cart"
                  size={19}
                  color={colors.white}
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
    </ScrollView>
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
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderIcon}>
        <Icon
          name={icon}
          size={19}
          color={colors.primary}
        />
      </View>
      <View style={styles.sectionHeaderTextContainer}>
        <Text style={styles.sectionTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.sectionSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function ProgressTimelineItem({
  step,
  index,
  isLast,
  state,
}: {
  step: ProgressStep
  index: number
  isLast: boolean
  state: 'completed' | 'current' | 'upcoming'
}) {
  const isCompleted = state === 'completed'
  const isCurrent = state === 'current'

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View
          style={[
            styles.timelineCircle,
            isCompleted && styles.timelineCircleCompleted,
            isCurrent && styles.timelineCircleCurrent,
          ]}
        >
          <Icon
            name={isCompleted ? 'check' : step.icon}
            size={isCompleted ? 15 : 16}
            color={
              isCompleted || isCurrent
                ? colors.white
                : colors.textMuted
            }
          />
        </View>

        {!isLast ? (
          <View
            style={[
              styles.timelineLine,
              isCompleted && styles.timelineLineCompleted,
            ]}
          />
        ) : null}
      </View>

      <View
        style={[
          styles.timelineContent,
          !isLast && styles.timelineContentSpacing,
        ]}
      >
        <View style={styles.timelineTitleRow}>
          <Text
            style={[
              styles.timelineTitle,
              isCurrent && styles.timelineTitleCurrent,
              state === 'upcoming' && styles.timelineTitleUpcoming,
            ]}
          >
            {step.label}
          </Text>

          <View
            style={[
              styles.timelineStateBadge,
              isCompleted && styles.completedBadge,
              isCurrent && styles.currentBadge,
            ]}
          >
            <Text
              style={[
                styles.timelineStateText,
                isCompleted && styles.completedBadgeText,
                isCurrent && styles.currentBadgeText,
              ]}
            >
              {isCompleted
                ? 'Terminée'
                : isCurrent
                  ? 'En cours'
                  : 'À venir'}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.timelineDescription,
            state === 'upcoming' && styles.timelineDescriptionUpcoming,
          ]}
        >
          {step.description}
        </Text>
      </View>
    </View>
  )
}

function TrackingCard({
  status,
}: {
  status: OrderStatus
}) {
  const activeDelivery =
    status === 'picked_up' ||
    status === 'out_for_delivery'

  const waitingForDelivery =
    status === 'ready_for_pickup' ||
    status === 'awaiting_agent'

  if (
    status === 'delivered' ||
    TERMINAL_PROBLEM_STATUSES.includes(status)
  ) {
    return null
  }

  return (
    <View style={styles.trackingCard}>
      <View style={styles.trackingIconContainer}>
        <Icon
          name={activeDelivery ? 'near_me' : 'location_searching'}
          size={26}
          color={colors.primary}
        />
      </View>

      <View style={styles.trackingContent}>
        <Text style={styles.trackingTitle}>
          {activeDelivery
            ? 'Livraison en cours'
            : waitingForDelivery
              ? 'Préparation du suivi'
              : 'Suivi en direct à venir'}
        </Text>
        <Text style={styles.trackingDescription}>
          {activeDelivery
            ? 'Le statut réel est disponible. La carte, la position du livreur et l’heure estimée seront connectées dans l’étape temps réel.'
            : waitingForDelivery
              ? 'Le suivi en direct deviendra disponible quand un livreur prendra en charge la commande.'
              : 'La commande doit d’abord être préparée avant le démarrage du suivi de livraison.'}
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
    <View style={[styles.card, styles.problemCard]}>
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
    <View style={styles.informationRow}>
      <View style={styles.informationIconContainer}>
        <Icon
          name={icon}
          size={18}
          color={colors.primary}
        />
      </View>

      <View style={styles.informationTextContainer}>
        <Text style={styles.informationLabel}>
          {label}
        </Text>
        <Text
          style={styles.informationValue}
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
      <View style={styles.card}>
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
      <View style={styles.card}>
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
    <View style={styles.card}>
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
    <View style={styles.priceLine}>
      <Text style={styles.priceLineLabel}>
        {label}
      </Text>
      <Text style={styles.priceLineValue}>
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
    backgroundColor: colors.surface,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },

  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
    backgroundColor: colors.surface,
  },
  centeredIconContainer: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    marginBottom: 2,
  },
  centeredErrorIconContainer: {
    backgroundColor: colors.errorBg,
  },
  centeredTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  centeredText: {
    maxWidth: 330,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    minWidth: 150,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
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
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.textMuted,
  },
  orderTitle: {
    marginTop: 2,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: colors.primary,
  },
  orderDate: {
    marginTop: 5,
    fontSize: 12,
    color: colors.textSecondary,
  },
  statusBadge: {
    maxWidth: '52%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadgeText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },

  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    backgroundColor: colors.errorBg,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.errorText,
  },
  inlineErrorAction: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.error,
  },

  statusHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  problemHero: {
    borderColor: '#fecaca',
    backgroundColor: colors.errorBg,
  },
  successHero: {
    borderColor: '#bbf7d0',
    backgroundColor: colors.successBg,
  },
  statusHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  problemHeroIcon: {
    backgroundColor: '#fff5f5',
  },
  successHeroIcon: {
    backgroundColor: '#f7fff9',
  },
  statusHeroContent: {
    flex: 1,
  },
  statusHeroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statusHeroDescription: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  lastUpdateText: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },

  card: {
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 18,
    backgroundColor: colors.surfaceLowest,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  sectionHeaderIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  sectionHeaderTextContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  timelineContainer: {
    paddingTop: 2,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineRail: {
    width: 32,
    alignItems: 'center',
  },
  timelineCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  timelineCircleCompleted: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  timelineCircleCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 30,
    marginVertical: 4,
    backgroundColor: colors.outlineVariant,
  },
  timelineLineCompleted: {
    backgroundColor: colors.success,
  },
  timelineContent: {
    flex: 1,
    paddingTop: 3,
  },
  timelineContentSpacing: {
    paddingBottom: 18,
  },
  timelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timelineTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timelineTitleCurrent: {
    color: colors.primary,
  },
  timelineTitleUpcoming: {
    color: colors.textMuted,
  },
  timelineDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  timelineDescriptionUpcoming: {
    color: colors.textMuted,
  },
  timelineStateBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  completedBadge: {
    backgroundColor: colors.successBg,
  },
  currentBadge: {
    backgroundColor: '#eef2ff',
  },
  timelineStateText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
  },
  completedBadgeText: {
    color: colors.success,
  },
  currentBadgeText: {
    color: colors.primary,
  },

  trackingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#a5f3fc',
    borderRadius: 18,
    backgroundColor: '#ecfeff',
  },
  trackingIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  trackingContent: {
    flex: 1,
  },
  trackingTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  trackingDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },

  itemsList: {
    gap: 0,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
  },
  itemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  itemIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  itemInformation: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemCalculation: {
    marginTop: 3,
    fontSize: 11,
    color: colors.textSecondary,
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  priceDivider: {
    height: 1,
    backgroundColor: colors.outlineVariant,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLineLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  priceLineValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary,
  },

  informationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  informationIconContainer: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  informationTextContainer: {
    flex: 1,
  },
  informationLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  informationValue: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  prescriptionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
  },
  prescriptionStatusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  prescriptionVerifiedAt: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  rejectionReasonContainer: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff7f7',
  },
  rejectionReasonLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.error,
  },
  rejectionReasonText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: colors.errorText,
  },

  problemCard: {
    borderColor: '#fecaca',
  },
  problemCardText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },

  notesContainer: {
    padding: 13,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  notesText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textPrimary,
  },

  futureFeatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  futureFeatureIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  futureFeatureTextContainer: {
    flex: 1,
  },
  futureFeatureTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  futureFeatureText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 17,
    color: colors.textSecondary,
  },

  actionsCard: {
    gap: 10,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  actionsTitle: {
    marginBottom: 2,
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  primaryAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: colors.primary,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  cancelAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 13,
    backgroundColor: colors.errorBg,
  },
  cancelActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.error,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})