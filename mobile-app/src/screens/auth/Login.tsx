import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import PhoneInput from '../../components/ui/PhoneInput'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { authApi } from '../../api/auth'
import { firstError } from '../../api/errors'
import { useAuthStore } from '../../store/authStore'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>

// Mobile port of the web app's Login.tsx. The marketing side panel (quote,
// stats) is dropped -- there's no room for it on a phone screen, and it's
// decorative, not functional. Everything else (validation, error handling,
// navigation targets) matches the web page.
//
// "Se souvenir de moi" is dropped too: on mobile, staying signed in via
// SecureStore is the expected default, there's no web-style "session only"
// concept to opt out of.
//
// No explicit navigate() after login -- RootNavigator swaps AuthStack for
// MainStack automatically once authStore.isAuthenticated flips to true.
export default function Login({ navigation }: Props) {
  const login = useAuthStore((s) => s.login)

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (phone.length < 9) {
      setError('Numéro de téléphone invalide.')
      return
    }
    if (!password) {
      setError('Mot de passe requis.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const fullPhone = `+212${phone}`
      const { data } = await authApi.login(fullPhone, password)
      await login(data.access, data.refresh, data.user_id)
    } catch (err: unknown) {
      setError(firstError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surfaceLowest }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.navigate('Landing')} style={styles.backLink}>
          <Icon name="arrow_back" size={16} color={colors.textSecondary} />
          <Text style={styles.backLinkText}>Retour à l'accueil</Text>
        </Pressable>

        <Text style={styles.title}>Bon retour 👋</Text>
        <Text style={styles.subtitle}>Connectez-vous pour accéder à vos commandes…</Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Icon name="error" size={20} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Échec de connexion</Text>
              <Text style={styles.errorBody}>{error}</Text>
            </View>
            <Pressable onPress={() => setError('')}>
              <Icon name="close" size={18} color={colors.error} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.form}>
          <PhoneInput label="Numéro de téléphone" value={phone} onChange={setPhone} valid={phone.length === 9} />

          <View>
            <View style={styles.passwordHeader}>
              <Text style={styles.passwordLabel}>Mot de passe</Text>
              <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
                <Text style={styles.link}>Mot de passe oublié ?</Text>
              </Pressable>
            </View>
            <Input
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              rightIcon={
                <Pressable onPress={() => setShowPassword((v) => !v)}>
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={20} color={colors.textMuted} />
                </Pressable>
              }
            />
          </View>

          <Button onPress={handleSubmit} loading={loading} fullWidth>
            Se connecter →
          </Button>

          <Text style={styles.disclaimer}>
            Trop de tentatives peuvent bloquer temporairement votre compte.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Pas encore de compte ? </Text>
          <Pressable onPress={() => navigation.navigate('Register')}>
            <Text style={styles.link}>S'inscrire</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 24, paddingTop: 64 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  backLinkText: { fontSize: 14, color: colors.textSecondary },
  title: { fontSize: 28, fontWeight: '800', color: colors.primary },
  subtitle: { marginTop: 8, fontSize: 14, color: colors.textSecondary, marginBottom: 24 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.errorBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  errorTitle: { fontSize: 13, fontWeight: '700', color: colors.errorText },
  errorBody: { fontSize: 13, color: colors.error, marginTop: 2 },
  form: { gap: 18 },
  passwordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  passwordLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  link: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  disclaimer: { textAlign: 'center', fontSize: 11, color: colors.textMuted },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { fontSize: 14, color: colors.textSecondary },
})
