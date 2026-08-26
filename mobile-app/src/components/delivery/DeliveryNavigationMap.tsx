import React, { useMemo, useState } from 'react'
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  Camera,
  Map,
  Marker,
} from '@maplibre/maplibre-react-native'

type Coordinate = [number, number]

type DeliveryNavigationMapProps = {
  status: string

  agentLatitude?: number | null
  agentLongitude?: number | null

  pharmacyLatitude?: number | null
  pharmacyLongitude?: number | null
  pharmacyName?: string | null
  pharmacyAddress?: string | null

  customerLatitude?: number | null
  customerLongitude?: number | null
  customerAddress?: string | null

  height?: number
  variant?: 'default' | 'brand'
}

const MAP_STYLE_URL = 'https://demotiles.maplibre.org/style.json'

const defaultPalette = {
  agent: '#2563EB',
  agentHalo: 'rgba(37, 99, 235, 0.20)',
  pharmacy: '#059669',
  customer: '#EA580C',
  navigation: '#0F766E',
  navigationSoft: '#EFF6FF',
  navigationText: '#1D4ED8',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  text: '#0F172A',
  muted: '#64748B',
} as const

const brandPalette = {
  agent: '#0B43D5',
  agentHalo: 'rgba(11, 67, 213, 0.18)',
  pharmacy: '#12C9D3',
  customer: '#052A95',
  navigation: '#0B43D5',
  navigationSoft: '#EEF5FF',
  navigationText: '#0B43D5',
  border: '#E4EBF7',
  surface: '#F5F8FD',
  text: '#10214D',
  muted: '#68779B',
} as const

function buildCoordinate(
  latitude?: number | null,
  longitude?: number | null,
): Coordinate | null {
  if (
    typeof latitude !== 'number'
    || typeof longitude !== 'number'
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
  ) {
    return null
  }

  if (
    latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    return null
  }

  if (latitude === 0 && longitude === 0) {
    return null
  }

  return [longitude, latitude]
}

export default function DeliveryNavigationMap({
  status,

  agentLatitude,
  agentLongitude,

  pharmacyLatitude,
  pharmacyLongitude,
  pharmacyName,
  pharmacyAddress,

  customerLatitude,
  customerLongitude,
  customerAddress,

  height = 300,
  variant = 'default',
}: DeliveryNavigationMapProps) {
  const [cameraKey, setCameraKey] = useState(0)
  const palette = variant === 'brand' ? brandPalette : defaultPalette

  const agentCoordinate = useMemo(
    () => buildCoordinate(agentLatitude, agentLongitude),
    [agentLatitude, agentLongitude],
  )

  const destination = useMemo(() => {
    const headingToPharmacy = status === 'awaiting_agent'

    if (headingToPharmacy) {
      return {
        type: 'pharmacy' as const,
        title: pharmacyName || 'Pharmacie',
        subtitle: pharmacyAddress || 'Adresse de la pharmacie',
        coordinate: buildCoordinate(
          pharmacyLatitude,
          pharmacyLongitude,
        ),
      }
    }

    return {
      type: 'customer' as const,
      title: 'Adresse du client',
      subtitle: customerAddress || 'Adresse de livraison',
      coordinate: buildCoordinate(
        customerLatitude,
        customerLongitude,
      ),
    }
  }, [
    status,
    pharmacyLatitude,
    pharmacyLongitude,
    pharmacyName,
    pharmacyAddress,
    customerLatitude,
    customerLongitude,
    customerAddress,
  ])

  const cameraInitialView = useMemo(() => {
    if (!destination.coordinate) {
      return null
    }

    if (!agentCoordinate) {
      return {
        center: destination.coordinate,
        zoom: 15,
      }
    }

    const [agentLongitudeValue, agentLatitudeValue] = agentCoordinate
    const [
      destinationLongitude,
      destinationLatitude,
    ] = destination.coordinate

    const samePosition =
      Math.abs(agentLongitudeValue - destinationLongitude) < 0.00001
      && Math.abs(agentLatitudeValue - destinationLatitude) < 0.00001

    if (samePosition) {
      return {
        center: destination.coordinate,
        zoom: 16,
      }
    }

    const west = Math.min(
      agentLongitudeValue,
      destinationLongitude,
    )
    const east = Math.max(
      agentLongitudeValue,
      destinationLongitude,
    )
    const south = Math.min(
      agentLatitudeValue,
      destinationLatitude,
    )
    const north = Math.max(
      agentLatitudeValue,
      destinationLatitude,
    )

    const bounds: [number, number, number, number] = [
      west,
      south,
      east,
      north,
    ]

    return {
      bounds,
      padding: {
        top: 55,
        right: 55,
        bottom: 55,
        left: 55,
      },
    }
  }, [agentCoordinate, destination.coordinate])

  const openExternalNavigation = async () => {
    if (!destination.coordinate) {
      Alert.alert(
        'Navigation indisponible',
        'Les coordonnées de destination ne sont pas disponibles.',
      )
      return
    }

    const [longitude, latitude] = destination.coordinate

    const url =
      'https://www.google.com/maps/dir/'
      + `?api=1&destination=${latitude},${longitude}`
      + '&travelmode=driving'

    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert(
        'Navigation indisponible',
        'Impossible d’ouvrir l’application de navigation.',
      )
    }
  }

  const recenterMap = () => {
    setCameraKey((current) => current + 1)
  }

  if (!destination.coordinate || !cameraInitialView) {
    return (
      <View
        style={[
          styles.unavailableContainer,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        <Text
          style={[
            styles.unavailableTitle,
            { color: palette.text },
          ]}
        >
          Carte indisponible
        </Text>

        <Text
          style={[
            styles.unavailableText,
            { color: palette.muted },
          ]}
        >
          Les coordonnées de destination ne sont pas disponibles.
        </Text>
      </View>
    )
  }

  const destinationLabel =
    destination.type === 'pharmacy'
      ? 'Direction pharmacie'
      : 'Direction client'

  const destinationColor =
    destination.type === 'pharmacy'
      ? palette.pharmacy
      : palette.customer

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text
            style={[
              styles.directionLabel,
              { color: palette.muted },
            ]}
          >
            {destinationLabel}
          </Text>

          <Text
            style={[
              styles.destinationTitle,
              { color: palette.text },
            ]}
          >
            {destination.title}
          </Text>

          <Text
            style={[
              styles.destinationAddress,
              { color: palette.muted },
            ]}
            numberOfLines={2}
          >
            {destination.subtitle}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recentrer la carte"
          onPress={recenterMap}
          style={({ pressed }) => [
            styles.recenterButton,
            { backgroundColor: palette.navigationSoft },
            pressed && styles.buttonPressed,
          ]}
        >
          <Text
            style={[
              styles.recenterButtonText,
              { color: palette.navigationText },
            ]}
          >
            Recentrer
          </Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.mapContainer,
          {
            height,
            backgroundColor: palette.border,
          },
        ]}
      >
        <Map
          style={styles.map}
          mapStyle={MAP_STYLE_URL}
          androidView="texture"
          attribution
          compass
        >
          <Camera
            key={`delivery-camera-${cameraKey}`}
            initialViewState={cameraInitialView}
          />

          {agentCoordinate ? (
            <Marker
              id="delivery-agent"
              lngLat={agentCoordinate}
              anchor="center"
            >
              <View
                style={[
                  styles.agentMarkerOuter,
                  { backgroundColor: palette.agentHalo },
                ]}
              >
                <View
                  style={[
                    styles.agentMarker,
                    { backgroundColor: palette.agent },
                  ]}
                >
                  <Text style={styles.markerText}>L</Text>
                </View>
              </View>
            </Marker>
          ) : null}

          <Marker
            id="delivery-destination"
            lngLat={destination.coordinate}
            anchor="bottom"
          >
            <View style={styles.destinationMarkerWrapper}>
              <View
                style={[
                  styles.destinationMarker,
                  { backgroundColor: destinationColor },
                ]}
              >
                <Text style={styles.markerText}>
                  {destination.type === 'pharmacy' ? 'P' : 'C'}
                </Text>
              </View>

              <View
                style={[
                  styles.markerPointer,
                  { borderTopColor: destinationColor },
                ]}
              />
            </View>
          </Marker>
        </Map>

        <View pointerEvents="none" style={styles.legend}>
          <View style={styles.legendRow}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: palette.agent },
              ]}
            />
            <Text
              style={[
                styles.legendText,
                { color: palette.text },
              ]}
            >
              Votre position
            </Text>
          </View>

          <View style={styles.legendRow}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: destinationColor },
              ]}
            />
            <Text
              style={[
                styles.legendText,
                { color: palette.text },
              ]}
            >
              {destination.type === 'pharmacy' ? 'Pharmacie' : 'Client'}
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir l’itinéraire vers ${destination.type === 'pharmacy' ? 'la pharmacie' : 'le client'}`}
        onPress={openExternalNavigation}
        style={({ pressed }) => [
          styles.navigationButton,
          { backgroundColor: palette.navigation },
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.navigationButtonText}>
          Ouvrir l’itinéraire
        </Text>
      </Pressable>

      <Text
        style={[
          styles.navigationHint,
          { color: palette.muted },
        ]}
      >
        Ouvre la navigation routière vers la destination.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  headerTextContainer: {
    flex: 1,
    paddingRight: 12,
  },

  directionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 3,
  },

  destinationTitle: {
    fontSize: 16,
    fontWeight: '800',
  },

  destinationAddress: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },

  recenterButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  recenterButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },

  mapContainer: {
    borderRadius: 18,
    overflow: 'hidden',
  },

  map: {
    flex: 1,
  },

  agentMarkerOuter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  agentMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  destinationMarkerWrapper: {
    alignItems: 'center',
  },

  destinationMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  markerPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },

  markerText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  legend: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },

  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 6,
  },

  legendText: {
    fontSize: 10,
    fontWeight: '700',
  },

  navigationButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  navigationButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  navigationHint: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },

  buttonPressed: {
    opacity: 0.75,
  },

  unavailableContainer: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },

  unavailableTitle: {
    fontSize: 15,
    fontWeight: '800',
  },

  unavailableText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
})
