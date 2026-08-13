import { useCallback, useMemo, useState } from 'react'
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
import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'
import MapView, { Marker } from 'react-native-maps'

import {
  addressesApi,
  type Address,
  type CreateAddressPayload,
} from '../../api/addresses'
import { firstError } from '../../api/errors'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

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

const MAX_ADDRESSES = 5

interface Coordinates {
  latitude: number
  longitude: number
}

function labelIcon(label: string) {
  return (
    LABEL_OPTIONS.find((option) => option.value === label)?.icon ??
    'location_on'
  )
}

function parseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function coordinatesFromAddress(address: Address | null): Coordinates | null {
  if (!address) {
    return null
  }

  const latitude = parseCoordinate(address.latitude)
  const longitude = parseCoordinate(address.longitude)

  if (latitude === null || longitude === null) {
    return null
  }

  // Old development records sometimes used 0,0 as a placeholder.
  // That point is not a usable delivery position for this application.
  if (Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001) {
    return null
  }

  return { latitude, longitude }
}

function formatCoordinates(coordinates: Coordinates) {
  return `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`
}

function normalizeCoordinate(value: number) {
  return Number(value.toFixed(6))
}

function mapRegionFor(coordinates: Coordinates) {
  return {
    ...coordinates,
    latitudeDelta: 0.025,
    longitudeDelta: 0.025,
  }
}

export default function Addresses() {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<Address | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await addressesApi.list()
      setAddresses(response.data.results)
      setLoadError('')
    } catch (error) {
      setLoadError(
        firstError(error) ||
          "Impossible de charger vos adresses pour le moment.",
      )
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      let active = true

      setLoading(true)
      load().finally(() => {
        if (active) {
          setLoading(false)
        }
      })

      return () => {
        active = false
      }
    }, [load]),
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  function openNew() {
    if (addresses.length >= MAX_ADDRESSES) {
      Alert.alert(
        'Limite atteinte',
        `Vous pouvez enregistrer jusqu'à ${MAX_ADDRESSES} adresses.`,
      )
      return
    }

    setEditing(null)
    setMode('form')
  }

  function openEdit(address: Address) {
    setEditing(address)
    setMode('form')
  }

  function closeForm() {
    setMode('list')
    setEditing(null)
  }

  function confirmDelete(address: Address) {
    Alert.alert(
      'Supprimer cette adresse ?',
      `Vous êtes sur le point de supprimer l'adresse « ${address.label} » (${address.street}). Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void handleDelete(address)
          },
        },
      ],
    )
  }

  async function handleDelete(address: Address) {
    try {
      await addressesApi.delete(address.id)
      await load()
    } catch (error) {
      Alert.alert(
        'Erreur',
        firstError(error) ||
          "Impossible de supprimer cette adresse pour le moment.",
      )
    }
  }

  async function handleSetDefault(id: number) {
    try {
      await addressesApi.setDefault(id)
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

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Chargement de vos adresses…</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Mes adresses</Text>
          <Text style={styles.subtitle}>
            Gérez vos adresses et leurs positions GPS pour la livraison.
          </Text>
          <Text style={styles.addressCount}>
            {addresses.length} adresse{addresses.length !== 1 ? 's' : ''}{' '}
            enregistrée{addresses.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <Pressable
        style={[
          styles.addButton,
          addresses.length >= MAX_ADDRESSES && styles.buttonDisabled,
        ]}
        onPress={openNew}
        disabled={addresses.length >= MAX_ADDRESSES}
      >
        <Icon name="add_location_alt" size={19} color={colors.white} />
        <Text style={styles.addButtonText}>Ajouter une adresse</Text>
      </Pressable>

      {loadError ? (
        <View style={styles.errorState}>
          <Icon name="cloud_off" size={34} color={colors.error} />
          <Text style={styles.errorStateTitle}>Chargement impossible</Text>
          <Text style={styles.errorStateText}>{loadError}</Text>
          <Pressable style={styles.retryButton} onPress={() => void load()}>
            <Icon name="refresh" size={17} color={colors.white} />
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : addresses.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Icon name="location_off" size={38} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Aucune adresse enregistrée</Text>
          <Text style={styles.emptyText}>
            Ajoutez une adresse avec sa position GPS pour pouvoir confirmer
            vos commandes.
          </Text>
        </View>
      ) : (
        <View style={styles.cardsContainer}>
          {addresses.map((address) => {
            const hasCoordinates = Boolean(coordinatesFromAddress(address))

            return (
              <View
                key={address.id}
                style={[
                  styles.addressCard,
                  address.is_default && styles.addressCardDefault,
                ]}
              >
                <View style={styles.addressCardHeader}>
                  <View
                    style={[
                      styles.labelChip,
                      address.is_default && styles.labelChipDefault,
                    ]}
                  >
                    <Icon
                      name={labelIcon(address.label)}
                      size={14}
                      color={
                        address.is_default
                          ? colors.white
                          : colors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.labelChipText,
                        address.is_default && styles.labelChipTextActive,
                      ]}
                    >
                      {address.label}
                    </Text>
                  </View>

                  {address.is_default && (
                    <View style={styles.defaultBadge}>
                      <Icon name="check_circle" size={13} color="#047857" />
                      <Text style={styles.defaultBadgeText}>Par défaut</Text>
                    </View>
                  )}

                  <View style={styles.cardHeaderSpacer} />

                  <Pressable
                    style={styles.iconButton}
                    onPress={() => openEdit(address)}
                    accessibilityLabel={`Modifier l'adresse ${address.label}`}
                  >
                    <Icon name="edit" size={18} color={colors.textMuted} />
                  </Pressable>

                  <Pressable
                    style={styles.iconButton}
                    onPress={() => confirmDelete(address)}
                    accessibilityLabel={`Supprimer l'adresse ${address.label}`}
                  >
                    <Icon name="delete" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>

                <Text style={styles.addressStreet}>{address.street}</Text>
                <Text style={styles.addressCity}>
                  {address.city}
                  {address.postal_code ? ` — ${address.postal_code}` : ''}
                </Text>

                <View
                  style={[
                    styles.gpsStatus,
                    hasCoordinates
                      ? styles.gpsStatusSuccess
                      : styles.gpsStatusWarning,
                  ]}
                >
                  <Icon
                    name={hasCoordinates ? 'my_location' : 'location_off'}
                    size={16}
                    color={hasCoordinates ? '#047857' : '#b45309'}
                  />
                  <Text
                    style={[
                      styles.gpsStatusText,
                      {
                        color: hasCoordinates ? '#047857' : '#92400e',
                      },
                    ]}
                  >
                    {hasCoordinates
                      ? 'Position GPS enregistrée'
                      : 'Position GPS manquante — modifiez cette adresse'}
                  </Text>
                </View>

                <View style={styles.addressFooter}>
                  <View style={styles.addressFooterLeft}>
                    <Icon
                      name="two_wheeler"
                      size={16}
                      color={colors.textMuted}
                    />
                    <Text style={styles.addressFooterText}>
                      Adresse de livraison
                    </Text>
                  </View>

                  {!address.is_default ? (
                    <Pressable
                      onPress={() => void handleSetDefault(address.id)}
                    >
                      <Text style={styles.setDefaultLink}>
                        Définir par défaut
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.setDefaultDisabled}>Adresse active</Text>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      )}

      {addresses.length < MAX_ADDRESSES && !loadError && (
        <Pressable style={styles.dashedAdd} onPress={openNew}>
          <View style={styles.dashedAddIcon}>
            <Icon name="add" size={24} color={colors.accentLight} />
          </View>
          <Text style={styles.dashedAddText}>
            Ajouter une nouvelle adresse
          </Text>
        </Pressable>
      )}

      <View style={styles.limitStrip}>
        <View style={styles.limitInformation}>
          <Icon name="info" size={18} color={colors.primary} />
          <Text style={styles.limitText}>
            Jusqu'à {MAX_ADDRESSES} adresses · {addresses.length} sur{' '}
            {MAX_ADDRESSES} utilisées
          </Text>
        </View>
        <View style={styles.limitDots}>
          {Array.from({ length: MAX_ADDRESSES }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.limitDot,
                index < addresses.length && styles.limitDotFilled,
              ]}
            />
          ))}
        </View>
      </View>
    </ScrollView>
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
  const initialCoordinates = coordinatesFromAddress(initial)

  const [form, setForm] = useState({
    label: initial?.label ?? 'Domicile',
    street: initial?.street ?? '',
    city: initial?.city ?? 'Casablanca',
    postal_code: initial?.postal_code ?? '',
    is_default: initial?.is_default ?? false,
  })
  const [coordinates, setCoordinates] = useState<Coordinates | null>(
    initialCoordinates,
  )
  const [locating, setLocating] = useState(false)
  const [manualMapOpen, setManualMapOpen] = useState(false)
  const [manualCoordinates, setManualCoordinates] =
    useState<Coordinates | null>(null)
  const [manualMapKey, setManualMapKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [locationError, setLocationError] = useState('')

  const cityOptions = useMemo(() => {
    if (form.city && !CITIES.includes(form.city)) {
      return [form.city, ...CITIES]
    }

    return CITIES
  }, [form.city])

  function cityCenter(city = form.city) {
    return CITY_CENTERS[city] ?? CITY_CENTERS.Casablanca
  }

  function openManualMap() {
    setError('')
    setLocationError('')

    const startCoordinates = coordinates ?? cityCenter()

    setManualCoordinates(startCoordinates)
    setManualMapKey((current) => current + 1)
    setManualMapOpen(true)
  }

  function centerManualMapOnCity() {
    setManualCoordinates(cityCenter())
    setManualMapKey((current) => current + 1)
  }

  function confirmManualLocation() {
    if (!manualCoordinates) {
      setLocationError(
        'Touchez la carte pour choisir précisément la position de cette adresse.',
      )
      return
    }

    setCoordinates(manualCoordinates)
    setManualMapOpen(false)
    setLocationError('')
  }

  function cancelManualLocation() {
    setManualMapOpen(false)
    setManualCoordinates(null)
  }

  function selectCity(city: string) {
    if (city === form.city) {
      return
    }

    setForm((current) => ({ ...current, city }))
    setCoordinates(null)
    setManualCoordinates(null)
    setManualMapOpen(false)
    setLocationError(
      `La ville a été changée vers ${city}. Choisissez maintenant sa position exacte sur la carte ou utilisez votre position actuelle.`,
    )
  }

  async function useCurrentLocation() {
    setError('')
    setLocationError('')
    setLocating(true)

    try {
      const permission = await Location.requestForegroundPermissionsAsync()

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationError(
          "L'autorisation de localisation est nécessaire pour enregistrer une adresse de livraison précise.",
        )
        return
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      const nextCoordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }

      setCoordinates(nextCoordinates)
      setManualMapOpen(false)
      setManualCoordinates(null)

      // Reverse geocoding improves the form when the service is available,
      // but a failure here never discards the valid GPS coordinates.
      try {
        const results = await Location.reverseGeocodeAsync(nextCoordinates)
        const result = results[0]

        if (result) {
          const street = [result.streetNumber, result.street ?? result.name]
            .filter(Boolean)
            .join(' ')
            .trim()

          const city = result.city ?? result.district ?? result.subregion

          setForm((current) => ({
            ...current,
            street: current.street.trim() || street || current.street,
            city: city || current.city,
            postal_code:
              current.postal_code.trim() ||
              result.postalCode ||
              current.postal_code,
          }))
        }
      } catch {
        // The GPS point is still valid even if address lookup is unavailable.
      }
    } catch {
      setLocationError(
        "Impossible d'obtenir votre position. Activez le GPS, placez-vous près d'une fenêtre et réessayez.",
      )
    } finally {
      setLocating(false)
    }
  }

  async function handleSubmit() {
    if (!form.street.trim()) {
      setError('Veuillez saisir la rue et le numéro.')
      return
    }

    if (!form.city.trim()) {
      setError('Veuillez sélectionner une ville.')
      return
    }

    if (!coordinates) {
      setError(
        'Ajoutez la position GPS de cette adresse avant de l’enregistrer.',
      )
      return
    }

    setError('')
    setSaving(true)

    try {
      const payload: CreateAddressPayload = {
        label: form.label,
        street: form.street.trim(),
        city: form.city.trim(),
        postal_code: form.postal_code.trim() || undefined,
        latitude: normalizeCoordinate(coordinates.latitude),
        longitude: normalizeCoordinate(coordinates.longitude),
        is_default: form.is_default,
      }

      if (initial) {
        await addressesApi.update(initial.id, payload)
      } else {
        await addressesApi.create(payload)
      }

      onSaved()
    } catch (submitError) {
      setError(
        firstError(submitError) || 'Erreur lors de la sauvegarde.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.formHeader}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>
            {initial ? "Modifier l'adresse" : 'Nouvelle adresse'}
          </Text>
          <Text style={styles.subtitle}>
            {initial
              ? `${initial.label} · Mettez à jour les informations et la position GPS.`
              : 'Ajoutez les informations et enregistrez la position GPS exacte.'}
          </Text>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Icon name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Étiquette *</Text>
        <View style={styles.chipRow}>
          {LABEL_OPTIONS.map((option) => {
            const active = form.label === option.value

            return (
              <Pressable
                key={option.value}
                style={[
                  styles.optionChip,
                  active && styles.optionChipActive,
                ]}
                onPress={() =>
                  setForm((current) => ({
                    ...current,
                    label: option.value,
                  }))
                }
              >
                <Icon
                  name={option.icon}
                  size={15}
                  color={active ? colors.white : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.optionChipText,
                    active && styles.optionChipTextActive,
                  ]}
                >
                  {option.value}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.locationSection}>
        <View style={styles.locationHeader}>
          <View style={styles.locationHeaderIcon}>
            <Icon name="my_location" size={21} color={colors.primary} />
          </View>
          <View style={styles.locationHeaderText}>
            <Text style={styles.locationTitle}>Position GPS *</Text>
            <Text style={styles.locationDescription}>
              Utilisez votre position actuelle ou choisissez une autre adresse
              précisément sur la carte.
            </Text>
          </View>
        </View>

        <View style={styles.locationButtons}>
          <Pressable
            style={[
              styles.locationButton,
              locating && styles.buttonDisabled,
            ]}
            onPress={() => void useCurrentLocation()}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Icon name="gps_fixed" size={18} color={colors.white} />
            )}
            <Text style={styles.locationButtonText}>
              {locating
                ? 'Recherche de votre position…'
                : 'Utiliser ma position actuelle'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.manualLocationButton}
            onPress={openManualMap}
            disabled={locating}
          >
            <Icon name="map" size={18} color={colors.primary} />
            <Text style={styles.manualLocationButtonText}>
              Choisir la position sur la carte
            </Text>
          </Pressable>
        </View>

        {locationError ? (
          <View style={styles.inlineWarning}>
            <Icon name="warning" size={18} color="#b45309" />
            <Text style={styles.inlineWarningText}>{locationError}</Text>
          </View>
        ) : null}

        {manualMapOpen && manualCoordinates ? (
          <View style={styles.manualMapPanel}>
            <View style={styles.manualMapHeader}>
              <View style={styles.manualMapHeaderText}>
                <Text style={styles.manualMapTitle}>
                  Positionnez votre adresse
                </Text>
                <Text style={styles.manualMapDescription}>
                  Touchez la carte ou déplacez le marqueur jusqu'à l'entrée
                  exacte du bâtiment.
                </Text>
              </View>

              <Pressable
                style={styles.cityCenterButton}
                onPress={centerManualMapOnCity}
              >
                <Icon name="location_city" size={15} color={colors.primary} />
                <Text style={styles.cityCenterButtonText}>
                  Centrer sur {form.city}
                </Text>
              </Pressable>
            </View>

            <View style={styles.manualMapContainer}>
              <MapView
                key={manualMapKey}
                style={styles.map}
                initialRegion={mapRegionFor(manualCoordinates)}
                onPress={(event) =>
                  setManualCoordinates(event.nativeEvent.coordinate)
                }
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
              >
                <Marker
                  coordinate={manualCoordinates}
                  draggable
                  title="Adresse de livraison"
                  description="Déplacez ce marqueur si nécessaire"
                  onDragEnd={(event) =>
                    setManualCoordinates(event.nativeEvent.coordinate)
                  }
                />
              </MapView>
            </View>

            <View style={styles.manualCoordinatesRow}>
              <Icon name="place" size={16} color={colors.primary} />
              <Text style={styles.manualCoordinatesText}>
                {formatCoordinates(manualCoordinates)}
              </Text>
            </View>

            <View style={styles.manualMapActions}>
              <Pressable
                style={styles.manualCancelButton}
                onPress={cancelManualLocation}
              >
                <Text style={styles.manualCancelButtonText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={styles.manualConfirmButton}
                onPress={confirmManualLocation}
              >
                <Icon name="check" size={17} color={colors.white} />
                <Text style={styles.manualConfirmButtonText}>
                  Confirmer cette position
                </Text>
              </Pressable>
            </View>
          </View>
        ) : coordinates ? (
          <View style={styles.locationSuccess}>
            <View style={styles.locationSuccessRow}>
              <Icon name="check_circle" size={18} color="#047857" />
              <View style={styles.locationSuccessTextContainer}>
                <Text style={styles.locationSuccessTitle}>
                  Position GPS enregistrée
                </Text>
                <Text style={styles.coordinateText}>
                  {formatCoordinates(coordinates)}
                </Text>
              </View>
            </View>

            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                initialRegion={{
                  ...coordinates,
                  latitudeDelta: 0.008,
                  longitudeDelta: 0.008,
                }}
                region={{
                  ...coordinates,
                  latitudeDelta: 0.008,
                  longitudeDelta: 0.008,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
              >
                <Marker
                  coordinate={coordinates}
                  title="Adresse de livraison"
                  description={form.street || 'Position sélectionnée'}
                />
              </MapView>
            </View>
          </View>
        ) : (
          <View style={styles.locationMissing}>
            <Icon name="location_off" size={18} color="#b45309" />
            <Text style={styles.locationMissingText}>
              Aucune position enregistrée. Utilisez votre position actuelle
              ou choisissez manuellement l'adresse sur la carte.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Rue et numéro *</Text>
        <TextInput
          value={form.street}
          onChangeText={(value) =>
            setForm((current) => ({ ...current, street: value }))
          }
          placeholder="12 Rue Ibn Sina, Appartement 3B"
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
          autoCapitalize="sentences"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Ville *</Text>
        <View style={styles.chipRow}>
          {cityOptions.map((city) => {
            const active = form.city === city

            return (
              <Pressable
                key={city}
                style={[
                  styles.optionChip,
                  active && styles.optionChipActive,
                ]}
                onPress={() => selectCity(city)}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    active && styles.optionChipTextActive,
                  ]}
                >
                  {city}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Code postal</Text>
        <TextInput
          value={form.postal_code}
          onChangeText={(value) =>
            setForm((current) => ({ ...current, postal_code: value }))
          }
          placeholder="20250"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          style={styles.textInput}
        />
      </View>

      <Pressable
        style={styles.checkboxRow}
        onPress={() =>
          setForm((current) => ({
            ...current,
            is_default: !current.is_default,
          }))
        }
      >
        <Icon
          name={
            form.is_default ? 'check_box' : 'check_box_outline_blank'
          }
          size={21}
          color={form.is_default ? colors.primary : colors.textMuted}
        />
        <View style={styles.checkboxTextContainer}>
          <Text style={styles.checkboxLabel}>
            Définir comme adresse par défaut
          </Text>
          <Text style={styles.checkboxDescription}>
            Elle sera présélectionnée lors de vos prochaines commandes.
          </Text>
        </View>
      </Pressable>

      {error ? (
        <View style={styles.errorBox}>
          <Icon name="error" size={18} color={colors.errorText} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.formActions}>
        <Pressable
          style={styles.cancelButton}
          onPress={onClose}
          disabled={saving}
        >
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </Pressable>

        <Pressable
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={() => void handleSubmit()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Icon name="save" size={17} color={colors.white} />
          )}
          <Text style={styles.saveButtonText}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.surface,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 23,
    fontWeight: '700',
    color: colors.primary,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 4,
  },
  addressCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 6,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  addButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  errorState: {
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 22,
    paddingVertical: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: colors.errorBg,
  },
  errorStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.errorText,
  },
  errorStateText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: colors.errorText,
  },
  retryButton: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 44,
    paddingHorizontal: 26,
    gap: 10,
    backgroundColor: colors.surfaceLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  cardsContainer: {
    gap: 14,
  },
  addressCard: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderLeftWidth: 4,
    borderLeftColor: colors.outlineVariant,
    padding: 16,
    gap: 8,
  },
  addressCardDefault: {
    borderLeftColor: colors.primary,
  },
  addressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  labelChipDefault: {
    backgroundColor: colors.primary,
  },
  labelChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  labelChipTextActive: {
    color: colors.white,
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  defaultBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  cardHeaderSpacer: {
    flex: 1,
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: colors.surface,
  },
  addressStreet: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  addressCity: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: -3,
  },
  gpsStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
  },
  gpsStatusSuccess: {
    backgroundColor: '#ecfdf5',
  },
  gpsStatusWarning: {
    backgroundColor: '#fffbeb',
  },
  gpsStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  addressFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  addressFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addressFooterText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  setDefaultLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  setDefaultDisabled: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
  },
  dashedAdd: {
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 23,
    alignItems: 'center',
    gap: 10,
  },
  dashedAddIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ecfeff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedAddText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accentLight,
  },
  limitStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 14,
    padding: 14,
  },
  limitInformation: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  limitText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.primary,
  },
  limitDots: {
    flexDirection: 'row',
    gap: 4,
  },
  limitDot: {
    width: 15,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.outlineVariant,
  },
  limitDotFilled: {
    backgroundColor: colors.accentLight,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surfaceLowest,
  },
  optionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  optionChipTextActive: {
    color: colors.white,
  },
  locationSection: {
    gap: 12,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#f8fbff',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  locationHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
  },
  locationHeaderText: {
    flex: 1,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  locationDescription: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  locationButtons: {
    gap: 9,
  },
  manualLocationButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceLowest,
  },
  manualLocationButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  locationButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: colors.primary,
  },
  locationButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  manualMapPanel: {
    gap: 11,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#93c5fd',
    backgroundColor: colors.surfaceLowest,
  },
  manualMapHeader: {
    gap: 9,
  },
  manualMapHeaderText: {
    gap: 3,
  },
  manualMapTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  manualMapDescription: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  cityCenterButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
  },
  cityCenterButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  manualMapContainer: {
    height: 260,
    overflow: 'hidden',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.outlineVariant,
  },
  manualCoordinatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  manualCoordinatesText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  manualMapActions: {
    flexDirection: 'row',
    gap: 9,
  },
  manualCancelButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  manualCancelButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  manualConfirmButton: {
    flex: 1.5,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 11,
    backgroundColor: colors.primary,
  },
  manualConfirmButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  inlineWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 11,
    borderRadius: 11,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  inlineWarningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#92400e',
  },
  locationSuccess: {
    gap: 10,
  },
  locationSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    borderRadius: 11,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  locationSuccessTextContainer: {
    flex: 1,
  },
  locationSuccessTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  coordinateText: {
    marginTop: 2,
    fontSize: 11,
    color: '#047857',
  },
  mapContainer: {
    height: 180,
    overflow: 'hidden',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.outlineVariant,
  },
  map: {
    flex: 1,
  },
  locationMissing: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 11,
    borderRadius: 11,
    backgroundColor: '#fffbeb',
  },
  locationMissingText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#92400e',
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceLowest,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  checkboxDescription: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.errorBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    flex: 1,
    color: colors.errorText,
    fontSize: 13,
    lineHeight: 18,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
})