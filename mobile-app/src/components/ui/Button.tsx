import { Pressable, Text, ActivityIndicator, StyleSheet, PressableProps } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors } from '../../theme/colors'

interface ButtonProps extends Omit<PressableProps, 'style'> {
  variant?: 'primary' | 'outline' | 'ghost'
  loading?: boolean
  fullWidth?: boolean
  children: string
}

// Mobile port of the web app's Button.tsx. `primary` uses the same
// navy -> teal gradient; `outline`/`ghost` are flat since there's no
// hover state on native, just press feedback via Pressable's opacity.
export default function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  const content = (
    <>
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.white : colors.primary}
          style={{ marginRight: 8 }}
        />
      )}
      <Text style={[styles.label, variant !== 'primary' && { color: colors.primary }, variant === 'ghost' && { color: colors.secondary }]}>
        {children}
      </Text>
    </>
  )

  if (variant === 'primary') {
    return (
      <Pressable disabled={isDisabled} {...props}>
        {({ pressed }) => (
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.base, fullWidth && styles.fullWidth, isDisabled && styles.disabled, pressed && styles.pressed]}
          >
            {content}
          </LinearGradient>
        )}
      </Pressable>
    )
  }

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variant === 'outline' && styles.outline,
        isDisabled && styles.disabled,
        pressed && styles.pressed,
      ]}
      {...props}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  fullWidth: { width: '100%' },
  outline: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.white },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  label: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
