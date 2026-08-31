import {
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  Camera,
  Map,
  Marker,
} from '@maplibre/maplibre-react-native'

import type {
  OrderLocationUpdateEvent,
} from '../../api/orderRealtime'
import type { OrderStatus } from '../../api/orders'
import Icon from '../ui/Icon'

const DEVELOPMENT_MAP_STYLE =
  'https://demotiles.maplibre.org/style.json'

const BLUE = '#073BDF'
const BLUE_2 = '#087DFF'
const TEXT = '#0B1F4D'
const MUTED = '#667791'
const LINE = '#DCE7F4'

type Props = {
  status: OrderStatus
  tracking: OrderLocationUpdateEvent | null
  deliveryLatitude: number | null
  deliveryLongitude: number | null
}

export default function PatientLiveDeliveryCard({
  status,
  tracking,
  deliveryLatitude,
  deliveryLongitude,
}: Props) {
  const isActive =
    status === 'picked_up' ||
    status === 'out_for_delivery'

  if (!isActive) {
    return null
  }

  const agentLatitude = tracking?.agent_latitude
  const agentLongitude = tracking?.agent_longitude

  const hasAgentLocation =
    isFiniteCoordinate(agentLatitude) &&
    isFiniteCoordinate(agentLongitude)

  const hasDeliveryLocation =
    isFiniteCoordinate(deliveryLatitude) &&
    isFiniteCoordinate(deliveryLongitude)

  const canShowMap = hasAgentLocation && hasDeliveryLocation

  const bounds = canShowMap
    ? makeBounds(
        agentLatitude!,
        agentLongitude!,
        deliveryLatitude!,
        deliveryLongitude!,
      )
    : null

  const cameraKey = canShowMap
    ? [
        agentLatitude,
        agentLongitude,
        deliveryLatitude,
        deliveryLongitude,
      ].join(':')
    : 'waiting'

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Livraison en cours</Text>
          <Text style={styles.subtitle}>
            Position, distance et estimation mises à jour en direct.
          </Text>
        </View>

        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      <View style={styles.deliveryGrid}>
        <View style={styles.mapFrame}>
          {bounds ? (
            <Map
              style={styles.map}
              mapStyle={DEVELOPMENT_MAP_STYLE}
              dragPan={false}
              touchZoom={false}
              doubleTapZoom={false}
              doubleTapHoldZoom={false}
              touchRotate={false}
              touchPitch={false}
              compass={false}
              attribution={false}
              logo={false}
            >
              <Camera
                key={cameraKey}
                initialViewState={{
                  bounds,
                  padding: {
                    top: 36,
                    right: 30,
                    bottom: 36,
                    left: 30,
                  },
                }}
              />

              <Marker
                id="patient-live-courier"
                lngLat={[agentLongitude!, agentLatitude!]}
              >
                <MapMarker
                  icon="two_wheeler"
                  backgroundColor={BLUE}
                />
              </Marker>

              <Marker
                id="patient-live-destination"
                lngLat={[deliveryLongitude!, deliveryLatitude!]}
              >
                <MapMarker
                  icon="location_on"
                  backgroundColor={BLUE_2}
                />
              </Marker>
            </Map>
          ) : (
            <View style={styles.waitingMap}>
              <View style={styles.waitingIcon}>
                <Icon
                  name="location_searching"
                  size={25}
                  color={BLUE}
                />
              </View>
              <Text style={styles.waitingTitle}>
                Position GPS en attente
              </Text>
              <Text style={styles.waitingText}>
                La carte apparaîtra dès qu’une position récente sera reçue.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.metricsColumn}>
          <Metric
            icon="route"
            label="Distance restante"
            value={formatDistance(tracking?.distance_to_customer_m)}
          />
          <Metric
            icon="schedule"
            label="Temps estimé"
            value={formatEta(tracking?.eta_minutes)}
          />

          <View style={styles.syncBox}>
            <Icon
              name="sync"
              size={15}
              color={BLUE}
            />
            <Text style={styles.syncText} numberOfLines={2}>
              {tracking?.location_updated_at
                ? `Mise à jour ${formatUpdatedAt(tracking.location_updated_at)}`
                : 'En attente de la première position'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

function MapMarker({
  icon,
  backgroundColor,
}: {
  icon: string
  backgroundColor: string
}) {
  return (
    <View style={styles.markerOuter}>
      <View
        style={[
          styles.markerInner,
          { backgroundColor },
        ]}
      >
        <Icon
          name={icon}
          size={17}
          color="#FFFFFF"
        />
      </View>
    </View>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: string
  label: string
  value: string
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}>
        <Icon
          name={icon}
          size={17}
          color={BLUE}
        />
      </View>
      <View style={styles.metricCopy}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
    </View>
  )
}

function isFiniteCoordinate(
  value: number | null | undefined,
): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function makeBounds(
  agentLatitude: number,
  agentLongitude: number,
  deliveryLatitude: number,
  deliveryLongitude: number,
): [number, number, number, number] {
  const west = Math.min(agentLongitude, deliveryLongitude)
  const south = Math.min(agentLatitude, deliveryLatitude)
  const east = Math.max(agentLongitude, deliveryLongitude)
  const north = Math.max(agentLatitude, deliveryLatitude)

  const longitudePadding = Math.max((east - west) * 0.2, 0.002)
  const latitudePadding = Math.max((north - south) * 0.2, 0.002)

  return [
    west - longitudePadding,
    south - latitudePadding,
    east + longitudePadding,
    north + latitudePadding,
  ]
}

function formatDistance(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }

  if (value < 1000) {
    return `${Math.max(0, Math.round(value))} m`
  }

  return `${(value / 1000).toFixed(1)} km`
}

function formatEta(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }

  return `${Math.max(1, Math.round(value))} min`
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'récemment'
  }

  return `à ${date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

const styles = StyleSheet.create({
  card: {
    gap: 11,
    padding: 12,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',

    shadowColor: '#0B3474',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.055,
    shadowRadius: 10,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: TEXT,
  },
  subtitle: {
    marginTop: 2,
    maxWidth: 255,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: MUTED,
  },
  livePill: {
    minHeight: 27,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: '#EAFBF4',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#12B981',
  },
  liveText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    color: '#087A55',
  },
  deliveryGrid: {
    flexDirection: 'row',
    gap: 9,
  },
  mapFrame: {
    flex: 1.45,
    height: 185,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D5E4F3',
    borderRadius: 15,
    backgroundColor: '#EAF3FF',
  },
  map: {
    flex: 1,
  },
  waitingMap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  waitingIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  waitingTitle: {
    marginTop: 8,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    textAlign: 'center',
    color: TEXT,
  },
  waitingText: {
    marginTop: 3,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '600',
    textAlign: 'center',
    color: MUTED,
  },
  metricsColumn: {
    flex: 0.95,
    gap: 7,
  },
  metric: {
    flex: 1,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor: '#F7FAFF',
  },
  metricIcon: {
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#EEF5FF',
  },
  metricCopy: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: '700',
    color: MUTED,
  },
  metricValue: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: TEXT,
  },
  syncBox: {
    minHeight: 47,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#D7E7FF',
    borderRadius: 12,
    backgroundColor: '#EEF5FF',
  },
  syncText: {
    flex: 1,
    fontSize: 7.5,
    lineHeight: 11,
    fontWeight: '700',
    color: BLUE,
  },
  markerOuter: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
  },
  markerInner: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
})
