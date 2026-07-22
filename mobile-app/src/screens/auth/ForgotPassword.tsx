import { useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import PhoneInput from '../../components/ui/PhoneInput'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { authApi } from '../../api/auth'
import { firstError } from '../../api/errors'
import client from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>

function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw) && /\d/.test(pw)) score++
  if (/[^A-Za-z\d]/.test(pw) || pw.length >= 12) score++
  return score as 0 | 1 | 2 | 3
}
const STRENGTH_LABEL = ['', 'Faible', 'Moyen', 'Fort']
const STRENGTH_COLOR = ['', '#ef4444', '#fbbf24', '#22c55e']

// Mobile port of the web app's ForgotPassword.tsx, but restructured:
// web does all 3 steps (phone -> OTP -> new password) inline in one page.
// On mobile the OTP step is handled by the shared VerifyOTP screen instead
// of duplicating that UI here -- so this screen only covers step 1 (enter
// phone, request code) and step 3 (set new password once resetAccess is
// present in authStore, set by VerifyOTP after a successful code check).
export default function ForgotPassword({ navigation }: Props) {
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone)
  const resetAccess = useAuthStore((s) => s.resetAccess)
  const clearResetTokens = useAuthStore((s) => s.clearResetTokens)

  const [phone, setPhone] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showPwConfirm, setShowPwConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const strength = passwordStrength(newPassword)

  async function handleSendCode() {
    if (phone.length < 9) {
      setError('Numéro invalide (9 chiffres requis).')
      return
    }
    setError('')
    setLoading(true)
    try {
      const fullPhone = `+212${phone}`
      await authApi.requestOTP(fullPhone, 'password_reset')
      setPendingPhone(fullPhone)
      navigation.navigate('VerifyOTP', { phone: fullPhone, purpose: 'password_reset' })
    } catch (err: unknown) {
      setError(firstError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    if (newPassword.length < 8) {
      setError('8 caractères minimum.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await client.post(
        '/users/password/reset/',
        { new_password: newPassword, new_password_confirm: confirmPassword },
        { headers: { Authorization: `Bearer ${resetAccess}` } },
      )
      clearResetTokens()
      setSuccess(true)
    } catch {
      setError('Impossible de réinitialiser. Recommencez depuis le début.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <View style={styles.successScreen}>
        <View style={styles.successIcon}>
          <Icon name="check_circle" size={40} color={colors.success} />
        </View>
        <Text style={styles.successTitle}>Mot de passe réinitialisé !</Text>
        <Text style={styles.successBody}>
          Votre mot de passe a été mis à jour. Vous pouvez maintenant vous connecter.
        </Text>
        <Button onPress={() => navigation.navigate('Login')} fullWidth>
          Se connecter →
        </Button>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surfaceLowest }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.navigate('Login')} style={styles.backLink}>
          <Icon name="arrow_back" size={16} color={colors.textSecondary} />
          <Text style={styles.backLinkText}>Retour à la connexion</Text>
        </Pressable>

        {!resetAccess ? (
          <>
            <View style={styles.iconCircle}>
              <Icon name="smartphone" size={28} color={colors.white} />
            </View>
            <Text style={styles.title}>Mot de passe oublié ?</Text>
            <Text style={styles.subtitle}>
              Entrez votre numéro de téléphone, nous vous enverrons un code de vérification.
            </Text>

            <View style={styles.form}>
              <PhoneInput label="Numéro de téléphone" value={phone} onChange={setPhone} valid={phone.length === 9} />

              {error ? (
                <View style={styles.errorRow}>
                  <Icon name="error" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Button onPress={handleSendCode} loading={loading} fullWidth>
                Envoyer le code →
              </Button>
            </View>
          </>
        ) : (
          <>
            <View style={styles.iconCircle}>
              <Icon name="key" size={28} color={colors.white} />
            </View>
            <Text style={styles.title}>Nouveau mot de passe</Text>
            <Text style={styles.subtitle}>Choisissez un nouveau mot de passe pour votre compte.</Text>

            <View style={styles.form}>
              <View>
                <Input
                  placeholder="Nouveau mot de passe"
                  secureTextEntry={!showPw}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  rightIcon={
                    <Pressable onPress={() => setShowPw((v) => !v)}>
                      <Icon name={showPw ? 'visibility_off' : 'visibility'} size={20} color={colors.textMuted} />
                    </Pressable>
                  }
                />
                {!!newPassword && (
                  <View style={styles.strengthRow}>
                    {[1, 2, 3].map((i) => (
                      <View key={i} style={[styles.strengthBar, { backgroundColor: strength >= i ? STRENGTH_COLOR[strength] : colors.outlineVariant }]} />
                    ))}
                    <Text style={styles.strengthLabel}>{STRENGTH_LABEL[strength]}</Text>
                  </View>
                )}
              </View>

              <Input
                placeholder="Confirmer le mot de passe"
                secureTextEntry={!showPwConfirm}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                valid={!!confirmPassword && newPassword === confirmPassword}
                rightIcon={
                  <Pressable onPress={() => setShowPwConfirm((v) => !v)}>
                    <Icon name={showPwConfirm ? 'visibility_off' : 'visibility'} size={20} color={colors.textMuted} />
                  </Pressable>
                }
              />

              <View style={styles.checklist}>
                {[
                  { ok: newPassword.length >= 8, label: '8 caractères minimum' },
                  { ok: /[A-Z]/.test(newPassword) && /\d/.test(newPassword), label: '1 majuscule & 1 chiffre' },
                  { ok: !!confirmPassword && newPassword === confirmPassword, label: 'Les mots de passe correspondent' },
                ].map((r) => (
                  <View key={r.label} style={styles.checklistRow}>
                    <Icon name={r.ok ? 'check' : 'circle'} size={14} color={r.ok ? colors.success : colors.textMuted} />
                    <Text style={[styles.checklistText, r.ok && { color: colors.success }]}>{r.label}</Text>
                  </View>
                ))}
              </View>

              {error ? (
                <View style={styles.errorRow}>
                  <Icon name="error" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Button
                onPress={handleResetPassword}
                loading={loading}
                disabled={strength === 0 || newPassword !== confirmPassword}
                fullWidth
              >
                Réinitialiser le mot de passe →
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 24, paddingTop: 56, alignItems: 'center' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 24 },
  backLinkText: { fontSize: 14, color: colors.textSecondary },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 24, paddingHorizontal: 8 },
  form: { width: '100%', gap: 16 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { fontSize: 13, color: colors.error, flex: 1 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  strengthBar: { flex: 1, height: 6, borderRadius: 3 },
  strengthLabel: { fontSize: 12, color: colors.textSecondary, marginLeft: 6 },
  checklist: { gap: 6 },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checklistText: { fontSize: 12, color: colors.textMuted },
  successScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceLowest, padding: 32, gap: 4 },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  successBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 28 },
})