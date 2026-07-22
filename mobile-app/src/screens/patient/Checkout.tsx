import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MainStackParamList } from '../../navigation/types'
import { ordersApi, type PrescriptionMode, type PaymentMethod } from '../../api/orders'
import { addressesApi, type Address } from '../../api/addresses'
import { useCartStore } from '../../store/cartStore'
import { firstError } from '../../api/errors'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<MainStackParamList, 'Checkout'>

const PRESCRIPTION_OPTIONS: { value: PrescriptionMode; label: string }[] = [
  { value: 'none', label: 'Aucune' },
  { value: 'photo', label: 'Photo' },
  { value: 'pickup', label: 'À la livraison' },
]

// Mobile port of the web app's Checkout.tsx. Same fields and validation
// (address, prescription mode, payment method, notes) and the same
// create-order -> clear cart -> go to OrderDetail flow. Two UI swaps forced
// by the platform:
//  - web's <select> for saved addresses becomes a vertical list of
//    selectable cards (no native <select> equivalent worth building here).
//  - if the cart is empty, we redirect with a `useEffect` instead of doing
//    it during render -- navigating mid-render throws on native.
export default function Checkout({ navigation }: Props) {
  const { items, clearCart } = useCartStore()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [addressesLoading, setAddressesLoading] = useState(true)
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null)
  const [customAddress, setCustomAddress] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [prescriptionMode, setPrescriptionMode] = useState<PrescriptionMode>('none')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    addressesApi
      .list()
      .then((r) => {
        setAddresses(r.data.results)
        const def = r.data.results.find((a) => a.is_default)
        if (def) setSelectedAddress(def)
        else if (r.data.results.length === 0) setUseCustom(true)
      })
      .catch(() => setUseCustom(true))
      .finally(() => setAddressesLoading(false))
  }, [])

  useEffect(() => {
    if (items.length === 0) {
      navigation.replace('Tabs', { screen: 'Search' })
    }
  }, [items.length, navigation])

  if (items.length === 0) return null

  const hasPrescriptionItem = items.some((i) => i.medicine.requires_prescription)

  async function handleSubmit() {
    setError('')
    const deliveryAddr = useCustom
      ? customAddress.trim()
      : selectedAddress
        ? `${selectedAddress.street}, ${selectedAddress.city}`
        : ''

    if (!deliveryAddr) {
      setError('Veuillez sélectionner ou saisir une adresse de livraison.')
      return
    }
    if (hasPrescriptionItem && prescriptionMode === 'none') {
      setError('Certains médicaments nécessitent une ordonnance. Sélectionnez un mode de transmission.')
      return
    }

    const lat = selectedAddress?.latitude ?? 0
    const lng = selectedAddress?.longitude ?? 0

    setSubmitting(true)
    try {
      const res = await ordersApi.create({
        items: items.map((i) => ({ medicine: i.medicine.id, quantity: i.quantity })),
        delivery_address: deliveryAddr,
        latitude: lat,
        longitude: lng,
        prescription_mode: prescriptionMode,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
      })
      clearCart()
      navigation.replace('OrderDetail', { id: res.data.id })
    } catch (err) {
      setError(firstError(err) || 'Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Confirmer la commande</Text>

      {/* Order summary */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Icon name="receipt" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Récapitulatif</Text>
        </View>
        <View style={{ gap: 8 }}>
          {items.map(({ medicine, quantity }) => (
            <View key={medicine.id} style={styles.summaryRow}>
              <View style={styles.summaryLeft}>
                <View style={styles.summaryIcon}>
                  <Icon name="medication" size={16} color={colors.accentLight} />
                </View>
                <Text style={styles.summaryName}>{medicine.name}</Text>
              </View>
              <Text style={styles.summaryQty}>x{quantity}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.summaryFootnote}>Le prix sera confirmé par la pharmacie.</Text>
      </View>

      {/* Address */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Icon name="location_on" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Adresse de livraison</Text>
        </View>

        {addressesLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            {addresses.length > 0 && !useCustom && (
              <View style={{ gap: 8 }}>
                {addresses.map((a) => {
                  const active = selectedAddress?.id === a.id
                  return (
                    <Pressable
                      key={a.id}
                      style={[styles.addressOption, active && styles.addressOptionActive]}
                      onPress={() => setSelectedAddress(a)}
                    >
                      <View style={[styles.radio, active && styles.radioActive]}>
                        {active && <View style={styles.radioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.addressLabel}>{a.label}</Text>
                        <Text style={styles.addressText}>{a.street}, {a.city}</Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )}

            {(addresses.length === 0 || useCustom) && (
              <TextInput
                value={customAddress}
                onChangeText={setCustomAddress}
                placeholder="Ex: 12 Rue Mohammed V, Casablanca"
                placeholderTextColor={colors.textMuted}
                style={styles.textInput}
              />
            )}

            {addresses.length > 0 && (
              <Pressable onPress={() => setUseCustom((v) => !v)}>
                <Text style={styles.linkText}>
                  {useCustom ? '← Utiliser une adresse enregistrée' : '+ Saisir une autre adresse'}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {/* Prescription */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Icon name="description" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Ordonnance</Text>
        </View>

        {hasPrescriptionItem && (
          <View style={styles.warningBox}>
            <Icon name="warning" size={14} color="#c2410c" />
            <Text style={styles.warningText}>Certains médicaments nécessitent une ordonnance.</Text>
          </View>
        )}

        <View style={styles.segmentRow}>
          {PRESCRIPTION_OPTIONS.map((opt) => {
            const active = prescriptionMode === opt.value
            return (
              <Pressable
                key={opt.value}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setPrescriptionMode(opt.value)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
              </Pressable>
            )
          })}
        </View>

        {prescriptionMode === 'photo' && (
          <View style={styles.uploadBox}>
            <Icon name="upload" size={18} color={colors.primary} />
            <Text style={styles.uploadText}>Joindre une photo (fonctionnalité à venir)</Text>
          </View>
        )}
      </View>

      {/* Payment */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Icon name="payment" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Mode de paiement</Text>
        </View>
        <View style={styles.payRow}>
          <PayOption
            icon="payments"
            label="Espèces"
            active={paymentMethod === 'cash'}
            onPress={() => setPaymentMethod('cash')}
          />
          <PayOption
            icon="credit_card"
            label="Carte bancaire"
            active={paymentMethod === 'card'}
            onPress={() => setPaymentMethod('card')}
          />
        </View>
      </View>

      {/* Notes */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Icon name="notes" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Notes (optionnel)</Text>
        </View>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          placeholder="Informations supplémentaires pour la pharmacie..."
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, styles.textArea]}
        />
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Icon name="error" size={16} color={colors.errorText} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitText}>Confirmer la commande</Text>
        )}
      </Pressable>
    </ScrollView>
  )
}

function PayOption({ icon, label, active, onPress }: {
  icon: string
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable style={[styles.payOption, active && styles.payOptionActive]} onPress={onPress}>
      <Icon name={icon} size={22} color={active ? colors.primary : colors.textSecondary} />
      <Text style={[styles.payLabel, active && { color: colors.primary }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },

  card: {
    backgroundColor: colors.surfaceLowest, borderRadius: 16,
    borderWidth: 1, borderColor: colors.outlineVariant, padding: 16, gap: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },

  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  summaryIcon: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryName: { fontSize: 14, color: colors.textPrimary, flexShrink: 1 },
  summaryQty: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  summaryFootnote: {
    fontSize: 12, color: colors.textMuted, marginTop: 4, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.outlineVariant,
  },

  addressOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12, padding: 12,
  },
  addressOptionActive: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  addressLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  addressText: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },

  textInput: {
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.textPrimary,
    backgroundColor: colors.surfaceLowest,
  },
  textArea: { textAlignVertical: 'top', minHeight: 72 },
  linkText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  warningBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff7ed', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
  },
  warningText: { fontSize: 12, color: '#c2410c', flex: 1 },

  segmentRow: { flexDirection: 'row', gap: 8 },
  segmentBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2,
    borderColor: colors.outlineVariant, alignItems: 'center',
  },
  segmentBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  segmentTextActive: { color: colors.white },

  uploadBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 2, borderColor: '#bfdbfe', borderStyle: 'dashed', borderRadius: 12, padding: 12,
  },
  uploadText: { fontSize: 13, color: colors.textSecondary, flex: 1 },

  payRow: { flexDirection: 'row', gap: 12 },
  payOption: {
    flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16,
    borderRadius: 12, borderWidth: 2, borderColor: colors.outlineVariant,
  },
  payOptionActive: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  payLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.errorBg, borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  errorText: { color: colors.errorText, fontSize: 13, flex: 1 },

  submitButton: {
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 16, alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { color: colors.white, fontWeight: '700', fontSize: 14 },
})