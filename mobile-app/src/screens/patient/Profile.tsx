import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  ActivityIndicator, Image, Alert,
} from 'react-native'
import { usersApi, type UserProfile } from '../../api/users'
import { authApi } from '../../api/auth'
import { firstError } from '../../api/errors'
import { useAuthStore } from '../../store/authStore'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

// Mobile port of the web app's Profile.tsx: same personal-info form and
// password-change form. Two additions beyond a literal port, both filling
// gaps that only exist because mobile has no persistent sidebar shell:
//  - a "Se déconnecter" button -- on web, logout lives in DashboardLayout's
//    sidebar (outside Profile.tsx entirely); mobile has no such shell (the
//    tab bar has no room for it), so Profile is the natural place for it.
//  - the avatar edit button is present but shows a "coming soon" alert
//    instead of opening a picker -- `usersApi.uploadAvatar()` is already
//    shaped to take a local URI, but expo-image-picker isn't a project
//    dependency yet (same deferred status as GPS on the Addresses screen).
export default function Profile() {
  const logout = useAuthStore((s) => s.logout)
  const refreshToken = useAuthStore((s) => s.refreshToken)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    date_of_birth: '',
  })

  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwError, setPwError] = useState('')

  useEffect(() => {
    usersApi.me().then((r) => {
      setProfile(r.data)
      setForm({
        first_name: r.data.first_name,
        last_name: r.data.last_name,
        email: r.data.email,
        date_of_birth: r.data.date_of_birth ?? '',
      })
    }).finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setError('')
    setSuccess(false)
    setSaving(true)
    try {
      const r = await usersApi.updateMe(form)
      setProfile(r.data)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(firstError(err) || 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordChange() {
    setPwError('')
    setPwSuccess(false)
    setPwSaving(true)
    try {
      await authApi.passwordChange(pwForm.old_password, pwForm.new_password)
      setPwSuccess(true)
      setPwForm({ old_password: '', new_password: '' })
      setTimeout(() => setPwSuccess(false), 3000)
    } catch (err) {
      setPwError(firstError(err) || 'Erreur lors du changement de mot de passe.')
    } finally {
      setPwSaving(false)
    }
  }

  function handleAvatarPress() {
    Alert.alert('Bientôt disponible', "Le changement de photo de profil arrive bientôt.")
  }

  function confirmLogout() {
    Alert.alert('Se déconnecter ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: handleLogout },
    ])
  }

  async function handleLogout() {
    try {
      if (refreshToken) await authApi.logout(refreshToken)
    } catch {
      // best-effort -- clear local session regardless
    }
    logout()
  }

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const initials = `${profile?.first_name?.[0] ?? ''}${profile?.last_name?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Mon profil</Text>

      {/* Avatar card */}
      <View style={styles.card}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {profile?.avatar ? (
                <Image source={{ uri: profile.avatar }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{initials}</Text>
              )}
            </View>
            <Pressable style={styles.avatarEditBtn} onPress={handleAvatarPress}>
              <Icon name="photo_camera" size={14} color={colors.white} />
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profile?.first_name} {profile?.last_name}</Text>
            <View style={styles.metaRow}>
              <Icon name="phone" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{profile?.phone}</Text>
            </View>
            {!!profile?.cin && (
              <View style={styles.metaRow}>
                <Icon name="badge" size={13} color={colors.textMuted} />
                <Text style={styles.metaTextMuted}>CIN: {profile.cin}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Profile form */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Icon name="person" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Informations personnelles</Text>
        </View>

        <View style={styles.row}>
          <FormField label="Prénom" style={{ flex: 1 }}>
            <TextInput
              value={form.first_name}
              onChangeText={(v) => setForm((f) => ({ ...f, first_name: v }))}
              style={styles.textInput}
            />
          </FormField>
          <FormField label="Nom" style={{ flex: 1 }}>
            <TextInput
              value={form.last_name}
              onChangeText={(v) => setForm((f) => ({ ...f, last_name: v }))}
              style={styles.textInput}
            />
          </FormField>
        </View>

        <FormField label="Email">
          <TextInput
            value={form.email}
            onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.textInput}
          />
        </FormField>

        <FormField label="Date de naissance">
          <TextInput
            value={form.date_of_birth}
            onChangeText={(v) => setForm((f) => ({ ...f, date_of_birth: v }))}
            placeholder="AAAA-MM-JJ"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
          />
        </FormField>

        <FormField label="CIN">
          <TextInput
            value={profile?.cin ?? ''}
            editable={false}
            style={[styles.textInput, styles.textInputDisabled]}
          />
        </FormField>

        {success && (
          <View style={styles.successBox}>
            <Icon name="check_circle" size={16} color={colors.success} />
            <Text style={styles.successText}>Profil mis à jour avec succès !</Text>
          </View>
        )}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <>
              <Icon name="save" size={17} color={colors.white} />
              <Text style={styles.saveBtnText}>Sauvegarder</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Password change */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Icon name="lock" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Changer le mot de passe</Text>
        </View>

        <FormField label="Ancien mot de passe">
          <TextInput
            value={pwForm.old_password}
            onChangeText={(v) => setPwForm((f) => ({ ...f, old_password: v }))}
            secureTextEntry
            style={styles.textInput}
          />
        </FormField>

        <FormField label="Nouveau mot de passe">
          <TextInput
            value={pwForm.new_password}
            onChangeText={(v) => setPwForm((f) => ({ ...f, new_password: v }))}
            secureTextEntry
            style={styles.textInput}
          />
        </FormField>

        {pwSuccess && (
          <View style={styles.successBox}>
            <Icon name="check_circle" size={16} color={colors.success} />
            <Text style={styles.successText}>Mot de passe modifié !</Text>
          </View>
        )}
        {pwError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{pwError}</Text>
          </View>
        )}

        <Pressable style={styles.saveBtn} onPress={handlePasswordChange} disabled={pwSaving}>
          {pwSaving ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <>
              <Icon name="key" size={17} color={colors.white} />
              <Text style={styles.saveBtnText}>Modifier le mot de passe</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Logout */}
      <Pressable style={styles.logoutBtn} onPress={confirmLogout}>
        <Icon name="logout" size={18} color={colors.error} />
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </Pressable>
    </ScrollView>
  )
}

function FormField({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },

  card: {
    backgroundColor: colors.surfaceLowest, borderRadius: 16,
    borderWidth: 1, borderColor: colors.outlineVariant, padding: 16, gap: 14,
  },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 72, height: 72, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 22, fontWeight: '700', color: colors.white },
  avatarEditBtn: {
    position: 'absolute', bottom: -4, right: -4, width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.surfaceLowest,
  },
  profileName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  metaText: { fontSize: 13, color: colors.textSecondary },
  metaTextMuted: { fontSize: 12, color: colors.textMuted },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  row: { flexDirection: 'row', gap: 12 },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  textInput: {
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.textPrimary,
    backgroundColor: colors.surfaceLowest,
  },
  textInputDisabled: { backgroundColor: colors.surface, color: colors.textMuted },

  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.successBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  successText: { fontSize: 13, color: '#15803d' },
  errorBox: { backgroundColor: colors.errorBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  errorText: { fontSize: 13, color: colors.errorText },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 12,
  },
  saveBtnText: { color: colors.white, fontWeight: '600', fontSize: 14 },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#fecaca', backgroundColor: colors.errorBg,
    paddingVertical: 14, borderRadius: 14,
  },
  logoutText: { color: colors.error, fontWeight: '600', fontSize: 14 },
})