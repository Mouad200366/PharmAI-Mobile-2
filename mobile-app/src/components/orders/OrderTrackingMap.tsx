import { useEffect, useMemo, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MapView, {
  Marker,
  type LatLng,
  type Region,
} from 'react-native-maps'

import Icon from '../ui/Icon'
import { colors } from '../../theme/colors'

type OrderTrackingMapProps = {
  customerLatitude: number | null
  customerLongitude: number | null
  agentLatitude: number | null
  agentLongitude: number | null
  height?: number
}

const DEFAULT_REGION: Region = {
  latitude: 33.5731,
  longitude: -7.5898,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
}

const SINGLE_MARKER_DELTA = 0.015

export default function OrderTrackingMap({
  customerLatitude,
  customerLongitude,
  agentLatitude,
  agentLongitude,
  height = 280,
}: OrderTrackingMapProps) {
  const mapRef = useRef<MapView | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const customerCoordinate = useMemo(
    () =>
      createCoordinate(
        customerLatitude,
        customerLongitude,
      ),
    [customerLatitude, customerLongitude],
  )

  const agentCoordinate = useMemo(
    () => createCoordinate(agentLatitude, agentLongitude),
    [agentLatitude, agentLongitude],
  )

  const initialRegion = useMemo(
    () =>
      createRegion(
        customerCoordinate ?? agentCoordinate,
      ),
    [agentCoordinate, customerCoordinate],
  )

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return
    }

    const coordinates = [
      customerCoordinate,
      agentCoordinate,
    ].filter((coordinate): coordinate is LatLng => Boolean(coordinate))

    if (coordinates.length >= 2) {
      mapRef.current.fitToCoordinates(coordinates, {
        animated: true,
        edgePadding: {
          top: 70,
          right: 55,
          bottom: 70,
          left: 55,
        },
      })
      return
    }

    const onlyCoordinate = coordinates[0]

    if (onlyCoordinate) {
      mapRef.current.animateToRegion(
        createRegion(onlyCoordinate),
        450,
      )
    }
  }, [agentCoordinate, customerCoordinate, mapReady])

  if (!customerCoordinate && !agentCoordinate) {
    return (
      <View
        style={[styles.unavailableContainer, { height }]}
        accessibilityRole="text"
      >
        <View style={styles.unavailableIconContainer}>
          <Icon
            name="location_off"
            size={28}
            color={colors.textSecondary}
          />
        </View>
        <Text style={styles.unavailableTitle}>
          Carte temporairement indisponible
        </Text>
        <Text style={styles.unavailableDescription}>
          La carte apparaîtra dès qu’une position valide sera disponible.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={[styles.map, { height }]}
        initialRegion={initialRegion}
        onMapReady={() => setMapReady(true)}
        loadingEnabled
        loadingIndicatorColor={colors.primary}
        loadingBackgroundColor={colors.surface}
        showsCompass
        showsScale={false}
        showsTraffic={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        accessibilityLabel="Carte de suivi de la commande"
      >
        {customerCoordinate ? (
          <Marker
            coordinate={customerCoordinate}
            title="Adresse de livraison"
            description="Destination de la commande"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <MapMarker
              icon="home"
              backgroundColor={colors.primary}
              accessibilityLabel="Adresse de livraison"
            />
          </Marker>
        ) : null}

        {agentCoordinate ? (
          <Marker
            coordinate={agentCoordinate}
            title="Livreur"
            description="Dernière position reçue"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <MapMarker
              icon="local_shipping"
              backgroundColor={colors.secondary}
              accessibilityLabel="Position du livreur"
            />
          </Marker>
        ) : null}
      </MapView>

      <View style={styles.legend} pointerEvents="none">
        <LegendItem
          icon="home"
          label="Votre adresse"
          backgroundColor={colors.primary}
        />
        <LegendItem
          icon="local_shipping"
          label="Livreur"
          backgroundColor={colors.secondary}
        />
      </View>
    </View>
  )
}

function MapMarker({
  icon,
  backgroundColor,
  accessibilityLabel,
}: {
  icon: string
  backgroundColor: string
  accessibilityLabel: string
}) {
  return (
    <View
      style={[
        styles.markerOuter,
        { borderColor: backgroundColor },
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={[
          styles.markerInner,
          { backgroundColor },
        ]}
      >
        <Icon
          name={icon}
          size={18}
          color={colors.white}
        />
      </View>
    </View>
  )
}

function LegendItem({
  icon,
  label,
  backgroundColor,
}: {
  icon: string
  label: string
  backgroundColor: string
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendIcon,
          { backgroundColor },
        ]}
      >
        <Icon
          name={icon}
          size={14}
          color={colors.white}
        />
      </View>
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  )
}

function createCoordinate(
  latitude: number | null,
  longitude: number | null,
): LatLng | null {
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null
  }

  return {
    latitude,
    longitude,
  }
}

function createRegion(
  coordinate: LatLng | null,
): Region {
  if (!coordinate) {
    return DEFAULT_REGION
  }

  return {
    ...coordinate,
    latitudeDelta: SINGLE_MARKER_DELTA,
    longitudeDelta: SINGLE_MARKER_DELTA,
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  map: {
    width: '100%',
  },
  legend: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.95)',
  },
  legendIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  markerOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 5,
  },
  markerInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  unavailableIconContainer: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: '#eef2f7',
  },
  unavailableTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  unavailableDescription: {
    marginTop: 7,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
})