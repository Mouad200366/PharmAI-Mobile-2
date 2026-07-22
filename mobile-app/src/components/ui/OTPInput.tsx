import { useRef } from 'react'
import { View, TextInput, StyleSheet, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native'
import { colors } from '../../theme/colors'

interface OTPInputProps {
  value: string[]
  onChange: (value: string[]) => void
  length?: number
  error?: boolean
  disabled?: boolean
}

// Mobile port of the web app's OTPInput.tsx: N separate boxes, auto-advance
// to the next box on digit entry, Backspace steps back and clears the
// previous box. No paste handler -- RN's onKeyPress doesn't carry pasted
// text the way the web clipboard event does; typing digit-by-digit (or the
// SMS autofill keyboard suggestion) covers the real-world case.
export default function OTPInput({ value, onChange, length = 6, error = false, disabled = false }: OTPInputProps) {
  const refs = useRef<(TextInput | null)[]>([])

  function handleChange(index: number, digit: string) {
    const clean = digit.replace(/\D/g, '').slice(-1)
    const next = [...value]
    next[index] = clean
    onChange(next)
    if (clean && index < length - 1) refs.current[index + 1]?.focus()
  }

  function handleKeyPress(index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Backspace' && !value[index] && index > 0) {
      const next = [...value]
      next[index - 1] = ''
      onChange(next)
      refs.current[index - 1]?.focus()
    }
  }

  const borderColor = error ? colors.error : colors.outlineVariant

  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          style={[styles.box, { borderColor }, error && styles.boxError]}
          keyboardType="number-pad"
          maxLength={1}
          value={value[i] || ''}
          editable={!disabled}
          onChangeText={(v) => handleChange(i, v)}
          onKeyPress={(e) => handleKeyPress(i, e)}
          onFocus={(e) => e.currentTarget.setNativeProps({ selection: { start: 0, end: 1 } })}
          textAlign="center"
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  box: {
    width: 46,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    backgroundColor: colors.white,
  },
  boxError: { backgroundColor: colors.errorBg },
})