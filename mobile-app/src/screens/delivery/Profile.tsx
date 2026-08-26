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
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
import { getInstallationDeviceId } from '../../services/pushRegistration'
import { useAuthStore } from '../../store/authStore'

const brand = {
  navy: '#0B1B63',
  blue: '#0D4EEB',
  blueBright: '#168BEE',
  cyan: '#18C7D9',
  blueSoft: '#EEF5FF',
  cyanSoft: '#E8FAFC',
  surface: '#F7FAFF',
  white: '#FFFFFF',
  text: '#0C1C4C',
  textSecondary: '#667085',
  textMuted: '#98A2B3',
  border: '#E7EDF7',
  success: '#15803D',
  successBg: '#EAF8EF',
  warning: '#A16207',
  warningBg: '#FFF7DF',
  error: '#DC2626',
  errorBg: '#FFF0EF',
  neutralBg: '#F1F4F8',
} as const

function workStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return 'Actif'
    case 'suspended':
      return 'Suspendu'
    default:
      return 'Statut indisponible'
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  return `${day}/${month}/${year}`
}

interface DetailRowProps {
  icon: string
  label: string
  value: string
  last?: boolean
}

function DetailRow({
  icon,
  label,
  value,
  last = false,
}: DetailRowProps) {
  return (
    <View
      style={[
        styles.detailRow,
        !last && styles.detailRowBorder,
      ]}
    >
      <View style={styles.detailIcon}>
        <Icon
          name={icon}
          size={20}
          color={brand.navy}
        />
      </View>

      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>
          {label}
        </Text>

        <Text style={styles.detailValue}>
          {value}
        </Text>
      </View>
    </View>
  )
}

export default function DeliveryProfile() {
  const insets = useSafeAreaInsets()

  const logout = useAuthStore((state) => state.logout)
  const refreshToken = useAuthStore((state) => state.refreshToken)

  const [user, setUser] = useState<UserProfile | null>(null)
  const [agent, setAgent] = useState<DeliveryAgentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  const loadProfile = useCallback(async (
    isRefresh = false,
  ) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const [
        userResponse,
        agentResponse,
      ] = await Promise.all([
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
    if (loggingOut) {
      return
    }

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

      // Preserve the production courier rule:
      // local tokens are cleared only after the backend accepts logout.
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
    if (loggingOut) {
      return
    }

    Alert.alert(
      'Se déconnecter ?',
      'Vous ne pouvez pas vous déconnecter pendant une livraison active.',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
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
        <StatusBar style="light" />

        <View
          pointerEvents="none"
          style={[
            styles.statusBarGuard,
            { height: insets.top },
          ]}
        />

        <ActivityIndicator
          size="large"
          color={brand.blue}
        />

        <Text style={styles.centerStateText}>
          Chargement de votre profil…
        </Text>
      </View>
    )
  }

  const displayName = (
    user?.full_name?.trim()
    || [user?.first_name, user?.last_name]
      .filter(Boolean)
      .join(' ')
    || 'Compte livreur'
  )

  const displayPhone = (
    user?.phone?.trim()
    || 'Téléphone non renseigné'
  )

  const isOnline = Boolean(agent?.is_online)
  const canWork = Boolean(agent?.can_work)
  const isSuspended = agent?.work_status === 'suspended'

  const statusLabel = agent
    ? workStatusLabel(agent.work_status)
    : 'Statut indisponible'

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View
        pointerEvents="none"
        style={[
          styles.statusBarGuard,
          { height: insets.top },
        ]}
      />

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
            tintColor={brand.blue}
            colors={[brand.blue]}
          />
        }
      >
        <LinearGradient
          colors={[
            brand.navy,
            brand.blue,
            brand.blueBright,
            brand.cyan,
          ]}
          locations={[0, 0.35, 0.72, 1]}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: 0.9 }}
          style={styles.hero}
        >
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>
              Compte livreur
            </Text>

            <Text style={styles.title}>
              Mon profil
            </Text>

            <Text style={styles.subtitle}>
              Consultez vos informations et le statut de votre compte livreur.
            </Text>
          </View>

          <View style={styles.heroIcon}>
            <Icon
              name="person"
              size={32}
              color={brand.blue}
            />
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {error ? (
            <Pressable
              style={styles.errorCard}
              onPress={() => {
                void loadProfile()
              }}
            >
              <Icon
                name="error"
                size={20}
                color={brand.error}
              />

              <View style={styles.flex}>
                <Text style={styles.errorTitle}>
                  Impossible de charger le profil
                </Text>
                <Text style={styles.errorText}>
                  {error}
                </Text>
                <Text style={styles.retryText}>
                  Appuyez pour réessayer
                </Text>
              </View>
            </Pressable>
          ) : null}

          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Icon
                name="person"
                size={42}
                color={brand.blue}
              />
            </View>

            <View style={styles.profileText}>
              <Text
                style={styles.profileName}
                numberOfLines={1}
              >
                {displayName}
              </Text>

              <Text
                style={styles.profilePhone}
                numberOfLines={1}
              >
                {displayPhone}
              </Text>

              <View
                style={[
                  styles.accountBadge,
                  isSuspended
                    ? styles.accountBadgeSuspended
                    : styles.accountBadgeActive,
                ]}
              >
                <Icon
                  name={
                    isSuspended
                      ? 'warning'
                      : 'verified'
                  }
                  size={16}
                  color={
                    isSuspended
                      ? brand.error
                      : brand.success
                  }
                />

                <Text
                  style={[
                    styles.accountBadgeText,
                    {
                      color: isSuspended
                        ? brand.error
                        : brand.success,
                    },
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>
            Statut livreur
          </Text>

          <View style={styles.statusRow}>
            <View style={styles.statusCard}>
              <View
                style={[
                  styles.statusIcon,
                  {
                    backgroundColor: isOnline
                      ? brand.successBg
                      : brand.neutralBg,
                  },
                ]}
              >
                <Icon
                  name={
                    isOnline
                      ? 'radio_button_checked'
                      : 'radio_button_unchecked'
                  }
                  size={24}
                  color={
                    isOnline
                      ? brand.success
                      : brand.textMuted
                  }
                />
              </View>

              <Text style={styles.statusValue}>
                {isOnline
                  ? 'En ligne'
                  : 'Hors ligne'}
              </Text>

              <Text style={styles.statusLabel}>
                Disponibilité actuelle
              </Text>
            </View>

            <View style={styles.statusCard}>
              <View
                style={[
                  styles.statusIcon,
                  {
                    backgroundColor: canWork
                      ? brand.successBg
                      : (
                        isSuspended
                          ? brand.errorBg
                          : brand.neutralBg
                      ),
                  },
                ]}
              >
                <Icon
                  name={
                    canWork
                      ? 'task_alt'
                      : (
                        isSuspended
                          ? 'block'
                          : 'hourglass_top'
                      )
                  }
                  size={24}
                  color={
                    canWork
                      ? brand.success
                      : (
                        isSuspended
                          ? brand.error
                          : brand.textMuted
                      )
                  }
                />
              </View>

              <Text style={styles.statusValue}>
                {canWork
                  ? 'Autorisé'
                  : 'Indisponible'}
              </Text>

              <Text style={styles.statusLabel}>
                Autorisation de travailler
              </Text>
            </View>
          </View>

          <View style={styles.detailsCard}>
            <DetailRow
              icon="badge"
              label="Identifiant livreur"
              value={agent ? `#${agent.id}` : '—'}
            />

            <DetailRow
              icon="mail"
              label="Adresse e-mail"
              value={user?.email || 'Non renseignée'}
            />

            <DetailRow
              icon="event_available"
              label="Compte approuvé le"
              value={formatDate(agent?.approved_at ?? null)}
            />

            <DetailRow
              icon="location_on"
              label="Dernière position reçue"
              value={formatDate(
                agent?.location_updated_at ?? null,
              )}
              last
            />
          </View>

          {agent?.suspension_reason ? (
            <View style={styles.warningCard}>
              <View style={styles.warningIcon}>
                <Icon
                  name="warning"
                  size={21}
                  color={brand.error}
                />
              </View>

              <View style={styles.flex}>
                <Text style={styles.warningTitle}>
                  Compte suspendu
                </Text>
                <Text style={styles.warningText}>
                  {agent.suspension_reason}
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.sessionSectionTitle}>
            Session
          </Text>

          <View style={styles.sessionCard}>
            <View style={styles.sessionInfo}>
              <View style={styles.sessionIcon}>
                <Icon
                  name="security"
                  size={23}
                  color={brand.navy}
                />
              </View>

              <View style={styles.flex}>
                <Text style={styles.sessionTitle}>
                  Déconnexion sécurisée
                </Text>

                <Text style={styles.sessionDescription}>
                  Une livraison active doit être terminée avant de pouvoir fermer la session.
                </Text>
              </View>
            </View>

            {logoutError ? (
              <View style={styles.logoutErrorCard}>
                <Icon
                  name="error"
                  size={17}
                  color={brand.error}
                />
                <Text style={styles.logoutErrorText}>
                  {logoutError}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.logoutButton,
                loggingOut && styles.logoutButtonDisabled,
                pressed
                && !loggingOut
                && styles.logoutButtonPressed,
              ]}
              onPress={confirmLogout}
              disabled={loggingOut}
              accessibilityRole="button"
              accessibilityLabel="Se déconnecter"
            >
              {loggingOut ? (
                <ActivityIndicator
                  size="small"
                  color={brand.error}
                />
              ) : (
                <Icon
                  name="logout"
                  size={21}
                  color={brand.error}
                />
              )}

              <Text style={styles.logoutText}>
                {loggingOut
                  ? 'Déconnexion…'
                  : 'Se déconnecter'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.versionText}>
            PharmAI Delivery
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  root: {
    flex: 1,
    backgroundColor: brand.surface,
  },

  statusBarGuard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: brand.navy,
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: brand.surface,
  },

  centerStateText: {
    fontSize: 14,
    color: brand.textSecondary,
    textAlign: 'center',
  },

  screen: {
    flex: 1,
    backgroundColor: brand.surface,
  },

  content: {
    paddingBottom: 34,
  },

  hero: {
    minHeight: 330,
    paddingTop: 58,
    paddingHorizontal: 24,
    paddingBottom: 76,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },

  heroText: {
    flex: 1,
    paddingRight: 4,
  },

  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7FE7F0',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },

  title: {
    marginTop: 10,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    color: brand.white,
    letterSpacing: -0.6,
  },

  subtitle: {
    marginTop: 15,
    maxWidth: 300,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.92)',
  },

  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 21,
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.white,
    shadowColor: '#071445',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 5,
  },

  body: {
    paddingHorizontal: 20,
    marginTop: -64,
  },

  errorCard: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: brand.errorBg,
  },

  errorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: brand.error,
  },

  errorText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: brand.error,
  },

  retryText: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '800',
    color: brand.blue,
  },

  profileCard: {
    minHeight: 168,
    padding: 22,
    borderRadius: 29,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.08,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowRadius: 18,
    elevation: 4,
  },

  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.blueSoft,
  },

  profileText: {
    flex: 1,
    minWidth: 0,
  },

  profileName: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: brand.navy,
  },

  profilePhone: {
    marginTop: 5,
    fontSize: 13,
    color: brand.textSecondary,
  },

  accountBadge: {
    alignSelf: 'flex-start',
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },

  accountBadgeActive: {
    backgroundColor: brand.successBg,
  },

  accountBadgeSuspended: {
    backgroundColor: brand.errorBg,
  },

  accountBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },

  sectionTitle: {
    marginTop: 30,
    marginBottom: 14,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: brand.navy,
  },

  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },

  statusCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 154,
    padding: 17,
    borderRadius: 25,
    justifyContent: 'space-between',
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.05,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowRadius: 13,
    elevation: 2,
  },

  statusIcon: {
    width: 43,
    height: 43,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusValue: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: '900',
    color: brand.navy,
  },

  statusLabel: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 16,
    color: brand.textSecondary,
  },

  detailsCard: {
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 27,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.055,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowRadius: 14,
    elevation: 3,
  },

  detailRow: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },

  detailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
  },

  detailIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.blueSoft,
  },

  detailText: {
    flex: 1,
    minWidth: 0,
  },

  detailLabel: {
    fontSize: 11,
    color: brand.textSecondary,
  },

  detailValue: {
    marginTop: 5,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: brand.navy,
  },

  warningCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    backgroundColor: brand.errorBg,
  },

  warningIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.white,
  },

  warningTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: brand.error,
  },

  warningText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: brand.error,
  },

  sessionSectionTitle: {
    marginTop: 30,
    marginBottom: 14,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: brand.navy,
  },

  sessionCard: {
    padding: 18,
    borderRadius: 27,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.055,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowRadius: 14,
    elevation: 3,
  },

  sessionInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  sessionIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.blueSoft,
  },

  sessionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: brand.navy,
  },

  sessionDescription: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: brand.textSecondary,
  },

  logoutErrorCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: brand.errorBg,
  },

  logoutErrorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: brand.error,
  },

  logoutButton: {
    marginTop: 17,
    minHeight: 57,
    paddingHorizontal: 16,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: brand.white,
  },

  logoutButtonDisabled: {
    opacity: 0.5,
  },

  logoutButtonPressed: {
    backgroundColor: '#FFF8F8',
  },

  logoutText: {
    fontSize: 14,
    fontWeight: '900',
    color: brand.error,
  },

  versionText: {
    marginTop: 22,
    marginBottom: 6,
    fontSize: 12,
    color: brand.textMuted,
    textAlign: 'center',
  },
})
