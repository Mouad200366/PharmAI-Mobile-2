import { useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import Input from '../../components/ui/Input'
import PhoneInput from '../../components/ui/PhoneInput'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { authApi, type Gender } from '../../api/auth'
import { extractErrors } from '../../api/errors'
import { useAuthStore } from '../../store/authStore'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>

const CIN_REGEX = /^[A-Z]{1,2}\d{5,6}$/i
// Same shape the backend expects (YYYY-MM-DD). No native date picker yet --
// keeping this page dependency-free for now; swap the plain Input for
// @react-native-community/datetimepicker later if you want a real picker.
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw) && /\d/.test(pw)) score++
  if (/[^A-Za-z\d]/.test(pw) || pw.length >= 12) score++
  return score as 0 | 1 | 2 | 3
}

const STRENGTH_LABEL = ['', 'Faible', 'Moyen', 'Fort']
const STRENGTH_COLOR = ['', '#ef4444', '#fbbf24', '#22c55e']

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'M', label: 'Homme' },
  { value: 'F', label: 'Femme' },
  { value: 'O', label: 'Autre' },
]

// Mobile port of the web app's Register.tsx. Same fields, same client-side
// validation rules, same backend payload shape. The left marketing panel
// is dropped (no room on a phone); the "Étape 1 sur 2" progress bar is
// kept since it sets expectations for the OTP step that follows.
export default function Register({ navigation }: Props) {
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone)

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    cin: '',
    dateOfBirth: '',
    gender: '' as Gender | '',
    password: '',
    passwordConfirm: '',
    acceptTerms: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [showPwConfirm, setShowPwConfirm] = useState(false)

  const strength = passwordStrength(form.password)
  const set = (field: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }))

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    if (!form.firstName.trim()) e.firstName = 'Prénom requis'
    if (!form.lastName.trim()) e.lastName = 'Nom requis'
    if (form.phone.length < 9) e.phone = 'Numéro invalide (9 chiffres requis)'
    if (!CIN_REGEX.test(form.cin)) e.cin = 'Format invalide. Exemple: AB123456'
    if (!DATE_REGEX.test(form.dateOfBirth)) e.dateOfBirth = 'Format attendu: AAAA-MM-JJ'
    if (!form.gender) e.gender = 'Veuillez sélectionner votre sexe'
    if (form.password.length < 8) e.password = '8 caractères minimum'
    if (form.password !== form.passwordConfirm) e.passwordConfirm = 'Les mots de passe ne correspondent pas'
    if (!form.acceptTerms) e.acceptTerms = "Veuillez accepter les conditions d'utilisation"
    return e
  }

  async function handleSubmit() {
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      const phone = `+212${form.phone}`
      await authApi.signUp({
        phone,
        cin: form.cin.toUpperCase(),
        first_name: form.firstName,
        last_name: form.lastName,
        date_of_birth: form.dateOfBirth,
        gender: form.gender as Gender,
        password: form.password,
        password_confirm: form.passwordConfirm,
      })
      setPendingPhone(phone)
      navigation.navigate('VerifyOTP', { phone, purpose: 'signup' })
     } catch (err: unknown) {
      console.log('Signup error:', JSON.stringify(err, null, 2))
      setErrors(extractErrors(err))
     } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surfaceLowest }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Créer votre compte</Text>
          <Text style={styles.step}>Étape 1 sur 2</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={styles.progressFill} />
        </View>

        {errors.form ? (
          <View style={styles.formError}>
            <Text style={styles.formErrorText}>{errors.form}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <View style={styles.row}>
            <View style={styles.half}>
              <Input
                label="Prénom"
                placeholder="Mohamed"
                value={form.firstName}
                onChangeText={(v) => set('firstName', v)}
                error={errors.firstName}
                valid={!!form.firstName && !errors.firstName}
              />
            </View>
            <View style={styles.half}>
              <Input
                label="Nom"
                placeholder="Alami"
                value={form.lastName}
                onChangeText={(v) => set('lastName', v)}
                error={errors.lastName}
                valid={!!form.lastName && !errors.lastName}
              />
            </View>
          </View>

          <PhoneInput label="Téléphone" value={form.phone} onChange={(v) => set('phone', v)} error={errors.phone} valid={form.phone.length === 9} />

          <Input
            label="CIN"
            placeholder="AB123456"
            autoCapitalize="characters"
            value={form.cin}
            onChangeText={(v) => set('cin', v.toUpperCase())}
            error={errors.cin}
            valid={CIN_REGEX.test(form.cin)}
          />

          <Input
            label="Date de naissance"
            placeholder="AAAA-MM-JJ"
            value={form.dateOfBirth}
            onChangeText={(v) => set('dateOfBirth', v)}
            error={errors.dateOfBirth}
            keyboardType="numbers-and-punctuation"
          />

          <View>
            <Text style={styles.label}>Sexe</Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((opt) => {
                const active = form.gender === opt.value
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => set('gender', opt.value)}
                    style={[styles.genderOption, active && styles.genderOptionActive]}
                  >
                    <Text style={[styles.genderOptionText, active && styles.genderOptionTextActive]}>{opt.label}</Text>
                  </Pressable>
                )
              })}
            </View>
            {errors.gender && <Text style={styles.fieldError}>{errors.gender}</Text>}
          </View>

          <View>
            <Input
              label="Mot de passe"
              placeholder="••••••••"
              secureTextEntry={!showPw}
              value={form.password}
              onChangeText={(v) => set('password', v)}
              error={errors.password}
              rightIcon={
                <Pressable onPress={() => setShowPw((v) => !v)}>
                  <Icon name={showPw ? 'visibility_off' : 'visibility'} size={20} color={colors.textMuted} />
                </Pressable>
              }
            />
            {!!form.password && (
              <View style={styles.strengthRow}>
                {[1, 2, 3].map((i) => (
                  <View key={i} style={[styles.strengthBar, { backgroundColor: strength >= i ? STRENGTH_COLOR[strength] : colors.outlineVariant }]} />
                ))}
                <Text style={styles.strengthLabel}>{STRENGTH_LABEL[strength]}</Text>
              </View>
            )}
          </View>

          <Input
            label="Confirmer le mot de passe"
            placeholder="••••••••"
            secureTextEntry={!showPwConfirm}
            value={form.passwordConfirm}
            onChangeText={(v) => set('passwordConfirm', v)}
            error={errors.passwordConfirm}
            valid={!!form.passwordConfirm && form.password === form.passwordConfirm}
            rightIcon={
              <Pressable onPress={() => setShowPwConfirm((v) => !v)}>
                <Icon name={showPwConfirm ? 'visibility_off' : 'visibility'} size={20} color={colors.textMuted} />
              </Pressable>
            }
          />

          <View>
            <Pressable style={styles.termsRow} onPress={() => set('acceptTerms', !form.acceptTerms)}>
              <View style={[styles.checkbox, form.acceptTerms && styles.checkboxChecked]}>
                {form.acceptTerms && <Icon name="check" size={14} color={colors.white} />}
              </View>
              <Text style={styles.termsText}>
                J'accepte les Conditions d'utilisation et la Politique de confidentialité.
              </Text>
            </Pressable>
            {errors.acceptTerms && <Text style={styles.fieldError}>{errors.acceptTerms}</Text>}
          </View>

          <Button onPress={handleSubmit} loading={loading} fullWidth>
            Créer mon compte →
          </Button>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Déjà un compte ? </Text>
          <Pressable onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Se connecter</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 24, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: colors.primary },
  step: { fontSize: 13, color: colors.textMuted },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.outlineVariant, marginBottom: 24, overflow: 'hidden' },
  progressFill: { width: '50%', height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  formError: { backgroundColor: colors.errorBg, borderRadius: 16, padding: 14, marginBottom: 16 },
  formErrorText: { fontSize: 13, color: colors.error },
  form: { gap: 18 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
  },
  genderOptionActive: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  genderOptionText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  genderOptionTextActive: { color: colors.primary },
  fieldError: { marginTop: 6, fontSize: 12, color: colors.error },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  strengthBar: { flex: 1, height: 6, borderRadius: 3 },
  strengthLabel: { fontSize: 12, color: colors.textSecondary, marginLeft: 6 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  termsText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28, marginBottom: 12 },
  footerText: { fontSize: 14, color: colors.textSecondary },
  link: { fontSize: 14, color: colors.primary, fontWeight: '600' },
})
