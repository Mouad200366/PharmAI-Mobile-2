import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native'
import type { ReactNode } from 'react'
import Icon from './Icon'
import { colors } from '../../theme/colors'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
  hint?: string
  rightIcon?: ReactNode
  valid?: boolean
}

// Mobile port of the web app's Input.tsx. Same states (default / valid /
// error) via border color, same label/hint/error layout underneath.
export default function Input({ label, error, hint, rightIcon, valid, style, ...props }: InputProps) {
  const borderColor = error ? colors.error : valid ? colors.success : colors.outlineVariant

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputWrapper, { borderColor }]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textMuted}
          {...props}
        />
        {rightIcon && <View style={styles.iconSlot}>{rightIcon}</View>}
        {valid && !rightIcon && (
          <View style={styles.iconSlot}>
            <Icon name="check" size={20} color={colors.success} />
          </View>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {hint && !error && <Text style={styles.hintText}>{hint}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 4,
  },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: colors.textPrimary },
  iconSlot: { paddingHorizontal: 10 },
  errorText: { marginTop: 6, fontSize: 12, color: colors.error },
  hintText: { marginTop: 6, fontSize: 12, color: colors.textMuted },
})
