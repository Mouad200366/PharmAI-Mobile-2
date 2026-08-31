import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { patientDeliveryApi } from '../../api/patientDelivery'
import { firstError } from '../../api/errors'
import Icon from '../ui/Icon'

const GREEN = '#118A5B'
const GREEN_DARK = '#087A55'
const GREEN_SOFT = '#F0FBF6'
const MUTED = '#667791'
const ERROR = '#D92D20'

type Props = {
  orderId: number
}

function formatExpiry(value: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PatientDeliveryPinCard({
  orderId,
}: Props) {
  const [pin, setPin] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expiryLabel = formatExpiry(expiresAt)

  async function issuePin() {
    if (issuing) {
      return
    }

    setIssuing(true)
    setError(null)

    try {
      const response = await patientDeliveryApi.issuePin(orderId)
      const nextPin = String(response.data.pin ?? '').trim()

      if (!/^\d{6}$/.test(nextPin)) {
        setPin(null)
        setExpiresAt(null)
        setError(
          'Le serveur a renvoyé un code de livraison invalide. Réessayez.',
        )
        return
      }

      setPin(nextPin)
      setExpiresAt(response.data.expires_at)
    } catch (issueError) {
      setError(
        firstError(issueError)
        || 'Impossible de générer le code de livraison pour le moment.',
      )
    } finally {
      setIssuing(false)
    }
  }

  function handleGeneratePress() {
    if (!pin) {
      void issuePin()
      return
    }

    Alert.alert(
      'Générer un nouveau code ?',
      'Le code actuel sera remplacé et ne pourra plus être utilisé par le livreur.',
      [
        {
          text: 'Garder le code actuel',
          style: 'cancel',
        },
        {
          text: 'Nouveau code',
          onPress: () => {
            void issuePin()
          },
        },
      ],
    )
  }

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.iconContainer}>
          <Icon
            name="verified_user"
            size={21}
            color={GREEN}
          />
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>Code de livraison</Text>
          <Text style={styles.subtitle}>
            Partagez ce code uniquement avec le livreur au moment de la remise.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            pin
              ? 'Générer un nouveau code de livraison'
              : 'Afficher le code de livraison'
          }
          disabled={issuing}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && !issuing && styles.pressed,
            issuing && styles.disabled,
          ]}
          onPress={handleGeneratePress}
        >
          {issuing ? (
            <ActivityIndicator
              size="small"
              color={GREEN}
            />
          ) : (
            <Icon
              name={pin ? 'refresh' : 'key'}
              size={19}
              color={GREEN}
            />
          )}
        </Pressable>
      </View>

      {pin ? (
        <View style={styles.pinArea}>
          <Text
            selectable
            style={styles.pin}
            accessibilityLabel={`Code de livraison ${pin}`}
          >
            {pin.split('').join('  ')}
          </Text>

          {expiryLabel ? (
            <View style={styles.expiryRow}>
              <Icon
                name="schedule"
                size={14}
                color={MUTED}
              />
              <Text style={styles.expiryText}>
                Valable jusqu’à {expiryLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={issuing}
          style={({ pressed }) => [
            styles.revealButton,
            pressed && !issuing && styles.pressed,
            issuing && styles.disabled,
          ]}
          onPress={handleGeneratePress}
        >
          {issuing ? (
            <ActivityIndicator
              size="small"
              color="#FFFFFF"
            />
          ) : (
            <Icon
              name="key"
              size={17}
              color="#FFFFFF"
            />
          )}
          <Text style={styles.revealButtonText}>
            {issuing ? 'Génération…' : 'Afficher mon code'}
          </Text>
        </Pressable>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Icon
            name="error_outline"
            size={17}
            color={ERROR}
          />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {pin ? (
        <Text style={styles.securityNotice}>
          Ne partagez pas ce code avant d’avoir physiquement reçu votre commande.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: '#CDEBDD',
    borderRadius: 18,
    backgroundColor: GREEN_SOFT,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: GREEN_DARK,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: MUTED,
  },
  actionButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CDEBDD',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  pinArea: {
    marginTop: 12,
    alignItems: 'center',
    paddingTop: 5,
  },
  pin: {
    paddingLeft: 2,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '900',
    color: GREEN,
    textAlign: 'center',
  },
  expiryRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  expiryText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: MUTED,
  },
  revealButton: {
    minHeight: 42,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: GREEN,
  },
  revealButtonText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  errorBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 9,
    borderRadius: 11,
    backgroundColor: '#FFF1F1',
  },
  errorText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: ERROR,
  },
  securityNotice: {
    marginTop: 8,
    fontSize: 8.5,
    lineHeight: 12,
    textAlign: 'center',
    color: MUTED,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.62,
  },
})
