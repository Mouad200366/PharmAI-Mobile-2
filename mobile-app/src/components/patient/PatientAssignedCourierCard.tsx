import {
  StyleSheet,
  Text,
  View,
} from 'react-native'

import Icon from '../ui/Icon'

const BLUE = '#073BDF'
const BLUE_SOFT = '#EEF5FF'
const TEXT = '#0B1F4D'
const MUTED = '#667791'
const LINE = '#DCE7F4'
const CYAN = '#10D1D0'

type Props = {
  name: string
}

export default function PatientAssignedCourierCard({
  name,
}: Props) {
  const displayName = name.trim()

  if (!displayName) {
    return null
  }

  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Icon
          name="two_wheeler"
          size={27}
          color={BLUE}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>LIVREUR ASSIGNÉ</Text>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.verifiedBadge}>
            <Icon
              name="verified"
              size={13}
              color="#FFFFFF"
            />
          </View>
        </View>
        <Text style={styles.description}>
          Affectation confirmée pour cette livraison
        </Text>
      </View>

      <View style={styles.statusPill}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Assigné</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',

    shadowColor: '#0B3474',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.055,
    shadowRadius: 9,
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D7E7FF',
    backgroundColor: BLUE_SOFT,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.9,
    color: BLUE,
  },
  nameRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: TEXT,
  },
  verifiedBadge: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#087DFF',
  },
  description: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: MUTED,
  },
  statusPill: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: '#EAFBFA',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: CYAN,
  },
  statusText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    color: '#0F766E',
  },
})
