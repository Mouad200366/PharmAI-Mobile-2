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
import { useFocusEffect } from '@react-navigation/native'

import Icon from '../../components/ui/Icon'
import {
  deliveryApi,
  type CashSettlementHistoryItem,
  type DeliveryCashSummary,
  type DeliveryEarningHistoryItem,
  type DeliveryEarningsSummary,
} from '../../api/delivery'
import { firstError } from '../../api/errors'
import { colors } from '../../theme/colors'

function formatAmount(value: string | number) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) {
    return String(value)
  }

  return numberValue.toFixed(2)
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

function earningStatusIcon(
  status: DeliveryEarningHistoryItem['status'],
) {
  switch (status) {
    case 'pending':
      return 'schedule'
    case 'earned':
      return 'verified'
    case 'paid':
      return 'payments'
    case 'cancelled':
      return 'cancel'
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

function settlementStatusIcon(
  status: CashSettlementHistoryItem['status'],
) {
  switch (status) {
    case 'pending':
      return 'schedule'
    case 'completed':
      return 'check_circle'
    case 'cancelled':
      return 'cancel'
  }
}

export default function DeliveryEarnings() {
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
      setError(firstError(err))
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
          (total, item) =>
            total + Number(item.amount || 0),
          0,
        ),
    [history],
  )

  const currency = summary?.currency ?? 'MAD'

  if (loading && summary === null && history.length === 0) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />
        <Text style={styles.centerStateText}>
          Chargement de vos gains…
        </Text>
      </View>
    )
  }

  return (
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
        />
      }
    >
      <View style={styles.header}>
        <View>
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

        <View style={styles.headerIcon}>
          <Icon
            name="payments"
            size={27}
            color={colors.primary}
          />
        </View>
      </View>

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
            color={colors.error}
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
            size={24}
            color={colors.primary}
          />
        </View>

        <View style={styles.todayText}>
          <Text style={styles.todayLabel}>
            Gains aujourd’hui
          </Text>
          <Text style={styles.todayValue}>
            {formatAmount(summary?.today_earned ?? '0')}
            {' '}
            {currency}
          </Text>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Icon
            name="account_balance_wallet"
            size={21}
            color={colors.primary}
          />
          <Text style={styles.summaryValue}>
            {formatAmount(summary?.total_earned ?? '0')}
            {' '}
            {currency}
          </Text>
          <Text style={styles.summaryLabel}>
            Total gagné
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Icon
            name="paid"
            size={21}
            color={colors.secondary}
          />
          <Text style={styles.summaryValue}>
            {formatAmount(summary?.total_paid ?? '0')}
            {' '}
            {currency}
          </Text>
          <Text style={styles.summaryLabel}>
            Total payé
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Icon
            name="schedule"
            size={21}
            color={colors.primary}
          />
          <Text style={styles.summaryValue}>
            {formatAmount(pendingAmount)}
            {' '}
            {currency}
          </Text>
          <Text style={styles.summaryLabel}>
            En attente
          </Text>
        </View>
      </View>

      <View style={styles.cashSection}>
        <View style={styles.cashSectionHeader}>
          <View style={styles.cashSectionTitleGroup}>
            <View style={styles.cashSectionIcon}>
              <Icon
                name="account_balance_wallet"
                size={22}
                color={colors.secondary}
              />
            </View>

            <View style={styles.cashSectionTitleText}>
              <Text style={styles.sectionTitle}>
                Espèces à remettre
              </Text>
              <Text style={styles.cashSectionSubtitle}>
                Montant encaissé auprès des clients à remettre à PharmAI.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cashBalanceCard}>
          <View>
            <Text style={styles.cashBalanceLabel}>
              Solde espèces actuel
            </Text>

            <Text style={styles.cashBalanceValue}>
              {formatAmount(
                cashSummary?.outstanding_cash ?? '0',
              )}
              {' '}
              {cashSummary?.currency ?? 'MAD'}
            </Text>
          </View>

          <View style={styles.cashBalanceBadge}>
            <Icon
              name="payments"
              size={19}
              color={colors.secondary}
            />
          </View>
        </View>

        <View style={styles.settlementHeader}>
          <Text style={styles.settlementTitle}>
            Historique des règlements
          </Text>

          <View style={styles.historyCount}>
            <Text style={styles.historyCountText}>
              {settlements.length}
            </Text>
          </View>
        </View>

        {settlements.length > 0 ? (
          <View style={styles.settlementList}>
            {settlements.map((item) => (
              <View
                key={item.id}
                style={styles.settlementCard}
              >
                <View style={styles.settlementCardHeader}>
                  <View style={styles.settlementIdentity}>
                    <View style={styles.settlementIcon}>
                      <Icon
                        name={settlementStatusIcon(item.status)}
                        size={20}
                        color={
                          item.status === 'completed'
                            ? colors.secondary
                            : colors.primary
                        }
                      />
                    </View>

                    <View style={styles.settlementDetails}>
                      <Text style={styles.settlementNumber}>
                        Règlement #{item.id}
                      </Text>

                      <Text style={styles.settlementDate}>
                        {formatDate(item.created_at)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.settlementAmountGroup}>
                    <Text style={styles.settlementAmount}>
                      {formatAmount(item.amount)}
                      {' '}
                      {item.currency}
                    </Text>

                    <View style={styles.settlementStatusBadge}>
                      <Text style={styles.settlementStatusText}>
                        {settlementStatusLabel(item.status)}
                      </Text>
                    </View>
                  </View>
                </View>

                {item.completed_at ? (
                  <View style={styles.settlementInfoRow}>
                    <Icon
                      name="check_circle"
                      size={15}
                      color={colors.secondary}
                    />
                    <Text style={styles.settlementInfoText}>
                      Terminé le {formatDate(item.completed_at)}
                    </Text>
                  </View>
                ) : null}

                {item.note ? (
                  <View style={styles.settlementNote}>
                    <Icon
                      name="notes"
                      size={15}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.settlementNoteText}>
                      {item.note}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.cashEmptyCard}>
            <Icon
              name="receipt_long"
              size={28}
              color={colors.textMuted}
            />

            <Text style={styles.cashEmptyTitle}>
              Aucun règlement
            </Text>

            <Text style={styles.cashEmptyText}>
              Vos remises d’espèces apparaîtront ici.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.historyHeader}>
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
        <View style={styles.historyList}>
          {history.map((item) => (
            <View
              key={item.id}
              style={styles.earningCard}
            >
              <View style={styles.earningHeader}>
                <View style={styles.earningIdentity}>
                  <View style={styles.earningIcon}>
                    <Icon
                      name={earningStatusIcon(item.status)}
                      size={21}
                      color={colors.primary}
                    />
                  </View>

                  <View>
                    <Text style={styles.earningOrder}>
                      Commande #{item.order_id}
                    </Text>
                    <Text style={styles.earningDate}>
                      {formatDate(
                        item.earned_at
                        ?? item.created_at,
                      )}
                    </Text>
                  </View>
                </View>

                <View style={styles.earningAmountGroup}>
                  <Text style={styles.earningAmount}>
                    {formatAmount(item.amount)}
                    {' '}
                    {item.currency}
                  </Text>
                  <View style={styles.earningStatusBadge}>
                    <Text style={styles.earningStatusText}>
                      {earningStatusLabel(item.status)}
                    </Text>
                  </View>
                </View>
              </View>

              {item.status === 'paid' && item.paid_at ? (
                <View style={styles.paidRow}>
                  <Icon
                    name="check_circle"
                    size={16}
                    color={colors.secondary}
                  />
                  <Text style={styles.paidText}>
                    Payé le {formatDate(item.paid_at)}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Icon
            name="payments"
            size={32}
            color={colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            Aucun gain pour le moment
          </Text>
          <Text style={styles.emptyText}>
            Vos gains apparaîtront ici après vos premières livraisons.
          </Text>
        </View>
      )}
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 26,
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
    maxWidth: 285,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
  },

  errorCard: {
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: colors.errorBg,
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

  todayCard: {
    minHeight: 104,
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surfaceLowest,
  },

  todayIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },

  todayText: {
    flex: 1,
  },

  todayLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  todayValue: {
    marginTop: 5,
    fontSize: 25,
    fontWeight: '800',
    color: colors.primary,
  },

  summaryGrid: {
    marginTop: 12,
    marginBottom: 28,
    flexDirection: 'row',
    gap: 8,
  },

  summaryCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: 18,
    padding: 13,
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLowest,
  },

  summaryValue: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },

  summaryLabel: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textSecondary,
  },

  cashSection: {
    marginBottom: 30,
  },

  cashSectionHeader: {
    marginBottom: 12,
  },

  cashSectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  cashSectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
  },

  cashSectionTitleText: {
    flex: 1,
  },

  cashSectionSubtitle: {
    marginTop: -7,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },

  cashBalanceCard: {
    minHeight: 100,
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLowest,
  },

  cashBalanceLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  cashBalanceValue: {
    marginTop: 5,
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
  },

  cashBalanceBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },

  settlementHeader: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  settlementTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },

  settlementList: {
    gap: 10,
  },

  settlementCard: {
    borderRadius: 18,
    padding: 15,
    backgroundColor: colors.surfaceLowest,
  },

  settlementCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  settlementIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  settlementIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },

  settlementDetails: {
    flex: 1,
  },

  settlementNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },

  settlementDate: {
    marginTop: 3,
    fontSize: 10,
    color: colors.textMuted,
  },

  settlementAmountGroup: {
    alignItems: 'flex-end',
  },

  settlementAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },

  settlementStatusBadge: {
    marginTop: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.outlineVariant,
  },

  settlementStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
  },

  settlementInfoRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  settlementInfoText: {
    flex: 1,
    fontSize: 10,
    color: colors.secondary,
  },

  settlementNote: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },

  settlementNoteText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: colors.textSecondary,
  },

  cashEmptyCard: {
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceLowest,
  },

  cashEmptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },

  cashEmptyText: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  historyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  sectionTitle: {
    marginBottom: 12,
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },

  historyCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.outlineVariant,
  },

  historyCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },

  historyList: {
    gap: 10,
  },

  earningCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: colors.surfaceLowest,
  },

  earningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  earningIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  earningIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },

  earningOrder: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },

  earningDate: {
    marginTop: 4,
    fontSize: 10,
    color: colors.textMuted,
  },

  earningAmountGroup: {
    alignItems: 'flex-end',
  },

  earningAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },

  earningStatusBadge: {
    marginTop: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.outlineVariant,
  },

  earningStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
  },

  paidRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  paidText: {
    fontSize: 10,
    color: colors.secondary,
  },

  emptyCard: {
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceLowest,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },
})
