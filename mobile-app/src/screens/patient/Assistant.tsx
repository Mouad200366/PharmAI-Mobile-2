import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type {
  BottomTabScreenProps,
} from '@react-navigation/bottom-tabs'
import {
  useFocusEffect,
} from '@react-navigation/native'
import type {
  CompositeScreenProps,
} from '@react-navigation/native'
import type {
  NativeStackScreenProps,
} from '@react-navigation/native-stack'

import {
  addressesApi,
  type Address,
} from '../../api/addresses'
import {
  catalogApi,
  type Medicine,
} from '../../api/catalog'
import {
  checkPharmAgentHealth,
  streamAssist,
  type AssistFinalPayload,
  type PharmacyOption,
  type PharmacyOptions,
} from '../../api/pharmagent'
import Icon from '../../components/ui/Icon'
import type {
  AppTabParamList,
  MainStackParamList,
} from '../../navigation/types'
import {
  colors,
} from '../../theme/colors'

type Props = CompositeScreenProps<
  BottomTabScreenProps<
    AppTabParamList,
    'Assistant'
  >,
  NativeStackScreenProps<
    MainStackParamList
  >
>

type AgentKey =
  | 'triage'
  | 'medical'
  | 'pharmacy'
  | 'validator'

type AgentStatus =
  | 'idle'
  | 'active'
  | 'done'

type PharmAgentServiceStatus =
  | 'checking'
  | 'available'
  | 'unavailable'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  kind:
    | 'text'
    | 'loading'
    | 'response'
    | 'connection_error'
    | 'stopped'
  text?: string
  response?: AssistFinalPayload
  retryQuery?: string
}

interface QuickAction {
  icon: string
  title: string
  description: string
  prompt: string
}

const AGENT_MAP: Record<string, AgentKey> = {
  triage: 'triage',
  medical: 'medical',
  pharmacy: 'pharmacy',
  validator: 'validator',
  emergency: 'validator',
}

const AGENT_NODES: {
  key: AgentKey
  icon: string
  name: string
  description: string
}[] = [
  {
    key: 'triage',
    icon: 'clinical_notes',
    name: 'Triage',
    description: 'Comprend la demande',
  },
  {
    key: 'medical',
    icon: 'medical_information',
    name: 'Médical',
    description: 'Analyse les informations',
  },
  {
    key: 'pharmacy',
    icon: 'local_pharmacy',
    name: 'Pharmacie',
    description: 'Recherche les options',
  },
  {
    key: 'validator',
    icon: 'verified',
    name: 'Contrôle',
    description: 'Vérifie la réponse',
  },
]

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: 'medication',
    title: 'Médicament',
    description: 'Usage, précautions et informations',
    prompt: 'Je veux comprendre ce médicament : ',
  },
  {
    icon: 'healing',
    title: 'Symptômes',
    description: 'Décrivez ce que vous ressentez',
    prompt: "J'ai les symptômes suivants : ",
  },
  {
    icon: 'warning_amber',
    title: 'Interactions',
    description: 'Vérifier plusieurs médicaments',
    prompt: 'Vérifie les interactions entre ces médicaments : ',
  },
  {
    icon: 'local_pharmacy',
    title: 'Pharmacie',
    description: 'Chercher une option disponible',
    prompt: 'Je cherche une pharmacie pour ce médicament : ',
  },
]

const STATUS_META: Record<
  string,
  {
    label: string
    icon: string
    background: string
    border: string
    text: string
  }
> = {
  APPROVED: {
    label: 'Analyse validée',
    icon: 'check_circle',
    background: '#ecfdf5',
    border: '#bbf7d0',
    text: '#047857',
  },
  EMERGENCY: {
    label: 'Urgence potentielle',
    icon: 'emergency',
    background: '#fef2f2',
    border: '#fecaca',
    text: colors.error,
  },
  REJECTED: {
    label: 'Réponse non validée',
    icon: 'report',
    background: '#fffbeb',
    border: '#fde68a',
    text: '#b45309',
  },
  UNKNOWN: {
    label: 'À vérifier',
    icon: 'help_outline',
    background: '#f9fafb',
    border: colors.outlineVariant,
    text: colors.textSecondary,
  },
}

let idCounter = 0

function genId() {
  idCounter += 1
  return `msg_${Date.now()}_${idCounter}`
}

function emptyAgentStatuses(): Record<
  AgentKey,
  AgentStatus
> {
  return {
    triage: 'idle',
    medical: 'idle',
    pharmacy: 'idle',
    validator: 'idle',
  }
}

function parseCoordinate(
  value: unknown,
): number | null {
  if (
    value === null
    || value === undefined
    || value === ''
  ) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : null
}

function addressCoordinates(
  address: Address,
): {
  latitude: number
  longitude: number
} | null {
  const latitude =
    parseCoordinate(
      address.latitude,
    )

  const longitude =
    parseCoordinate(
      address.longitude,
    )

  if (
    latitude === null
    || longitude === null
  ) {
    return null
  }

  if (
    Math.abs(latitude)
      < 0.000001
    && Math.abs(longitude)
      < 0.000001
  ) {
    return null
  }

  return {
    latitude,
    longitude,
  }
}

function chooseAssistantAddress(
  addresses: Address[],
): Address | null {
  const validAddresses =
    addresses.filter(
      (address) =>
        addressCoordinates(
          address,
        ) !== null,
    )

  return (
    validAddresses.find(
      (address) =>
        address.is_default,
    )
    ?? validAddresses[0]
    ?? null
  )
}

function normalizeMedicineName(
  value: string,
) {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' ',
    )
    .trim()
}

function chooseCatalogMedicine(
  requestedName: string,
  medicines: Medicine[],
): Medicine | null {
  const requested =
    normalizeMedicineName(
      requestedName,
    )

  if (!requested) {
    return null
  }

  const exact =
    medicines.find(
      (medicine) =>
        normalizeMedicineName(
          medicine.name,
        ) === requested
        || normalizeMedicineName(
          medicine.generic_name,
        ) === requested,
    )

  if (exact) {
    return exact
  }

  const close =
    medicines.find(
      (medicine) => {
        const name =
          normalizeMedicineName(
            medicine.name,
          )

        const generic =
          normalizeMedicineName(
            medicine.generic_name,
          )

        return (
          (
            name
            && (
              requested.includes(
                name,
              )
              || name.includes(
                requested,
              )
            )
          )
          || (
            generic
            && (
              requested.includes(
                generic,
              )
              || generic.includes(
                requested,
              )
            )
          )
        )
      },
    )

  return (
    close
    ?? medicines[0]
    ?? null
  )
}

function toDisplayText(
  value: unknown,
): string {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (
    typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toDisplayText(item))
      .filter(Boolean)
      .join('\n')
  }

  if (typeof value === 'object') {
    return Object.entries(
      value as Record<string, unknown>,
    )
      .map(([key, nestedValue]) => {
        const label = key
          .replace(/_/g, ' ')
          .replace(
            /\b\w/g,
            (letter) => letter.toUpperCase(),
          )

        const text =
          toDisplayText(nestedValue)

        return text
          ? `${label}: ${text}`
          : ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return String(value)
}

function displayList(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    const single = toDisplayText(value)
    return single ? [single] : []
  }

  return value
    .map((item) => toDisplayText(item))
    .filter(Boolean)
}

type AvailabilityOption =
  PharmacyOption & {
    medicine: string
    medicine_name?: string
    generic_name?: string
    available_count?: number
    eta_minutes?: number | null
    requires_prescription?: boolean
    source?: string
  }

function buildAvailabilityList(
  options: PharmacyOptions,
): AvailabilityOption[] {
  const all: AvailabilityOption[] = []

  Object.entries(options || {}).forEach(
    ([medicine, list]) => {
      if (!Array.isArray(list)) {
        return
      }

      list.forEach((option) => {
        all.push({
          ...option,
          medicine,
        })
      })
    },
  )

  all.sort(
    (a, b) =>
      (a.distance_km ?? 99)
      - (b.distance_km ?? 99),
  )

  return all
}

function getStatusMeta(
  status?: string,
) {
  if (status && STATUS_META[status]) {
    return STATUS_META[status]
  }

  return {
    label: status || 'Analyse terminée',
    icon: 'info',
    background: '#f9fafb',
    border: colors.outlineVariant,
    text: colors.textSecondary,
  }
}

export default function Assistant({
  navigation,
  route,
}: Props) {
  const [
    messages,
    setMessages,
  ] = useState<ChatMessage[]>([])

  const [
    input,
    setInput,
  ] = useState('')

  const [
    hasPrescription,
    setHasPrescription,
  ] = useState(false)

  const [
    sending,
    setSending,
  ] = useState(false)

  const [
    agentStatuses,
    setAgentStatuses,
  ] = useState<
    Record<AgentKey, AgentStatus>
  >(emptyAgentStatuses)

  const [
    finalStatus,
    setFinalStatus,
  ] = useState<string | null>(null)

  const [
    assistantAddress,
    setAssistantAddress,
  ] = useState<Address | null>(null)

  const [
    addressLoading,
    setAddressLoading,
  ] = useState(true)

  const [
    addressError,
    setAddressError,
  ] = useState(false)

  const [
    openingMedicine,
    setOpeningMedicine,
  ] = useState<string | null>(null)

  const [
    serviceStatus,
    setServiceStatus,
  ] = useState<PharmAgentServiceStatus>(
    'checking',
  )

  const scrollRef =
    useRef<ScrollView>(null)

  const inputRef =
    useRef<TextInput>(null)

  const abortRef =
    useRef<(() => void) | null>(null)

  const cancelledRef =
    useRef(false)

  const processedAutoRequests =
    useRef<Set<string>>(new Set())

  useEffect(() => {
    return () => {
      abortRef.current?.()
    }
  }, [])

  const refreshServiceStatus =
    useCallback(async () => {
      setServiceStatus('checking')

      try {
        await checkPharmAgentHealth()
        setServiceStatus('available')
      } catch {
        setServiceStatus(
          'unavailable',
        )
      }
    }, [])

  useFocusEffect(
    useCallback(() => {
      let active = true

      const checkHealth =
        async () => {
          try {
            await checkPharmAgentHealth()

            if (active) {
              setServiceStatus(
                'available',
              )
            }
          } catch {
            if (active) {
              setServiceStatus(
                'unavailable',
              )
            }
          }
        }

      setServiceStatus('checking')
      void checkHealth()

      const interval =
        setInterval(
          () => {
            void checkHealth()
          },
          30_000,
        )

      return () => {
        active = false
        clearInterval(interval)
      }
    }, []),
  )

  useFocusEffect(
    useCallback(() => {
      let active = true

      setAddressLoading(true)

      addressesApi
        .list()
        .then((response) => {
          if (!active) {
            return
          }

          setAssistantAddress(
            chooseAssistantAddress(
              response.data.results,
            ),
          )
          setAddressError(false)
        })
        .catch(() => {
          if (!active) {
            return
          }

          setAssistantAddress(null)
          setAddressError(true)
        })
        .finally(() => {
          if (active) {
            setAddressLoading(false)
          }
        })

      return () => {
        active = false
      }
    }, []),
  )

  const resetPipeline =
    useCallback(() => {
      setAgentStatuses(
        emptyAgentStatuses(),
      )
      setFinalStatus(null)
    }, [])

  const markAgentActive =
    useCallback((agentKey: string) => {
      setAgentStatuses(
        (previousStatuses) => {
          const nextStatuses = {
            ...previousStatuses,
          }

          ;(
            Object.keys(
              nextStatuses,
            ) as AgentKey[]
          ).forEach((key) => {
            if (
              nextStatuses[key]
              === 'active'
            ) {
              nextStatuses[key] =
                'done'
            }
          })

          const mappedAgent =
            AGENT_MAP[agentKey]

          if (mappedAgent) {
            nextStatuses[
              mappedAgent
            ] = 'active'
          }

          return nextStatuses
        },
      )
    }, [])

  const finalizePipeline =
    useCallback(() => {
      setAgentStatuses(
        (previousStatuses) => {
          const nextStatuses = {
            ...previousStatuses,
          }

          ;(
            Object.keys(
              nextStatuses,
            ) as AgentKey[]
          ).forEach((key) => {
            if (
              nextStatuses[key]
              === 'active'
            ) {
              nextStatuses[key] =
                'done'
            }
          })

          return nextStatuses
        },
      )
    }, [])

  const removeLoadingMessage =
    useCallback((loadingId: string) => {
      setMessages(
        (currentMessages) =>
          currentMessages.filter(
            (message) =>
              message.id
              !== loadingId,
          ),
      )
    }, [])

  const sendQuery = useCallback(
    async (query: string) => {
      const normalizedQuery =
        query.trim()

      if (
        !normalizedQuery
        || sending
      ) {
        return
      }

      if (
        serviceStatus
        === 'unavailable'
      ) {
        setMessages(
          (currentMessages) => [
            ...currentMessages,
            {
              id: genId(),
              role: 'assistant',
              kind:
                'connection_error',
              text:
                'Le service PharmAgent est actuellement indisponible. Touchez « Indisponible » en haut de l’écran pour réessayer.',
              retryQuery:
                normalizedQuery,
            },
          ],
        )
        return
      }

      if (addressLoading) {
        setMessages(
          (currentMessages) => [
            ...currentMessages,
            {
              id: genId(),
              role: 'assistant',
              kind: 'text',
              text:
                'Chargement de votre adresse en cours. Réessayez dans un instant.',
            },
          ],
        )
        return
      }

      const coordinates =
        assistantAddress
          ? addressCoordinates(
              assistantAddress,
            )
          : null

      if (!coordinates) {
        setMessages(
          (currentMessages) => [
            ...currentMessages,
            {
              id: genId(),
              role: 'assistant',
              kind: 'text',
              text:
                'PharmAgent a besoin d’une adresse enregistrée avec une position GPS valide pour rechercher les pharmacies autour de vous. Ajoutez ou corrigez votre adresse depuis Profil → Mes adresses, puis revenez ici.',
            },
          ],
        )
        return
      }

      cancelledRef.current = false

      setMessages(
        (currentMessages) => [
          ...currentMessages,
          {
            id: genId(),
            role: 'user',
            kind: 'text',
            text: normalizedQuery,
          },
        ],
      )

      setInput('')
      resetPipeline()
      setSending(true)

      const loadingId = genId()

      setMessages(
        (currentMessages) => [
          ...currentMessages,
          {
            id: loadingId,
            role: 'assistant',
            kind: 'loading',
          },
        ],
      )

      let finalData:
        AssistFinalPayload
        | null = null

      let streamError:
        string
        | null = null

      const {
        promise,
        abort,
      } = streamAssist(
        {
          user_query:
            normalizedQuery,
          user_lat:
            coordinates.latitude,
          user_lng:
            coordinates.longitude,
          has_prescription:
            hasPrescription,
        },
        (event) => {
          if (
            event.type
            === 'agent_step'
          ) {
            setServiceStatus(
              'available',
            )
            markAgentActive(
              event.agent,
            )
          } else if (
            event.type
            === 'final'
          ) {
            setServiceStatus(
              'available',
            )
            finalData = event
            finalizePipeline()
            setFinalStatus(
              event.status,
            )
          } else if (
            event.type
            === 'error'
          ) {
            streamError =
              event.error
          }
        },
      )

      abortRef.current = abort

      try {
        await promise

        removeLoadingMessage(
          loadingId,
        )

        if (
          cancelledRef.current
        ) {
          setMessages(
            (currentMessages) => [
              ...currentMessages,
              {
                id: genId(),
                role: 'assistant',
                kind: 'stopped',
                text:
                  'Analyse arrêtée.',
              },
            ],
          )
          return
        }

        if (streamError) {
          setMessages(
            (currentMessages) => [
              ...currentMessages,
              {
                id: genId(),
                role: 'assistant',
                kind:
                  'connection_error',
                text:
                  streamError
                  ?? 'Une erreur est survenue pendant l’analyse.',
                retryQuery:
                  normalizedQuery,
              },
            ],
          )
        } else if (
          finalData !== null
        ) {
          const responseData:
            AssistFinalPayload =
              finalData

          setMessages(
            (currentMessages) => [
              ...currentMessages,
              {
                id: genId(),
                role: 'assistant',
                kind: 'response',
                response:
                  responseData,
              },
            ],
          )
        } else {
          setMessages(
            (currentMessages) => [
              ...currentMessages,
              {
                id: genId(),
                role: 'assistant',
                kind:
                  'connection_error',
                text:
                  'Aucune réponse complète n’a été reçue.',
                retryQuery:
                  normalizedQuery,
              },
            ],
          )
        }
      } catch {
        setServiceStatus(
          'unavailable',
        )
        removeLoadingMessage(
          loadingId,
        )

        if (
          cancelledRef.current
        ) {
          setMessages(
            (currentMessages) => [
              ...currentMessages,
              {
                id: genId(),
                role: 'assistant',
                kind: 'stopped',
                text:
                  'Analyse arrêtée.',
              },
            ],
          )
          return
        }

        setMessages(
          (currentMessages) => [
            ...currentMessages,
            {
              id: genId(),
              role: 'assistant',
              kind:
                'connection_error',
              text:
                "Impossible de contacter PharmAgent. Vérifiez que le service est démarré puis réessayez.",
              retryQuery:
                normalizedQuery,
            },
          ],
        )
      } finally {
        setSending(false)
        abortRef.current = null
        cancelledRef.current =
          false
      }
    },
    [
      addressLoading,
      assistantAddress,
      finalizePipeline,
      hasPrescription,
      markAgentActive,
      removeLoadingMessage,
      resetPipeline,
      sending,
      serviceStatus,
    ],
  )

  const openRecommendedMedicine =
    useCallback(
      async (
        medicineName: string,
      ) => {
        const query =
          medicineName.trim()

        if (
          !query
          || openingMedicine
        ) {
          return
        }

        setOpeningMedicine(query)

        try {
          const response =
            await catalogApi.list({
              search: query,
              ordering: 'name',
            })

          const medicine =
            chooseCatalogMedicine(
              query,
              response.data.results,
            )

          if (!medicine) {
            Alert.alert(
              'Médicament introuvable',
              `« ${query} » n’est pas encore disponible dans le catalogue PharmAI.`,
            )
            return
          }

          navigation.navigate(
            'MedicineDetails',
            {
              id: medicine.id,
            },
          )
        } catch {
          Alert.alert(
            'Impossible d’ouvrir le médicament',
            'Le catalogue PharmAI est momentanément indisponible. Veuillez réessayer.',
          )
        } finally {
          setOpeningMedicine(null)
        }
      },
      [
        navigation,
        openingMedicine,
      ],
    )

  function handleSend() {
    void sendQuery(input)
  }

  function handleStop() {
    if (
      !sending
      || !abortRef.current
    ) {
      return
    }

    cancelledRef.current = true
    abortRef.current()
  }

  function handleQuickAction(
    action: QuickAction,
  ) {
    setInput(action.prompt)

    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }

  function startNewConversation() {
    if (
      messages.length === 0
      && !sending
    ) {
      return
    }

    Alert.alert(
      'Nouvelle conversation',
      'Effacer la conversation actuelle et recommencer ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Recommencer',
          onPress: () => {
            if (sending) {
              cancelledRef.current =
                true
              abortRef.current?.()
            }

            setMessages([])
            setInput('')
            setHasPrescription(
              false,
            )
            resetPipeline()
          },
        },
      ],
    )
  }

  useEffect(() => {
    const autoRequest =
      route.params?.autoRequest

    if (
      !autoRequest
      || sending
      || addressLoading
      || processedAutoRequests
        .current
        .has(
          autoRequest.requestId,
        )
    ) {
      return
    }

    processedAutoRequests
      .current
      .add(
        autoRequest.requestId,
      )

    navigation.setParams({
      autoRequest: undefined,
    })

    void sendQuery(
      autoRequest.prompt,
    )
  }, [
    addressLoading,
    navigation,
    route.params?.autoRequest,
    sendQuery,
    sending,
  ])

  const hasConversation =
    messages.length > 0

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
      keyboardVerticalOffset={
        Platform.OS === 'ios'
          ? 88
          : 0
      }
    >
      <LinearGradient
        colors={[
          colors.primary,
          '#00687a',
        ]}
        start={{
          x: 0,
          y: 0,
        }}
        end={{
          x: 1,
          y: 1,
        }}
        style={styles.header}
      >
        <View
          style={styles.headerLeft}
        >
          <View
            style={styles.headerIcon}
          >
            <Icon
              name="auto_awesome"
              size={20}
              color={colors.white}
            />
          </View>

          <View
            style={styles.headerText}
          >
            <Text
              style={styles.headerTitle}
            >
              PharmAgent
            </Text>

            <Text
              style={
                styles.headerSubtitle
              }
            >
              Assistant pharmaceutique IA
            </Text>
          </View>
        </View>

        <View
          style={styles.headerActions}
        >
          <ServiceStatusBadge
            status={serviceStatus}
            onRetry={() => {
              void refreshServiceStatus()
            }}
          />

          <Pressable
            style={[
              styles.newChatButton,
              !hasConversation
                && !sending
                && styles.newChatButtonDisabled,
            ]}
            disabled={
              !hasConversation
              && !sending
            }
            onPress={
              startNewConversation
            }
            hitSlop={6}
          >
            <Icon
              name="add_comment"
              size={18}
              color={colors.white}
            />
          </Pressable>
        </View>
      </LinearGradient>

      <AssistantLocationBar
        address={assistantAddress}
        loading={addressLoading}
        error={addressError}
      />

      {sending ? (
        <PipelineProgress
          statuses={
            agentStatuses
          }
        />
      ) : finalStatus ? (
        <View
          style={
            styles.completedStrip
          }
        >
          <Icon
            name={
              getStatusMeta(
                finalStatus,
              ).icon
            }
            size={16}
            color={
              getStatusMeta(
                finalStatus,
              ).text
            }
          />

          <Text
            style={[
              styles.completedStripText,
              {
                color:
                  getStatusMeta(
                    finalStatus,
                  ).text,
              },
            ]}
          >
            {
              getStatusMeta(
                finalStatus,
              ).label
            }
          </Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={[
          styles.chatContent,
          !hasConversation
            && styles.emptyChatContent,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
        onContentSizeChange={() =>
          scrollRef.current
            ?.scrollToEnd({
              animated: true,
            })
        }
      >
        {!hasConversation ? (
          <WelcomePanel
            onQuickAction={
              handleQuickAction
            }
          />
        ) : (
          messages.map(
            (message) => (
              <MessageBubble
                key={message.id}
                message={message}
                sending={sending}
                openingMedicine={
                  openingMedicine
                }
                onOpenMedicine={
                  openRecommendedMedicine
                }
                onRetry={(query) => {
                  void sendQuery(
                    query,
                  )
                }}
              />
            ),
          )
        )}
      </ScrollView>

      <View style={styles.footer}>
        <PrescriptionSelector
          value={hasPrescription}
          disabled={sending}
          onChange={
            setHasPrescription
          }
        />

        <View
          style={styles.composer}
        >
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder="Posez votre question à PharmAgent…"
            placeholderTextColor={
              colors.textMuted
            }
            style={styles.textInput}
            multiline
            maxLength={1200}
            textAlignVertical="top"
            editable={!sending}
            blurOnSubmit={false}
          />

          {sending ? (
            <Pressable
              style={
                styles.stopButton
              }
              onPress={handleStop}
            >
              <Icon
                name="stop"
                size={18}
                color={colors.white}
              />
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.sendButton,
                !input.trim()
                  && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!input.trim()}
            >
              <Icon
                name="arrow_upward"
                size={19}
                color={colors.white}
              />
            </Pressable>
          )}
        </View>

        <View
          style={styles.disclaimerRow}
        >
          <Icon
            name="info_outline"
            size={13}
            color={colors.textMuted}
          />

          <Text
            style={styles.disclaimer}
          >
            PharmAgent fournit des informations générales et ne remplace pas un médecin ou un pharmacien.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

function ServiceStatusBadge({
  status,
  onRetry,
}: {
  status: PharmAgentServiceStatus
  onRetry: () => void
}) {
  if (status === 'checking') {
    return (
      <Pressable
        style={styles.serviceBadge}
        onPress={onRetry}
        hitSlop={6}
      >
        <ActivityIndicator
          size={10}
          color={colors.white}
        />

        <Text
          style={
            styles.serviceBadgeText
          }
          numberOfLines={1}
        >
          Vérification
        </Text>
      </Pressable>
    )
  }

  const available =
    status === 'available'

  return (
    <Pressable
      style={[
        styles.serviceBadge,
        available
          ? styles.serviceBadgeAvailable
          : styles.serviceBadgeUnavailable,
      ]}
      onPress={onRetry}
      hitSlop={6}
    >
      <View
        style={[
          styles.serviceDot,
          {
            backgroundColor:
              available
                ? '#86efac'
                : '#fecaca',
          },
        ]}
      />

      <Text
        style={
          styles.serviceBadgeText
        }
        numberOfLines={1}
      >
        {available
          ? 'Disponible'
          : 'Indisponible'}
      </Text>

      {!available ? (
        <Icon
          name="refresh"
          size={12}
          color={colors.white}
        />
      ) : null}
    </Pressable>
  )
}

function AssistantLocationBar({
  address,
  loading,
  error,
}: {
  address: Address | null
  loading: boolean
  error: boolean
}) {
  if (loading) {
    return (
      <View
        style={styles.locationBar}
      >
        <ActivityIndicator
          size={13}
          color={colors.primary}
        />

        <Text
          style={
            styles.locationLoadingText
          }
        >
          Chargement de l’adresse…
        </Text>
      </View>
    )
  }

  if (!address) {
    return (
      <View
        style={[
          styles.locationBar,
          styles.locationBarWarning,
        ]}
      >
        <Icon
          name={
            error
              ? 'cloud_off'
              : 'location_off'
          }
          size={15}
          color="#b45309"
        />

        <View
          style={
            styles.locationTextContainer
          }
        >
          <Text
            style={
              styles.locationWarningTitle
            }
          >
            Localisation indisponible
          </Text>

          <Text
            style={
              styles.locationWarningText
            }
            numberOfLines={1}
          >
            {error
              ? 'Impossible de charger vos adresses.'
              : 'Ajoutez une adresse avec position GPS dans Mes adresses.'}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View
      style={styles.locationBar}
    >
      <View
        style={styles.locationIcon}
      >
        <Icon
          name="location_on"
          size={15}
          color={colors.primary}
        />
      </View>

      <View
        style={
          styles.locationTextContainer
        }
      >
        <Text
          style={styles.locationEyebrow}
        >
          Localisation utilisée
        </Text>

        <Text
          style={styles.locationValue}
          numberOfLines={1}
        >
          {address.label}
          {' · '}
          {address.city}
        </Text>
      </View>

      {address.is_default ? (
        <View
          style={
            styles.defaultLocationBadge
          }
        >
          <Text
            style={
              styles.defaultLocationBadgeText
            }
          >
            Par défaut
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function WelcomePanel({
  onQuickAction,
}: {
  onQuickAction:
    (action: QuickAction) => void
}) {
  return (
    <View style={styles.welcome}>
      <View
        style={styles.welcomeHero}
      >
        <LinearGradient
          colors={[
            '#eef3ff',
            '#ecfeff',
          ]}
          style={
            styles.welcomeIcon
          }
        >
          <Icon
            name="auto_awesome"
            size={30}
            color={colors.primary}
          />
        </LinearGradient>

        <Text
          style={styles.welcomeTitle}
        >
          Comment puis-je vous aider ?
        </Text>

        <Text
          style={
            styles.welcomeDescription
          }
        >
          Posez une question sur un médicament, décrivez vos symptômes ou demandez des informations sur les précautions et les pharmacies.
        </Text>
      </View>

      <View
        style={
          styles.agentSummaryCard
        }
      >
        <View
          style={
            styles.agentSummaryHeader
          }
        >
          <Icon
            name="hub"
            size={17}
            color={colors.primary}
          />

          <Text
            style={
              styles.agentSummaryTitle
            }
          >
            Analyse multi-agents
          </Text>
        </View>

        <Text
          style={
            styles.agentSummaryText
          }
        >
          4 agents spécialisés collaborent pour analyser la demande, rechercher les informations utiles et contrôler la réponse finale.
        </Text>

        <View
          style={
            styles.agentMiniRow
          }
        >
          {AGENT_NODES.map(
            (agent) => (
              <View
                key={agent.key}
                style={
                  styles.agentMini
                }
              >
                <View
                  style={
                    styles.agentMiniIcon
                  }
                >
                  <Icon
                    name={
                      agent.icon
                    }
                    size={14}
                    color={
                      colors.primary
                    }
                  />
                </View>

                <Text
                  style={
                    styles.agentMiniLabel
                  }
                  numberOfLines={1}
                >
                  {agent.name}
                </Text>
              </View>
            ),
          )}
        </View>
      </View>

      <View
        style={styles.quickSection}
      >
        <Text
          style={
            styles.quickSectionTitle
          }
        >
          Que voulez-vous faire ?
        </Text>

        <View
          style={styles.quickGrid}
        >
          {QUICK_ACTIONS.map(
            (action) => (
              <Pressable
                key={action.title}
                style={({
                  pressed,
                }) => [
                  styles.quickAction,
                  pressed
                    && styles.quickActionPressed,
                ]}
                onPress={() =>
                  onQuickAction(
                    action,
                  )
                }
              >
                <View
                  style={
                    styles.quickActionIcon
                  }
                >
                  <Icon
                    name={
                      action.icon
                    }
                    size={20}
                    color={
                      colors.primary
                    }
                  />
                </View>

                <Text
                  style={
                    styles.quickActionTitle
                  }
                >
                  {action.title}
                </Text>

                <Text
                  style={
                    styles.quickActionDescription
                  }
                >
                  {
                    action.description
                  }
                </Text>
              </Pressable>
            ),
          )}
        </View>
      </View>
    </View>
  )
}

function PipelineProgress({
  statuses,
}: {
  statuses:
    Record<AgentKey, AgentStatus>
}) {
  const activeNode =
    AGENT_NODES.find(
      (node) =>
        statuses[node.key]
        === 'active',
    )

  return (
    <View
      style={
        styles.pipelineContainer
      }
    >
      <View
        style={
          styles.pipelineHeader
        }
      >
        <View
          style={
            styles.pipelineHeaderLeft
          }
        >
          <ActivityIndicator
            size="small"
            color={colors.primary}
          />

          <View>
            <Text
              style={
                styles.pipelineTitle
              }
            >
              Analyse en cours
            </Text>

            <Text
              style={
                styles.pipelineSubtitle
              }
            >
              {activeNode
                ? activeNode.description
                : 'Initialisation de PharmAgent…'}
            </Text>
          </View>
        </View>

        <Text
          style={
            styles.pipelineHint
          }
        >
          4 agents
        </Text>
      </View>

      <View
        style={styles.pipelineRow}
      >
        {AGENT_NODES.map(
          (node, index) => {
            const status =
              statuses[node.key]

            return (
              <View
                key={node.key}
                style={
                  styles.pipelineStepWrap
                }
              >
                <View
                  style={
                    styles.pipelineStepContent
                  }
                >
                  <View
                    style={[
                      styles.pipelineNode,
                      status
                        === 'active'
                        && styles.pipelineNodeActive,
                      status
                        === 'done'
                        && styles.pipelineNodeDone,
                    ]}
                  >
                    {status === 'active' ? (
                      <ActivityIndicator
                        size={11}
                        color={
                          colors.white
                        }
                      />
                    ) : (
                      <Icon
                        name={
                          status
                          === 'done'
                            ? 'check'
                            : node.icon
                        }
                        size={13}
                        color={
                          status
                          === 'idle'
                            ? colors.textMuted
                            : colors.white
                        }
                      />
                    )}
                  </View>

                  <Text
                    style={[
                      styles.pipelineLabel,
                      status
                        !== 'idle'
                        && styles.pipelineLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {node.name}
                  </Text>
                </View>

                {index
                  < AGENT_NODES.length
                    - 1 ? (
                  <View
                    style={[
                      styles.pipelineLine,
                      (
                        status
                        === 'done'
                      )
                        && styles.pipelineLineDone,
                    ]}
                  />
                ) : null}
              </View>
            )
          },
        )}
      </View>
    </View>
  )
}

function PrescriptionSelector({
  value,
  disabled,
  onChange,
}: {
  value: boolean
  disabled: boolean
  onChange:
    (value: boolean) => void
}) {
  return (
    <View
      style={
        styles.prescriptionContainer
      }
    >
      <View
        style={
          styles.prescriptionLabelRow
        }
      >
        <Icon
          name="description"
          size={15}
          color={
            colors.textSecondary
          }
        />

        <Text
          style={
            styles.prescriptionLabel
          }
        >
          Ordonnance
        </Text>

        <Text
          style={
            styles.prescriptionHelp
          }
        >
          Déclarative uniquement
        </Text>
      </View>

      <View
        style={
          styles.prescriptionOptions
        }
      >
        <Pressable
          style={[
            styles.prescriptionOption,
            !value
              && styles.prescriptionOptionSelected,
          ]}
          disabled={disabled}
          onPress={() =>
            onChange(false)
          }
        >
          <Icon
            name={
              !value
                ? 'radio_button_checked'
                : 'radio_button_unchecked'
            }
            size={15}
            color={
              !value
                ? colors.primary
                : colors.textMuted
            }
          />

          <Text
            style={[
              styles.prescriptionOptionText,
              !value
                && styles.prescriptionOptionTextSelected,
            ]}
          >
            Je n’en ai pas
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.prescriptionOption,
            value
              && styles.prescriptionOptionSelected,
          ]}
          disabled={disabled}
          onPress={() =>
            onChange(true)
          }
        >
          <Icon
            name={
              value
                ? 'radio_button_checked'
                : 'radio_button_unchecked'
            }
            size={15}
            color={
              value
                ? colors.primary
                : colors.textMuted
            }
          />

          <Text
            style={[
              styles.prescriptionOptionText,
              value
                && styles.prescriptionOptionTextSelected,
            ]}
          >
            J’en ai une
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function MessageBubble({
  message,
  sending,
  openingMedicine,
  onOpenMedicine,
  onRetry,
}: {
  message: ChatMessage
  sending: boolean
  openingMedicine: string | null
  onOpenMedicine:
    (medicine: string) => void
  onRetry: (query: string) => void
}) {
  if (
    message.role
    === 'user'
  ) {
    return (
      <View
        style={styles.rowRight}
      >
        <View
          style={styles.userBubble}
        >
          <Text
            style={
              styles.userBubbleText
            }
          >
            {message.text}
          </Text>
        </View>
      </View>
    )
  }

  if (
    message.kind
    === 'loading'
  ) {
    return (
      <View
        style={styles.rowLeft}
      >
        <View
          style={
            styles.loadingBubble
          }
        >
          <ActivityIndicator
            size="small"
            color={colors.primary}
          />

          <Text
            style={
              styles.loadingBubbleText
            }
          >
            PharmAgent analyse votre demande…
          </Text>
        </View>
      </View>
    )
  }

  if (
    message.kind
    === 'connection_error'
  ) {
    return (
      <View
        style={styles.rowLeft}
      >
        <View
          style={styles.errorBubble}
        >
          <View
            style={
              styles.errorBubbleHeader
            }
          >
            <Icon
              name="cloud_off"
              size={18}
              color={colors.error}
            />

            <Text
              style={
                styles.errorBubbleTitle
              }
            >
              PharmAgent indisponible
            </Text>
          </View>

          <Text
            style={
              styles.errorBubbleText
            }
          >
            {message.text}
          </Text>

          {message.retryQuery ? (
            <Pressable
              style={[
                styles.retryButton,
                sending
                  && styles.retryButtonDisabled,
              ]}
              disabled={sending}
              onPress={() =>
                onRetry(
                  message.retryQuery!,
                )
              }
            >
              <Icon
                name="refresh"
                size={16}
                color={colors.error}
              />

              <Text
                style={
                  styles.retryButtonText
                }
              >
                Réessayer
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  }

  if (
    message.kind === 'stopped'
  ) {
    return (
      <View
        style={styles.rowLeft}
      >
        <View
          style={
            styles.stoppedBubble
          }
        >
          <Icon
            name="stop_circle"
            size={16}
            color={
              colors.textSecondary
            }
          />

          <Text
            style={
              styles.stoppedBubbleText
            }
          >
            {message.text}
          </Text>
        </View>
      </View>
    )
  }

  if (
    message.kind === 'text'
  ) {
    return (
      <View
        style={styles.rowLeft}
      >
        <View
          style={
            styles.assistantBubble
          }
        >
          <View
            style={
              styles.assistantLabel
            }
          >
            <Icon
              name="auto_awesome"
              size={13}
              color={colors.primary}
            />

            <Text
              style={
                styles.assistantLabelText
              }
            >
              PharmAgent
            </Text>
          </View>

          <Text
            style={
              styles.assistantBubbleText
            }
          >
            {message.text}
          </Text>
        </View>
      </View>
    )
  }

  if (!message.response) {
    return null
  }

  return (
    <ResponseCard
      data={message.response}
      openingMedicine={
        openingMedicine
      }
      onOpenMedicine={
        onOpenMedicine
      }
    />
  )
}

function ResponseCard({
  data,
  openingMedicine,
  onOpenMedicine,
}: {
  data: AssistFinalPayload
  openingMedicine: string | null
  onOpenMedicine:
    (medicine: string) => void
}) {
  const [
    sourcesExpanded,
    setSourcesExpanded,
  ] = useState(false)

  const status =
    getStatusMeta(data.status)

  const recommendedMedicines =
    displayList(
      data.recommended_medicines,
    )

  const warnings =
    displayList(data.warnings)

  const citations =
    displayList(data.citations)

  const availability =
    data.status === 'APPROVED'
      ? buildAvailabilityList(
          data.pharmacy_options,
        )
      : []

  const finalAnswer =
    toDisplayText(
      data.final_answer,
    )

  const emergencyResponse =
    toDisplayText(
      data.emergency_response,
    )

  const issuesSummary =
    toDisplayText(
      data.issues_summary,
    )

  const pharmacySummary =
    toDisplayText(
      data.pharmacy_summary,
    )

  return (
    <View style={styles.rowLeft}>
      <View
        style={styles.responseCard}
      >
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor:
                status.background,
              borderColor:
                status.border,
            },
          ]}
        >
          <Icon
            name={status.icon}
            size={18}
            color={status.text}
          />

          <View
            style={
              styles.statusBannerText
            }
          >
            <Text
              style={[
                styles.statusTitle,
                {
                  color:
                    status.text,
                },
              ]}
            >
              {status.label}
            </Text>

            <Text
              style={
                styles.statusSubtitle
              }
            >
              Contrôle PharmAgent terminé
            </Text>
          </View>
        </View>

        {data.status
          === 'EMERGENCY' ? (
          <EmergencyCard
            text={
              emergencyResponse
              || finalAnswer
            }
          />
        ) : null}

        {finalAnswer ? (
          <ResponseSection
            icon="subject"
            title={
              data.status
              === 'EMERGENCY'
                ? 'Informations complémentaires'
                : 'Réponse'
            }
          >
            <Text
              style={
                styles.responseText
              }
            >
              {finalAnswer}
            </Text>
          </ResponseSection>
        ) : null}

        {recommendedMedicines.length
          > 0 ? (
          <ResponseSection
            icon="medication"
            title="Médicaments mentionnés"
          >
            <View
              style={
                styles.medicineLinks
              }
            >
              {recommendedMedicines.map(
                (
                  medicine,
                  index,
                ) => {
                  const isOpening =
                    openingMedicine
                    === medicine

                  return (
                    <Pressable
                      key={`${medicine}-${index}`}
                      style={({
                        pressed,
                      }) => [
                        styles.medicineLink,
                        pressed
                          && styles.medicineLinkPressed,
                        openingMedicine
                          && !isOpening
                          && styles.medicineLinkDisabled,
                      ]}
                      disabled={
                        openingMedicine
                        !== null
                      }
                      onPress={() =>
                        onOpenMedicine(
                          medicine,
                        )
                      }
                    >
                      <View
                        style={
                          styles.medicineLinkIcon
                        }
                      >
                        <Icon
                          name="medication"
                          size={17}
                          color={
                            colors.primary
                          }
                        />
                      </View>

                      <View
                        style={
                          styles.medicineLinkContent
                        }
                      >
                        <Text
                          style={
                            styles.medicineLinkName
                          }
                          numberOfLines={2}
                        >
                          {medicine}
                        </Text>

                        <Text
                          style={
                            styles.medicineLinkAction
                          }
                        >
                          Voir la fiche PharmAI
                        </Text>
                      </View>

                      {isOpening ? (
                        <ActivityIndicator
                          size="small"
                          color={
                            colors.primary
                          }
                        />
                      ) : (
                        <Icon
                          name="chevron_right"
                          size={20}
                          color={
                            colors.textMuted
                          }
                        />
                      )}
                    </Pressable>
                  )
                },
              )}
            </View>
          </ResponseSection>
        ) : null}

        {data.status
          === 'APPROVED'
          && availability.length
          > 0 ? (
          <ResponseSection
            icon="local_pharmacy"
            title="Disponibilité PharmAI"
          >
            <View
              style={
                styles.availabilityList
              }
            >
              {availability.map(
                (
                  option,
                  index,
                ) => (
                  <AvailabilityRow
                    key={
                      `${option.medicine}-${option.id ?? index}`
                    }
                    option={option}
                  />
                ),
              )}
            </View>

            <View
              style={
                styles.liveDataNotice
              }
            >
              <Icon
                name="verified"
                size={14}
                color="#15803d"
              />

              <Text
                style={
                  styles.liveDataNoticeText
                }
              >
                Disponibilité vérifiée via le stock PharmAI au moment de cette recherche.
              </Text>
            </View>
          </ResponseSection>
        ) : null}

        {data.status
          === 'APPROVED'
          && availability.length
          === 0
          && pharmacySummary ? (
          <ResponseSection
            icon="local_pharmacy"
            title="Disponibilité PharmAI"
          >
            <Text
              style={
                styles.secondaryText
              }
            >
              {pharmacySummary}
            </Text>
          </ResponseSection>
        ) : null}

        {warnings.length > 0 ? (
          <View
            style={
              styles.warningSection
            }
          >
            <View
              style={
                styles.warningHeader
              }
            >
              <Icon
                name="warning_amber"
                size={17}
                color="#b45309"
              />

              <Text
                style={
                  styles.warningTitle
                }
              >
                Précautions importantes
              </Text>
            </View>

            {warnings.map(
              (warning, index) => (
                <View
                  key={`${warning}-${index}`}
                  style={
                    styles.warningItem
                  }
                >
                  <View
                    style={
                      styles.warningDot
                    }
                  />

                  <Text
                    style={
                      styles.warningText
                    }
                  >
                    {warning}
                  </Text>
                </View>
              ),
            )}
          </View>
        ) : null}

        {issuesSummary
          && data.status
          !== 'APPROVED' ? (
          <ResponseSection
            icon="fact_check"
            title="Points à vérifier"
          >
            <Text
              style={
                styles.secondaryText
              }
            >
              {issuesSummary}
            </Text>
          </ResponseSection>
        ) : null}

        {citations.length > 0 ? (
          <View
            style={
              styles.sourcesSection
            }
          >
            <Pressable
              style={
                styles.sourcesHeader
              }
              onPress={() =>
                setSourcesExpanded(
                  (current) =>
                    !current,
                )
              }
            >
              <View
                style={
                  styles.sourcesHeaderLeft
                }
              >
                <Icon
                  name="menu_book"
                  size={16}
                  color={
                    colors.textSecondary
                  }
                />

                <Text
                  style={
                    styles.sourcesTitle
                  }
                >
                  Sources utilisées
                </Text>

                <View
                  style={
                    styles.sourcesCount
                  }
                >
                  <Text
                    style={
                      styles.sourcesCountText
                    }
                  >
                    {
                      citations.length
                    }
                  </Text>
                </View>
              </View>

              <Icon
                name={
                  sourcesExpanded
                    ? 'expand_less'
                    : 'expand_more'
                }
                size={20}
                color={
                  colors.textMuted
                }
              />
            </Pressable>

            {sourcesExpanded ? (
              <View
                style={
                  styles.sourcesList
                }
              >
                {citations.map(
                  (
                    citation,
                    index,
                  ) => (
                    <View
                      key={`${citation}-${index}`}
                      style={
                        styles.sourceItem
                      }
                    >
                      <Text
                        style={
                          styles.sourceIndex
                        }
                      >
                        {index + 1}
                      </Text>

                      <Text
                        style={
                          styles.sourceText
                        }
                      >
                        {citation}
                      </Text>
                    </View>
                  ),
                )}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

function EmergencyCard({
  text,
}: {
  text: string
}) {
  return (
    <View
      style={styles.emergencyCard}
    >
      <View
        style={
          styles.emergencyIcon
        }
      >
        <Icon
          name="emergency"
          size={22}
          color={colors.error}
        />
      </View>

      <View
        style={
          styles.emergencyContent
        }
      >
        <Text
          style={
            styles.emergencyTitle
          }
        >
          Urgence potentielle
        </Text>

        <Text
          style={
            styles.emergencyText
          }
        >
          {text
            || 'Les informations décrites peuvent nécessiter une évaluation médicale rapide.'}
        </Text>
      </View>
    </View>
  )
}

function ResponseSection({
  icon,
  title,
  children,
}: {
  icon: string
  title: string
  children: React.ReactNode
}) {
  return (
    <View
      style={styles.responseSection}
    >
      <View
        style={
          styles.responseSectionHeader
        }
      >
        <View
          style={
            styles.responseSectionIcon
          }
        >
          <Icon
            name={icon}
            size={15}
            color={colors.primary}
          />
        </View>

        <Text
          style={
            styles.responseSectionTitle
          }
        >
          {title}
        </Text>
      </View>

      {children}
    </View>
  )
}

function AvailabilityRow({
  option,
}: {
  option: AvailabilityOption
}) {
  const medicineName =
    option.medicine_name
    || option.medicine

  const genericName =
    option.generic_name?.trim()

  const count =
    typeof option.available_count
      === 'number'
      ? Math.max(
          0,
          Math.floor(
            option.available_count,
          ),
        )
      : null

  const eta =
    typeof option.eta_minutes
      === 'number'
      ? Math.max(
          0,
          Math.round(
            option.eta_minutes,
          ),
        )
      : null

  return (
    <View
      style={
        styles.availabilityCard
      }
    >
      <View
        style={
          styles.availabilityHeader
        }
      >
        <View
          style={
            styles.availabilityMedicineIcon
          }
        >
          <Icon
            name="medication"
            size={18}
            color={colors.primary}
          />
        </View>

        <View
          style={
            styles.availabilityTitleBlock
          }
        >
          <Text
            style={
              styles.availabilityMedicineName
            }
            numberOfLines={1}
          >
            {medicineName}
          </Text>

          {genericName
            && genericName
            !== medicineName ? (
            <Text
              style={
                styles.availabilityGenericName
              }
              numberOfLines={1}
            >
              {genericName}
            </Text>
          ) : null}
        </View>

        <View
          style={
            styles.availableBadge
          }
        >
          <Icon
            name="check_circle"
            size={12}
            color="#15803d"
          />

          <Text
            style={
              styles.availableBadgeText
            }
          >
            Disponible
          </Text>
        </View>
      </View>

      <View
        style={
          styles.availabilityMetrics
        }
      >
        {count !== null ? (
          <AvailabilityMetric
            icon="local_pharmacy"
            label="Pharmacies"
            value={`${count}`}
          />
        ) : null}

        {option.price != null ? (
          <AvailabilityMetric
            icon="payments"
            label="À partir de"
            value={`${Number(
              option.price,
            ).toFixed(2)} MAD`}
          />
        ) : null}

        {option.distance_km
          != null ? (
          <AvailabilityMetric
            icon="near_me"
            label="Plus proche"
            value={`${Number(
              option.distance_km,
            ).toFixed(1)} km`}
          />
        ) : null}

        {eta !== null ? (
          <AvailabilityMetric
            icon="schedule"
            label="ETA"
            value={`~${eta} min`}
          />
        ) : null}
      </View>

      <View
        style={
          styles.availabilityBadges
        }
      >
        <View
          style={[
            styles.requirementBadge,
            option.requires_prescription
              ? styles.requirementBadgeRx
              : styles.requirementBadgeFree,
          ]}
        >
          <Icon
            name={
              option.requires_prescription
                ? 'prescriptions'
                : 'check'
            }
            size={11}
            color={
              option.requires_prescription
                ? '#92400e'
                : '#15803d'
            }
          />

          <Text
            style={[
              styles.requirementBadgeText,
              {
                color:
                  option.requires_prescription
                    ? '#92400e'
                    : '#15803d',
              },
            ]}
          >
            {option.requires_prescription
              ? 'Ordonnance requise'
              : 'Sans ordonnance'}
          </Text>
        </View>

        {option.is_night_shift ? (
          <View
            style={
              styles.nightAvailabilityBadge
            }
          >
            <Icon
              name="dark_mode"
              size={11}
              color="#7c3aed"
            />

            <Text
              style={
                styles.nightAvailabilityBadgeText
              }
            >
              Garde disponible
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function AvailabilityMetric({
  icon,
  label,
  value,
}: {
  icon: string
  label: string
  value: string
}) {
  return (
    <View
      style={
        styles.availabilityMetric
      }
    >
      <Icon
        name={icon}
        size={14}
        color={
          colors.textSecondary
        }
      />

      <View
        style={
          styles.availabilityMetricText
        }
      >
        <Text
          style={
            styles.availabilityMetricLabel
          }
        >
          {label}
        </Text>

        <Text
          style={
            styles.availabilityMetricValue
          }
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        colors.surface,
    },
    header: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    headerLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor:
        'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor:
        'rgba(255,255,255,0.16)',
    },
    headerText: {
      flex: 1,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    serviceBadge: {
      minHeight: 30,
      maxWidth: 105,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        'rgba(255,255,255,0.20)',
      backgroundColor:
        'rgba(255,255,255,0.12)',
    },
    serviceBadgeAvailable: {
      backgroundColor:
        'rgba(22,163,74,0.24)',
    },
    serviceBadgeUnavailable: {
      backgroundColor:
        'rgba(220,38,38,0.28)',
    },
    serviceDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    serviceBadgeText: {
      flexShrink: 1,
      fontSize: 8,
      fontWeight: '800',
      color: colors.white,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.white,
    },
    headerSubtitle: {
      marginTop: 1,
      fontSize: 10,
      color:
        'rgba(255,255,255,0.74)',
    },
    newChatButton: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor:
        'rgba(255,255,255,0.14)',
    },
    newChatButtonDisabled: {
      opacity: 0.4,
    },
    completedStrip: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor:
        colors.outlineVariant,
      backgroundColor:
        colors.surfaceLowest,
    },
    completedStripText: {
      fontSize: 11,
      fontWeight: '700',
    },
    locationBar: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor:
        colors.outlineVariant,
      backgroundColor:
        '#f8fafc',
    },
    locationBarWarning: {
      backgroundColor:
        '#fffbeb',
      borderBottomColor:
        '#fde68a',
    },
    locationIcon: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor:
        '#eef3ff',
    },
    locationTextContainer: {
      flex: 1,
      minWidth: 0,
    },
    locationEyebrow: {
      fontSize: 8,
      fontWeight: '700',
      color:
        colors.textMuted,
    },
    locationValue: {
      marginTop: 1,
      fontSize: 10,
      fontWeight: '800',
      color:
        colors.textPrimary,
    },
    locationLoadingText: {
      fontSize: 10,
      fontWeight: '600',
      color:
        colors.textSecondary,
    },
    locationWarningTitle: {
      fontSize: 10,
      fontWeight: '800',
      color: '#92400e',
    },
    locationWarningText: {
      marginTop: 1,
      fontSize: 8,
      color: '#b45309',
    },
    defaultLocationBadge: {
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor:
        '#e0e7ff',
    },
    defaultLocationBadgeText: {
      fontSize: 7,
      fontWeight: '800',
      color:
        colors.primary,
    },
    chat: {
      flex: 1,
    },
    chatContent: {
      gap: 12,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 20,
    },
    emptyChatContent: {
      flexGrow: 1,
      justifyContent:
        'flex-start',
    },
    welcome: {
      gap: 16,
      paddingTop: 8,
    },
    welcomeHero: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    welcomeIcon: {
      width: 66,
      height: 66,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 22,
      borderWidth: 1,
      borderColor: '#dbeafe',
    },
    welcomeTitle: {
      marginTop: 13,
      fontSize: 21,
      fontWeight: '800',
      textAlign: 'center',
      color:
        colors.textPrimary,
    },
    welcomeDescription: {
      marginTop: 7,
      maxWidth: 330,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      color:
        colors.textSecondary,
    },
    agentSummaryCard: {
      gap: 10,
      padding: 13,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      backgroundColor:
        colors.surfaceLowest,
    },
    agentSummaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    agentSummaryTitle: {
      fontSize: 12,
      fontWeight: '800',
      color:
        colors.textPrimary,
    },
    agentSummaryText: {
      fontSize: 10,
      lineHeight: 15,
      color:
        colors.textSecondary,
    },
    agentMiniRow: {
      flexDirection: 'row',
      gap: 6,
    },
    agentMini: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    agentMiniIcon: {
      width: 31,
      height: 31,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor:
        '#eef3ff',
    },
    agentMiniLabel: {
      fontSize: 8,
      fontWeight: '700',
      color:
        colors.textSecondary,
    },
    quickSection: {
      gap: 9,
    },
    quickSectionTitle: {
      fontSize: 12,
      fontWeight: '800',
      color:
        colors.textPrimary,
    },
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
    },
    quickAction: {
      width: '48.5%',
      minHeight: 116,
      gap: 6,
      padding: 12,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      backgroundColor:
        colors.surfaceLowest,
    },
    quickActionPressed: {
      opacity: 0.75,
    },
    quickActionIcon: {
      width: 39,
      height: 39,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor:
        '#eef3ff',
    },
    quickActionTitle: {
      fontSize: 12,
      fontWeight: '800',
      color:
        colors.textPrimary,
    },
    quickActionDescription: {
      fontSize: 9,
      lineHeight: 13,
      color:
        colors.textMuted,
    },
    pipelineContainer: {
      gap: 10,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 11,
      borderBottomWidth: 1,
      borderBottomColor:
        colors.outlineVariant,
      backgroundColor:
        colors.surfaceLowest,
    },
    pipelineHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      gap: 10,
    },
    pipelineHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    pipelineTitle: {
      fontSize: 11,
      fontWeight: '800',
      color:
        colors.textPrimary,
    },
    pipelineSubtitle: {
      marginTop: 1,
      fontSize: 9,
      color:
        colors.textMuted,
    },
    pipelineHint: {
      fontSize: 9,
      fontWeight: '700',
      color:
        colors.textMuted,
    },
    pipelineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    pipelineStepWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    pipelineStepContent: {
      alignItems: 'center',
      gap: 4,
    },
    pipelineNode: {
      width: 29,
      height: 29,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      backgroundColor:
        colors.surface,
    },
    pipelineNodeActive: {
      borderColor:
        colors.primary,
      backgroundColor:
        colors.primary,
    },
    pipelineNodeDone: {
      borderColor: '#22c55e',
      backgroundColor:
        '#22c55e',
    },
    pipelineLabel: {
      width: 48,
      fontSize: 8,
      fontWeight: '600',
      textAlign: 'center',
      color:
        colors.textMuted,
    },
    pipelineLabelActive: {
      color:
        colors.textPrimary,
    },
    pipelineLine: {
      flex: 1,
      height: 2,
      marginTop: 14,
      marginHorizontal: 4,
      borderRadius: 1,
      backgroundColor:
        colors.outlineVariant,
    },
    pipelineLineDone: {
      backgroundColor:
        '#86efac',
    },
    footer: {
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 9,
      paddingBottom:
        Platform.OS === 'ios'
          ? 8
          : 10,
      borderTopWidth: 1,
      borderTopColor:
        colors.outlineVariant,
      backgroundColor:
        colors.surfaceLowest,
    },
    prescriptionContainer: {
      gap: 6,
    },
    prescriptionLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    prescriptionLabel: {
      fontSize: 10,
      fontWeight: '700',
      color:
        colors.textSecondary,
    },
    prescriptionHelp: {
      marginLeft: 'auto',
      fontSize: 8,
      color:
        colors.textMuted,
    },
    prescriptionOptions: {
      flexDirection: 'row',
      gap: 7,
    },
    prescriptionOption: {
      flex: 1,
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      backgroundColor:
        colors.surfaceLowest,
    },
    prescriptionOptionSelected: {
      borderColor:
        '#bfdbfe',
      backgroundColor:
        '#eff6ff',
    },
    prescriptionOptionText: {
      fontSize: 9,
      fontWeight: '600',
      color:
        colors.textMuted,
    },
    prescriptionOptionTextSelected: {
      color:
        colors.primary,
    },
    composer: {
      minHeight: 50,
      maxHeight: 112,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 7,
      paddingLeft: 12,
      paddingRight: 6,
      paddingVertical: 6,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      backgroundColor:
        colors.white,
    },
    textInput: {
      flex: 1,
      minHeight: 37,
      maxHeight: 96,
      paddingTop: 8,
      paddingBottom: 7,
      fontSize: 13,
      lineHeight: 18,
      color:
        colors.textPrimary,
    },
    sendButton: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor:
        colors.primary,
    },
    sendButtonDisabled: {
      opacity: 0.4,
    },
    stopButton: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor:
        colors.error,
    },
    disclaimerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 4,
    },
    disclaimer: {
      flex: 1,
      fontSize: 8,
      lineHeight: 12,
      color:
        colors.textMuted,
    },
    rowRight: {
      alignItems: 'flex-end',
    },
    rowLeft: {
      alignItems: 'flex-start',
    },
    userBubble: {
      maxWidth: '86%',
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderRadius: 16,
      borderBottomRightRadius: 5,
      backgroundColor:
        colors.primary,
    },
    userBubbleText: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.white,
    },
    assistantBubble: {
      maxWidth: '89%',
      gap: 7,
      padding: 12,
      borderRadius: 16,
      borderBottomLeftRadius: 5,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      backgroundColor:
        colors.surfaceLowest,
    },
    assistantLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    assistantLabelText: {
      fontSize: 9,
      fontWeight: '800',
      color:
        colors.primary,
    },
    assistantBubbleText: {
      fontSize: 13,
      lineHeight: 19,
      color:
        colors.textPrimary,
    },
    loadingBubble: {
      maxWidth: '86%',
      minHeight: 45,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        '#bfdbfe',
      backgroundColor:
        '#eff6ff',
    },
    loadingBubbleText: {
      fontSize: 11,
      fontWeight: '600',
      color:
        colors.textSecondary,
    },
    errorBubble: {
      width: '90%',
      gap: 8,
      padding: 12,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        '#fecaca',
      backgroundColor:
        '#fef2f2',
    },
    errorBubbleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    errorBubbleTitle: {
      fontSize: 12,
      fontWeight: '800',
      color:
        colors.error,
    },
    errorBubbleText: {
      fontSize: 11,
      lineHeight: 16,
      color:
        colors.errorText,
    },
    retryButton: {
      alignSelf: 'flex-start',
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        '#fecaca',
      backgroundColor:
        colors.white,
    },
    retryButtonDisabled: {
      opacity: 0.45,
    },
    retryButtonText: {
      fontSize: 10,
      fontWeight: '700',
      color:
        colors.error,
    },
    stoppedBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor:
        '#f3f4f6',
    },
    stoppedBubbleText: {
      fontSize: 10,
      color:
        colors.textSecondary,
    },
    responseCard: {
      width: '96%',
      overflow: 'hidden',
      borderRadius: 17,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      backgroundColor:
        colors.surfaceLowest,
    },
    statusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
    },
    statusBannerText: {
      flex: 1,
    },
    statusTitle: {
      fontSize: 11,
      fontWeight: '800',
    },
    statusSubtitle: {
      marginTop: 1,
      fontSize: 8,
      color:
        colors.textMuted,
    },
    responseSection: {
      gap: 8,
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor:
        colors.outlineVariant,
    },
    responseSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    responseSectionIcon: {
      width: 27,
      height: 27,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 9,
      backgroundColor:
        '#eef3ff',
    },
    responseSectionTitle: {
      fontSize: 11,
      fontWeight: '800',
      color:
        colors.textPrimary,
    },
    responseText: {
      fontSize: 12,
      lineHeight: 18,
      color:
        colors.textPrimary,
    },
    secondaryText: {
      fontSize: 11,
      lineHeight: 17,
      color:
        colors.textSecondary,
    },
    sectionFootnote: {
      fontSize: 8,
      lineHeight: 12,
      color:
        colors.textMuted,
    },
    medicineLinks: {
      gap: 7,
    },
    medicineLink: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 9,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        '#bfdbfe',
      backgroundColor:
        '#eff6ff',
    },
    medicineLinkPressed: {
      opacity: 0.75,
    },
    medicineLinkDisabled: {
      opacity: 0.55,
    },
    medicineLinkIcon: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor:
        colors.white,
    },
    medicineLinkContent: {
      flex: 1,
      minWidth: 0,
    },
    medicineLinkName: {
      fontSize: 10,
      fontWeight: '800',
      color:
        colors.textPrimary,
    },
    medicineLinkAction: {
      marginTop: 2,
      fontSize: 8,
      fontWeight: '700',
      color:
        colors.primary,
    },
    availabilityList: {
      gap: 8,
    },
    availabilityCard: {
      gap: 10,
      padding: 10,
      borderRadius: 13,
      borderWidth: 1,
      borderColor:
        '#bbf7d0',
      backgroundColor:
        '#f0fdf4',
    },
    availabilityHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    availabilityMedicineIcon: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 11,
      backgroundColor:
        colors.white,
    },
    availabilityTitleBlock: {
      flex: 1,
      minWidth: 0,
    },
    availabilityMedicineName: {
      fontSize: 11,
      fontWeight: '800',
      color:
        colors.textPrimary,
    },
    availabilityGenericName: {
      marginTop: 1,
      fontSize: 8,
      color:
        colors.textSecondary,
    },
    availableBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor:
        '#dcfce7',
    },
    availableBadgeText: {
      fontSize: 7,
      fontWeight: '800',
      color: '#15803d',
    },
    availabilityMetrics: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    availabilityMetric: {
      width: '48%',
      minHeight: 43,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor:
        colors.white,
    },
    availabilityMetricText: {
      flex: 1,
      minWidth: 0,
    },
    availabilityMetricLabel: {
      fontSize: 7,
      fontWeight: '600',
      color:
        colors.textMuted,
    },
    availabilityMetricValue: {
      marginTop: 1,
      fontSize: 9,
      fontWeight: '800',
      color:
        colors.textPrimary,
    },
    availabilityBadges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
    },
    requirementBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 999,
    },
    requirementBadgeRx: {
      backgroundColor:
        '#fef3c7',
    },
    requirementBadgeFree: {
      backgroundColor:
        '#dcfce7',
    },
    requirementBadgeText: {
      fontSize: 7,
      fontWeight: '800',
    },
    nightAvailabilityBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor:
        '#f5f3ff',
    },
    nightAvailabilityBadgeText: {
      fontSize: 7,
      fontWeight: '800',
      color: '#7c3aed',
    },
    liveDataNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 5,
      paddingTop: 2,
    },
    liveDataNoticeText: {
      flex: 1,
      fontSize: 8,
      lineHeight: 12,
      color: '#166534',
    },
    warningSection: {
      gap: 7,
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor:
        '#fde68a',
      backgroundColor:
        '#fffbeb',
    },
    warningHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    warningTitle: {
      fontSize: 10,
      fontWeight: '800',
      color: '#92400e',
    },
    warningItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
    },
    warningDot: {
      width: 5,
      height: 5,
      marginTop: 6,
      borderRadius: 2.5,
      backgroundColor:
        '#d97706',
    },
    warningText: {
      flex: 1,
      fontSize: 10,
      lineHeight: 15,
      color: '#92400e',
    },
    emergencyCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor:
        '#fecaca',
      backgroundColor:
        '#fef2f2',
    },
    emergencyIcon: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor:
        colors.white,
    },
    emergencyContent: {
      flex: 1,
      gap: 3,
    },
    emergencyTitle: {
      fontSize: 12,
      fontWeight: '800',
      color:
        colors.error,
    },
    emergencyText: {
      fontSize: 10,
      lineHeight: 16,
      color:
        colors.errorText,
    },
    sourcesSection: {
      backgroundColor:
        '#fafafa',
    },
    sourcesHeader: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    sourcesHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sourcesTitle: {
      fontSize: 9,
      fontWeight: '700',
      color:
        colors.textSecondary,
    },
    sourcesCount: {
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
      borderRadius: 10,
      backgroundColor:
        '#eef3ff',
    },
    sourcesCountText: {
      fontSize: 8,
      fontWeight: '800',
      color:
        colors.primary,
    },
    sourcesList: {
      gap: 7,
      paddingHorizontal: 12,
      paddingBottom: 11,
    },
    sourceItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
    },
    sourceIndex: {
      width: 20,
      height: 20,
      textAlign: 'center',
      textAlignVertical:
        'center',
      borderRadius: 10,
      fontSize: 8,
      fontWeight: '800',
      color:
        colors.textMuted,
      backgroundColor:
        '#f3f4f6',
    },
    sourceText: {
      flex: 1,
      fontSize: 9,
      lineHeight: 14,
      color:
        colors.textSecondary,
    },
  })