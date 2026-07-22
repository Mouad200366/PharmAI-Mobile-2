import { View, Text, TextInput, StyleSheet } from 'react-native'
import Icon from './Icon'
import { colors } from '../../theme/colors'

interface PhoneInputProps {
  label?: string
  error?: string
  valid?: boolean
  value: string
  onChange: (value: string) => void
}

// Mobile port of the web app's PhoneInput.tsx: fixed +212 (Morocco) prefix,
// digits-only, capped at 9 digits — same validation contract as web
// (`phone.length === 9` for the green check state).
export default function PhoneInput({ label, error, valid, value, onChange }: PhoneInputProps) {
  const borderColor = error ? colors.error : valid ? colors.success : colors.outlineVariant

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.wrapper, { borderColor }]}>
        <View style={styles.prefix}>
          <Text style={styles.flag}>🇲🇦</Text>
          <Text style={styles.prefixText}>+212</Text>
        </View>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          placeholder="06 00 00 00 00"
          placeholderTextColor={colors.textMuted}
          value={value}
          maxLength={9}
          onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 9))}
        />
        {valid && <Icon name="check" size={20} color={colors.success} />}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: colors.white,
    paddingRight: 12,
  },
  prefix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant,
  },
  flag: { fontSize: 16 },
  prefixText: { fontSize: 14, fontWeight: '600', color: '#4b5563' },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: colors.textPrimary },
  errorText: { marginTop: 6, fontSize: 12, color: colors.error },
})
