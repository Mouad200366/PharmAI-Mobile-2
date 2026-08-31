import { useCallback, useMemo, useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AlertButton,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import {
  useFocusEffect,
} from '@react-navigation/native'
import type {
  CompositeScreenProps,
} from '@react-navigation/native'
import type {
  BottomTabScreenProps,
} from '@react-navigation/bottom-tabs'
import type {
  NativeStackScreenProps,
} from '@react-navigation/native-stack'

import {
  usersApi,
  type AvatarUpload,
  type Gender,
  type UserProfile,
} from '../../api/users'
import {
  authApi,
} from '../../api/auth'
import {
  firstError,
} from '../../api/errors'
import {
  isActiveOrder,
  ordersApi,
} from '../../api/orders'
import Icon from '../../components/ui/Icon'
import type {
  AppTabParamList,
  MainStackParamList,
} from '../../navigation/types'
import {
  useAuthStore,
} from '../../store/authStore'
import {
  getInstallationDeviceId,
} from '../../services/pushRegistration'
import {
  colors,
} from '../../theme/colors'

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Profile'>,
  NativeStackScreenProps<MainStackParamList>
>

type ProfileForm = {
  first_name: string
  last_name: string
  email: string
  date_of_birth: string
  gender: Gender
}

type PasswordForm = {
  old_password: string
  new_password: string
  confirm_password: string
}

type OrderStats = {
  total: number
  delivered: number
  prescriptions: number
  active: number
}

type ProfilePanel = 'personal' | 'security' | 'payments' | null

const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const SUPPORTED_AVATAR_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
])

const GENDER_OPTIONS: {
  value: Gender
  label: string
  icon: string
}[] = [
  {
    value: 'M',
    label: 'Homme',
    icon: 'male',
  },
  {
    value: 'F',
    label: 'Femme',
    icon: 'female',
  },
]

function emptyProfileForm(): ProfileForm {
  return {
    first_name: '',
    last_name: '',
    email: '',
    date_of_birth: '',
    gender: 'M',
  }
}

function emptyPasswordForm(): PasswordForm {
  return {
    old_password: '',
    new_password: '',
    confirm_password: '',
  }
}

function profileToForm(profile: UserProfile): ProfileForm {
  return {
    first_name: profile.first_name ?? '',
    last_name: profile.last_name ?? '',
    email: profile.email ?? '',
    date_of_birth: profile.date_of_birth ?? '',
    gender: profile.gender,
  }
}

function trimmedForm(form: ProfileForm): ProfileForm {
  return {
    ...form,
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    email: form.email.trim().toLowerCase(),
    date_of_birth: form.date_of_birth.trim(),
  }
}

function isSameForm(
  left: ProfileForm,
  right: ProfileForm,
) {
  const a = trimmedForm(left)
  const b = trimmedForm(right)

  return (
    a.first_name === b.first_name
    && a.last_name === b.last_name
    && a.email === b.email
    && a.date_of_birth === b.date_of_birth
    && a.gender === b.gender
  )
}

function validateDateOfBirth(value: string) {
  if (!value) {
    return 'La date de naissance est obligatoire.'
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Utilisez le format AAAA-MM-JJ.'
  }

  const [yearText, monthText, dayText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  const date = new Date(
    Date.UTC(year, month - 1, day),
  )

  const isRealDate = (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  )

  if (!isRealDate) {
    return 'Cette date de naissance est invalide.'
  }

  const today = new Date()
  const todayUtc = new Date(
    Date.UTC(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ),
  )

  if (date > todayUtc) {
    return 'La date de naissance ne peut pas être dans le futur.'
  }

  if (year < 1900) {
    return 'Veuillez vérifier la date de naissance.'
  }

  return null
}

function validateEmail(value: string) {
  if (!value) {
    return null
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  return valid
    ? null
    : "L'adresse e-mail n'est pas valide."
}

function getProfileValidation(form: ProfileForm) {
  const normalized = trimmedForm(form)
  const errors: Partial<Record<keyof ProfileForm, string>> = {}

  if (!normalized.first_name) {
    errors.first_name = 'Le prénom est obligatoire.'
  }

  if (!normalized.last_name) {
    errors.last_name = 'Le nom est obligatoire.'
  }

  const emailError = validateEmail(normalized.email)

  if (emailError) {
    errors.email = emailError
  }

  const dateError = validateDateOfBirth(
    normalized.date_of_birth,
  )

  if (dateError) {
    errors.date_of_birth = dateError
  }

  return errors
}

function getPasswordValidation(form: PasswordForm) {
  const errors: Partial<Record<keyof PasswordForm, string>> = {}

  if (!form.old_password) {
    errors.old_password = "Saisissez votre mot de passe actuel."
  }

  if (!form.new_password) {
    errors.new_password = 'Saisissez un nouveau mot de passe.'
  } else if (form.new_password.length < 8) {
    errors.new_password = 'Utilisez au moins 8 caractères.'
  } else if (form.new_password === form.old_password) {
    errors.new_password = (
      'Le nouveau mot de passe doit être différent de l’ancien.'
    )
  }

  if (!form.confirm_password) {
    errors.confirm_password = 'Confirmez le nouveau mot de passe.'
  } else if (
    form.new_password
    && form.confirm_password !== form.new_password
  ) {
    errors.confirm_password = 'Les mots de passe ne correspondent pas.'
  }

  return errors
}

function getFileExtension(uri: string) {
  const cleanUri = uri.split('?')[0]
  const lastPart = cleanUri.split('.').pop()?.toLowerCase()

  if (
    lastPart === 'jpg'
    || lastPart === 'jpeg'
    || lastPart === 'png'
    || lastPart === 'webp'
  ) {
    return lastPart
  }

  return 'jpg'
}

function getMimeType(extension: string) {
  if (extension === 'png') {
    return 'image/png'
  }

  if (extension === 'webp') {
    return 'image/webp'
  }

  return 'image/jpeg'
}

function createAvatarUpload(
  asset: ImagePicker.ImagePickerAsset,
): AvatarUpload {
  const extension = getFileExtension(asset.uri)

  return {
    uri: asset.uri,
    name:
      asset.fileName
      || `avatar-${Date.now()}.${extension}`,
    type:
      asset.mimeType
      || getMimeType(extension),
  }
}

function formatMemberSince(dateString: string) {
  const date = new Date(dateString)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toLocaleDateString('fr-MA', {
    month: 'long',
    year: 'numeric',
  })
}

export default function Profile({
  navigation,
}: Props) {
  const logout = useAuthStore((state) => state.logout)
  const refreshToken = useAuthStore(
    (state) => state.refreshToken,
  )

  const [
    profile,
    setProfile,
  ] = useState<UserProfile | null>(null)

  const [
    form,
    setForm,
  ] = useState<ProfileForm>(emptyProfileForm)

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const [
    loadError,
    setLoadError,
  ] = useState<string | null>(null)

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    saveError,
    setSaveError,
  ] = useState<string | null>(null)

  const [
    saveSuccess,
    setSaveSuccess,
  ] = useState<string | null>(null)

  const [
    avatarBusy,
    setAvatarBusy,
  ] = useState(false)

  const [
    avatarError,
    setAvatarError,
  ] = useState<string | null>(null)

  const [
    passwordForm,
    setPasswordForm,
  ] = useState<PasswordForm>(
    emptyPasswordForm,
  )

  const [
    passwordSaving,
    setPasswordSaving,
  ] = useState(false)

  const [
    passwordError,
    setPasswordError,
  ] = useState<string | null>(null)

  const [
    passwordSuccess,
    setPasswordSuccess,
  ] = useState<string | null>(null)

  const [
    showOldPassword,
    setShowOldPassword,
  ] = useState(false)

  const [
    showNewPassword,
    setShowNewPassword,
  ] = useState(false)

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false)

  const [
    orderStats,
    setOrderStats,
  ] = useState<OrderStats | null>(null)

  const [
    openPanel,
    setOpenPanel,
  ] = useState<ProfilePanel>(null)

  const loadOrderStats = useCallback(async () => {
    try {
      const response = await ordersApi.list()
      const orders = response.data

      setOrderStats({
        total: orders.length,
        delivered: orders.filter(
          (order) => order.status === 'delivered',
        ).length,
        prescriptions: orders.filter(
          (order) => order.prescription_mode !== 'none',
        ).length,
        active: orders.filter(
          (order) => isActiveOrder(order.status),
        ).length,
      })
    } catch {
      setOrderStats(null)
    }
  }, [])

  const loadProfile = useCallback(
    async (showLoader = false) => {
      if (showLoader) {
        setLoading(true)
      }

      try {
        const response = await usersApi.me()

        setProfile(response.data)
        setForm(profileToForm(response.data))
        setLoadError(null)
        setSaveError(null)
      } catch (error) {
        setLoadError(
          firstError(error)
          || 'Impossible de charger votre profil.',
        )
      } finally {
        if (showLoader) {
          setLoading(false)
        }
      }
    },
    [],
  )

  useFocusEffect(
    useCallback(() => {
      void loadProfile(true)
      void loadOrderStats()
    }, [loadOrderStats, loadProfile]),
  )

  const normalizedForm = useMemo(
    () => trimmedForm(form),
    [form],
  )

  const profileValidation = useMemo(
    () => getProfileValidation(form),
    [form],
  )

  const passwordValidation = useMemo(
    () => getPasswordValidation(passwordForm),
    [passwordForm],
  )

  const isDirty = useMemo(() => {
    if (!profile) {
      return false
    }

    return !isSameForm(
      form,
      profileToForm(profile),
    )
  }, [form, profile])

  const hasProfileErrors = (
    Object.keys(profileValidation).length > 0
  )

  const hasPasswordErrors = (
    Object.keys(passwordValidation).length > 0
  )

  const canSave = (
    isDirty
    && !hasProfileErrors
    && !saving
  )

  const canChangePassword = (
    passwordForm.old_password.length > 0
    && passwordForm.new_password.length > 0
    && passwordForm.confirm_password.length > 0
    && !hasPasswordErrors
    && !passwordSaving
  )

  const initials = useMemo(() => {
    const first =
      profile?.first_name?.trim()?.[0] ?? ''
    const last =
      profile?.last_name?.trim()?.[0] ?? ''

    return `${first}${last}`.toUpperCase() || '?'
  }, [profile])

  const memberSince = profile
    ? formatMemberSince(profile.date_joined)
    : null

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([
      loadProfile(false),
      loadOrderStats(),
    ])
    setRefreshing(false)
  }

  function updateForm<K extends keyof ProfileForm>(
    key: K,
    value: ProfileForm[K],
  ) {
    setSaveError(null)
    setSaveSuccess(null)

    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  async function handleSave() {
    if (!profile || !canSave) {
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)

    try {
      const response = await usersApi.updateMe({
        first_name: normalizedForm.first_name,
        last_name: normalizedForm.last_name,
        email: normalizedForm.email,
        date_of_birth: normalizedForm.date_of_birth,
        gender: normalizedForm.gender,
      })

      setProfile(response.data)
      setForm(profileToForm(response.data))
      setSaveSuccess(
        'Vos informations ont été mises à jour.',
      )
    } catch (error) {
      setSaveError(
        firstError(error)
        || 'Impossible de mettre à jour le profil.',
      )
    } finally {
      setSaving(false)
    }
  }

  function resetProfileChanges() {
    if (!profile || saving) {
      return
    }

    setForm(profileToForm(profile))
    setSaveError(null)
    setSaveSuccess(null)
  }

  function showAvatarActions() {
    if (avatarBusy) {
      return
    }

    const buttons: AlertButton[] = [
      {
        text: 'Prendre une photo',
        onPress: () => {
          void takeAvatarPhoto()
        },
      },
      {
        text: 'Choisir dans la galerie',
        onPress: () => {
          void chooseAvatarPhoto()
        },
      },
    ]

    if (profile?.avatar) {
      buttons.push({
        text: 'Supprimer la photo',
        style: 'destructive',
        onPress: confirmRemoveAvatar,
      })
    }

    buttons.push({
      text: 'Annuler',
      style: 'cancel',
    })

    Alert.alert(
      'Photo de profil',
      'Choisissez comment mettre à jour votre photo.',
      buttons,
    )
  }

  async function takeAvatarPhoto() {
    if (avatarBusy) {
      return
    }

    setAvatarError(null)
    setAvatarBusy(true)

    try {
      const permission =
        await ImagePicker.requestCameraPermissionsAsync()

      if (!permission.granted) {
        setAvatarError(
          "L'accès à la caméra est nécessaire. Autorisez-le dans les réglages du téléphone.",
        )
        return
      }

      const result =
        await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          cameraType: ImagePicker.CameraType.front,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        })

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0])
      }
    } catch (error) {
      setAvatarError(
        firstError(error)
        || "Impossible d'utiliser la caméra.",
      )
    } finally {
      setAvatarBusy(false)
    }
  }

  async function chooseAvatarPhoto() {
    if (avatarBusy) {
      return
    }

    setAvatarError(null)
    setAvatarBusy(true)

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!permission.granted) {
        setAvatarError(
          "L'accès aux photos est nécessaire. Autorisez-le dans les réglages du téléphone.",
        )
        return
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
          selectionLimit: 1,
        })

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0])
      }
    } catch (error) {
      setAvatarError(
        firstError(error)
        || "Impossible d'ouvrir la galerie.",
      )
    } finally {
      setAvatarBusy(false)
    }
  }

  async function uploadAvatar(
    asset: ImagePicker.ImagePickerAsset,
  ) {
    if (
      typeof asset.fileSize === 'number'
      && asset.fileSize > MAX_AVATAR_SIZE
    ) {
      setAvatarError(
        'La photo doit faire 5 Mo maximum.',
      )
      return
    }

    const upload = createAvatarUpload(asset)

    if (!SUPPORTED_AVATAR_TYPES.has(upload.type.toLowerCase())) {
      setAvatarError(
        'Utilisez une image JPG, PNG ou WEBP.',
      )
      return
    }

    try {
      const response =
        await usersApi.uploadAvatar(upload)

      setProfile(response.data)
      setForm(profileToForm(response.data))
      setAvatarError(null)
    } catch (error) {
      setAvatarError(
        firstError(error)
        || 'Impossible de mettre à jour la photo.',
      )
    }
  }

  function confirmRemoveAvatar() {
    Alert.alert(
      'Supprimer la photo ?',
      'Vos initiales seront affichées à la place.',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void removeAvatar()
          },
        },
      ],
    )
  }

  async function removeAvatar() {
    if (avatarBusy) {
      return
    }

    setAvatarBusy(true)
    setAvatarError(null)

    try {
      const response =
        await usersApi.removeAvatar()

      setProfile(response.data)
      setForm(profileToForm(response.data))
    } catch (error) {
      setAvatarError(
        firstError(error)
        || 'Impossible de supprimer la photo.',
      )
    } finally {
      setAvatarBusy(false)
    }
  }

  async function handlePasswordChange() {
    if (!canChangePassword) {
      return
    }

    setPasswordSaving(true)
    setPasswordError(null)
    setPasswordSuccess(null)

    try {
      await authApi.passwordChange(
        passwordForm.old_password,
        passwordForm.new_password,
      )

      setPasswordForm(emptyPasswordForm())
      setShowOldPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      setPasswordSuccess(
        'Votre mot de passe a été modifié avec succès.',
      )
    } catch (error) {
      setPasswordError(
        firstError(error)
        || 'Impossible de modifier le mot de passe.',
      )
    } finally {
      setPasswordSaving(false)
    }
  }

  function confirmLogout() {
    Alert.alert(
      'Se déconnecter ?',
      'Vous devrez vous reconnecter pour accéder à votre compte.',
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
  }

  async function handleLogout() {
    try {
      if (refreshToken) {
        const deviceId = await getInstallationDeviceId()

        await authApi.logout(
          refreshToken,
          deviceId ?? undefined,
        )
      }
    } catch {
      // Logout remains best effort on the server.
      // The local session must still be cleared.
    } finally {
      logout()
    }
  }

  if (loading && !profile) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />
        <Text style={styles.loadingText}>
          Chargement de votre profil…
        </Text>
      </View>
    )
  }

  if (loadError && !profile) {
    return (
      <View style={styles.centerScreen}>
        <View style={styles.centerIcon}>
          <Icon
            name="person_off"
            size={30}
            color={colors.error}
          />
        </View>

        <Text style={styles.centerTitle}>
          Impossible de charger votre profil
        </Text>

        <Text style={styles.centerDescription}>
          {loadError}
        </Text>

        <Pressable
          style={styles.retryButton}
          onPress={() => void loadProfile(true)}
        >
          <Icon
            name="refresh"
            size={18}
            color={colors.white}
          />
          <Text style={styles.retryButtonText}>
            Réessayer
          </Text>
        </Pressable>
      </View>
    )
  }

  if (!profile) {
    return null
  }

  return (
    <ScrollView
      style={styles.mockScreen}
      contentContainerStyle={styles.mockContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefresh()}
          tintColor="#073BDF"
          colors={['#073BDF']}
        />
      }
    >
      <LinearGradient
        colors={['#00236F', '#073BDF', '#087DFF', '#10D1D0']}
        start={{ x: 0.02, y: 0 }}
        end={{ x: 1, y: 0.92 }}
        style={styles.mockHero}
      >
        <View style={styles.mockHeroOrbLarge} />
        <View style={styles.mockHeroOrbSmall} />

        <View style={styles.mockHeroTopRow}>
          <View style={styles.mockHeroCopy}>
            <Text style={styles.mockHeroTitle}>
              Mon profil
            </Text>
            <Text style={styles.mockHeroSubtitle}>
              Gérez vos informations personnelles et votre compte
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ouvrir les informations personnelles"
            style={({ pressed }) => [
              styles.mockSettingsButton,
              pressed && styles.mockPressed,
            ]}
            onPress={() =>
              setOpenPanel((current) =>
                current === 'personal'
                  ? null
                  : 'personal',
              )
            }
          >
            <Icon
              name="settings"
              size={25}
              color="#FFFFFF"
            />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.mockBody}>
        {loadError ? (
          <View style={styles.inlineWarning}>
            <Icon
              name="warning"
              size={18}
              color="#b45309"
            />
            <Text style={styles.inlineWarningText}>
              {loadError}
            </Text>
          </View>
        ) : null}

        <View style={styles.mockProfileCard}>
          <View style={styles.mockIdentityRow}>
            <Pressable
              style={styles.mockAvatarWrapper}
              onPress={showAvatarActions}
              disabled={avatarBusy}
            >
              <View style={styles.mockAvatar}>
                {profile.avatar ? (
                  <Image
                    source={{ uri: profile.avatar }}
                    style={styles.mockAvatarImage}
                  />
                ) : (
                  <Text style={styles.mockAvatarInitials}>
                    {initials}
                  </Text>
                )}

                {avatarBusy ? (
                  <View style={styles.mockAvatarBusy}>
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                    />
                  </View>
                ) : null}
              </View>

              <View style={styles.mockCameraButton}>
                <Icon
                  name="photo_camera"
                  size={17}
                  color="#FFFFFF"
                />
              </View>
            </Pressable>

            <View style={styles.mockIdentityCopy}>
              <View style={styles.mockNameRow}>
                <Text
                  style={styles.mockProfileName}
                  numberOfLines={2}
                >
                  {profile.full_name
                    || `${profile.first_name} ${profile.last_name}`.trim()}
                </Text>
                <Icon
                  name={
                    profile.is_phone_verified
                      ? 'verified'
                      : 'error_outline'
                  }
                  size={19}
                  color={
                    profile.is_phone_verified
                      ? '#0B5CFF'
                      : '#D97706'
                  }
                />
              </View>

              <View style={styles.mockPatientBadge}>
                <Icon
                  name="shield"
                  size={14}
                  color="#0B5CFF"
                />
                <Text style={styles.mockPatientBadgeText}>
                  Patient PharmAI
                </Text>
              </View>

              {profile.email ? (
                <Text
                  style={styles.mockIdentityMeta}
                  numberOfLines={1}
                >
                  {profile.email}
                </Text>
              ) : null}

              <Text style={styles.mockIdentityMeta}>
                {profile.phone}
              </Text>
            </View>

            <Icon
              name="chevron_right"
              size={25}
              color="#8491A8"
            />
          </View>

          {avatarError ? (
            <View style={styles.errorBox}>
              <Icon
                name="error_outline"
                size={17}
                color={colors.error}
              />
              <Text style={styles.errorText}>
                {avatarError}
              </Text>
            </View>
          ) : null}

          <View style={styles.mockStatsRow}>
            <ProfileStat
              icon="shopping_bag"
              value={orderStats ? String(orderStats.total) : '—'}
              title="Commandes"
              subtitle="au total"
              tint="#0B5CFF"
              background="#EEF5FF"
            />
            <ProfileStat
              icon="local_shipping"
              value={orderStats ? String(orderStats.delivered) : '—'}
              title="Livraisons"
              subtitle="réussies"
              tint="#12B981"
              background="#ECFDF5"
            />
            <ProfileStat
              icon="description"
              value={orderStats ? String(orderStats.prescriptions) : '—'}
              title="Ordonnances"
              subtitle="enregistrées"
              tint="#7C5CFC"
              background="#F3F0FF"
            />
            <ProfileStat
              icon="schedule"
              value={orderStats ? String(orderStats.active) : '—'}
              title="En cours"
              subtitle="maintenant"
              tint="#F59E0B"
              background="#FFF8E8"
            />
          </View>
        </View>

        <Text style={styles.mockSectionEyebrow}>
          COMPTE
        </Text>

        <View style={styles.mockMenuCard}>
          <ProfileMenuRow
            icon="person"
            title="Informations personnelles"
            subtitle="Gérez vos informations de profil"
            onPress={() =>
              setOpenPanel((current) =>
                current === 'personal'
                  ? null
                  : 'personal',
              )
            }
          />
          <View style={styles.mockMenuDivider} />
          <ProfileMenuRow
            icon="location_on"
            title="Mes adresses"
            subtitle="Gérez vos adresses de livraison"
            onPress={() => navigation.navigate('Addresses')}
          />
          <View style={styles.mockMenuDivider} />
          <ProfileMenuRow
            icon="lock"
            title="Sécurité & mot de passe"
            subtitle="Changez votre mot de passe"
            onPress={() =>
              setOpenPanel((current) =>
                current === 'security'
                  ? null
                  : 'security',
              )
            }
          />
          <View style={styles.mockMenuDivider} />
          <ProfileMenuRow
            icon="credit_card"
            title="Moyens de paiement"
            subtitle="Consultez les options de paiement disponibles"
            onPress={() =>
              setOpenPanel((current) =>
                current === 'payments'
                  ? null
                  : 'payments',
              )
            }
          />
        </View>

        {openPanel === 'personal' ? (
          <View style={styles.mockExpandedCard}>
            <View style={styles.mockExpandedHeader}>
              <View style={styles.mockExpandedIcon}>
                <Icon
                  name="person"
                  size={20}
                  color="#073BDF"
                />
              </View>
              <View style={styles.mockExpandedCopy}>
                <Text style={styles.mockExpandedTitle}>
                  Informations personnelles
                </Text>
                <Text style={styles.mockExpandedText}>
                  Modifiez uniquement les champs autorisés par votre compte.
                </Text>
              </View>
            </View>

            <View style={styles.nameRow}>
              <FormField
                label="Prénom"
                error={profileValidation.first_name}
                style={styles.nameField}
              >
                <TextInput
                  value={form.first_name}
                  onChangeText={(value) =>
                    updateForm('first_name', value)
                  }
                  placeholder="Votre prénom"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  textContentType="givenName"
                  style={[
                    styles.textInput,
                    profileValidation.first_name
                      && styles.textInputError,
                  ]}
                />
              </FormField>

              <FormField
                label="Nom"
                error={profileValidation.last_name}
                style={styles.nameField}
              >
                <TextInput
                  value={form.last_name}
                  onChangeText={(value) =>
                    updateForm('last_name', value)
                  }
                  placeholder="Votre nom"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  textContentType="familyName"
                  style={[
                    styles.textInput,
                    profileValidation.last_name
                      && styles.textInputError,
                  ]}
                />
              </FormField>
            </View>

            <FormField
              label="E-mail"
              optional
              error={profileValidation.email}
            >
              <View
                style={[
                  styles.inputWithIcon,
                  profileValidation.email
                    && styles.textInputError,
                ]}
              >
                <Icon
                  name="mail_outline"
                  size={18}
                  color={colors.textMuted}
                />
                <TextInput
                  value={form.email}
                  onChangeText={(value) =>
                    updateForm('email', value)
                  }
                  placeholder="exemple@email.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  style={styles.inputWithIconText}
                />
              </View>
            </FormField>

            <FormField
              label="Date de naissance"
              helper="Format : AAAA-MM-JJ"
              error={profileValidation.date_of_birth}
            >
              <View
                style={[
                  styles.inputWithIcon,
                  profileValidation.date_of_birth
                    && styles.textInputError,
                ]}
              >
                <Icon
                  name="cake"
                  size={18}
                  color={colors.textMuted}
                />
                <TextInput
                  value={form.date_of_birth}
                  onChangeText={(value) =>
                    updateForm('date_of_birth', value)
                  }
                  placeholder="2000-01-31"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  style={styles.inputWithIconText}
                />
              </View>
            </FormField>

            <FormField label="Genre">
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map((option) => {
                  const selected =
                    form.gender === option.value

                  return (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.genderOption,
                        selected
                          && styles.genderOptionSelected,
                      ]}
                      onPress={() =>
                        updateForm('gender', option.value)
                      }
                    >
                      <Icon
                        name={option.icon}
                        size={17}
                        color={
                          selected
                            ? colors.white
                            : colors.textSecondary
                        }
                      />
                      <Text
                        style={[
                          styles.genderOptionText,
                          selected
                            && styles.genderOptionTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </FormField>

            <View style={styles.readOnlyGrid}>
              <ReadOnlyField
                icon="phone"
                label="Téléphone"
                value={profile.phone}
              />
              <ReadOnlyField
                icon="badge"
                label="CIN"
                value={profile.cin}
              />
            </View>

            <View style={styles.readOnlyNotice}>
              <Icon
                name="info_outline"
                size={17}
                color={colors.textMuted}
              />
              <Text style={styles.readOnlyNoticeText}>
                Le numéro de téléphone et le CIN ne peuvent pas être modifiés depuis l’application.
              </Text>
            </View>

            {saveSuccess ? (
              <View style={styles.successBox}>
                <Icon
                  name="check_circle"
                  size={17}
                  color={colors.success}
                />
                <Text style={styles.successText}>
                  {saveSuccess}
                </Text>
              </View>
            ) : null}

            {saveError ? (
              <View style={styles.errorBox}>
                <Icon
                  name="error_outline"
                  size={17}
                  color={colors.error}
                />
                <Text style={styles.errorText}>
                  {saveError}
                </Text>
              </View>
            ) : null}

            {isDirty ? (
              <View style={styles.unsavedNotice}>
                <Icon
                  name="edit_note"
                  size={18}
                  color="#b45309"
                />
                <Text style={styles.unsavedNoticeText}>
                  Vous avez des modifications non enregistrées.
                </Text>
              </View>
            ) : null}

            <View style={styles.formActions}>
              <Pressable
                style={[
                  styles.resetButton,
                  (!isDirty || saving)
                    && styles.disabledButton,
                ]}
                onPress={resetProfileChanges}
                disabled={!isDirty || saving}
              >
                <Text
                  style={[
                    styles.resetButtonText,
                    (!isDirty || saving)
                      && styles.disabledButtonText,
                  ]}
                >
                  Annuler
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.saveButton,
                  !canSave && styles.primaryButtonDisabled,
                ]}
                onPress={() => void handleSave()}
                disabled={!canSave}
              >
                {saving ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.white}
                  />
                ) : (
                  <Icon
                    name="save"
                    size={18}
                    color={colors.white}
                  />
                )}
                <Text style={styles.saveButtonText}>
                  Enregistrer
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {openPanel === 'security' ? (
          <View style={styles.mockExpandedCard}>
            <View style={styles.mockExpandedHeader}>
              <View style={styles.mockExpandedIcon}>
                <Icon
                  name="lock"
                  size={20}
                  color="#073BDF"
                />
              </View>
              <View style={styles.mockExpandedCopy}>
                <Text style={styles.mockExpandedTitle}>
                  Sécurité & mot de passe
                </Text>
                <Text style={styles.mockExpandedText}>
                  Utilisez un mot de passe unique pour votre compte PharmAI.
                </Text>
              </View>
            </View>

            <PasswordField
              label="Mot de passe actuel"
              value={passwordForm.old_password}
              onChangeText={(value) => {
                setPasswordError(null)
                setPasswordSuccess(null)
                setPasswordForm((current) => ({
                  ...current,
                  old_password: value,
                }))
              }}
              visible={showOldPassword}
              onToggleVisible={() =>
                setShowOldPassword((current) => !current)
              }
              error={
                passwordForm.old_password.length > 0
                  ? passwordValidation.old_password
                  : undefined
              }
              autoComplete="current-password"
            />

            <PasswordField
              label="Nouveau mot de passe"
              value={passwordForm.new_password}
              onChangeText={(value) => {
                setPasswordError(null)
                setPasswordSuccess(null)
                setPasswordForm((current) => ({
                  ...current,
                  new_password: value,
                }))
              }}
              visible={showNewPassword}
              onToggleVisible={() =>
                setShowNewPassword((current) => !current)
              }
              error={
                passwordForm.new_password.length > 0
                  ? passwordValidation.new_password
                  : undefined
              }
              helper="8 caractères minimum."
              autoComplete="new-password"
            />

            <PasswordField
              label="Confirmer le nouveau mot de passe"
              value={passwordForm.confirm_password}
              onChangeText={(value) => {
                setPasswordError(null)
                setPasswordSuccess(null)
                setPasswordForm((current) => ({
                  ...current,
                  confirm_password: value,
                }))
              }}
              visible={showConfirmPassword}
              onToggleVisible={() =>
                setShowConfirmPassword((current) => !current)
              }
              error={
                passwordForm.confirm_password.length > 0
                  ? passwordValidation.confirm_password
                  : undefined
              }
              autoComplete="new-password"
            />

            {passwordSuccess ? (
              <View style={styles.successBox}>
                <Icon
                  name="check_circle"
                  size={17}
                  color={colors.success}
                />
                <Text style={styles.successText}>
                  {passwordSuccess}
                </Text>
              </View>
            ) : null}

            {passwordError ? (
              <View style={styles.errorBox}>
                <Icon
                  name="error_outline"
                  size={17}
                  color={colors.error}
                />
                <Text style={styles.errorText}>
                  {passwordError}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.passwordButton,
                !canChangePassword
                  && styles.primaryButtonDisabled,
              ]}
              onPress={() => void handlePasswordChange()}
              disabled={!canChangePassword}
            >
              {passwordSaving ? (
                <ActivityIndicator
                  size="small"
                  color={colors.white}
                />
              ) : (
                <Icon
                  name="key"
                  size={18}
                  color={colors.white}
                />
              )}
              <Text style={styles.passwordButtonText}>
                Modifier le mot de passe
              </Text>
            </Pressable>
          </View>
        ) : null}

        {openPanel === 'payments' ? (
          <View style={styles.mockPaymentInfo}>
            <View style={styles.mockPaymentIcon}>
              <Icon
                name="credit_card"
                size={22}
                color="#073BDF"
              />
            </View>
            <View style={styles.mockPaymentCopy}>
              <Text style={styles.mockPaymentTitle}>
                Paiement au moment de la commande
              </Text>
              <Text style={styles.mockPaymentText}>
                PharmAI vous laisse choisir le moyen de paiement disponible pendant le checkout. Aucune carte bancaire enregistrée n’est affichée ici.
              </Text>
            </View>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.mockLogoutCard,
            pressed && styles.mockPressed,
          ]}
          onPress={confirmLogout}
        >
          <View style={styles.mockLogoutIcon}>
            <Icon
              name="power_settings_new"
              size={25}
              color="#EF3340"
            />
          </View>
          <View style={styles.mockLogoutCopy}>
            <Text style={styles.mockLogoutTitle}>
              Se déconnecter
            </Text>
            <Text style={styles.mockLogoutText}>
              Déconnectez-vous de votre compte PharmAI
            </Text>
          </View>
          <Icon
            name="chevron_right"
            size={24}
            color="#8491A8"
          />
        </Pressable>
      </View>
    </ScrollView>
  )
}


function ProfileStat({
  icon,
  value,
  title,
  subtitle,
  tint,
  background,
}: {
  icon: string
  value: string
  title: string
  subtitle: string
  tint: string
  background: string
}) {
  return (
    <View style={styles.mockStatCard}>
      <View
        style={[
          styles.mockStatIcon,
          { backgroundColor: background },
        ]}
      >
        <Icon
          name={icon}
          size={17}
          color={tint}
        />
      </View>
      <Text style={styles.mockStatValue}>
        {value}
      </Text>
      <Text
        style={styles.mockStatTitle}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text
        style={styles.mockStatSubtitle}
        numberOfLines={1}
      >
        {subtitle}
      </Text>
    </View>
  )
}

function ProfileMenuRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: string
  title: string
  subtitle: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.mockMenuRow,
        pressed && styles.mockPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.mockMenuIcon}>
        <Icon
          name={icon}
          size={22}
          color="#0B5CFF"
        />
      </View>
      <View style={styles.mockMenuCopy}>
        <Text style={styles.mockMenuTitle}>
          {title}
        </Text>
        <Text style={styles.mockMenuSubtitle}>
          {subtitle}
        </Text>
      </View>
      <Icon
        name="chevron_right"
        size={24}
        color="#8491A8"
      />
    </Pressable>
  )
}


function FormField({
  label,
  children,
  error,
  helper,
  optional = false,
  style,
}: {
  label: string
  children: React.ReactNode
  error?: string
  helper?: string
  optional?: boolean
  style?: object
}) {
  return (
    <View style={[styles.formField, style]}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>
          {label}
        </Text>

        {optional ? (
          <Text style={styles.optionalLabel}>
            Facultatif
          </Text>
        ) : null}
      </View>

      {children}

      {error ? (
        <View style={styles.fieldMessageRow}>
          <Icon
            name="error_outline"
            size={14}
            color={colors.error}
          />
          <Text style={styles.fieldError}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text style={styles.fieldHelper}>
          {helper}
        </Text>
      ) : null}
    </View>
  )
}

function PasswordField({
  label,
  value,
  onChangeText,
  visible,
  onToggleVisible,
  error,
  helper,
  autoComplete,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  visible: boolean
  onToggleVisible: () => void
  error?: string
  helper?: string
  autoComplete:
    | 'current-password'
    | 'new-password'
}) {
  return (
    <FormField
      label={label}
      error={error}
      helper={helper}
    >
      <View
        style={[
          styles.passwordInput,
          error && styles.textInputError,
        ]}
      >
        <Icon
          name="lock_outline"
          size={18}
          color={colors.textMuted}
        />

        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          style={styles.passwordInputText}
        />

        <Pressable
          style={styles.visibilityButton}
          onPress={onToggleVisible}
          hitSlop={8}
        >
          <Icon
            name={visible ? 'visibility_off' : 'visibility'}
            size={19}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
    </FormField>
  )
}

function ReadOnlyField({
  icon,
  label,
  value,
}: {
  icon: string
  label: string
  value: string
}) {
  return (
    <View style={styles.readOnlyField}>
      <View style={styles.readOnlyFieldHeader}>
        <Icon
          name={icon}
          size={15}
          color={colors.textMuted}
        />
        <Text style={styles.readOnlyFieldLabel}>
          {label}
        </Text>
      </View>

      <Text
        style={styles.readOnlyFieldValue}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}

function QuickLink({
  icon,
  title,
  description,
  onPress,
}: {
  icon: string
  title: string
  description: string
  onPress: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickLink,
        pressed && styles.quickLinkPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.quickLinkIcon}>
        <Icon
          name={icon}
          size={21}
          color={colors.primary}
        />
      </View>

      <View style={styles.quickLinkText}>
        <Text style={styles.quickLinkTitle}>
          {title}
        </Text>
        <Text style={styles.quickLinkDescription}>
          {description}
        </Text>
      </View>

      <Icon
        name="chevron_right"
        size={21}
        color={colors.textMuted}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({

  mockScreen: {
    flex: 1,
    backgroundColor: '#F7FAFF',
  },
  mockContent: {
    paddingBottom: 34,
  },
  mockHero: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 220,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 74,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  mockHeroOrbLarge: {
    position: 'absolute',
    right: -72,
    bottom: -110,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  mockHeroOrbSmall: {
    position: 'absolute',
    right: 122,
    top: 88,
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  mockHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  mockHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  mockHeroTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -0.7,
    color: '#FFFFFF',
  },
  mockHeroSubtitle: {
    marginTop: 8,
    maxWidth: 280,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#EAF8FF',
  },
  mockSettingsButton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  mockBody: {
    marginTop: -58,
    gap: 16,
    paddingHorizontal: 14,
  },
  mockProfileCard: {
    padding: 15,
    borderWidth: 1,
    borderColor: '#DFE8F4',
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    shadowColor: '#153B76',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 5,
  },
  mockIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mockAvatarWrapper: {
    width: 92,
    height: 92,
  },
  mockAvatar: {
    width: 92,
    height: 92,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    borderRadius: 46,
    backgroundColor: '#EAF2FF',
    shadowColor: '#0B3474',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  mockAvatarImage: {
    width: '100%',
    height: '100%',
  },
  mockAvatarInitials: {
    fontSize: 28,
    fontWeight: '900',
    color: '#073BDF',
  },
  mockAvatarBusy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,35,111,0.58)',
  },
  mockCameraButton: {
    position: 'absolute',
    right: -2,
    bottom: 0,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: 18,
    backgroundColor: '#087DFF',
  },
  mockIdentityCopy: {
    flex: 1,
    minWidth: 0,
  },
  mockNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mockProfileName: {
    flexShrink: 1,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  mockPatientBadge: {
    alignSelf: 'flex-start',
    minHeight: 29,
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: '#D4E3FF',
    borderRadius: 10,
    backgroundColor: '#F1F6FF',
  },
  mockPatientBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    color: '#0B5CFF',
  },
  mockIdentityMeta: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#526684',
  },
  mockStatsRow: {
    marginTop: 15,
    flexDirection: 'row',
    gap: 7,
  },
  mockStatCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E7EDF6',
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
  },
  mockStatIcon: {
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  mockStatValue: {
    marginTop: 5,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  mockStatTitle: {
    marginTop: 3,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '800',
    textAlign: 'center',
    color: '#34435D',
  },
  mockStatSubtitle: {
    marginTop: 1,
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: '600',
    textAlign: 'center',
    color: '#8491A8',
  },
  mockSectionEyebrow: {
    marginTop: 2,
    marginLeft: 3,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: '#71809A',
  },
  mockMenuCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DFE7F1',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    shadowColor: '#153B76',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.065,
    shadowRadius: 12,
    elevation: 3,
  },
  mockMenuRow: {
    minHeight: 75,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mockMenuIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#EEF5FF',
  },
  mockMenuCopy: {
    flex: 1,
    minWidth: 0,
  },
  mockMenuTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  mockMenuSubtitle: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#71809A',
  },
  mockMenuDivider: {
    height: 1,
    marginLeft: 74,
    backgroundColor: '#E8EEF6',
  },
  mockExpandedCard: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCE7F4',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  mockExpandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mockExpandedIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#EEF5FF',
  },
  mockExpandedCopy: {
    flex: 1,
    minWidth: 0,
  },
  mockExpandedTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  mockExpandedText: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#71809A',
  },
  mockPaymentInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D7E5FA',
    borderRadius: 20,
    backgroundColor: '#F8FBFF',
  },
  mockPaymentIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#EEF5FF',
  },
  mockPaymentCopy: {
    flex: 1,
    minWidth: 0,
  },
  mockPaymentTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  mockPaymentText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
    color: '#657791',
  },
  mockLogoutCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#FED2D5',
    borderRadius: 22,
    backgroundColor: '#FFF7F7',
    shadowColor: '#7F1D1D',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.035,
    shadowRadius: 8,
    elevation: 1,
  },
  mockLogoutIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#FFE8EA',
  },
  mockLogoutCopy: {
    flex: 1,
    minWidth: 0,
  },
  mockLogoutTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#EF3340',
  },
  mockLogoutText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#7E6570',
  },
  mockPressed: {
    opacity: 0.82,
    transform: [
      {
        scale: 0.995,
      },
    ],
  },

  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 38,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    paddingHorizontal: 28,
    backgroundColor: colors.surface,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  centerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorBg,
  },
  centerTitle: {
    marginTop: 3,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.textPrimary,
  },
  centerDescription: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  retryButton: {
    marginTop: 5,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  pageHeader: {
    gap: 10,
  },
  pageHeaderText: {
    gap: 3,
  },
  pageTitle: {
    fontSize: 25,
    fontWeight: '800',
    color: colors.primary,
  },
  pageSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  verifiedBadge: {
    alignSelf: 'flex-start',
    minHeight: 31,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    backgroundColor: '#ecfdf5',
  },
  unverifiedBadge: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  unverifiedBadgeText: {
    color: '#b45309',
  },
  inlineWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  inlineWarningText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#92400e',
  },
  identityCard: {
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  identityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: colors.secondary,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: 25,
    fontWeight: '800',
    color: colors.white,
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  avatarEditButton: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.secondary,
  },
  identityContent: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.white,
  },
  profileRole: {
    marginTop: 2,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#bfdbfe',
  },
  identityMeta: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  identityMetaText: {
    flexShrink: 1,
    fontSize: 11,
    color: '#e5e7eb',
  },
  identityMetaMuted: {
    fontSize: 10,
    color: '#bfdbfe',
  },
  avatarActionsRow: {
    flexDirection: 'row',
    gap: 9,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 11,
    backgroundColor: colors.white,
  },
  secondaryActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  dangerGhostAction: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: colors.errorBg,
  },
  dangerGhostActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.error,
  },
  quickLinksCard: {
    gap: 10,
  },
  quickLinksTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  quickLinksGrid: {
    gap: 9,
  },
  quickLink: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  quickLinkPressed: {
    opacity: 0.78,
  },
  quickLinkIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3ff',
  },
  quickLinkText: {
    flex: 1,
  },
  quickLinkTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  quickLinkDescription: {
    marginTop: 2,
    fontSize: 10,
    color: colors.textMuted,
  },
  card: {
    gap: 14,
    padding: 16,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3ff',
  },
  sectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionDescription: {
    fontSize: 10,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  formField: {
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nameField: {
    flex: 1,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  optionalLabel: {
    fontSize: 9,
    color: colors.textMuted,
  },
  textInput: {
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
    fontSize: 13,
    color: colors.textPrimary,
  },
  textInputError: {
    borderColor: '#fca5a5',
    backgroundColor: '#fffafa',
  },
  inputWithIcon: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  inputWithIconText: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.textPrimary,
  },
  fieldMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  fieldError: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    color: colors.error,
  },
  fieldHelper: {
    fontSize: 9,
    lineHeight: 13,
    color: colors.textMuted,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 7,
  },
  genderOption: {
    flex: 1,
    minHeight: 41,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  genderOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  genderOptionText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  genderOptionTextSelected: {
    color: colors.white,
  },
  readOnlyGrid: {
    flexDirection: 'row',
    gap: 9,
  },
  readOnlyField: {
    flex: 1,
    gap: 4,
    padding: 11,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  readOnlyFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  readOnlyFieldLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  readOnlyFieldValue: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  readOnlyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  readOnlyNoticeText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 14,
    color: colors.textMuted,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: colors.successBg,
  },
  successText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: '#15803d',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: colors.errorBg,
  },
  errorText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: colors.errorText,
  },
  unsavedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fffbeb',
  },
  unsavedNoticeText: {
    flex: 1,
    fontSize: 10,
    color: '#92400e',
  },
  formActions: {
    flexDirection: 'row',
    gap: 9,
  },
  resetButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1.4,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledButtonText: {
    color: colors.textMuted,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  passwordInput: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingLeft: 12,
    paddingRight: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  passwordInputText: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.textPrimary,
  },
  visibilityButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  passwordButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  accountCard: {
    gap: 13,
    padding: 16,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: colors.surfaceLowest,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  accountIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorBg,
  },
  accountHeaderText: {
    flex: 1,
    gap: 2,
  },
  accountTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  accountDescription: {
    fontSize: 10,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  logoutButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: colors.errorBg,
  },
  logoutButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
})