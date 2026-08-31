import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  useFocusEffect,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'

import {
  fetchOrderChatHistory,
  openOrderChatSocket,
  parseLiveOrderChatMessage,
  type OrderChatMessage,
} from '../../api/orderChat'
import { firstError } from '../../api/errors'
import { useAuthStore } from '../../store/authStore'
import { tokenStorage } from '../../store/tokenStorage'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

type OrderChatRouteParamList = {
  OrderChat: {
    orderId: number
    peerLabel: string
  }
}

type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'

const RECONNECT_DELAY_MS = 2500
const MAX_MESSAGE_LENGTH = 2000

export default function OrderChat() {
  const route =
    useRoute<RouteProp<OrderChatRouteParamList, 'OrderChat'>>()
  const { orderId, peerLabel } = route.params

  const userId = useAuthStore((state) => state.userId)
  const role = useAuthStore((state) => state.role)

  const listRef = useRef<FlatList<OrderChatMessage> | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  const [messages, setMessages] =
    useState<OrderChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')

  const mergeMessages = useCallback((
    incoming: OrderChatMessage[],
  ) => {
    setMessages((current) => {
      const byId = new Map<number, OrderChatMessage>()

      current.forEach((message) => {
        byId.set(message.id, message)
      })

      incoming.forEach((message) => {
        byId.set(message.id, {
          ...byId.get(message.id),
          ...message,
        })
      })

      return [...byId.values()].sort((left, right) => {
        const leftTime = new Date(left.created_at).getTime()
        const rightTime = new Date(right.created_at).getTime()

        if (
          Number.isFinite(leftTime)
          && Number.isFinite(rightTime)
          && leftTime !== rightTime
        ) {
          return leftTime - rightTime
        }

        return left.id - right.id
      })
    })
  }, [])

  const loadHistory = useCallback(async (
    silent = false,
  ) => {
    if (!silent) {
      setLoading(true)
    }

    try {
      const history = await fetchOrderChatHistory(orderId)
      mergeMessages(history)
      setHistoryError('')
    } catch (error) {
      setHistoryError(
        firstError(error)
        || 'Impossible de charger la discussion.',
      )
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [mergeMessages, orderId])

  useFocusEffect(
    useCallback(() => {
      let active = true
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null

      void loadHistory()

      const scheduleReconnect = () => {
        if (!active || reconnectTimer !== null) {
          return
        }

        setConnectionState('reconnecting')

        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          void connect()
        }, RECONNECT_DELAY_MS)
      }

      const connect = async () => {
        setConnectionState('connecting')

        const accessToken =
          await tokenStorage.getAccessToken()

        if (!active) {
          return
        }

        if (!accessToken) {
          setConnectionState('offline')
          return
        }

        try {
          const socket =
            openOrderChatSocket(orderId, accessToken)

          socketRef.current = socket

          socket.onopen = () => {
            if (!active || socketRef.current !== socket) {
              return
            }

            setConnectionState('connected')

            // Recover any messages persisted while this client was
            // disconnected before continuing with realtime delivery.
            void loadHistory(true)
          }

          socket.onmessage = (event) => {
            if (!active) {
              return
            }

            const message =
              parseLiveOrderChatMessage(event.data)

            if (
              !message
              || message.order_id !== orderId
            ) {
              return
            }

            mergeMessages([message])
          }

          socket.onerror = () => {
            // onclose handles retry and REST remains the history fallback.
          }

          socket.onclose = () => {
            if (socketRef.current === socket) {
              socketRef.current = null
            }

            scheduleReconnect()
          }
        } catch {
          scheduleReconnect()
        }
      }

      void connect()

      return () => {
        active = false

        if (reconnectTimer !== null) {
          clearTimeout(reconnectTimer)
        }

        const socket = socketRef.current
        socketRef.current = null

        if (socket) {
          socket.close()
        }
      }
    }, [
      loadHistory,
      mergeMessages,
      orderId,
    ]),
  )

  useEffect(() => {
    if (messages.length === 0) {
      return
    }

    const timeout = setTimeout(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      })
    }, 80)

    return () => clearTimeout(timeout)
  }, [messages.length])

  const handleSend = useCallback(() => {
    const content = draft.trim()

    if (!content) {
      return
    }

    const socket = socketRef.current

    if (
      !socket
      || socket.readyState !== WebSocket.OPEN
    ) {
      setConnectionState('reconnecting')
      return
    }

    try {
      socket.send(JSON.stringify({
        content: content.slice(0, MAX_MESSAGE_LENGTH),
      }))
      setDraft('')
    } catch {
      setConnectionState('reconnecting')
    }
  }, [draft])

  const connected =
    connectionState === 'connected'
  const canSend =
    connected && draft.trim().length > 0

  const renderMessage = useCallback(({
    item,
  }: ListRenderItemInfo<OrderChatMessage>) => {
    const isMine =
      userId !== null && item.sender_id === userId

    return (
      <View
        style={[
          styles.messageRow,
          isMine
            ? styles.messageRowMine
            : styles.messageRowPeer,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isMine
              ? styles.bubbleMine
              : styles.bubblePeer,
          ]}
        >
          <Text
            style={[
              styles.senderLabel,
              isMine && styles.senderLabelMine,
            ]}
          >
            {isMine
              ? 'Vous'
              : item.sender_name || peerLabel}
          </Text>

          <Text
            style={[
              styles.messageText,
              isMine && styles.messageTextMine,
            ]}
          >
            {item.content}
          </Text>

          <Text
            style={[
              styles.timeText,
              isMine && styles.timeTextMine,
            ]}
          >
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    )
  }, [peerLabel, userId])

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.headerCard}>
        <View style={styles.headerIcon}>
          <Icon
            name="forum"
            size={23}
            color={colors.primary}
          />
        </View>

        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>
            COMMANDE #{orderId}
          </Text>
          <Text style={styles.title}>
            Discussion avec {peerLabel}
          </Text>
          <Text style={styles.subtitle}>
            {role === 'delivery'
              ? 'Échangez uniquement les informations utiles à la livraison.'
              : 'Utilisez ce chat pour les informations liées à votre livraison.'}
          </Text>
        </View>

        <ConnectionBadge state={connectionState} />
      </View>

      {historyError ? (
        <Pressable
          style={styles.errorBanner}
          onPress={() => {
            void loadHistory()
          }}
        >
          <Icon
            name="cloud_off"
            size={18}
            color={colors.error}
          />
          <Text style={styles.errorText}>
            {historyError} Appuyez pour réessayer.
          </Text>
        </Pressable>
      ) : null}

      {loading && messages.length === 0 ? (
        <View style={styles.centerState}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
          <Text style={styles.centerTitle}>
            Chargement de la discussion
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.emptyListContent,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Icon
                  name="chat_bubble_outline"
                  size={28}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>
                Aucun message
              </Text>
              <Text style={styles.emptyText}>
                La discussion commencera dès que l’un de vous enverra un message.
              </Text>
            </View>
          }
        />
      )}

      <View style={styles.composer}>
        <View style={styles.inputContainer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={
              connected
                ? 'Écrire un message…'
                : 'Reconnexion en cours…'
            }
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            editable={connected}
            style={styles.input}
            accessibilityLabel="Message"
          />
          <Text style={styles.counter}>
            {draft.length}/{MAX_MESSAGE_LENGTH}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Envoyer le message"
          style={({ pressed }) => [
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
            pressed && canSend && styles.sendButtonPressed,
          ]}
          disabled={!canSend}
          onPress={handleSend}
        >
          <Icon
            name="send"
            size={20}
            color={colors.white}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

function ConnectionBadge({
  state,
}: {
  state: ConnectionState
}) {
  const connected = state === 'connected'

  return (
    <View
      style={[
        styles.connectionBadge,
        connected
          ? styles.connectionBadgeOnline
          : styles.connectionBadgeOffline,
      ]}
    >
      <View
        style={[
          styles.connectionDot,
          connected
            ? styles.connectionDotOnline
            : styles.connectionDotOffline,
        ]}
      />
      <Text
        style={[
          styles.connectionText,
          connected
            ? styles.connectionTextOnline
            : styles.connectionTextOffline,
        ]}
      >
        {connected ? 'En ligne' : 'Connexion…'}
      </Text>
    </View>
  )
}

function formatTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleTimeString('fr-MA', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    marginTop: 2,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
  },
  connectionBadgeOnline: {
    backgroundColor: colors.successBg,
  },
  connectionBadgeOffline: {
    backgroundColor: colors.surface,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectionDotOnline: {
    backgroundColor: colors.success,
  },
  connectionDotOffline: {
    backgroundColor: colors.textMuted,
  },
  connectionText: {
    fontSize: 9,
    fontWeight: '800',
  },
  connectionTextOnline: {
    color: colors.success,
  },
  connectionTextOffline: {
    color: colors.textSecondary,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    flex: 1,
    color: colors.errorText,
    fontSize: 11,
    lineHeight: 16,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  emptyTitle: {
    marginTop: 12,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  messageRow: {
    width: '100%',
  },
  messageRowMine: {
    alignItems: 'flex-end',
  },
  messageRowPeer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 8,
    borderRadius: 18,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  bubblePeer: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderBottomLeftRadius: 6,
  },
  senderLabel: {
    marginBottom: 3,
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
  },
  senderLabelMine: {
    color: '#dbeafe',
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextMine: {
    color: colors.white,
  },
  timeText: {
    marginTop: 5,
    color: colors.textMuted,
    fontSize: 9,
    textAlign: 'right',
  },
  timeTextMine: {
    color: '#bfdbfe',
  },
  composer: {
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.white,
  },
  inputContainer: {
    flex: 1,
    minHeight: 48,
    maxHeight: 118,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 5,
  },
  input: {
    minHeight: 27,
    maxHeight: 78,
    padding: 0,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 19,
    textAlignVertical: 'top',
  },
  counter: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 8,
    textAlign: 'right',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: {
    opacity: 0.38,
  },
  sendButtonPressed: {
    opacity: 0.78,
  },
})
