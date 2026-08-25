import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

import { authApi } from '../../api/auth'
import {
  deliveryApi,
  type DeliveryAgentProfile,
} from '../../api/delivery'
import { firstError } from '../../api/errors'
import {
  usersApi,
  type UserProfile,
} from '../../api/users'
import Icon from '../../components/ui/Icon'
import { useAuthStore } from '../../store/authStore'
import { getInstallationDeviceId } from '../../services/pushRegistration'
import { colors } from '../../theme/colors'

function workStatusLabel(status: string) {
  switch (status) {
    case 'approved':
      return 'Compte approuvé'
    case 'pending':
      return 'Validation en attente'
    case 'suspended':
      return 'Compte suspendu'
    case 'rejected':
      return 'Compte refusé'
    default:
      return status || 'Statut indisponible'
  }
}

function formatDate(value: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function DeliveryProfile() {
  const logout = useAuthStore((state) => state.logout)
  const refreshToken = useAuthStore((state) => state.refreshToken)

  const [user, setUser] = useState<UserProfile | null>(null)
  const [agent, setAgent] = useState<DeliveryAgentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  const loadProfile = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    setError('')

    try {
      const [userResponse, agentResponse] = await Promise.all([
        usersApi.me(),
        deliveryApi.me(),
      ])

      setUser(userResponse.data)
      setAgent(agentResponse.data)
    } catch (err: unknown) {
      setError(
        firstError(err)
        || 'Impossible de charger votre profil.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadProfile()
    }, [loadProfile]),
  )

  const handleLogout = useCallback(async () => {
    if (loggingOut) return

    if (!refreshToken) {
      setLogoutError(
        'Impossible de fermer correctement cette session. '
        + 'Reconnectez-vous puis réessayez.',
      )
      return
    }

    setLoggingOut(true)
    setLogoutError('')

    try {
      const deviceId = await getInstallationDeviceId()

      await authApi.logout(
        refreshToken,
        deviceId ?? undefined,
      )

      // Delivery-agent rule: local tokens are cleared only after the
      // backend accepts logout. A backend rejection therefore keeps
      // the courier authenticated during an active delivery.
      logout()
    } catch (err: unknown) {
      setLogoutError(
        firstError(err)
        || 'Impossible de vous déconnecter pour le moment.',
      )
    } finally {
      setLoggingOut(false)
    }
  }, [loggingOut, logout, refreshToken])

  const confirmLogout = useCallback(() => {
    if (loggingOut) return

    Alert.alert(
      'Se déconnecter ?',
      'Vous ne pouvez pas vous déconnecter pendant une livraison active.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Se déconnecter',
          style: 'destructive',
          onPress: () => {
            void handleLogout()
          },
        },
      ],
    )
  }, [handleLogout, loggingOut])

  if (loading && !user && !agent) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerStateText}>
          Chargement de votre profil…
        </Text>
      </View>
    )
  }

  const displayName = (
    user?.full_name?.trim()
    || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || 'Compte livreur'
  )

  const isApproved = Boolean(agent?.can_work)
  const isOnline = Boolean(agent?.is_online)

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void loadProfile(true)
          }}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Compte livreur</Text>
          <Text style={styles.title}>Mon profil</Text>
          <Text style={styles.subtitle}>
            Consultez vos informations et le statut de votre compte livreur.
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Icon name="person" size={28} color={colors.primary} />
        </View>
      </View>

      {error ? (
        <Pressable
          style={styles.errorCard}
          onPress={() => {
            void loadProfile()
          }}
        >
          <Icon name="error" size={20} color={colors.error} />
          <View style={styles.flex}>
            <Text style={styles.errorTitle}>Impossible de charger le profil</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retryText}>Appuyez pour réessayer</Text>
          </View>
        </Pressable>
      ) : null}

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Icon name="person" size={34} color={colors.primary} />
        </View>

        <View style={styles.flex}>
          <Text style={styles.profileName}>{displayName}</Text>
          {user?.phone ? (
            <Text style={styles.profilePhone}>{user.phone}</Text>
          ) : null}

          <View
            style={[
              styles.badge,
              isApproved ? styles.badgeApproved : styles.badgeNeutral,
            ]}
          >
            <Icon
              name={isApproved ? 'verified' : 'info'}
              size={15}
              color={isApproved ? colors.secondary : colors.textSecondary}
            />
            <Text
              style={[
                styles.badgeText,
                isApproved ? styles.badgeTextApproved : styles.badgeTextNeutral,
              ]}
            >
              {agent
                ? workStatusLabel(agent.work_status)
                : 'Statut indisponible'}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Statut livreur</Text>

      <View style={styles.statusRow}>
        <View style={styles.statusCard}>
          <Icon
            name={isOnline ? 'radio_button_checked' : 'radio_button_unchecked'}
            size={21}
            color={isOnline ? colors.secondary : colors.textMuted}
          />
          <Text style={styles.statusValue}>
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </Text>
          <Text style={styles.statusLabel}>Disponibilité actuelle</Text>
        </View>

        <View style={styles.statusCard}>
          <Icon
            name={isApproved ? 'task_alt' : 'hourglass_top'}
            size={21}
            color={isApproved ? colors.secondary : colors.textMuted}
          />
          <Text style={styles.statusValue}>
            {isApproved ? 'Autorisé' : 'Indisponible'}
          </Text>
          <Text style={styles.statusLabel}>Autorisation de travailler</Text>
        </View>
      </View>

      <View style={styles.detailsCard}>
        <View style={styles.detailRow}>
          <Icon name="badge" size={20} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.detailLabel}>Identifiant livreur</Text>
            <Text style={styles.detailValue}>
              {agent ? `#${agent.id}` : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <Icon name="mail" size={20} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.detailLabel}>Adresse e-mail</Text>
            <Text style={styles.detailValue}>
              {user?.email || 'Non renseignée'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <Icon name="event_available" size={20} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.detailLabel}>Compte approuvé le</Text>
            <Text style={styles.detailValue}>
              {formatDate(agent?.approved_at ?? null)}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <Icon name="location_on" size={20} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.detailLabel}>Dernière position reçue</Text>
            <Text style={styles.detailValue}>
              {formatDate(agent?.location_updated_at ?? null)}
            </Text>
          </View>
        </View>
      </View>

      {agent?.suspension_reason ? (
        <View style={styles.warningCard}>
          <Icon name="warning" size={20} color={colors.error} />
          <View style={styles.flex}>
            <Text style={styles.warningTitle}>Compte suspendu</Text>
            <Text style={styles.warningText}>{agent.suspension_reason}</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Session</Text>

      <View style={styles.sessionCard}>
        <View style={styles.sessionInfo}>
          <Icon name="security" size={21} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.sessionTitle}>Déconnexion sécurisée</Text>
            <Text style={styles.sessionDescription}>
              Une livraison active doit être terminée avant de pouvoir fermer la session.
            </Text>
          </View>
        </View>

        {logoutError ? (
          <View style={styles.logoutErrorCard}>
            <Icon name="error" size={17} color={colors.error} />
            <Text style={styles.logoutErrorText}>{logoutError}</Text>
          </View>
        ) : null}

        <Pressable
          style={[
            styles.logoutButton,
            loggingOut && styles.logoutButtonDisabled,
          ]}
          onPress={confirmLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Icon name="logout" size={20} color={colors.error} />
          )}
          <Text style={styles.logoutText}>
            {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.versionText}>PharmAI Delivery</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: colors.surface,
  },

  centerStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  screen: { flex: 1, backgroundColor: colors.surface },

  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 32,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 24,
  },

  headerText: { flex: 1 },

  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },

  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
  },

  errorCard: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: colors.errorBg,
  },

  errorTitle: { fontSize: 13, fontWeight: '700', color: colors.error },
  errorText: { marginTop: 3, fontSize: 12, lineHeight: 17, color: colors.error },
  retryText: { marginTop: 6, fontSize: 12, fontWeight: '700', color: colors.primary },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.surfaceLowest,
    marginBottom: 28,
  },

  avatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileName: { fontSize: 18, fontWeight: '800', color: colors.primary },
  profilePhone: { marginTop: 3, fontSize: 12, color: colors.textSecondary },

  badge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  badgeApproved: { backgroundColor: '#f0fdfa' },
  badgeNeutral: { backgroundColor: colors.outlineVariant },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextApproved: { color: colors.secondary },
  badgeTextNeutral: { color: colors.textSecondary },

  sectionTitle: {
    marginBottom: 12,
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },

  statusRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },

  statusCard: {
    flex: 1,
    minHeight: 108,
    borderRadius: 18,
    padding: 14,
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLowest,
  },

  statusValue: { marginTop: 8, fontSize: 14, fontWeight: '800', color: colors.primary },
  statusLabel: { marginTop: 4, fontSize: 10, lineHeight: 14, color: colors.textSecondary },

  detailsCard: {
    borderRadius: 22,
    paddingHorizontal: 16,
    marginBottom: 26,
    backgroundColor: colors.surfaceLowest,
  },

  detailRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  detailLabel: { fontSize: 10, color: colors.textSecondary },
  detailValue: { marginTop: 4, fontSize: 13, fontWeight: '700', color: colors.primary },
  divider: { height: 1, backgroundColor: colors.outlineVariant },

  warningCard: {
    marginTop: -10,
    marginBottom: 26,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: colors.errorBg,
  },

  warningTitle: { fontSize: 13, fontWeight: '800', color: colors.error },
  warningText: { marginTop: 4, fontSize: 12, lineHeight: 17, color: colors.error },

  sessionCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: colors.surfaceLowest,
  },

  sessionInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  sessionTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },
  sessionDescription: { marginTop: 4, fontSize: 11, lineHeight: 16, color: colors.textSecondary },

  logoutErrorCard: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: 12,
    padding: 10,
    backgroundColor: colors.errorBg,
  },

  logoutErrorText: { flex: 1, fontSize: 11, lineHeight: 16, color: colors.error },

  logoutButton: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  logoutButtonDisabled: { opacity: 0.55 },
  logoutText: { fontSize: 14, fontWeight: '700', color: colors.error },

  versionText: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
  },
})
