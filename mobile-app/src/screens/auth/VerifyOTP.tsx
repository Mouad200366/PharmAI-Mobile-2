import { useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import OTPInput from '../../components/ui/OTPInput'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { useCountdown } from '../../hooks/useCountdown'
import { authApi } from '../../api/auth'
import { firstError } from '../../api/errors'
import { useAuthStore } from '../../store/authStore'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyOTP'>

// Mobile port of the web app's VerifyOTP.tsx. Same flow: 6-digit code,
// 154s countdown, 3-attempt limit with a friendlier error each time,
// resend once expired.
//
// Two purpose-dependent outcomes, same as web:
//  - 'signup' -> authStore.login() logs the user in directly; RootNavigator
//    swaps to MainStack automatically, no manual navigation needed.
//  - 'password_reset' -> tokens go into authStore.setResetTokens() (mobile
//    equivalent of web's sessionStorage) and we navigate to ForgotPassword
//    to finish setting the new password.
export default function VerifyOTP({ navigation, route }: Props) {
  const { phone, purpose } = route.params
  const login = useAuthStore((s) => s.login)
  const setResetTokens = useAuthStore((s) => s.setResetTokens)

  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const { formatted, expired, reset } = useCountdown(154)

  const maskedPhone = phone.replace(/(\+212\s?)(\d)(\d{2})(\d{3})(\d{2})(\d{2})/, '+212 $2•• ••• •$6')
  const code = digits.join('')

  async function handleVerify() {
    if (code.length < 6) {
      setError('Veuillez saisir les 6 chiffres du code.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { data } = await authApi.verifyOTP(phone, code, purpose)
      if (purpose === 'signup') {
        await login(data.access, data.refresh, data.user_id)
      } else {
        setResetTokens(data.access, data.refresh)
        navigation.navigate('ForgotPassword')
      }
    } catch (err: unknown) {
      const msg = firstError(err)
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      const remaining = 3 - newAttempts
      if (remaining > 0) {
        setError(`${msg} Il vous reste ${remaining} tentative${remaining > 1 ? 's' : ''}.`)
      } else {
        setError('Trop de tentatives. Votre accès est temporairement bloqué.')
      }
      setDigits(Array(6).fill(''))
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!expired) return
    setResending(true)
    setError('')
    try {
      await authApi.requestOTP(phone, purpose)
      reset()
      setDigits(Array(6).fill(''))
      setAttempts(0)
    } catch {
      setError('Impossible de renvoyer le code. Réessayez.')
    } finally {
      setResending(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Pressable
        onPress={() => navigation.navigate(purpose === 'signup' ? 'Register' : 'ForgotPassword')}
        style={styles.restartLink}
      >
        <Text style={styles.restartLinkText}>
          Mauvais numéro ? <Text style={styles.restartLinkStrong}>Recommencer</Text>
        </Text>
      </Pressable>

      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Icon name="verified_user" size={30} color={colors.white} />
        </View>

        <Text style={styles.title}>Vérifiez votre numéro</Text>
        <Text style={styles.subtitle}>
          Nous avons envoyé un code à 6 chiffres au{' '}
          <Text style={styles.subtitleStrong}>{maskedPhone}</Text>. Saisissez-le ci-dessous pour activer votre
          compte.
        </Text>

        <Text style={styles.otpLabel}>Code de vérification</Text>
        <OTPInput value={digits} onChange={setDigits} error={!!error} />

        <View style={styles.timerRow}>
          {!expired ? (
            <View style={styles.timerBadge}>
              <Icon name="timer" size={16} color={colors.secondary} />
              <Text style={styles.timerText}>Le code expire dans {formatted}</Text>
            </View>
          ) : (
            <Text style={styles.expiredText}>Code expiré</Text>
          )}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Icon name="error" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.resendRow}>
          <Text style={styles.resendText}>Vous n'avez pas reçu de code ? </Text>
          <Pressable onPress={handleResend} disabled={!expired || resending}>
            <Text style={[styles.resendLink, (!expired || resending) && styles.resendLinkDisabled]}>
              {resending ? 'Envoi…' : 'Renvoyer le code'}
            </Text>
          </Pressable>
        </View>

        <Button onPress={handleVerify} loading={loading} fullWidth>
          Vérifier le code →
        </Button>

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Étape 2 sur 2 — Vérification du numéro</Text>
            <Icon name="check_circle" size={16} color={colors.secondary} />
          </View>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, backgroundColor: colors.surface, padding: 20, paddingTop: 56, alignItems: 'center' },
  restartLink: { alignSelf: 'flex-end', marginBottom: 16 },
  restartLinkText: { fontSize: 13, color: colors.textSecondary },
  restartLinkStrong: { color: colors.primary, fontWeight: '700' },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surfaceLowest,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.primary, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  subtitleStrong: { fontWeight: '700', color: colors.primary },
  otpLabel: { alignSelf: 'flex-start', fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 },
  timerRow: { marginTop: 16, marginBottom: 4, alignItems: 'center' },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdfa',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  timerText: { fontSize: 13, color: colors.secondary, fontWeight: '600' },
  expiredText: { fontSize: 13, color: colors.error, fontWeight: '600' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.errorBg,
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginTop: 12,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20, marginBottom: 20, flexWrap: 'wrap' },
  resendText: { fontSize: 13, color: colors.textSecondary },
  resendLink: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  resendLinkDisabled: { color: colors.textMuted },
  progressSection: { width: '100%', marginTop: 28, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressLabel: { fontSize: 11, color: colors.textMuted },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.outlineVariant, overflow: 'hidden' },
  progressFill: { width: '100%', height: '100%', backgroundColor: colors.primary },
})