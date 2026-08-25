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
}

const MAP_STYLE_URL = 'https://demotiles.maplibre.org/style.json'

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

  // Prevent accidental "Null Island" coordinates.
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
}: DeliveryNavigationMapProps) {
  const [cameraKey, setCameraKey] = useState(0)

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
  }, [
    agentCoordinate,
    destination.coordinate,
  ])

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
      <View style={styles.unavailableContainer}>
        <Text style={styles.unavailableTitle}>
          Carte indisponible
        </Text>

        <Text style={styles.unavailableText}>
          Les coordonnées de destination ne sont pas disponibles.
        </Text>
      </View>
    )
  }

  const destinationLabel =
    destination.type === 'pharmacy'
      ? 'Direction pharmacie'
      : 'Direction client'

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.directionLabel}>
            {destinationLabel}
          </Text>

          <Text style={styles.destinationTitle}>
            {destination.title}
          </Text>

          <Text
            style={styles.destinationAddress}
            numberOfLines={2}
          >
            {destination.subtitle}
          </Text>
        </View>

        <Pressable
          onPress={recenterMap}
          style={({ pressed }) => [
            styles.recenterButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.recenterButtonText}>
            Recentrer
          </Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.mapContainer,
          { height },
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
              <View style={styles.agentMarkerOuter}>
                <View style={styles.agentMarker}>
                  <Text style={styles.markerText}>
                    L
                  </Text>
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
                  destination.type === 'pharmacy'
                    ? styles.pharmacyMarker
                    : styles.customerMarker,
                ]}
              >
                <Text style={styles.markerText}>
                  {destination.type === 'pharmacy' ? 'P' : 'C'}
                </Text>
              </View>

              <View
                style={[
                  styles.markerPointer,
                  destination.type === 'pharmacy'
                    ? styles.pharmacyPointer
                    : styles.customerPointer,
                ]}
              />
            </View>
          </Marker>
        </Map>

        <View
          pointerEvents="none"
          style={styles.legend}
        >
          <View style={styles.legendRow}>
            <View style={styles.legendAgentDot} />
            <Text style={styles.legendText}>
              Votre position
            </Text>
          </View>

          <View style={styles.legendRow}>
            <View
              style={[
                styles.legendDestinationDot,
                destination.type === 'pharmacy'
                  ? styles.pharmacyMarker
                  : styles.customerMarker,
              ]}
            />

            <Text style={styles.legendText}>
              {destination.type === 'pharmacy'
                ? 'Pharmacie'
                : 'Client'}
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={openExternalNavigation}
        style={({ pressed }) => [
          styles.navigationButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.navigationButtonText}>
          Ouvrir l’itinéraire
        </Text>
      </Pressable>

      <Text style={styles.navigationHint}>
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
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 3,
  },

  destinationTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },

  destinationAddress: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },

  recenterButton: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  recenterButtonText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
  },

  mapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },

  map: {
    flex: 1,
  },

  agentMarkerOuter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(37, 99, 235, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  agentMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563EB',
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

  pharmacyMarker: {
    backgroundColor: '#059669',
  },

  customerMarker: {
    backgroundColor: '#EA580C',
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

  pharmacyPointer: {
    borderTopColor: '#059669',
  },

  customerPointer: {
    borderTopColor: '#EA580C',
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

  legendAgentDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#2563EB',
    marginRight: 6,
  },

  legendDestinationDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 6,
  },

  legendText: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '700',
  },

  navigationButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#0F766E',
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
    color: '#64748B',
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
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },

  unavailableTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },

  unavailableText: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
})