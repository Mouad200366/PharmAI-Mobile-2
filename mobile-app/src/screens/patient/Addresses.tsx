import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  ActivityIndicator, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { addressesApi, type Address, type CreateAddressPayload } from '../../api/addresses'
import { firstError } from '../../api/errors'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

const LABEL_OPTIONS = [
  { value: 'Domicile', icon: 'home' },
  { value: 'Travail', icon: 'work' },
  { value: 'Clinique', icon: 'local_hospital' },
  { value: 'Autre', icon: 'location_on' },
]

const CITIES = ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda']

const MAX_ADDRESSES = 5

function labelIcon(label: string) {
  return LABEL_OPTIONS.find((o) => o.value === label)?.icon ?? 'location_on'
}

// Mobile port of the web app's Addresses.tsx. Same feature set (list,
// add/edit, delete confirmation, default toggle, 5-address limit strip) --
// two layout differences forced by the platform:
//  - desktop shows the list and a slide-in form side by side; there's no
//    room for that here, so the form takes over the whole screen and the
//    list comes back once you close/save it (single `mode` state instead
//    of a two-column grid).
//  - desktop's city/label pickers are native <select>/text; there's no
//    picker dependency in this project yet, so both become horizontal chip
//    rows (same pattern already used for the label toggle on web).
// GPS ("use my current location") is left out for now -- would need
// expo-location added as a dependency; lat/lng stay optional, filled in
// later once that's wired up.
export default function Addresses() {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<Address | null>(null)

  const load = useCallback(async () => {
    const r = await addressesApi.list()
    setAddresses(r.data.results)
  }, [])

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false))
    }, [load]),
  )

  function openNew() { setEditing(null); setMode('form') }
  function openEdit(addr: Address) { setEditing(addr); setMode('form') }
  function closeForm() { setMode('list'); setEditing(null) }

  function confirmDelete(addr: Address) {
    Alert.alert(
      'Supprimer cette adresse ?',
      `Vous êtes sur le point de supprimer l'adresse « ${addr.label} » (${addr.street}). Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => handleDelete(addr) },
      ],
    )
  }

  async function handleDelete(addr: Address) {
    try {
      await addressesApi.delete(addr.id)
      load()
    } catch {
      Alert.alert('Erreur', "Impossible de supprimer cette adresse pour le moment.")
    }
  }

  async function handleSetDefault(id: number) {
    try {
      await addressesApi.setDefault(id)
      load()
    } catch {
      Alert.alert('Erreur', "Impossible de définir cette adresse par défaut.")
    }
  }

  if (mode === 'form') {
    return (
      <AddressForm
        initial={editing}
        onClose={closeForm}
        onSaved={() => { closeForm(); load() }}
      />
    )
  }

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mes adresses</Text>
          <Text style={styles.subtitle}>
            Gérez vos adresses de livraison sauvegardées
            {` · ${addresses.length} adresse${addresses.length !== 1 ? 's' : ''} enregistrée${addresses.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
      </View>

      <Pressable style={styles.addButton} onPress={openNew}>
        <Icon name="add" size={18} color={colors.white} />
        <Text style={styles.addButtonText}>Ajouter une adresse</Text>
      </Pressable>

      {addresses.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="location_off" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>Aucune adresse enregistrée</Text>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {addresses.map((addr) => (
            <View
              key={addr.id}
              style={[styles.addressCard, addr.is_default && styles.addressCardDefault]}
            >
              <View style={styles.addressCardHeader}>
                <View style={[styles.labelChip, addr.is_default && styles.labelChipDefault]}>
                  <Icon
                    name={labelIcon(addr.label)}
                    size={14}
                    color={addr.is_default ? colors.white : colors.textSecondary}
                  />
                  <Text style={[styles.labelChipText, addr.is_default && { color: colors.white }]}>
                    {addr.label}
                  </Text>
                </View>
                {addr.is_default && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Par défaut</Text>
                    <Icon name="check" size={13} color="#047857" />
                  </View>
                )}
                <View style={{ flex: 1 }} />
                <Pressable style={styles.iconBtn} onPress={() => openEdit(addr)}>
                  <Icon name="edit" size={18} color={colors.textMuted} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => confirmDelete(addr)}>
                  <Icon name="delete" size={18} color={colors.textMuted} />
                </Pressable>
              </View>

              <Text style={styles.addressStreet}>{addr.street}</Text>
              <Text style={styles.addressCity}>
                {addr.city}{addr.postal_code ? ` — ${addr.postal_code}` : ''}
              </Text>

              <View style={styles.addressFooter}>
                <View style={styles.addressFooterLeft}>
                  <Icon name="two_wheeler" size={16} color={colors.textMuted} />
                  <Text style={styles.addressFooterText}>Adresse de livraison</Text>
                </View>
                {!addr.is_default ? (
                  <Pressable onPress={() => handleSetDefault(addr.id)}>
                    <Text style={styles.setDefaultLink}>Définir par défaut</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.setDefaultDisabled}>Définir par défaut</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {addresses.length < MAX_ADDRESSES && (
        <Pressable style={styles.dashedAdd} onPress={openNew}>
          <View style={styles.dashedAddIcon}>
            <Icon name="add" size={24} color={colors.accentLight} />
          </View>
          <Text style={styles.dashedAddText}>Ajouter une nouvelle adresse</Text>
        </Pressable>
      )}

      {/* Limit strip */}
      <View style={styles.limitStrip}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Icon name="info" size={18} color={colors.primary} />
          <Text style={styles.limitText}>
            Vous pouvez enregistrer jusqu'à {MAX_ADDRESSES} adresses. Vous en avez {addresses.length} sur {MAX_ADDRESSES}.
          </Text>
        </View>
        <View style={styles.limitDots}>
          {Array.from({ length: MAX_ADDRESSES }).map((_, i) => (
            <View key={i} style={[styles.limitDot, i < addresses.length && styles.limitDotFilled]} />
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

function AddressForm({ initial, onClose, onSaved }: {
  initial: Address | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    label: initial?.label ?? 'Domicile',
    street: initial?.street ?? '',
    city: initial?.city ?? 'Casablanca',
    postal_code: initial?.postal_code ?? '',
    is_default: initial?.is_default ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!form.street.trim()) {
      setError('Veuillez saisir la rue et le numéro.')
      return
    }
    setError('')
    setSaving(true)
    try {
      const payload: CreateAddressPayload = {
        label: form.label,
        street: form.street.trim(),
        city: form.city,
        postal_code: form.postal_code || undefined,
        latitude: initial?.latitude ?? undefined,
        longitude: initial?.longitude ?? undefined,
        is_default: form.is_default,
      }
      if (initial) {
        await addressesApi.update(initial.id, payload)
      } else {
        await addressesApi.create(payload)
      }
      onSaved()
    } catch (err) {
      setError(firstError(err) || 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.formHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{initial ? "Modifier l'adresse" : 'Nouvelle adresse'}</Text>
          <Text style={styles.subtitle}>
            {initial ? `${initial.label} · Mise à jour des informations` : 'Remplissez les informations ci-dessous'}
          </Text>
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Icon name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Label */}
      <View style={{ gap: 8 }}>
        <Text style={styles.fieldLabel}>Étiquette *</Text>
        <View style={styles.chipRow}>
          {LABEL_OPTIONS.map((opt) => {
            const active = form.label === opt.value
            return (
              <Pressable
                key={opt.value}
                style={[styles.optionChip, active && styles.optionChipActive]}
                onPress={() => setForm((f) => ({ ...f, label: opt.value }))}
              >
                <Icon name={opt.icon} size={15} color={active ? colors.white : colors.textSecondary} />
                <Text style={[styles.optionChipText, active && { color: colors.white }]}>{opt.value}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* Street */}
      <View style={{ gap: 8 }}>
        <Text style={styles.fieldLabel}>Rue et numéro *</Text>
        <TextInput
          value={form.street}
          onChangeText={(v) => setForm((f) => ({ ...f, street: v }))}
          placeholder="12 Rue Ibn Sina, Appartement 3B"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
        />
      </View>

      {/* City */}
      <View style={{ gap: 8 }}>
        <Text style={styles.fieldLabel}>Ville *</Text>
        <View style={styles.chipRow}>
          {CITIES.map((c) => {
            const active = form.city === c
            return (
              <Pressable
                key={c}
                style={[styles.optionChip, active && styles.optionChipActive]}
                onPress={() => setForm((f) => ({ ...f, city: c }))}
              >
                <Text style={[styles.optionChipText, active && { color: colors.white }]}>{c}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* Postal code */}
      <View style={{ gap: 8 }}>
        <Text style={styles.fieldLabel}>Code Postal</Text>
        <TextInput
          value={form.postal_code}
          onChangeText={(v) => setForm((f) => ({ ...f, postal_code: v }))}
          placeholder="20250"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          style={styles.textInput}
        />
      </View>

      {/* Default toggle */}
      <Pressable
        style={styles.checkboxRow}
        onPress={() => setForm((f) => ({ ...f, is_default: !f.is_default }))}
      >
        <Icon
          name={form.is_default ? 'check_box' : 'check_box_outline_blank'}
          size={20}
          color={form.is_default ? colors.primary : colors.textMuted}
        />
        <Text style={styles.checkboxLabel}>Définir comme adresse par défaut</Text>
      </Pressable>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.formActions}>
        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Annuler</Text>
        </Pressable>
        <Pressable style={styles.saveBtn} onPress={handleSubmit} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <>
              <Icon name="save" size={16} color={colors.white} />
              <Text style={styles.saveBtnText}>Enregistrer</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: '700', color: colors.primary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },

  addButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 14,
  },
  addButtonText: { color: colors.white, fontWeight: '600', fontSize: 14 },

  emptyState: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 56, gap: 10,
    backgroundColor: colors.surfaceLowest, borderRadius: 16, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  emptyText: { fontSize: 13, color: colors.textMuted },

  addressCard: {
    backgroundColor: colors.surfaceLowest, borderRadius: 14, borderWidth: 1, borderColor: colors.outlineVariant,
    borderLeftWidth: 4, borderLeftColor: colors.outlineVariant, padding: 16, gap: 8,
  },
  addressCardDefault: { borderLeftColor: colors.primary },
  addressCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  labelChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  labelChipDefault: { backgroundColor: colors.primary },
  labelChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  defaultBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ecfdf5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, borderColor: '#a7f3d0',
  },
  defaultBadgeText: { fontSize: 11, fontWeight: '600', color: '#047857' },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  addressStreet: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  addressCity: { fontSize: 13, color: colors.textSecondary, marginTop: -4 },
  addressFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.outlineVariant,
  },
  addressFooterLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addressFooterText: { fontSize: 12, color: colors.textMuted },
  setDefaultLink: { fontSize: 12, fontWeight: '600', color: colors.primary },
  setDefaultDisabled: { fontSize: 12, color: colors.textMuted },

  dashedAdd: {
    borderWidth: 2, borderColor: colors.outlineVariant, borderStyle: 'dashed', borderRadius: 14,
    paddingVertical: 24, alignItems: 'center', gap: 10,
  },
  dashedAddIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#ecfeff',
    alignItems: 'center', justifyContent: 'center',
  },
  dashedAddText: { fontSize: 13, fontWeight: '600', color: colors.accentLight },

  limitStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#dbeafe', borderRadius: 14, padding: 14,
  },
  limitText: { fontSize: 12, color: colors.primary, flexShrink: 1 },
  limitDots: { flexDirection: 'row', gap: 4 },
  limitDot: { width: 16, height: 8, borderRadius: 4, backgroundColor: colors.outlineVariant },
  limitDotFilled: { backgroundColor: colors.accentLight },

  // Form
  formHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surfaceLowest,
  },
  optionChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionChipText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  textInput: {
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.textPrimary,
    backgroundColor: colors.surfaceLowest,
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkboxLabel: { fontSize: 13, color: colors.textPrimary },

  errorBox: { backgroundColor: colors.errorBg, borderRadius: 12, padding: 12 },
  errorText: { color: colors.errorText, fontSize: 13 },

  formActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
    borderRadius: 14, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14,
  },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: colors.white },
})