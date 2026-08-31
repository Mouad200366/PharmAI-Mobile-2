// ADDRESSES_APPROVED_MOCKUP_MAPLIBRE_V2
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  useCallback,
  useMemo,
  useState,
  useLayoutEffect,
} from 'react'
import { useFocusEffect } from '@react-navigation/native'
import type {
  NativeStackScreenProps,
} from '@react-navigation/native-stack'
import * as Location from 'expo-location'
import {
  Camera,
  Map,
  ViewAnnotation,
} from '@maplibre/maplibre-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type {
  MainStackParamList,
} from '../../navigation/types'
import {
  addressesApi,
  type Address,
  type CreateAddressPayload,
} from '../../api/addresses'
import { firstError } from '../../api/errors'
import Icon from '../../components/ui/Icon'

type Props = NativeStackScreenProps<
  MainStackParamList,
  'Addresses'
>

const LABEL_OPTIONS = [
  { value: 'Domicile', icon: 'home' },
  { value: 'Travail', icon: 'work' },
  { value: 'Clinique', icon: 'local_hospital' },
  { value: 'Autre', icon: 'location_on' },
]

const CITIES = [
  'Casablanca',
  'Rabat',
  'Marrakech',
  'Fès',
  'Tanger',
  'Agadir',
  'Meknès',
  'Oujda',
  'Martil',
]

const MAX_ADDRESSES = 5

const DEV_MAP_STYLE =
  'https://demotiles.maplibre.org/style.json'

const NAVY = '#00236f'
const BLUE = '#073bdf'
const BRIGHT_BLUE = '#087dff'
const CYAN = '#10d1d0'
const TEXT = '#0b1f4d'
const MUTED = '#6b7c96'
const BORDER = '#dfe8f4'
const SURFACE = '#f7faff'
const GREEN = '#16a34a'
const RED = '#ef233c'

interface Coordinates {
  latitude: number
  longitude: number
}

const CITY_CENTERS: Record<string, Coordinates> = {
  Casablanca: { latitude: 33.5731, longitude: -7.5898 },
  Rabat: { latitude: 34.0209, longitude: -6.8416 },
  Marrakech: { latitude: 31.6295, longitude: -7.9811 },
  Fès: { latitude: 34.0181, longitude: -5.0078 },
  Tanger: { latitude: 35.7595, longitude: -5.834 },
  Agadir: { latitude: 30.4278, longitude: -9.5981 },
  Meknès: { latitude: 33.8935, longitude: -5.5473 },
  Oujda: { latitude: 34.6814, longitude: -1.9086 },
  Martil: { latitude: 35.6166, longitude: -5.2752 },
}

function labelIcon(label: string) {
  return (
    LABEL_OPTIONS.find(
      (option) => option.value === label,
    )?.icon ?? 'location_on'
  )
}

function parseCoordinate(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : null
}

function coordinatesFromAddress(
  address: Address | null,
): Coordinates | null {
  if (!address) {
    return null
  }

  const latitude =
    parseCoordinate(address.latitude)

  const longitude =
    parseCoordinate(address.longitude)

  if (
    latitude === null ||
    longitude === null
  ) {
    return null
  }

  if (
    Math.abs(latitude) < 0.000001 &&
    Math.abs(longitude) < 0.000001
  ) {
    return null
  }

  return {
    latitude,
    longitude,
  }
}

function normalizeCoordinate(
  value: number,
) {
  return Number(
    value.toFixed(6),
  )
}

function formatCoordinates(
  coordinates: Coordinates,
) {
  return `${coordinates.latitude.toFixed(
    5,
  )}, ${coordinates.longitude.toFixed(5)}`
}


function toLngLat(
  coordinates: Coordinates,
): [number, number] {
  return [
    coordinates.longitude,
    coordinates.latitude,
  ]
}

function fromLngLat(
  lngLat: readonly [number, number],
): Coordinates {
  return {
    longitude: lngLat[0],
    latitude: lngLat[1],
  }
}

export default function Addresses({
  navigation,
}: Props) {
  const insets = useSafeAreaInsets()

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    })
  }, [navigation])

  const [
    addresses,
    setAddresses,
  ] = useState<Address[]>([])

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
  ] = useState('')

  const [
    mode,
    setMode,
  ] =
    useState<'list' | 'form'>(
      'list',
    )

  const [
    editing,
    setEditing,
  ] = useState<Address | null>(
    null,
  )

  const load =
    useCallback(async () => {
      try {
        const response =
          await addressesApi.list()

        setAddresses(
          response.data.results,
        )
        setLoadError('')
      } catch (error) {
        setLoadError(
          firstError(error) ||
            'Impossible de charger vos adresses pour le moment.',
        )
      }
    }, [])

  useFocusEffect(
    useCallback(() => {
      let active = true

      setLoading(true)

      void load().finally(() => {
        if (active) {
          setLoading(false)
        }
      })

      return () => {
        active = false
      }
    }, [load]),
  )

  const handleRefresh =
    useCallback(async () => {
      setRefreshing(true)
      await load()
      setRefreshing(false)
    }, [load])

  function openNew() {
    if (
      addresses.length >=
      MAX_ADDRESSES
    ) {
      Alert.alert(
        'Limite atteinte',
        `Vous pouvez enregistrer jusqu'à ${MAX_ADDRESSES} adresses.`,
      )
      return
    }

    setEditing(null)
    setMode('form')
  }

  function openEdit(
    address: Address,
  ) {
    setEditing(address)
    setMode('form')
  }

  function closeForm() {
    setMode('list')
    setEditing(null)
  }

  async function handleDelete(
    address: Address,
  ) {
    try {
      await addressesApi.delete(
        address.id,
      )

      await load()
    } catch (error) {
      Alert.alert(
        'Erreur',
        firstError(error) ||
          "Impossible de supprimer cette adresse pour le moment.",
      )
    }
  }

  function confirmDelete(
    address: Address,
  ) {
    Alert.alert(
      'Supprimer cette adresse ?',
      `Vous êtes sur le point de supprimer l'adresse « ${address.label} » (${address.street}). Cette action est irréversible.`,
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void handleDelete(
              address,
            )
          },
        },
      ],
    )
  }

  async function handleSetDefault(
    id: number,
  ) {
    try {
      await addressesApi.setDefault(
        id,
      )

      await load()
    } catch (error) {
      Alert.alert(
        'Erreur',
        firstError(error) ||
          "Impossible de définir cette adresse par défaut.",
      )
    }
  }

  if (mode === 'form') {
    return (
      <AddressForm
        initial={editing}
        onClose={closeForm}
        onSaved={() => {
          closeForm()
          void load()
        }}
      />
    )
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom:
              Math.max(
                insets.bottom,
                12,
              ) + 28,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={
              handleRefresh
            }
            tintColor={BLUE}
            colors={[BLUE]}
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <LinearGradient
          colors={[
            NAVY,
            BLUE,
            BRIGHT_BLUE,
            CYAN,
          ]}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: 0.9 }}
          style={[
            styles.hero,
            {
              paddingTop:
                insets.top + 12,
            },
          ]}
        >
          <View style={styles.heroRow}>
            <Pressable
              style={styles.heroBack}
              onPress={() =>
                navigation.goBack()
              }
            >
              <Icon
                name="arrow_back"
                size={21}
                color="#ffffff"
              />
            </Pressable>

            <View style={styles.heroText}>
              <Text
                style={styles.heroTitle}
              >
                Mes adresses
              </Text>

              <Text
                style={
                  styles.heroSubtitle
                }
              >
                Gérez vos adresses de
                livraison
              </Text>
            </View>

            <Pressable
              style={[
                styles.heroAdd,
                addresses.length >=
                  MAX_ADDRESSES &&
                  styles.disabled,
              ]}
              onPress={openNew}
              disabled={
                addresses.length >=
                MAX_ADDRESSES
              }
            >
              <Icon
                name="add"
                size={27}
                color="#ffffff"
              />
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.safeNotice}>
          <View
            style={
              styles.safeNoticeIcon
            }
          >
            <Icon
              name="location_on"
              size={25}
              color={BLUE}
            />
          </View>

          <View
            style={
              styles.safeNoticeText
            }
          >
            <Text
              style={
                styles.safeNoticeTitle
              }
            >
              Livraison rapide et
              sécurisée
            </Text>

            <Text
              style={
                styles.safeNoticeSubtitle
              }
            >
              Vos adresses enregistrées
              sont utilisées avec leur
              position GPS pour vos
              livraisons.
            </Text>
          </View>

          <View
            style={
              styles.safeNoticeShield
            }
          >
            <Icon
              name="verified_user"
              size={25}
              color={BLUE}
            />
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text
              style={
                styles.sectionHeadingTitle
              }
            >
              Adresses enregistrées
            </Text>

            <Text
              style={
                styles.sectionHeadingSubtitle
              }
            >
              {addresses.length} sur{' '}
              {MAX_ADDRESSES} utilisées
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator
              size="large"
              color={BLUE}
            />

            <Text
              style={styles.stateTitle}
            >
              Chargement de vos
              adresses…
            </Text>
          </View>
        ) : loadError ? (
          <View style={styles.stateCard}>
            <View
              style={
                styles.errorStateIcon
              }
            >
              <Icon
                name="cloud_off"
                size={30}
                color={RED}
              />
            </View>

            <Text
              style={styles.stateTitle}
            >
              Chargement impossible
            </Text>

            <Text
              style={styles.stateText}
            >
              {loadError}
            </Text>

            <Pressable
              style={styles.retryButton}
              onPress={() => {
                void load()
              }}
            >
              <Icon
                name="refresh"
                size={17}
                color="#ffffff"
              />

              <Text
                style={
                  styles.retryButtonText
                }
              >
                Réessayer
              </Text>
            </Pressable>
          </View>
        ) : addresses.length === 0 ? (
          <View style={styles.stateCard}>
            <View
              style={
                styles.emptyStateIcon
              }
            >
              <Icon
                name="location_off"
                size={32}
                color={BLUE}
              />
            </View>

            <Text
              style={styles.stateTitle}
            >
              Aucune adresse
              enregistrée
            </Text>

            <Text
              style={styles.stateText}
            >
              Ajoutez une adresse avec
              une position GPS pour
              pouvoir confirmer vos
              commandes.
            </Text>
          </View>
        ) : (
          <View style={styles.addressList}>
            {addresses.map(
              (address) => {
                const coordinates =
                  coordinatesFromAddress(
                    address,
                  )

                const hasCoordinates =
                  Boolean(coordinates)

                return (
                  <View
                    key={address.id}
                    style={[
                      styles.addressCard,
                      address.is_default &&
                        styles.addressCardDefault,
                    ]}
                  >
                    <View
                      style={
                        styles.addressTopRow
                      }
                    >
                      <View
                        style={
                          styles.addressLabelIcon
                        }
                      >
                        <Icon
                          name={labelIcon(
                            address.label,
                          )}
                          size={27}
                          color={BLUE}
                        />
                      </View>

                      <View
                        style={
                          styles.addressMain
                        }
                      >
                        <View
                          style={
                            styles.addressTitleRow
                          }
                        >
                          <Text
                            style={
                              styles.addressLabel
                            }
                            numberOfLines={
                              1
                            }
                          >
                            {address.label}
                          </Text>

                          {address.is_default ? (
                            <View
                              style={
                                styles.defaultBadge
                              }
                            >
                              <Text
                                style={
                                  styles.defaultBadgeText
                                }
                              >
                                Adresse par
                                défaut
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {address.is_default ? (
                          <View
                            style={
                              styles.currentBadge
                            }
                          >
                            <Text
                              style={
                                styles.currentBadgeText
                              }
                            >
                              Adresse
                              actuelle
                            </Text>
                          </View>
                        ) : null}

                        <Text
                          style={
                            styles.addressStreet
                          }
                        >
                          {address.street}
                        </Text>

                        <Text
                          style={
                            styles.addressCity
                          }
                        >
                          {address.city}
                          {address.postal_code
                            ? ` ${address.postal_code}`
                            : ''}
                        </Text>

                        <View
                          style={
                            styles.gpsLine
                          }
                        >
                          <Icon
                            name={
                              hasCoordinates
                                ? 'my_location'
                                : 'location_off'
                            }
                            size={15}
                            color={
                              hasCoordinates
                                ? GREEN
                                : '#c76a18'
                            }
                          />

                          <Text
                            style={[
                              styles.gpsLineText,
                              !hasCoordinates &&
                                styles.gpsWarningText,
                            ]}
                          >
                            {hasCoordinates
                              ? 'Position GPS enregistrée'
                              : 'Position GPS manquante'}
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        style={
                          styles.defaultSelector
                        }
                        onPress={() => {
                          if (
                            !address.is_default
                          ) {
                            void handleSetDefault(
                              address.id,
                            )
                          }
                        }}
                        accessibilityLabel={
                          address.is_default
                            ? 'Adresse par défaut'
                            : 'Définir comme adresse par défaut'
                        }
                      >
                        {address.is_default ? (
                          <View
                            style={
                              styles.defaultSelectorActive
                            }
                          >
                            <View
                              style={
                                styles.defaultSelectorInner
                              }
                            />
                          </View>
                        ) : (
                          <View
                            style={
                              styles.defaultSelectorInactive
                            }
                          />
                        )}
                      </Pressable>
                    </View>

                    <View
                      style={
                        styles.addressActions
                      }
                    >
                      <Pressable
                        style={
                          styles.addressAction
                        }
                        onPress={() =>
                          openEdit(
                            address,
                          )
                        }
                      >
                        <Icon
                          name="edit"
                          size={18}
                          color={BLUE}
                        />

                        <Text
                          style={
                            styles.addressActionEdit
                          }
                        >
                          Modifier
                        </Text>
                      </Pressable>

                      <View
                        style={
                          styles.actionDivider
                        }
                      />

                      <Pressable
                        style={
                          styles.addressAction
                        }
                        onPress={() =>
                          confirmDelete(
                            address,
                          )
                        }
                      >
                        <Icon
                          name="delete_outline"
                          size={18}
                          color={RED}
                        />

                        <Text
                          style={
                            styles.addressActionDelete
                          }
                        >
                          Supprimer
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )
              },
            )}
          </View>
        )}

        {!loadError &&
        addresses.length <
          MAX_ADDRESSES ? (
          <Pressable
            style={styles.addAddressButton}
            onPress={openNew}
          >
            <Icon
              name="add"
              size={22}
              color="#ffffff"
            />

            <Text
              style={
                styles.addAddressButtonText
              }
            >
              Ajouter une nouvelle
              adresse
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.limitCard}>
          <View
            style={styles.limitIcon}
          >
            <Icon
              name="info_outline"
              size={21}
              color={BLUE}
            />
          </View>

          <View
            style={styles.limitText}
          >
            <Text
              style={styles.limitTitle}
            >
              Adresses de livraison
            </Text>

            <Text
              style={
                styles.limitSubtitle
              }
            >
              Vous pouvez enregistrer
              jusqu’à {MAX_ADDRESSES}{' '}
              adresses avec une position
              GPS précise.
            </Text>
          </View>

          <View style={styles.limitDots}>
            {Array.from({
              length: MAX_ADDRESSES,
            }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.limitDot,
                  index <
                    addresses.length &&
                    styles.limitDotFilled,
                ]}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function AddressForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Address | null
  onClose: () => void
  onSaved: () => void
}) {
  const insets = useSafeAreaInsets()

  const initialCoordinates =
    coordinatesFromAddress(initial)

  const [
    step,
    setStep,
  ] = useState<1 | 2>(1)

  const [
    form,
    setForm,
  ] = useState({
    label:
      initial?.label ??
      'Domicile',
    street:
      initial?.street ?? '',
    city:
      initial?.city ??
      'Casablanca',
    postal_code:
      initial?.postal_code ?? '',
    is_default:
      initial?.is_default ??
      false,
  })

  const [
    coordinates,
    setCoordinates,
  ] =
    useState<Coordinates | null>(
      initialCoordinates,
    )

  const [
    locating,
    setLocating,
  ] = useState(false)

  const [
    manualMapOpen,
    setManualMapOpen,
  ] = useState(false)

  const [
    manualCoordinates,
    setManualCoordinates,
  ] =
    useState<Coordinates | null>(
      null,
    )

  const [
    manualMapKey,
    setManualMapKey,
  ] = useState(0)

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const [
    locationError,
    setLocationError,
  ] = useState('')

  const cityOptions =
    useMemo(() => {
      if (
        form.city &&
        !CITIES.includes(form.city)
      ) {
        return [
          form.city,
          ...CITIES,
        ]
      }

      return CITIES
    }, [form.city])

  function cityCenter(
    city = form.city,
  ) {
    return (
      CITY_CENTERS[city] ??
      CITY_CENTERS.Casablanca
    )
  }

  function openManualMap() {
    setError('')
    setLocationError('')

    const startCoordinates =
      coordinates ??
      cityCenter()

    setManualCoordinates(
      startCoordinates,
    )
    setManualMapKey(
      (current) =>
        current + 1,
    )
    setManualMapOpen(true)
  }

  function centerManualMapOnCity() {
    setManualCoordinates(
      cityCenter(),
    )

    setManualMapKey(
      (current) =>
        current + 1,
    )
  }

  function confirmManualLocation() {
    if (!manualCoordinates) {
      setLocationError(
        'Touchez la carte pour choisir précisément la position de cette adresse.',
      )
      return
    }

    setCoordinates(
      manualCoordinates,
    )
    setManualMapOpen(false)
    setLocationError('')
  }

  function cancelManualLocation() {
    setManualMapOpen(false)
    setManualCoordinates(null)
  }

  function selectCity(
    city: string,
  ) {
    if (
      city === form.city
    ) {
      return
    }

    setForm(
      (current) => ({
        ...current,
        city,
      }),
    )
    setCoordinates(null)
    setManualCoordinates(null)
    setManualMapOpen(false)
    setLocationError(
      `La ville a été changée vers ${city}. Utilisez votre position actuelle ou ajustez la position sur la carte.`,
    )
  }

  async function useCurrentLocation() {
    setError('')
    setLocationError('')
    setLocating(true)

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync()

      if (
        permission.status !==
        Location.PermissionStatus.GRANTED
      ) {
        setLocationError(
          "L'autorisation de localisation est nécessaire pour enregistrer une adresse de livraison précise.",
        )
        return
      }

      const position =
        await Location.getCurrentPositionAsync(
          {
            accuracy:
              Location.Accuracy.High,
          },
        )

      const nextCoordinates = {
        latitude:
          position.coords.latitude,
        longitude:
          position.coords.longitude,
      }

      setCoordinates(
        nextCoordinates,
      )
      setManualMapOpen(false)
      setManualCoordinates(null)

      try {
        const results =
          await Location.reverseGeocodeAsync(
            nextCoordinates,
          )

        const result =
          results[0]

        if (result) {
          const street = [
            result.streetNumber,
            result.street ??
              result.name,
          ]
            .filter(Boolean)
            .join(' ')
            .trim()

          const city =
            result.city ??
            result.district ??
            result.subregion

          setForm(
            (current) => ({
              ...current,
              street:
                current.street.trim() ||
                street ||
                current.street,
              city:
                city ||
                current.city,
              postal_code:
                current.postal_code.trim() ||
                result.postalCode ||
                current.postal_code,
            }),
          )
        }
      } catch {
        // GPS coordinates remain valid if reverse geocoding is unavailable.
      }
    } catch {
      setLocationError(
        "Impossible d'obtenir votre position. Activez le GPS puis réessayez.",
      )
    } finally {
      setLocating(false)
    }
  }

  function validateStepOne() {
    setError('')

    if (!form.street.trim()) {
      setError(
        'Veuillez saisir la rue et le numéro.',
      )
      return false
    }

    if (!form.city.trim()) {
      setError(
        'Veuillez sélectionner une ville.',
      )
      return false
    }

    if (!coordinates) {
      setError(
        'Ajoutez la position GPS de cette adresse avant de continuer.',
      )
      return false
    }

    return true
  }

  function continueToConfirmation() {
    if (!validateStepOne()) {
      return
    }

    setStep(2)
  }

  async function handleSubmit() {
    if (!validateStepOne()) {
      setStep(1)
      return
    }

    if (!coordinates) {
      return
    }

    setSaving(true)

    try {
      const payload:
        CreateAddressPayload = {
          label: form.label,
          street:
            form.street.trim(),
          city:
            form.city.trim(),
          postal_code:
            form.postal_code.trim() ||
            undefined,
          latitude:
            normalizeCoordinate(
              coordinates.latitude,
            ),
          longitude:
            normalizeCoordinate(
              coordinates.longitude,
            ),
          is_default:
            form.is_default,
        }

      if (initial) {
        await addressesApi.update(
          initial.id,
          payload,
        )
      } else {
        await addressesApi.create(
          payload,
        )
      }

      onSaved()
    } catch (submitError) {
      setError(
        firstError(
          submitError,
        ) ||
          'Erreur lors de la sauvegarde.',
      )
    } finally {
      setSaving(false)
    }
  }

  const previewCoordinates =
    manualMapOpen &&
    manualCoordinates
      ? manualCoordinates
      : coordinates ??
        cityCenter()

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.formContent,
          {
            paddingBottom:
              Math.max(
                insets.bottom,
                12,
              ) + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        <LinearGradient
          colors={[
            NAVY,
            BLUE,
            BRIGHT_BLUE,
            CYAN,
          ]}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: 0.9 }}
          style={[
            styles.formHero,
            {
              paddingTop:
                insets.top + 12,
            },
          ]}
        >
          <View
            style={
              styles.formHeroRow
            }
          >
            <Pressable
              style={styles.heroBack}
              onPress={() => {
                if (step === 2) {
                  setStep(1)
                  setError('')
                  return
                }

                onClose()
              }}
            >
              <Icon
                name="arrow_back"
                size={21}
                color="#ffffff"
              />
            </Pressable>

            <View
              style={
                styles.formHeroText
              }
            >
              <Text
                style={
                  styles.formHeroTitle
                }
              >
                {initial
                  ? "Modifier l'adresse"
                  : 'Ajouter une adresse'}
              </Text>

              <Text
                style={
                  styles.formHeroSubtitle
                }
              >
                Étape {step} sur 2
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View
          style={
            styles.formProgressCard
          }
        >
          <View
            style={
              styles.formProgressItem
            }
          >
            <View
              style={[
                styles.formProgressCircle,
                styles.formProgressCircleActive,
              ]}
            >
              {step === 2 ? (
                <Icon
                  name="check"
                  size={16}
                  color="#ffffff"
                />
              ) : (
                <Text
                  style={
                    styles.formProgressNumberActive
                  }
                >
                  1
                </Text>
              )}
            </View>

            <Text
              style={
                styles.formProgressLabelActive
              }
            >
              Informations
            </Text>

            <View
              style={[
                styles.formProgressLine,
                step === 2 &&
                  styles.formProgressLineActive,
              ]}
            />
          </View>

          <View
            style={
              styles.formProgressItem
            }
          >
            <View
              style={[
                styles.formProgressCircle,
                step === 2 &&
                  styles.formProgressCircleActive,
              ]}
            >
              <Text
                style={[
                  styles.formProgressNumber,
                  step === 2 &&
                    styles.formProgressNumberActive,
                ]}
              >
                2
              </Text>
            </View>

            <Text
              style={[
                styles.formProgressLabel,
                step === 2 &&
                  styles.formProgressLabelActive,
              ]}
            >
              Confirmation
            </Text>
          </View>
        </View>

        {step === 1 ? (
          <>
            <View
              style={
                styles.formSectionCard
              }
            >
              <Text
                style={
                  styles.formSectionTitle
                }
              >
                Informations de
                l’adresse
              </Text>

              <Text
                style={
                  styles.fieldLabel
                }
              >
                Nom de l’adresse
              </Text>

              <View
                style={
                  styles.labelOptions
                }
              >
                {LABEL_OPTIONS.map(
                  (option) => {
                    const active =
                      form.label ===
                      option.value

                    return (
                      <Pressable
                        key={
                          option.value
                        }
                        style={[
                          styles.labelOption,
                          active &&
                            styles.labelOptionActive,
                        ]}
                        onPress={() =>
                          setForm(
                            (current) => ({
                              ...current,
                              label:
                                option.value,
                            }),
                          )
                        }
                      >
                        <Icon
                          name={
                            option.icon
                          }
                          size={17}
                          color={
                            active
                              ? BLUE
                              : '#708096'
                          }
                        />

                        <Text
                          style={[
                            styles.labelOptionText,
                            active &&
                              styles.labelOptionTextActive,
                          ]}
                        >
                          {
                            option.value
                          }
                        </Text>
                      </Pressable>
                    )
                  },
                )}
              </View>

              <Text
                style={
                  styles.fieldLabel
                }
              >
                Adresse *
              </Text>

              <View
                style={
                  styles.inputShell
                }
              >
                <Icon
                  name="location_on"
                  size={20}
                  color="#7e8ba0"
                />

                <TextInput
                  value={form.street}
                  onChangeText={(
                    value,
                  ) => {
                    setForm(
                      (current) => ({
                        ...current,
                        street:
                          value,
                      }),
                    )
                    setError('')
                  }}
                  placeholder="123 Avenue Hassan II"
                  placeholderTextColor="#99a5b6"
                  style={
                    styles.input
                  }
                  autoCapitalize="sentences"
                />
              </View>

              <View
                style={
                  styles.cityPostalRow
                }
              >
                <View
                  style={
                    styles.cityField
                  }
                >
                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    Ville *
                  </Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={
                      false
                    }
                    contentContainerStyle={
                      styles.cityChips
                    }
                  >
                    {cityOptions.map(
                      (city) => {
                        const active =
                          form.city ===
                          city

                        return (
                          <Pressable
                            key={
                              city
                            }
                            style={[
                              styles.cityChip,
                              active &&
                                styles.cityChipActive,
                            ]}
                            onPress={() =>
                              selectCity(
                                city,
                              )
                            }
                          >
                            <Text
                              style={[
                                styles.cityChipText,
                                active &&
                                  styles.cityChipTextActive,
                              ]}
                            >
                              {city}
                            </Text>
                          </Pressable>
                        )
                      },
                    )}
                  </ScrollView>
                </View>
              </View>

              <Text
                style={
                  styles.fieldLabel
                }
              >
                Code postal
              </Text>

              <View
                style={
                  styles.inputShell
                }
              >
                <Icon
                  name="markunread_mailbox"
                  size={20}
                  color="#7e8ba0"
                />

                <TextInput
                  value={
                    form.postal_code
                  }
                  onChangeText={(
                    value,
                  ) => {
                    setForm(
                      (current) => ({
                        ...current,
                        postal_code:
                          value,
                      }),
                    )
                    setError('')
                  }}
                  placeholder="20000"
                  placeholderTextColor="#99a5b6"
                  keyboardType="number-pad"
                  style={
                    styles.input
                  }
                />
              </View>
            </View>

            <View
              style={
                styles.formSectionCard
              }
            >
              <Text
                style={
                  styles.formSectionTitle
                }
              >
                Position GPS
              </Text>

              <Pressable
                style={
                  styles.currentLocationCard
                }
                onPress={() => {
                  void useCurrentLocation()
                }}
                disabled={locating}
              >
                <View
                  style={
                    styles.currentLocationIcon
                  }
                >
                  {locating ? (
                    <ActivityIndicator
                      size="small"
                      color={BLUE}
                    />
                  ) : (
                    <Icon
                      name="my_location"
                      size={24}
                      color={BLUE}
                    />
                  )}
                </View>

                <View
                  style={
                    styles.currentLocationText
                  }
                >
                  <Text
                    style={
                      styles.currentLocationTitle
                    }
                  >
                    Utiliser ma position
                    actuelle
                  </Text>

                  <Text
                    style={
                      styles.currentLocationSubtitle
                    }
                  >
                    Remplir
                    automatiquement avec
                    votre position GPS
                  </Text>
                </View>

                <View
                  style={[
                    styles.switchTrack,
                    coordinates &&
                      styles.switchTrackActive,
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      coordinates &&
                        styles.switchThumbActive,
                    ]}
                  />
                </View>
              </Pressable>

              <Text
                style={
                  styles.mapPreviewLabel
                }
              >
                Prévisualisation sur la
                carte
              </Text>

              <View
                style={
                  styles.previewMapWrap
                }
              >
                <Map
                  key={manualMapKey}
                  style={styles.map}
                  mapStyle={DEV_MAP_STYLE}
                  onPress={
                    manualMapOpen
                      ? (event) =>
                          setManualCoordinates(
                            fromLngLat(
                              event.nativeEvent.lngLat,
                            ),
                          )
                      : undefined
                  }
                  dragPan={manualMapOpen}
                  touchZoom={manualMapOpen}
                  doubleTapZoom={manualMapOpen}
                  doubleTapHoldZoom={manualMapOpen}
                  touchRotate={false}
                  touchPitch={false}
                  compass={false}
                >
                  <Camera
                    center={toLngLat(
                      previewCoordinates,
                    )}
                    zoom={manualMapOpen ? 15 : 16}
                  />

                  <ViewAnnotation
                    lngLat={toLngLat(
                      previewCoordinates,
                    )}
                    draggable={manualMapOpen}
                    onDragEnd={
                      manualMapOpen
                        ? (event) =>
                            setManualCoordinates(
                              fromLngLat(
                                event.nativeEvent.lngLat,
                              ),
                            )
                        : undefined
                    }
                  >
                    <View style={styles.mapPin}>
                      <Icon
                        name="place"
                        size={30}
                        color={BLUE}
                      />
                    </View>
                  </ViewAnnotation>
                </Map>

                <Pressable
                  style={
                    styles.adjustMapButton
                  }
                  onPress={
                    manualMapOpen
                      ? confirmManualLocation
                      : openManualMap
                  }
                >
                  <Icon
                    name={
                      manualMapOpen
                        ? 'check'
                        : 'my_location'
                    }
                    size={17}
                    color={BLUE}
                  />

                  <Text
                    style={
                      styles.adjustMapButtonText
                    }
                  >
                    {manualMapOpen
                      ? 'Confirmer la position'
                      : 'Ajuster sur la carte'}
                  </Text>
                </Pressable>
              </View>

              {manualMapOpen ? (
                <View
                  style={
                    styles.manualControls
                  }
                >
                  <Pressable
                    style={
                      styles.manualSecondaryButton
                    }
                    onPress={
                      centerManualMapOnCity
                    }
                  >
                    <Text
                      style={
                        styles.manualSecondaryButtonText
                      }
                    >
                      Centrer sur{' '}
                      {form.city}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={
                      styles.manualSecondaryButton
                    }
                    onPress={
                      cancelManualLocation
                    }
                  >
                    <Text
                      style={
                        styles.manualSecondaryButtonText
                      }
                    >
                      Annuler
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {coordinates ? (
                <View
                  style={
                    styles.coordinateSuccess
                  }
                >
                  <Icon
                    name="check_circle"
                    size={18}
                    color={GREEN}
                  />

                  <Text
                    style={
                      styles.coordinateSuccessText
                    }
                  >
                    Position GPS
                    enregistrée ·{' '}
                    {formatCoordinates(
                      coordinates,
                    )}
                  </Text>
                </View>
              ) : null}

              {locationError ? (
                <View
                  style={
                    styles.inlineWarning
                  }
                >
                  <Icon
                    name="warning"
                    size={18}
                    color="#b35a18"
                  />

                  <Text
                    style={
                      styles.inlineWarningText
                    }
                  >
                    {locationError}
                  </Text>
                </View>
              ) : null}
            </View>

            {error ? (
              <View
                style={
                  styles.formError
                }
              >
                <Icon
                  name="error_outline"
                  size={19}
                  color="#b4232f"
                />

                <Text
                  style={
                    styles.formErrorText
                  }
                >
                  {error}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={
                styles.primaryFormButton
              }
              onPress={
                continueToConfirmation
              }
            >
              <Text
                style={
                  styles.primaryFormButtonText
                }
              >
                Continuer
              </Text>

              <Icon
                name="arrow_forward"
                size={20}
                color="#ffffff"
              />
            </Pressable>
          </>
        ) : (
          <>
            <View
              style={
                styles.formSectionCard
              }
            >
              <Text
                style={
                  styles.formSectionTitle
                }
              >
                Confirmer l’adresse
              </Text>

              <View
                style={
                  styles.reviewAddressCard
                }
              >
                <View
                  style={
                    styles.reviewIcon
                  }
                >
                  <Icon
                    name={labelIcon(
                      form.label,
                    )}
                    size={25}
                    color={BLUE}
                  />
                </View>

                <View
                  style={
                    styles.reviewAddressText
                  }
                >
                  <Text
                    style={
                      styles.reviewAddressTitle
                    }
                  >
                    {form.label}
                  </Text>

                  <Text
                    style={
                      styles.reviewAddressStreet
                    }
                  >
                    {form.street}
                  </Text>

                  <Text
                    style={
                      styles.reviewAddressCity
                    }
                  >
                    {form.city}
                    {form.postal_code
                      ? ` ${form.postal_code}`
                      : ''}
                  </Text>
                </View>

                <Pressable
                  onPress={() =>
                    setStep(1)
                  }
                >
                  <Text
                    style={
                      styles.reviewEditLink
                    }
                  >
                    Modifier
                  </Text>
                </Pressable>
              </View>

              {coordinates ? (
                <View
                  style={
                    styles.reviewMapWrap
                  }
                >
                  <Map
                    style={styles.map}
                    mapStyle={DEV_MAP_STYLE}
                    dragPan={false}
                    touchZoom={false}
                    doubleTapZoom={false}
                    doubleTapHoldZoom={false}
                    touchRotate={false}
                    touchPitch={false}
                    compass={false}
                  >
                    <Camera
                      center={toLngLat(
                        coordinates,
                      )}
                      zoom={16}
                    />

                    <ViewAnnotation
                      lngLat={toLngLat(
                        coordinates,
                      )}
                    >
                      <View style={styles.mapPin}>
                        <Icon
                          name="place"
                          size={30}
                          color={BLUE}
                        />
                      </View>
                    </ViewAnnotation>
                  </Map>
                </View>
              ) : null}

              <Pressable
                style={
                  styles.defaultToggleRow
                }
                onPress={() =>
                  setForm(
                    (current) => ({
                      ...current,
                      is_default:
                        !current.is_default,
                    }),
                  )
                }
              >
                <View
                  style={
                    styles.defaultToggleText
                  }
                >
                  <Text
                    style={
                      styles.defaultToggleTitle
                    }
                  >
                    Définir comme adresse
                    par défaut
                  </Text>

                  <Text
                    style={
                      styles.defaultToggleSubtitle
                    }
                  >
                    Elle sera
                    présélectionnée lors
                    de vos prochaines
                    commandes.
                  </Text>
                </View>

                <View
                  style={[
                    styles.switchTrack,
                    form.is_default &&
                      styles.switchTrackActive,
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      form.is_default &&
                        styles.switchThumbActive,
                    ]}
                  />
                </View>
              </Pressable>
            </View>

            {error ? (
              <View
                style={
                  styles.formError
                }
              >
                <Icon
                  name="error_outline"
                  size={19}
                  color="#b4232f"
                />

                <Text
                  style={
                    styles.formErrorText
                  }
                >
                  {error}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.primaryFormButton,
                saving &&
                  styles.disabled,
              ]}
              onPress={() => {
                void handleSubmit()
              }}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <Icon
                  name="save"
                  size={19}
                  color="#ffffff"
                />
              )}

              <Text
                style={
                  styles.primaryFormButtonText
                }
              >
                {saving
                  ? 'Enregistrement…'
                  : initial
                    ? 'Enregistrer les modifications'
                    : 'Enregistrer cette adresse'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SURFACE,
  },

  listContent: {
    backgroundColor: SURFACE,
  },

  hero: {
    minHeight: 188,
    paddingHorizontal: 18,
    paddingBottom: 34,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
  },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  heroBack: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  heroText: {
    flex: 1,
    marginLeft: 14,
  },

  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.55,
  },

  heroSubtitle: {
    marginTop: 4,
    color: '#eaf7ff',
    fontSize: 14,
    fontWeight: '600',
  },

  heroAdd: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  safeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: -18,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 4,
  },

  safeNoticeIcon: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 17,
    backgroundColor: '#edf4ff',
  },

  safeNoticeText: {
    flex: 1,
  },

  safeNoticeTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '900',
  },

  safeNoticeSubtitle: {
    marginTop: 3,
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
  },

  safeNoticeShield: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#f3f7ff',
  },

  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 12,
  },

  sectionHeadingTitle: {
    color: TEXT,
    fontSize: 18,
    fontWeight: '900',
  },

  sectionHeadingSubtitle: {
    marginTop: 3,
    color: MUTED,
    fontSize: 11,
  },

  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 24,
    paddingVertical: 34,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    backgroundColor: '#ffffff',
  },

  errorStateIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#fff1f2',
  },

  emptyStateIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#edf4ff',
  },

  stateTitle: {
    marginTop: 13,
    color: TEXT,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },

  stateText: {
    marginTop: 6,
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },

  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 15,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: BLUE,
  },

  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },

  addressList: {
    gap: 13,
    paddingHorizontal: 16,
  },

  addressCard: {
    padding: 15,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.07,
    shadowRadius: 13,
    elevation: 3,
  },

  addressCardDefault: {
    borderColor: '#4d78ff',
    borderWidth: 1.5,
  },

  addressTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  addressLabelIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 20,
    backgroundColor: '#eef4ff',
  },

  addressMain: {
    flex: 1,
    minWidth: 0,
  },

  addressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  addressLabel: {
    flexShrink: 1,
    color: TEXT,
    fontSize: 16,
    fontWeight: '900',
  },

  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: BLUE,
  },

  defaultBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },

  currentBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: '#eaf9f0',
  },

  currentBadgeText: {
    color: '#16834f',
    fontSize: 9,
    fontWeight: '900',
  },

  addressStreet: {
    marginTop: 8,
    color: '#344966',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },

  addressCity: {
    marginTop: 2,
    color: MUTED,
    fontSize: 12,
  },

  gpsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },

  gpsLineText: {
    color: GREEN,
    fontSize: 10,
    fontWeight: '800',
  },

  gpsWarningText: {
    color: '#b35a18',
  },

  defaultSelector: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },

  defaultSelectorActive: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: BLUE,
  },

  defaultSelectorInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#ffffff',
  },

  defaultSelectorInactive: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#aeb9ca',
    borderRadius: 12,
  },

  addressActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#e7edf5',
  },

  addressAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 34,
  },

  addressActionEdit: {
    color: BLUE,
    fontSize: 12,
    fontWeight: '900',
  },

  addressActionDelete: {
    color: RED,
    fontSize: 12,
    fontWeight: '900',
  },

  actionDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#dfe6ef',
  },

  addAddressButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: BLUE,
  },

  addAddressButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },

  limitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#eef4ff',
  },

  limitIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 13,
    backgroundColor: '#ffffff',
  },

  limitText: {
    flex: 1,
  },

  limitTitle: {
    color: TEXT,
    fontSize: 12,
    fontWeight: '900',
  },

  limitSubtitle: {
    marginTop: 3,
    color: MUTED,
    fontSize: 10,
    lineHeight: 14,
  },

  limitDots: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 8,
  },

  limitDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#c5d0e0',
  },

  limitDotFilled: {
    backgroundColor: BLUE,
  },

  disabled: {
    opacity: 0.55,
  },

  formContent: {
    backgroundColor: SURFACE,
  },

  formHero: {
    minHeight: 158,
    paddingHorizontal: 18,
    paddingBottom: 30,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
  },

  formHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  formHeroText: {
    flex: 1,
    marginLeft: 14,
  },

  formHeroTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
  },

  formHeroSubtitle: {
    marginTop: 4,
    color: '#eaf7ff',
    fontSize: 13,
    fontWeight: '600',
  },

  formProgressCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -17,
    marginBottom: 14,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },

  formProgressItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },

  formProgressCircle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#acb7c8',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    zIndex: 2,
  },

  formProgressCircleActive: {
    borderColor: BLUE,
    backgroundColor: BLUE,
  },

  formProgressNumber: {
    color: '#7c899c',
    fontSize: 13,
    fontWeight: '900',
  },

  formProgressNumberActive: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },

  formProgressLabel: {
    marginTop: 6,
    color: '#78869a',
    fontSize: 11,
    fontWeight: '700',
  },

  formProgressLabelActive: {
    marginTop: 6,
    color: TEXT,
    fontSize: 11,
    fontWeight: '900',
  },

  formProgressLine: {
    position: 'absolute',
    top: 15,
    left: '68%',
    width: '64%',
    height: 2,
    backgroundColor: '#d4dbe5',
    zIndex: 1,
  },

  formProgressLineActive: {
    backgroundColor: BLUE,
  },

  formSectionCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },

  formSectionTitle: {
    marginBottom: 16,
    color: TEXT,
    fontSize: 17,
    fontWeight: '900',
  },

  fieldLabel: {
    marginTop: 12,
    marginBottom: 7,
    color: '#465975',
    fontSize: 12,
    fontWeight: '800',
  },

  labelOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  labelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#dde5ef',
    borderRadius: 13,
    backgroundColor: '#f8fafc',
  },

  labelOptionActive: {
    borderColor: '#b8ccff',
    backgroundColor: '#edf4ff',
  },

  labelOptionText: {
    color: '#6f7e93',
    fontSize: 11,
    fontWeight: '800',
  },

  labelOptionTextActive: {
    color: BLUE,
  },

  inputShell: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#d8e1ed',
    borderRadius: 14,
    backgroundColor: '#fbfcfe',
  },

  input: {
    flex: 1,
    color: TEXT,
    fontSize: 13,
  },

  cityPostalRow: {
    flexDirection: 'row',
  },

  cityField: {
    flex: 1,
  },

  cityChips: {
    gap: 7,
    paddingRight: 4,
  },

  cityChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#dce4ef',
    borderRadius: 13,
    backgroundColor: '#f8fafc',
  },

  cityChipActive: {
    borderColor: BLUE,
    backgroundColor: '#edf4ff',
  },

  cityChipText: {
    color: '#718096',
    fontSize: 11,
    fontWeight: '800',
  },

  cityChipTextActive: {
    color: BLUE,
  },

  currentLocationCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 17,
    backgroundColor: '#f2f6ff',
  },

  currentLocationIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },

  currentLocationText: {
    flex: 1,
  },

  currentLocationTitle: {
    color: TEXT,
    fontSize: 13,
    fontWeight: '900',
  },

  currentLocationSubtitle: {
    marginTop: 3,
    color: MUTED,
    fontSize: 10,
    lineHeight: 14,
  },

  switchTrack: {
    width: 46,
    height: 26,
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: 13,
    backgroundColor: '#c8d0dd',
  },

  switchTrackActive: {
    backgroundColor: BLUE,
  },

  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },

  switchThumbActive: {
    alignSelf: 'flex-end',
  },

  mapPreviewLabel: {
    marginTop: 15,
    marginBottom: 8,
    color: TEXT,
    fontSize: 12,
    fontWeight: '900',
  },

  previewMapWrap: {
    height: 190,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#dce4ef',
    borderRadius: 18,
    backgroundColor: '#eef2f6',
  },

  map: {
    width: '100%',
    height: '100%',
  },

  adjustMapButton: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#c3d2f2',
    borderRadius: 13,
    backgroundColor: '#ffffff',
  },

  adjustMapButtonText: {
    color: BLUE,
    fontSize: 10,
    fontWeight: '900',
  },

  manualControls: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
  },

  manualSecondaryButton: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d6e0ee',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },

  manualSecondaryButtonText: {
    color: BLUE,
    fontSize: 10,
    fontWeight: '800',
  },

  coordinateSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    padding: 10,
    borderRadius: 13,
    backgroundColor: '#ecfaf3',
  },

  coordinateSuccessText: {
    flex: 1,
    color: '#16734e',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },

  inlineWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 9,
    padding: 10,
    borderRadius: 13,
    backgroundColor: '#fff7ed',
  },

  inlineWarningText: {
    flex: 1,
    color: '#99501b',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },

  formError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#efc2c7',
    borderRadius: 15,
    backgroundColor: '#fff5f6',
  },

  formErrorText: {
    flex: 1,
    color: '#972b38',
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
  },

  primaryFormButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: BLUE,
  },

  primaryFormButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },

  reviewAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 17,
    backgroundColor: '#f4f8ff',
  },

  reviewIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 16,
    backgroundColor: '#e5efff',
  },

  reviewAddressText: {
    flex: 1,
    minWidth: 0,
  },

  reviewAddressTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '900',
  },

  reviewAddressStreet: {
    marginTop: 4,
    color: '#50617a',
    fontSize: 12,
  },

  reviewAddressCity: {
    marginTop: 2,
    color: MUTED,
    fontSize: 11,
  },

  reviewEditLink: {
    color: BLUE,
    fontSize: 11,
    fontWeight: '900',
  },

  reviewMapWrap: {
    height: 170,
    overflow: 'hidden',
    marginTop: 13,
    borderRadius: 17,
    backgroundColor: '#eef2f6',
  },

  defaultToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 13,
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
  },

  defaultToggleText: {
    flex: 1,
    marginRight: 10,
  },

  defaultToggleTitle: {
    color: TEXT,
    fontSize: 12,
    fontWeight: '900',
  },

  defaultToggleSubtitle: {
    marginTop: 3,
    color: MUTED,
    fontSize: 10,
    lineHeight: 14,
  },
  mapPin: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#ffffff',
    shadowColor: '#00184d',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
  },

})
