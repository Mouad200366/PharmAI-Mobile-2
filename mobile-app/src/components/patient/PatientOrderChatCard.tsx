import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import Icon from '../ui/Icon'

const BLUE = '#073BDF'
const MUTED = '#667791'

type Props = {
  courierName: string
  onPress: () => void
}

export default function PatientOrderChatCard({
  courierName,
  onPress,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir la discussion avec ${courierName}`}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <Icon
          name="chat_bubble_outline"
          size={21}
          color={BLUE}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Chat avec le livreur</Text>
        <Text style={styles.description} numberOfLines={2}>
          Discutez avec {courierName} au sujet de cette livraison.
        </Text>
      </View>

      <Icon
        name="chevron_right"
        size={22}
        color={BLUE}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#CFE0FF',
    borderRadius: 16,
    backgroundColor: '#F8FBFF',
  },
  pressed: {
    opacity: 0.78,
  },
  iconContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#EEF5FF',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: BLUE,
  },
  description: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: MUTED,
  },
})
