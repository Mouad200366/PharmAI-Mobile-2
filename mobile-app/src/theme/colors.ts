// Ported from the web app's Tailwind theme (brand navy/teal palette).
// Central place for colors so every screen stays visually consistent
// without a Tailwind-equivalent config.
export const colors = {
  primary: '#00236f',
  primaryDark: '#00184d',
  secondary: '#005a6e',
  accent: '#22d3ee',
  accentLight: '#57dffe',

  surface: '#f7fafc',
  surfaceLowest: '#ffffff',
  outlineVariant: '#e5e7eb',

  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',

  success: '#16a34a',
  successBg: '#f0fdf4',
  error: '#dc2626',
  errorBg: '#fef2f2',
  errorText: '#b91c1c',

  white: '#ffffff',
} as const

export const gradients = {
  // react-native-linear-gradient / expo-linear-gradient expect a color
  // array + start/end points instead of a CSS gradient string.
  brand: [colors.primary, colors.secondary] as const,
}
