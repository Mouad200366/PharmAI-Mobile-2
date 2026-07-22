import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  ActivityIndicator, Alert, Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import type { MainStackParamList } from '../../navigation/types'
import { ordersApi, type Order, STATUS_LABELS, STATUS_COLOR, isActiveOrder } from '../../api/orders'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<MainStackParamList, 'OrderDetail'>

const TIMELINE = [
  { key: 'pending_review', label: 'Commande validée' },
  { key: 'preparing', label: 'Préparation en pharmacie' },
  { key: 'awaiting_agent', label: 'Agent assigné' },
  { key: 'out_for_delivery', label: 'En transit', live: true },
  { key: 'delivered', label: 'Livraison effectuée' },
]

const STATUS_ORDER = [
  'pending_review', 'accepted', 'preparing',
  'ready_for_pickup', 'awaiting_agent', 'picked_up',
  'out_for_delivery', 'delivered',
]

function stepIndex(status: string) {
  const idx = STATUS_ORDER.indexOf(status)
  if (idx <= 1) return 0
  if (idx <= 3) return 1
  if (idx <= 4) return 2
  if (idx <= 6) return 3
  if (idx === 7) return 4
  return -1
}

// Mobile port of the web app's OrderDetail.tsx -- but NOT a literal 1:1
// layout port. The desktop version is a wide 3-column live-tracking layout
// (timeline / map+agent / chat) built for a large screen; that doesn't fit
// a phone. This reflows the same information into a single scrollable
// column: status + actions, ETA (when live), timeline, a simplified
// map/agent card, order summary, then chat. Live map tiles and the
// WebSocket-driven chat are deferred per the README (same as web's
// placeholder chat for now -- two canned messages when live, otherwise an
// empty state), to be wired up once the socket client lands.
export default function OrderDetail({ route, navigation }: Props) {
  const { id } = route.params
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [chatMsg, setChatMsg] = useState('')

  const load = useCallback(async () => {
    const r = await ordersApi.detail(id)
    setOrder(r.data)
  }, [id])

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false))
    }, [load]),
  )

  function confirmCancel() {
    Alert.alert('Annuler cette commande ?', undefined, [
      { text: 'Non', style: 'cancel' },
      { text: 'Oui, annuler', style: 'destructive', onPress: handleCancel },
    ])
  }

  async function handleCancel() {
    if (!order) return
    setCancelling(true)
    try {
      const r = await ordersApi.cancel(order.id)
      setOrder(r.data)
    } catch {
      Alert.alert('Erreur', "Impossible d'annuler cette commande pour le moment.")
    } finally {
      setCancelling(false)
    }
  }

  async function handleReorder() {
    if (!order) return
    try {
      const r = await ordersApi.reorder(order.id)
      navigation.replace('OrderDetail', { id: r.data.id })
    } catch {
      Alert.alert('Erreur', 'Impossible de recommander pour le moment.')
    }
  }

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!order) {
    return (
      <View style={styles.centerScreen}>
        <Icon name="receipt_long" size={48} color={colors.textMuted} />
        <Text style={styles.notFoundText}>Commande introuvable.</Text>
        <Pressable style={styles.backLink} onPress={() => navigation.goBack()}>
          <Icon name="arrow_back" size={16} color={colors.primary} />
          <Text style={styles.backLinkText}>Retour aux commandes</Text>
        </Pressable>
      </View>
    )
  }

  const current = stepIndex(order.status)
  const isLive = order.status === 'out_for_delivery' || order.status === 'picked_up'
  const isCancelled = ['cancelled', 'failed', 'rejected'].includes(order.status)
  const statusColor = STATUS_COLOR[order.status]

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.orderTitle}>Commande #{order.id}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor.bg, alignSelf: 'flex-start' }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
              {STATUS_LABELS[order.status]}
            </Text>
          </View>
        </View>

        {isActiveOrder(order.status) && !isCancelled && (
          <Pressable
            style={styles.headerActionOutline}
            onPress={confirmCancel}
            disabled={cancelling || order.status === 'out_for_delivery'}
          >
            <Text style={styles.headerActionOutlineText}>
              {cancelling ? 'Annulation…' : 'Annuler'}
            </Text>
          </Pressable>
        )}
        {(order.status === 'delivered' || order.status === 'cancelled') && (
          <Pressable style={styles.headerActionFilled} onPress={handleReorder}>
            <Text style={styles.headerActionFilledText}>Recommander</Text>
          </Pressable>
        )}
      </View>

      {/* ETA card */}
      {isLive && (
        <LinearGradient
          colors={[colors.primary, '#00687a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.etaCard}
        >
          <View style={styles.etaHeader}>
            <Icon name="schedule" size={18} color="#ffffffcc" />
            <Text style={styles.etaLabel}>Arrivée estimée dans</Text>
          </View>
          <View style={styles.etaValueRow}>
            <Text style={styles.etaValue}>12</Text>
            <Text style={styles.etaUnit}>minutes</Text>
          </View>
          <View style={styles.etaFooter}>
            <Text style={styles.etaFooterLabel}>Heure prévue :</Text>
            <Text style={styles.etaFooterValue}>18:45</Text>
          </View>
        </LinearGradient>
      )}

      {/* Timeline */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>État de la commande</Text>

        {isCancelled ? (
          <View style={styles.cancelledState}>
            <Icon name="cancel" size={40} color={colors.error} />
            <Text style={styles.cancelledText}>{STATUS_LABELS[order.status]}</Text>
          </View>
        ) : (
          <View style={{ gap: 18 }}>
            {TIMELINE.map((step, idx) => {
              const done = idx <= current
              const active = idx === current
              return (
                <View key={step.key} style={styles.timelineRow}>
                  <View style={styles.timelineDotWrap}>
                    {active ? (
                      <View style={styles.timelineDotActive} />
                    ) : done ? (
                      <View style={styles.timelineDotDone}>
                        <Icon name="check" size={12} color={colors.primary} />
                      </View>
                    ) : (
                      <View style={styles.timelineDotPending} />
                    )}
                    {idx < TIMELINE.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 2 }}>
                    <View style={styles.timelineLabelRow}>
                      <Text style={[
                        styles.timelineLabel,
                        active && { color: colors.primary },
                        !done && !active && { color: colors.textMuted },
                      ]}>
                        {step.label}
                      </Text>
                      {active && step.live && (
                        <View style={styles.liveTag}>
                          <View style={styles.liveDot} />
                          <Text style={styles.liveTagText}>LIVE</Text>
                        </View>
                      )}
                    </View>
                    {active && isLive && (
                      <Text style={styles.timelineSub}>À ~1.2 km de votre adresse</Text>
                    )}
                    <Text style={styles.timelineTime}>
                      {done && !active
                        ? new Date(order.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                        : active ? 'Maintenant' : 'En attente'}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* Agent / tracking card */}
      {isLive ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Votre livreur</Text>
          <View style={styles.agentRow}>
            <View style={styles.agentAvatar}>
              <Text style={styles.agentAvatarText}>KM</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.agentName}>Khalid Mansouri</Text>
              <View style={styles.agentMetaRow}>
                <Icon name="two_wheeler" size={13} color={colors.textSecondary} />
                <Text style={styles.agentMeta}>Honda PCX · 1234-A-56</Text>
                <Icon name="star" size={13} color="#fbbf24" />
                <Text style={styles.agentMeta}>4.9</Text>
              </View>
            </View>
            <Pressable style={styles.callBtn}>
              <Icon name="call" size={18} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.trackingPlaceholder}>
          <Icon name="local_shipping" size={32} color={colors.primary} />
          <Text style={styles.trackingTitle}>Suivi en direct disponible</Text>
          <Text style={styles.trackingSubtitle}>
            Le livreur sera tracé en temps réel une fois en route.
          </Text>
        </View>
      )}

      {/* Order summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Détails de la commande</Text>
        <View style={{ gap: 10 }}>
          {order.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.medicine_name}</Text>
                <Text style={styles.itemPrice}>{item.line_total} MAD</Text>
              </View>
              <Text style={styles.itemQty}>×{item.quantity}</Text>
            </View>
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryLine}>
          <Text style={styles.summaryLabel}>Livraison</Text>
          <Text style={styles.summaryValue}>{order.delivery_fee} MAD</Text>
        </View>
        <View style={styles.summaryLine}>
          <Text style={styles.totalLabel}>Total à payer</Text>
          <Text style={styles.totalValue}>{order.grand_total} MAD</Text>
        </View>
        <View style={styles.summaryLine}>
          <Text style={styles.summaryLabel}>Mode de paiement</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="payments" size={14} color={colors.textSecondary} />
            <Text style={styles.summaryValue}>{order.payment_method === 'cash' ? 'Espèces' : 'Carte'}</Text>
          </View>
        </View>
      </View>

      {/* Chat */}
      <View style={styles.card}>
        <View style={styles.chatHeader}>
          <Icon name="forum" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>{isLive ? 'Chat avec le livreur' : 'Messages'}</Text>
        </View>

        {isLive ? (
          <View style={{ gap: 10 }}>
            <View style={styles.bubbleLeft}>
              <Text style={styles.bubbleLeftText}>
                Bonjour, je viens de récupérer votre commande à la pharmacie. J'arrive dans environ 15 minutes.
              </Text>
            </View>
            <View style={styles.bubbleRight}>
              <Text style={styles.bubbleRightText}>
                Parfait, merci. Je suis chez moi, sonnez à l'interphone 14.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.chatEmpty}>
            <Icon name="chat" size={28} color={colors.textMuted} />
            <Text style={styles.chatEmptyText}>
              Le chat sera disponible une fois le livreur assigné.
            </Text>
          </View>
        )}

        <View style={styles.chatInputRow}>
          <TextInput
            value={chatMsg}
            onChangeText={setChatMsg}
            editable={isLive}
            placeholder="Écrire un message..."
            placeholderTextColor={colors.textMuted}
            style={[styles.chatInput, !isLive && { opacity: 0.5 }]}
          />
          <Pressable style={styles.sendBtn} disabled={!isLive || !chatMsg.trim()}>
            <Icon name="send" size={16} color={colors.white} />
          </Pressable>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.surface, padding: 24 },
  notFoundText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  backLinkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  orderTitle: { fontSize: 20, fontWeight: '700', color: colors.primary },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  headerActionOutline: {
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  headerActionOutlineText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  headerActionFilled: {
    backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  headerActionFilledText: { fontSize: 13, fontWeight: '600', color: colors.white },

  etaCard: { borderRadius: 16, padding: 16 },
  etaHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  etaLabel: { fontSize: 11, color: '#ffffffcc', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  etaValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  etaValue: { fontSize: 40, fontWeight: '700', color: colors.white, lineHeight: 44 },
  etaUnit: { fontSize: 15, color: '#ffffffe0' },
  etaFooter: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#ffffff33',
  },
  etaFooterLabel: { fontSize: 12, color: '#ffffffcc' },
  etaFooterValue: { fontSize: 14, fontWeight: '700', color: colors.white },

  card: {
    backgroundColor: colors.surfaceLowest, borderRadius: 16,
    borderWidth: 1, borderColor: colors.outlineVariant, padding: 16, gap: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.primary },

  cancelledState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  cancelledText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },

  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineDotWrap: { alignItems: 'center', width: 24 },
  timelineDotActive: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary,
    borderWidth: 2, borderColor: colors.white,
  },
  timelineDotDone: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center',
  },
  timelineDotPending: {
    width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.outlineVariant,
    borderStyle: 'dashed', backgroundColor: colors.white,
  },
  timelineLine: { flex: 1, width: 2, backgroundColor: '#dbeafe', marginTop: 4, minHeight: 16 },
  timelineLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  timelineLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  timelineSub: { fontSize: 11, color: colors.primary, opacity: 0.8, marginTop: 2 },
  timelineTime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  liveTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ccfbf1', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#14b8a6' },
  liveTagText: { fontSize: 9, fontWeight: '700', color: '#0f766e', textTransform: 'uppercase' },

  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  agentAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#eef2ff',
    alignItems: 'center', justifyContent: 'center',
  },
  agentAvatarText: { fontWeight: '700', color: colors.primary },
  agentName: { fontSize: 14, fontWeight: '700', color: colors.primary },
  agentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' },
  agentMeta: { fontSize: 12, color: colors.textSecondary },
  callBtn: {
    width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },

  trackingPlaceholder: {
    backgroundColor: colors.surfaceLowest, borderRadius: 16, borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', padding: 24, gap: 6,
  },
  trackingTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  trackingSubtitle: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },

  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemName: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  itemPrice: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  itemQty: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.outlineVariant, marginVertical: 4 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 12, color: colors.textSecondary },
  summaryValue: { fontSize: 12, color: colors.textSecondary },
  totalLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  totalValue: { fontSize: 17, fontWeight: '700', color: colors.primary },

  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bubbleLeft: { alignSelf: 'flex-start', maxWidth: '85%', backgroundColor: colors.surface, borderRadius: 14, borderBottomLeftRadius: 4, padding: 10 },
  bubbleLeftText: { fontSize: 13, color: colors.textPrimary },
  bubbleRight: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.primary, borderRadius: 14, borderBottomRightRadius: 4, padding: 10 },
  bubbleRightText: { fontSize: 13, color: colors.white },
  chatEmpty: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  chatEmptyText: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  chatInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 999, borderWidth: 1, borderColor: colors.outlineVariant,
    paddingHorizontal: 14, paddingVertical: Platform.select({ ios: 10, android: 8, default: 10 }), fontSize: 13, color: colors.textPrimary,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
})