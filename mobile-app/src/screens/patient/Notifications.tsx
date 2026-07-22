import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput,
  ActivityIndicator, Modal, ScrollView,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { notificationsApi, type Notification } from '../../api/notifications'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

type NType = 'delivery' | 'order' | 'prescription' | 'pharmacy' | 'system'

function inferType(title: string, body: string): NType {
  const text = `${title} ${body}`.toLowerCase()
  if (text.includes('livreur') || text.includes('livraison') || text.includes('route') || text.includes('transit')) return 'delivery'
  if (text.includes('ordonnance') || text.includes('prescription')) return 'prescription'
  if (text.includes('commande')) return 'order'
  if (text.includes('pharmacie') || text.includes('garde')) return 'pharmacy'
  return 'system'
}

const TYPE_META: Record<NType, { icon: string; bg: string; color: string; label: string }> = {
  delivery: { icon: 'two_wheeler', bg: '#E0F2FE', color: '#006172', label: 'Mise à jour de livraison' },
  order: { icon: 'local_mall', bg: '#f3f4f6', color: '#4b5563', label: 'Commande' },
  prescription: { icon: 'fact_check', bg: '#f2f3ff', color: colors.primary, label: 'Ordonnance' },
  pharmacy: { icon: 'nightlight', bg: '#ede9fe', color: '#6d28d9', label: 'Pharmacie de garde' },
  system: { icon: 'notifications', bg: '#f3f4f6', color: '#6b7280', label: 'Système' },
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
  if (diffMin < 60) return `Il y a ${diffMin} min`
  if (diffMin < 1440) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (diffMin < 2880) return `Hier, ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  return date.toLocaleDateString('fr-MA', { day: 'numeric', month: 'short' })
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}

function groupByDate(notifs: Notification[]): { label: string; items: Notification[] }[] {
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  const todayItems = notifs.filter((n) => sameDay(new Date(n.created_at), today))
  const yesterdayItems = notifs.filter((n) => sameDay(new Date(n.created_at), yesterday))
  const olderItems = notifs.filter((n) => !sameDay(new Date(n.created_at), today) && !sameDay(new Date(n.created_at), yesterday))
  return [
    ...(todayItems.length ? [{ label: "Aujourd'hui", items: todayItems }] : []),
    ...(yesterdayItems.length ? [{ label: 'Hier', items: yesterdayItems }] : []),
    ...(olderItems.length ? [{ label: 'Plus ancien', items: olderItems }] : []),
  ]
}

type FilterFn = (n: Notification) => boolean
const FILTER_TABS: { key: string; label: string; fn: FilterFn }[] = [
  { key: 'all', label: 'Toutes', fn: () => true },
  { key: 'unread', label: 'Non lues', fn: (n) => !n.is_read },
  { key: 'orders', label: 'Commandes', fn: (n) => inferType(n.title, n.body) === 'order' },
  { key: 'delivery', label: 'Livraisons', fn: (n) => inferType(n.title, n.body) === 'delivery' },
  { key: 'system', label: 'Système', fn: (n) => inferType(n.title, n.body) === 'system' },
]

// Mobile port of the web app's Notifications.tsx. Same data (filter tabs,
// date-grouped list, search, mark-all-read, alert preferences) with one
// layout change: desktop shows a persistent list+detail split view; there's
// no room for a side panel on a phone, so tapping a card opens the detail
// in a bottom-sheet-style Modal instead, and closes back to the list.
// Preferences (which used to sit in the desktop's right column) become a
// collapsible card under the list here since there's no free real estate.
export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('unread')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Notification | null>(null)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefs, setPrefs] = useState({ orders: true, delivery: true, prescription: true, pharmacy: false })

  const load = useCallback(async () => {
    const r = await notificationsApi.list()
    setNotifications(r.data.results)
  }, [])

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false))
    }, [load]),
  )

  async function handleMarkAll() {
    await notificationsApi.markAllRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  async function handleMarkOne(id: number) {
    await notificationsApi.markRead(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
  }

  async function handleSelect(notif: Notification) {
    setSelected(notif)
    if (!notif.is_read) await handleMarkOne(notif.id)
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length
  const readCount = notifications.filter((n) => n.is_read).length

  const activeTab = FILTER_TABS.find((t) => t.key === filter) ?? FILTER_TABS[0]
  const filtered = notifications
    .filter(activeTab.fn)
    .filter((n) => !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.body.toLowerCase().includes(search.toLowerCase()))
  const groups = groupByDate(filtered)

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <>
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={groups}
        keyExtractor={(g) => g.label}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 4 }}>
            {/* Header */}
            <View style={styles.headerRow}>
              <Text style={styles.title}>Notifications</Text>
              <Pressable style={styles.markAllBtn} onPress={handleMarkAll}>
                <Icon name="done_all" size={16} color={colors.primary} />
                <Text style={styles.markAllText}>Tout marquer comme lu</Text>
              </Pressable>
            </View>

            {/* Stats */}
            <View style={styles.statsGrid}>
              <StatChip icon="inbox" label="Total" value={notifications.length} color={colors.primary} />
              <StatChip icon="mark_email_unread" label="Non lues" value={unreadCount} color="#0e7490" highlight />
              <StatChip icon="drafts" label="Lues" value={readCount} color="#6b7280" />
            </View>

            {/* Search */}
            <View style={styles.searchBar}>
              <Icon name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Rechercher..."
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
            </View>

            {/* Filter tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {FILTER_TABS.map((tab) => {
                const active = filter === tab.key
                const cnt = notifications.filter(tab.fn).length
                return (
                  <Pressable
                    key={tab.key}
                    style={[styles.tabChip, active && styles.tabChipActive]}
                    onPress={() => setFilter(tab.key)}
                  >
                    <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>{tab.label}</Text>
                    {tab.key === 'unread' && cnt > 0 && (
                      <View style={styles.tabCountBadge}>
                        <Text style={styles.tabCountText}>{cnt}</Text>
                      </View>
                    )}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        }
        renderItem={({ item: group }) => (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            <View style={{ gap: 10 }}>
              {group.items.map((notif) => {
                const type = inferType(notif.title, notif.body)
                const meta = TYPE_META[type]
                return (
                  <Pressable
                    key={notif.id}
                    style={[styles.notifCard, !notif.is_read && styles.notifCardUnread]}
                    onPress={() => handleSelect(notif)}
                  >
                    <View style={[styles.notifIcon, { backgroundColor: meta.bg }]}>
                      <Icon name={meta.icon} size={20} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.notifTopLine}>
                        <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
                        <Text style={styles.notifTime}>{formatTime(notif.created_at)}</Text>
                      </View>
                      <Text style={styles.notifBody} numberOfLines={2}>{notif.body}</Text>
                    </View>
                    {!notif.is_read && <View style={styles.unreadDot} />}
                  </Pressable>
                )
              })}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="notifications_off" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>Aucune notification</Text>
          </View>
        }
        ListFooterComponent={
          <PreferencesCard prefs={prefs} setPrefs={setPrefs} open={prefsOpen} setOpen={setPrefsOpen} />
        }
      />

      {/* Detail modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {selected && <DetailPanel notif={selected} onClose={() => setSelected(null)} />}
          </View>
        </View>
      </Modal>
    </>
  )
}

function StatChip({ icon, label, value, color, highlight }: {
  icon: string; label: string; value: number; color: string; highlight?: boolean
}) {
  return (
    <View style={[styles.statChip, highlight && styles.statChipHighlight]}>
      <View style={[styles.statChipIcon, { backgroundColor: highlight ? '#cffafe' : '#f3f4f6' }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <View>
        <Text style={styles.statChipLabel}>{label}</Text>
        <Text style={[styles.statChipValue, { color }]}>{value}</Text>
      </View>
    </View>
  )
}

function DetailPanel({ notif, onClose }: { notif: Notification; onClose: () => void }) {
  const type = inferType(notif.title, notif.body)
  const meta = TYPE_META[type]

  const ctaLabel =
    type === 'delivery' ? 'Suivre la livraison'
    : type === 'order' ? 'Voir la commande'
    : type === 'prescription' || type === 'pharmacy' ? 'Voir les détails'
    : null
  const ctaIcon =
    type === 'delivery' ? 'map'
    : type === 'order' ? 'shopping_bag'
    : 'description'

  return (
    <View style={{ padding: 20, gap: 16 }}>
      <View style={styles.modalHandle} />

      <View style={styles.modalHeaderRow}>
        <View style={[styles.notifIcon, { backgroundColor: meta.bg }]}>
          <Icon name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.modalTypeLabel}>{meta.label}</Text>
          <Text style={styles.modalTime}>{formatTime(notif.created_at)}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.modalCloseBtn}>
          <Icon name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.modalTitle}>{notif.title}</Text>
      <Text style={styles.modalBody}>{notif.body}</Text>

      <View style={{ gap: 10 }}>
        {ctaLabel && (
          <Pressable style={styles.modalPrimaryBtn}>
            <Icon name={ctaIcon} size={16} color={colors.white} />
            <Text style={styles.modalPrimaryBtnText}>{ctaLabel}</Text>
          </Pressable>
        )}
        <Pressable style={styles.modalSecondaryBtn}>
          <Icon name="chat" size={16} color={colors.primary} />
          <Text style={styles.modalSecondaryBtnText}>Contacter le support</Text>
        </Pressable>
      </View>
    </View>
  )
}

function PreferencesCard({ prefs, setPrefs, open, setOpen }: {
  prefs: { orders: boolean; delivery: boolean; prescription: boolean; pharmacy: boolean }
  setPrefs: React.Dispatch<React.SetStateAction<{ orders: boolean; delivery: boolean; prescription: boolean; pharmacy: boolean }>>
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const toggles: { key: keyof typeof prefs; label: string }[] = [
    { key: 'orders', label: 'Statut des commandes' },
    { key: 'delivery', label: 'Suivi livreur (En direct)' },
    { key: 'prescription', label: 'Validation ordonnance' },
    { key: 'pharmacy', label: 'Pharmacies de garde' },
  ]

  return (
    <View style={styles.prefsCard}>
      <Pressable style={styles.prefsHeader} onPress={() => setOpen(!open)}>
        <Icon name="tune" size={18} color={colors.textSecondary} />
        <Text style={styles.prefsTitle}>Préférences d'alertes</Text>
        <View style={{ flex: 1 }} />
        <Icon name={open ? 'expand_less' : 'expand_more'} size={20} color={colors.textMuted} />
      </Pressable>

      {open && (
        <View style={{ gap: 14, marginTop: 12 }}>
          {toggles.map(({ key, label }) => (
            <Pressable
              key={key}
              style={styles.prefRow}
              onPress={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
            >
              <Text style={styles.prefLabel}>{label}</Text>
              <View style={[styles.switchTrack, prefs[key] && styles.switchTrackActive]}>
                <View style={[styles.switchThumb, prefs[key] && styles.switchThumbActive]} />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 24 },
  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700', color: colors.primary },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markAllText: { fontSize: 12, fontWeight: '600', color: colors.primary },

  statsGrid: { flexDirection: 'row', gap: 8 },
  statChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceLowest, borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 12, padding: 10,
  },
  statChipHighlight: { borderColor: '#22d3ee' },
  statChipIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  statChipLabel: { fontSize: 10, color: colors.textMuted },
  statChipValue: { fontSize: 16, fontWeight: '700' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceLowest, borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },

  tabChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: colors.surfaceLowest, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  tabChipTextActive: { color: colors.white },
  tabCountBadge: { backgroundColor: '#cffafe', borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  tabCountText: { fontSize: 10, fontWeight: '700', color: '#0e7490' },

  groupLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  notifCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surfaceLowest, borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 14, padding: 12,
  },
  notifCardUnread: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  notifIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  notifTopLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  notifTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
  notifTime: { fontSize: 11, color: colors.textMuted },
  notifBody: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },

  emptyState: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 56, gap: 10,
    backgroundColor: colors.surfaceLowest, borderRadius: 16, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  emptyText: { fontSize: 13, color: colors.textMuted },

  prefsCard: {
    backgroundColor: colors.surfaceLowest, borderRadius: 16,
    borderWidth: 1, borderColor: colors.outlineVariant, padding: 16, marginTop: 4,
  },
  prefsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prefsTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prefLabel: { fontSize: 13, color: colors.textSecondary },
  switchTrack: { width: 38, height: 22, borderRadius: 11, backgroundColor: colors.outlineVariant, padding: 2, justifyContent: 'center' },
  switchTrackActive: { backgroundColor: colors.accentLight },
  switchThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.white },
  switchThumbActive: { transform: [{ translateX: 16 }] },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surfaceLowest, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outlineVariant, alignSelf: 'center', marginBottom: 4 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalTypeLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalTime: { fontSize: 12, color: colors.accentLight, fontWeight: '500', marginTop: 2 },
  modalCloseBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
  modalBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  modalPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 12,
  },
  modalPrimaryBtnText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  modalSecondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.outlineVariant, paddingVertical: 13, borderRadius: 12,
  },
  modalSecondaryBtnText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
})