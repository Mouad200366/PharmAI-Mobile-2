import {
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type {
  CustomerDeliveryIncident,
  CustomerDeliveryIncidentStatus,
} from '../../api/orders'
import Icon from '../ui/Icon'

const ERROR = '#D92D20'
const ERROR_DARK = '#B42318'
const TEXT = '#0B1F4D'
const MUTED = '#667791'

type Props = {
  incident: CustomerDeliveryIncident
}

type IncidentPresentation = {
  icon: string
  title: string
  description: string
}

const PRESENTATION: Record<
  CustomerDeliveryIncidentStatus,
  IncidentPresentation
> = {
  open: {
    icon: 'report_problem',
    title: 'Livraison interrompue',
    description:
      'Un incident a été signalé pendant la livraison. La remise reste suspendue jusqu’à sa résolution.',
  },
  return_required: {
    icon: 'assignment_return',
    title: 'Retour à la pharmacie requis',
    description:
      'La livraison ne peut pas continuer. La commande doit être retournée à la pharmacie.',
  },
  returning: {
    icon: 'keyboard_return',
    title: 'Retour en cours',
    description:
      'Le livreur retourne actuellement la commande à la pharmacie.',
  },
  returned: {
    icon: 'inventory_2',
    title: 'Commande retournée',
    description:
      'Le retour à la pharmacie a été vérifié. Le statut final sera synchronisé dès sa finalisation.',
  },
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PatientDeliveryIncidentCard({
  incident,
}: Props) {
  const presentation = PRESENTATION[incident.status]
  const updatedAt = formatUpdatedAt(incident.updated_at)

  return (
    <View style={styles.card}>
      <View style={styles.iconContainer}>
        <Icon
          name={presentation.icon}
          size={23}
          color={ERROR}
        />
      </View>

      <View style={styles.copy}>
        <Text style={styles.eyebrow}>INCIDENT DE LIVRAISON</Text>
        <Text style={styles.title}>{presentation.title}</Text>
        <Text style={styles.description}>
          {presentation.description}
        </Text>

        <View style={styles.securityRow}>
          <Icon
            name="privacy_tip"
            size={15}
            color={ERROR_DARK}
          />
          <Text style={styles.securityText}>
            Le suivi normal et le code de remise sont masqués pendant cet incident.
          </Text>
        </View>

        {updatedAt ? (
          <Text style={styles.updatedAt}>
            Mise à jour : {updatedAt}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 13,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 18,
    backgroundColor: '#FFF7F7',
  },
  iconContainer: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFF0F0',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.85,
    color: ERROR,
  },
  title: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: TEXT,
  },
  description: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
    color: MUTED,
  },
  securityRow: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 9,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  securityText: {
    flex: 1,
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: '600',
    color: ERROR_DARK,
  },
  updatedAt: {
    marginTop: 7,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '600',
    color: MUTED,
  },
})
