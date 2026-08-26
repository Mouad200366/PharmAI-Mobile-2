import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Icon from '../../components/ui/Icon'
import {
  deliveryApi,
  type CashSettlementHistoryItem,
  type DeliveryCashSummary,
  type DeliveryEarningHistoryItem,
  type DeliveryEarningsSummary,
} from '../../api/delivery'
import { firstError } from '../../api/errors'

const brand = {
  navy: '#0B1B63',
  blue: '#0D4EEB',
  blueBright: '#168BEE',
  cyan: '#18C7D9',
  blueSoft: '#EEF5FF',
  cyanSoft: '#E8FAFC',
  surface: '#F7FAFF',
  white: '#FFFFFF',
  text: '#0C1C4C',
  textSecondary: '#667085',
  textMuted: '#98A2B3',
  border: '#E7EDF7',
  success: '#15803D',
  successBg: '#EAF8EF',
  teal: '#087C8C',
  tealSoft: '#E8FAFC',
  warning: '#A16207',
  warningBg: '#FFF7DF',
  danger: '#C2413A',
  dangerBg: '#FFF0EF',
  neutralBg: '#F1F4F8',
} as const

function safeNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatAmount(value: string | number | null | undefined) {
  return safeNumber(value).toFixed(2)
}

function formatDate(value: string | null) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${day}/${month}/${year} · ${hours}:${minutes}`
}

function earningStatusLabel(
  status: DeliveryEarningHistoryItem['status'],
) {
  switch (status) {
    case 'pending':
      return 'En attente'
    case 'earned':
      return 'Gagné'
    case 'paid':
      return 'Payé'
    case 'cancelled':
      return 'Annulé'
  }
}

function earningVisual(
  status: DeliveryEarningHistoryItem['status'],
) {
  switch (status) {
    case 'pending':
      return {
        icon: 'schedule',
        iconColor: brand.warning,
        iconBackground: brand.warningBg,
        badgeColor: brand.warning,
        badgeBackground: brand.warningBg,
      }
    case 'earned':
      return {
        icon: 'verified',
        iconColor: brand.blue,
        iconBackground: brand.blueSoft,
        badgeColor: brand.success,
        badgeBackground: brand.successBg,
      }
    case 'paid':
      return {
        icon: 'payments',
        iconColor: brand.teal,
        iconBackground: brand.tealSoft,
        badgeColor: brand.teal,
        badgeBackground: brand.tealSoft,
      }
    case 'cancelled':
      return {
        icon: 'cancel',
        iconColor: brand.danger,
        iconBackground: brand.dangerBg,
        badgeColor: brand.danger,
        badgeBackground: brand.dangerBg,
      }
  }
}

function settlementStatusLabel(
  status: CashSettlementHistoryItem['status'],
) {
  switch (status) {
    case 'pending':
      return 'En attente'
    case 'completed':
      return 'Terminé'
    case 'cancelled':
      return 'Annulé'
  }
}

function settlementVisual(
  status: CashSettlementHistoryItem['status'],
) {
  switch (status) {
    case 'pending':
      return {
        icon: 'schedule',
        iconColor: brand.warning,
        iconBackground: brand.warningBg,
        badgeColor: brand.warning,
        badgeBackground: brand.warningBg,
      }
    case 'completed':
      return {
        icon: 'check_circle',
        iconColor: brand.teal,
        iconBackground: brand.tealSoft,
        badgeColor: brand.textSecondary,
        badgeBackground: brand.neutralBg,
      }
    case 'cancelled':
      return {
        icon: 'cancel',
        iconColor: brand.danger,
        iconBackground: brand.dangerBg,
        badgeColor: brand.danger,
        badgeBackground: brand.dangerBg,
      }
  }
}

interface SummaryCardProps {
  icon: string
  iconColor: string
  iconBackground?: string
  value: string
  label: string
}

function SummaryCard({
  icon,
  iconColor,
  iconBackground = brand.blueSoft,
  value,
  label,
}: SummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <View
        style={[
          styles.summaryIcon,
          { backgroundColor: iconBackground },
        ]}
      >
        <Icon
          name={icon}
          size={21}
          color={iconColor}
        />
      </View>

      <Text
        style={styles.summaryValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
        {value}
      </Text>

      <Text style={styles.summaryLabel}>
        {label}
      </Text>
    </View>
  )
}

interface SettlementRowProps {
  item: CashSettlementHistoryItem
  last: boolean
}

function SettlementRow({
  item,
  last,
}: SettlementRowProps) {
  const visual = settlementVisual(item.status)

  return (
    <View
      style={[
        styles.settlementRow,
        !last && styles.listDivider,
      ]}
    >
      <View style={styles.settlementTopRow}>
        <View
          style={[
            styles.listIcon,
            { backgroundColor: visual.iconBackground },
          ]}
        >
          <Icon
            name={visual.icon}
            size={21}
            color={visual.iconColor}
          />
        </View>

        <View style={styles.settlementIdentity}>
          <Text style={styles.listTitle}>
            Règlement #{item.id}
          </Text>
          <Text style={styles.listDate}>
            {formatDate(item.created_at)}
          </Text>
        </View>

        <View style={styles.amountGroup}>
          <Text
            style={styles.listAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {formatAmount(item.amount)} {item.currency}
          </Text>

          <View
            style={[
              styles.smallBadge,
              { backgroundColor: visual.badgeBackground },
            ]}
          >
            <Text
              style={[
                styles.smallBadgeText,
                { color: visual.badgeColor },
              ]}
            >
              {settlementStatusLabel(item.status)}
            </Text>
          </View>
        </View>
      </View>

      {item.completed_at ? (
        <View style={styles.detailRow}>
          <Icon
            name="check_circle"
            size={16}
            color={brand.teal}
          />
          <Text style={styles.completedText}>
            Terminé le {formatDate(item.completed_at)}
          </Text>
        </View>
      ) : null}

      {item.note ? (
        <View style={styles.detailRow}>
          <Icon
            name="notes"
            size={16}
            color={brand.textSecondary}
          />
          <Text style={styles.noteText}>
            {item.note}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

interface EarningRowProps {
  item: DeliveryEarningHistoryItem
  last: boolean
}

function EarningRow({
  item,
  last,
}: EarningRowProps) {
  const visual = earningVisual(item.status)

  return (
    <View
      style={[
        styles.earningRow,
        !last && styles.listDivider,
      ]}
    >
      <View
        style={[
          styles.listIcon,
          { backgroundColor: visual.iconBackground },
        ]}
      >
        <Icon
          name={visual.icon}
          size={21}
          color={visual.iconColor}
        />
      </View>

      <View style={styles.earningIdentity}>
        <Text style={styles.listTitle}>
          Commande #{item.order_id}
        </Text>
        <Text style={styles.listDate}>
          {formatDate(item.earned_at ?? item.created_at)}
        </Text>
      </View>

      <View style={styles.amountGroup}>
        <Text
          style={styles.listAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {formatAmount(item.amount)} {item.currency}
        </Text>

        <View
          style={[
            styles.smallBadge,
            { backgroundColor: visual.badgeBackground },
          ]}
        >
          <Text
            style={[
              styles.smallBadgeText,
              { color: visual.badgeColor },
            ]}
          >
            {earningStatusLabel(item.status)}
          </Text>
        </View>
      </View>
    </View>
  )
}

export default function DeliveryEarnings() {
  const insets = useSafeAreaInsets()

  const [summary, setSummary] =
    useState<DeliveryEarningsSummary | null>(null)
  const [history, setHistory] =
    useState<DeliveryEarningHistoryItem[]>([])
  const [cashSummary, setCashSummary] =
    useState<DeliveryCashSummary | null>(null)
  const [settlements, setSettlements] =
    useState<CashSettlementHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadEarnings = useCallback(async (
    isRefresh = false,
  ) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const [
        summaryResponse,
        historyResponse,
        cashSummaryResponse,
        settlementsResponse,
      ] = await Promise.all([
        deliveryApi.earningsSummary(),
        deliveryApi.earningsHistory(),
        deliveryApi.cashSummary(),
        deliveryApi.cashSettlements(),
      ])

      setSummary(summaryResponse.data)
      setHistory(historyResponse.data)
      setCashSummary(cashSummaryResponse.data)
      setSettlements(settlementsResponse.data)
    } catch (err: unknown) {
      setError(
        firstError(err)
        || 'Impossible de charger vos gains.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadEarnings()
    }, [loadEarnings]),
  )

  const pendingAmount = useMemo(
    () =>
      history
        .filter((item) => item.status === 'pending')
        .reduce(
          (total, item) => total + safeNumber(item.amount),
          0,
        ),
    [history],
  )

  const currency = summary?.currency ?? 'MAD'
  const cashCurrency = cashSummary?.currency ?? 'MAD'

  if (
    loading
    && summary === null
    && history.length === 0
    && settlements.length === 0
  ) {
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
        <ActivityIndicator
          size="large"
          color={brand.blue}
        />
        <Text style={styles.centerStateText}>
          Chargement de vos gains…
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
              void loadEarnings(true)
            }}
            tintColor={brand.blue}
            colors={[brand.blue]}
          />
        }
      >
        <LinearGradient
          colors={[
            brand.navy,
            brand.blue,
            brand.blueBright,
            brand.cyan,
          ]}
          locations={[0, 0.35, 0.72, 1]}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: 0.9 }}
          style={styles.hero}
        >
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>
              Revenus
            </Text>

            <Text style={styles.title}>
              Mes gains
            </Text>

            <Text style={styles.subtitle}>
              Consultez vos gains du jour, vos paiements et l’historique de vos livraisons.
            </Text>
          </View>

          <View style={styles.heroIcon}>
            <Icon
              name="account_balance_wallet"
              size={31}
              color={brand.blue}
            />
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {error ? (
            <Pressable
              style={styles.errorCard}
              onPress={() => {
                void loadEarnings()
              }}
            >
              <Icon
                name="error"
                size={20}
                color={brand.danger}
              />

              <View style={styles.errorContent}>
                <Text style={styles.errorTitle}>
                  Impossible de charger vos gains
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

          <View style={styles.todayCard}>
            <View style={styles.todayIcon}>
              <Icon
                name="today"
                size={26}
                color={brand.blue}
              />
            </View>

            <View style={styles.todayText}>
              <Text style={styles.todayLabel}>
                Gains aujourd’hui
              </Text>

              <Text
                style={styles.todayValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {formatAmount(summary?.today_earned)} {currency}
              </Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryCard
              icon="account_balance_wallet"
              iconColor={brand.blue}
              value={`${formatAmount(summary?.total_earned)} ${currency}`}
              label="Total gagné"
            />

            <SummaryCard
              icon="paid"
              iconColor={brand.teal}
              iconBackground={brand.tealSoft}
              value={`${formatAmount(summary?.total_paid)} ${currency}`}
              label="Total payé"
            />

            <SummaryCard
              icon="schedule"
              iconColor={brand.navy}
              value={`${formatAmount(pendingAmount)} ${currency}`}
              label="En attente"
            />
          </View>

          <View style={styles.cashCard}>
            <View style={styles.cashHeader}>
              <View style={styles.cashHeaderIcon}>
                <Icon
                  name="account_balance_wallet"
                  size={22}
                  color={brand.teal}
                />
              </View>

              <View style={styles.cashHeaderText}>
                <Text style={styles.cashTitle}>
                  Espèces à remettre
                </Text>
                <Text style={styles.cashSubtitle}>
                  Montant encaissé auprès des clients à remettre à PharmAI.
                </Text>
              </View>
            </View>

            <View style={styles.cashBalanceCard}>
              <View style={styles.cashBalanceText}>
                <Text style={styles.cashBalanceLabel}>
                  Solde espèces actuel
                </Text>

                <Text
                  style={styles.cashBalanceValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {formatAmount(cashSummary?.outstanding_cash)} {cashCurrency}
                </Text>
              </View>

              <View style={styles.cashBalanceIcon}>
                <Icon
                  name="payments"
                  size={23}
                  color={brand.teal}
                />
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Historique des règlements
            </Text>

            <View style={styles.historyCount}>
              <Text style={styles.historyCountText}>
                {settlements.length}
              </Text>
            </View>
          </View>

          {settlements.length > 0 ? (
            <View style={styles.listCard}>
              {settlements.map((item, index) => (
                <SettlementRow
                  key={item.id}
                  item={item}
                  last={index === settlements.length - 1}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Icon
                  name="receipt_long"
                  size={28}
                  color={brand.blue}
                />
              </View>

              <Text style={styles.emptyTitle}>
                Aucun règlement
              </Text>
              <Text style={styles.emptyText}>
                Vos remises d’espèces apparaîtront ici.
              </Text>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Historique des gains
            </Text>

            <View style={styles.historyCount}>
              <Text style={styles.historyCountText}>
                {history.length}
              </Text>
            </View>
          </View>

          {history.length > 0 ? (
            <View style={styles.listCard}>
              {history.map((item, index) => (
                <EarningRow
                  key={item.id}
                  item={item}
                  last={index === history.length - 1}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Icon
                  name="payments"
                  size={28}
                  color={brand.blue}
                />
              </View>

              <Text style={styles.emptyTitle}>
                Aucun gain pour le moment
              </Text>
              <Text style={styles.emptyText}>
                Vos gains apparaîtront ici après vos premières livraisons.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brand.surface,
  },

  statusBarGuard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: brand.navy,
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: brand.surface,
  },

  centerStateText: {
    fontSize: 14,
    color: brand.textSecondary,
    textAlign: 'center',
  },

  screen: {
    flex: 1,
    backgroundColor: brand.surface,
  },

  content: {
    paddingBottom: 36,
  },

  hero: {
    minHeight: 245,
    paddingTop: 58,
    paddingHorizontal: 24,
    paddingBottom: 34,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },

  heroText: {
    flex: 1,
    paddingRight: 8,
  },

  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7FE7F0',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },

  title: {
    marginTop: 10,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    color: brand.white,
    letterSpacing: -0.6,
  },

  subtitle: {
    marginTop: 14,
    maxWidth: 300,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.92)',
  },

  heroIcon: {
    width: 66,
    height: 66,
    borderRadius: 20,
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.white,
    shadowColor: '#071445',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 5,
  },

  body: {
    paddingHorizontal: 20,
    paddingTop: 22,
  },

  errorCard: {
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: brand.dangerBg,
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: brand.danger,
  },

  errorText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: brand.danger,
  },

  retryText: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '800',
    color: brand.blue,
  },

  todayCard: {
    minHeight: 122,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },

  todayIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.blueSoft,
  },

  todayText: {
    flex: 1,
    minWidth: 0,
  },

  todayLabel: {
    fontSize: 14,
    color: brand.textSecondary,
  },

  todayValue: {
    marginTop: 6,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '900',
    color: brand.navy,
    letterSpacing: -0.5,
  },

  summaryGrid: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },

  summaryCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 137,
    padding: 14,
    borderRadius: 23,
    justifyContent: 'space-between',
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.045,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 12,
    elevation: 2,
  },

  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryValue: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '900',
    color: brand.navy,
  },

  summaryLabel: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 15,
    color: brand.textSecondary,
  },

  cashCard: {
    marginTop: 18,
    padding: 18,
    borderRadius: 27,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.055,
    shadowOffset: { width: 0, height: 7 },
    shadowRadius: 16,
    elevation: 3,
  },

  cashHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  cashHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.tealSoft,
  },

  cashHeaderText: {
    flex: 1,
  },

  cashTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: brand.navy,
  },

  cashSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: brand.textSecondary,
  },

  cashBalanceCard: {
    marginTop: 16,
    minHeight: 94,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    backgroundColor: '#FBFCFF',
    borderWidth: 1,
    borderColor: brand.border,
  },

  cashBalanceText: {
    flex: 1,
    minWidth: 0,
  },

  cashBalanceLabel: {
    fontSize: 12,
    color: brand.textSecondary,
  },

  cashBalanceValue: {
    marginTop: 5,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    color: brand.navy,
  },

  cashBalanceIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.tealSoft,
  },

  sectionHeader: {
    marginTop: 28,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  sectionTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: brand.navy,
  },

  historyCount: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F3FF',
  },

  historyCountText: {
    fontSize: 14,
    fontWeight: '900',
    color: brand.blue,
  },

  listCard: {
    borderRadius: 25,
    paddingHorizontal: 16,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.055,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 3,
    overflow: 'hidden',
  },

  settlementRow: {
    paddingVertical: 16,
  },

  settlementTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  listIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },

  settlementIdentity: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },

  earningIdentity: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },

  listTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: brand.navy,
  },

  listDate: {
    marginTop: 3,
    fontSize: 10,
    color: brand.textMuted,
  },

  amountGroup: {
    alignItems: 'flex-end',
    maxWidth: 118,
  },

  listAmount: {
    maxWidth: 118,
    fontSize: 13,
    fontWeight: '900',
    color: brand.navy,
    textAlign: 'right',
  },

  smallBadge: {
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },

  smallBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },

  detailRow: {
    marginTop: 10,
    marginLeft: 52,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  completedText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: brand.teal,
  },

  noteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: brand.textSecondary,
  },

  listDivider: {
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
  },

  earningRow: {
    minHeight: 74,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  emptyCard: {
    padding: 24,
    borderRadius: 25,
    alignItems: 'center',
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
  },

  emptyIcon: {
    width: 58,
    height: 58,
    marginBottom: 14,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.blueSoft,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: brand.text,
    textAlign: 'center',
  },

  emptyText: {
    marginTop: 7,
    maxWidth: 280,
    fontSize: 12,
    lineHeight: 18,
    color: brand.textSecondary,
    textAlign: 'center',
  },
})
