import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'
import {
  streamAssist,
  type AssistFinalPayload,
  type PharmacyOption,
  type PharmacyOptions,
} from '../../api/pharmagent'

// ─── Types (mirrors the web app's Assistant.tsx) ──────────────────

type AgentKey = 'triage' | 'medical' | 'pharmacy' | 'validator'
type AgentStatus = 'idle' | 'active' | 'done'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  kind: 'text' | 'loading' | 'response' | 'connection_error'
  text?: string
  response?: AssistFinalPayload
}

const AGENT_MAP: Record<string, AgentKey> = {
  triage: 'triage',
  medical: 'medical',
  pharmacy: 'pharmacy',
  validator: 'validator',
  emergency: 'validator',
}

const AGENT_NODES: { key: AgentKey; icon: string; name: string }[] = [
  { key: 'triage', icon: 'schedule', name: 'Triage' },
  { key: 'medical', icon: 'medical_information', name: 'Médical' },
  { key: 'pharmacy', icon: 'local_pharmacy', name: 'Pharmacie' },
  { key: 'validator', icon: 'verified', name: 'Contrôle' },
]

const STATUS_META: Record<string, { label: string; icon: string; bg: string; text: string }> = {
  APPROVED: { label: 'APPROUVÉ', icon: 'check_circle', bg: '#f0fdf4', text: '#15803d' },
  EMERGENCY: { label: 'URGENCE', icon: 'emergency', bg: '#fef2f2', text: colors.error },
  REJECTED: { label: 'REJETÉ', icon: 'block', bg: '#fffbeb', text: '#b45309' },
}

let idCounter = 0
function genId() {
  idCounter += 1
  return `msg_${Date.now()}_${idCounter}`
}

function buildPharmacyList(options: PharmacyOptions): (PharmacyOption & { medicine: string })[] {
  const seen = new Set<string | number>()
  const all: (PharmacyOption & { medicine: string })[] = []
  Object.entries(options || {}).forEach(([medicine, list]) => {
    if (!Array.isArray(list)) return
    list.forEach((p) => {
      const key = p.id ?? p.name ?? ''
      if (seen.has(key)) return
      seen.add(key)
      all.push({ ...p, medicine })
    })
  })
  all.sort((a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99))
  return all.slice(0, 3)
}

function bubbleColors(status?: string) {
  if (status === 'EMERGENCY') return { bg: '#fef2f2', border: '#fecaca' }
  if (status === 'REJECTED') return { bg: '#fffbeb', border: '#fde68a' }
  return { bg: colors.surface, border: colors.outlineVariant }
}

// ─── Screen ─────────────────────────────────────────────────────

// Mobile port of the web app's Assistant.tsx, wiring the same standalone
// PharmAgent service (see api/pharmagent.ts). Rebuilt against this app's
// components/tokens rather than embedding PharmAgent's own web frontend,
// same reasoning as web: it should read as one product.
//
// One structural change: desktop keeps the 4-agent pipeline as a
// permanent side panel next to the chat. There's no room for a second
// panel on a phone, so it becomes a slim horizontal strip below the
// header -- always present, but compact, so the chat itself stays the
// main focus. Markdown rendering (web uses a `renderMarkdown` lib) is
// simplified to plain text for now -- no markdown dependency in this
// project yet -- so `final_answer` shows as-is without headings/bold.
export default function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      kind: 'text',
      text: "Bienvenue ! Je suis un assistant IA pharmaceutique propulsé par 4 agents spécialisés qui collaborent. Décrivez vos symptômes ou demandez-moi un médicament, et je trouverai le bon traitement et la pharmacie ouverte la plus proche.",
    },
  ])
  const [input, setInput] = useState('')
  const [hasPrescription, setHasPrescription] = useState(false)
  const [sending, setSending] = useState(false)
  const [agentStatuses, setAgentStatuses] = useState<Record<AgentKey, AgentStatus>>({
    triage: 'idle', medical: 'idle', pharmacy: 'idle', validator: 'idle',
  })
  const [finalStatus, setFinalStatus] = useState<string | null>(null)

  const scrollRef = useRef<ScrollView>(null)
  const abortRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => abortRef.current?.()
  }, [])

  function resetPipeline() {
    setAgentStatuses({ triage: 'idle', medical: 'idle', pharmacy: 'idle', validator: 'idle' })
    setFinalStatus(null)
  }

  function markAgentActive(agentKey: string) {
    setAgentStatuses((prev) => {
      const next: Record<AgentKey, AgentStatus> = { ...prev }
      ;(Object.keys(next) as AgentKey[]).forEach((k) => {
        if (next[k] === 'active') next[k] = 'done'
      })
      const mapped = AGENT_MAP[agentKey]
      if (mapped) next[mapped] = 'active'
      return next
    })
  }

  function finalizePipeline() {
    setAgentStatuses((prev) => {
      const next: Record<AgentKey, AgentStatus> = { ...prev }
      ;(Object.keys(next) as AgentKey[]).forEach((k) => {
        if (next[k] === 'active') next[k] = 'done'
      })
      return next
    })
  }

  async function handleSend() {
    const query = input.trim()
    if (!query || sending) return

    setMessages((m) => [...m, { id: genId(), role: 'user', kind: 'text', text: query }])
    setInput('')
    resetPipeline()
    setSending(true)

    const loadingId = genId()
    setMessages((m) => [...m, { id: loadingId, role: 'assistant', kind: 'loading' }])

    let finalData: AssistFinalPayload | null = null
    let streamError: string | null = null

    const { promise, abort } = streamAssist(
      { user_query: query, has_prescription: hasPrescription },
      (event) => {
        if (event.type === 'agent_step') {
          markAgentActive(event.agent)
        } else if (event.type === 'final') {
          finalData = event
          finalizePipeline()
          setFinalStatus(event.status)
        } else if (event.type === 'error') {
          streamError = event.error
        }
      },
    )
    abortRef.current = abort

    try {
      await promise
      setMessages((m) => m.filter((msg) => msg.id !== loadingId))
      if (streamError) {
        setMessages((m) => [...m, { id: genId(), role: 'assistant', kind: 'text', text: `⚠️ ${streamError}` }])
      } else if (finalData) {
        setMessages((m) => [...m, { id: genId(), role: 'assistant', kind: 'response', response: finalData! }])
      } else {
        setMessages((m) => [...m, { id: genId(), role: 'assistant', kind: 'text', text: 'Hmm, aucune réponse reçue. Réessayez.' }])
      }
    } catch {
      setMessages((m) => m.filter((msg) => msg.id !== loadingId))
      setMessages((m) => [
        ...m,
        { id: genId(), role: 'assistant', kind: 'connection_error', text: "Impossible de joindre le serveur PharmAgent. Vérifiez qu'il est démarré." },
      ])
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <LinearGradient
        colors={[colors.primary, '#00687a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Icon name="smart_toy" size={20} color={colors.white} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Assistant IA</Text>
            <Text style={styles.headerSubtitle}>Pharmaceutique multi-agents</Text>
          </View>
        </View>
        <View style={styles.onlineTag}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>En ligne</Text>
        </View>
      </LinearGradient>

      {/* Pipeline strip */}
      <View style={styles.pipelineStrip}>
        {AGENT_NODES.map((node, i) => {
          const status = agentStatuses[node.key]
          return (
            <View key={node.key} style={styles.pipelineNodeWrap}>
              <View
                style={[
                  styles.pipelineNode,
                  status === 'active' && styles.pipelineNodeActive,
                  status === 'done' && styles.pipelineNodeDone,
                ]}
              >
                <Icon
                  name={status === 'done' ? 'check' : node.icon}
                  size={14}
                  color={status === 'idle' ? colors.textMuted : colors.white}
                />
              </View>
              <Text style={styles.pipelineLabel} numberOfLines={1}>{node.name}</Text>
              {i < AGENT_NODES.length - 1 && (
                <View style={[styles.pipelineLine, status !== 'idle' && styles.pipelineLineActive]} />
              )}
            </View>
          )
        })}
        {finalStatus && (
          <View style={[styles.finalBadge, { backgroundColor: STATUS_META[finalStatus]?.bg }]}>
            <Icon name={STATUS_META[finalStatus]?.icon ?? 'info'} size={13} color={STATUS_META[finalStatus]?.text} />
            <Text style={[styles.finalBadgeText, { color: STATUS_META[finalStatus]?.text }]}>
              {STATUS_META[finalStatus]?.label ?? finalStatus}
            </Text>
          </View>
        )}
      </View>

      {/* Chat */}
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable style={styles.rxRow} onPress={() => setHasPrescription((v) => !v)}>
          <Icon
            name={hasPrescription ? 'check_box' : 'check_box_outline_blank'}
            size={17}
            color={hasPrescription ? colors.primary : colors.textMuted}
          />
          <Text style={styles.rxLabel}>J'ai une ordonnance</Text>
        </Pressable>
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            placeholder="Décrivez vos symptômes..."
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            <Icon name="arrow_forward" size={18} color={colors.white} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

// ─── Message rendering ──────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <View style={styles.rowRight}>
        <View style={styles.bubbleUser}>
          <Text style={styles.bubbleUserText}>{msg.text}</Text>
        </View>
      </View>
    )
  }

  if (msg.kind === 'loading') {
    return (
      <View style={styles.rowLeft}>
        <View style={styles.bubbleAssistant}>
          <Text style={styles.loadingText}>Les agents travaillent…</Text>
        </View>
      </View>
    )
  }

  if (msg.kind === 'connection_error') {
    return (
      <View style={styles.rowLeft}>
        <View style={styles.bubbleError}>
          <Text style={styles.bubbleErrorText}>⚠️ {msg.text}</Text>
        </View>
      </View>
    )
  }

  if (msg.kind === 'text') {
    return (
      <View style={styles.rowLeft}>
        <View style={styles.bubbleAssistant}>
          <Text style={styles.bubbleAssistantText}>{msg.text}</Text>
        </View>
      </View>
    )
  }

  // kind === 'response'
  const data = msg.response!
  const pharmacies = data.status === 'APPROVED' ? buildPharmacyList(data.pharmacy_options) : []
  const bc = bubbleColors(data.status)

  return (
    <View style={styles.rowLeft}>
      <View style={[styles.bubbleResponse, { backgroundColor: bc.bg, borderColor: bc.border }]}>
        <Text style={styles.bubbleAssistantText}>{data.final_answer}</Text>

        {data.status === 'APPROVED' && pharmacies.length > 0 && (
          <View style={{ gap: 8, marginTop: 10 }}>
            {pharmacies.map((p, i) => (
              <View key={p.id ?? p.name ?? i} style={[styles.pharmacyRow, i === 0 && styles.pharmacyRowFirst]}>
                <View style={styles.pharmacyIcon}>
                  <Icon name="local_pharmacy" size={15} color={colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.pharmacyName} numberOfLines={1}>{p.pharmacy_name || p.name}</Text>
                  <Text style={styles.pharmacyMeta} numberOfLines={1}>
                    {p.distance_km != null ? `📍 ${p.distance_km} km` : ''}
                    {p.medicine ? `  💊 ${p.medicine}` : ''}
                    {p.is_night_shift ? '  🌙 GARDE' : ''}
                  </Text>
                </View>
                {p.price != null && <Text style={styles.pharmacyPrice}>{p.price.toFixed(2)} MAD</Text>}
              </View>
            ))}
          </View>
        )}

        {data.status === 'APPROVED' && pharmacies.length === 0 && !!data.pharmacy_summary && (
          <Text style={styles.pharmacySummary}>🏥 {data.pharmacy_summary}</Text>
        )}

        {data.warnings?.length > 0 && (
          <View style={styles.warningsBox}>
            <Text style={styles.warningsTitle}>⚠️ Avertissements importants</Text>
            {data.warnings.map((w, i) => (
              <Text key={i} style={styles.warningsItem}>• {w}</Text>
            ))}
          </View>
        )}

        {data.citations?.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.citationsTitle}>📚 Sources</Text>
            <View style={styles.citationsRow}>
              {data.citations.map((c, i) => (
                <View key={i} style={styles.citationChip}>
                  <Text style={styles.citationText}>{c}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#ffffff26',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: colors.white, fontWeight: '700', fontSize: 15 },
  headerSubtitle: { color: '#ffffffb3', fontSize: 11, marginTop: 1 },
  onlineTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#4ade80' },
  onlineText: { color: '#ffffffcc', fontSize: 11 },

  pipelineStrip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.surfaceLowest, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant, gap: 2,
  },
  pipelineNodeWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  pipelineNode: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.outlineVariant, alignItems: 'center', justifyContent: 'center',
  },
  pipelineNodeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pipelineNodeDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  pipelineLabel: { fontSize: 9, color: colors.textMuted, marginLeft: 4, flexShrink: 1 },
  pipelineLine: { flex: 1, height: 1, backgroundColor: colors.outlineVariant, marginHorizontal: 4 },
  pipelineLineActive: { backgroundColor: colors.primary },
  finalBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginLeft: 6,
  },
  finalBadgeText: { fontSize: 10, fontWeight: '700' },

  chat: { flex: 1 },
  chatContent: { padding: 16, gap: 10 },

  rowRight: { alignItems: 'flex-end' },
  rowLeft: { alignItems: 'flex-start' },

  bubbleUser: {
    maxWidth: '82%', backgroundColor: colors.primary,
    borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleUserText: { color: colors.white, fontSize: 14 },

  bubbleAssistant: {
    maxWidth: '82%', backgroundColor: colors.surfaceLowest, borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleAssistantText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  loadingText: { color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' },

  bubbleError: {
    maxWidth: '82%', backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleErrorText: { color: colors.error, fontSize: 13 },

  bubbleResponse: {
    maxWidth: '88%', borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, padding: 14,
  },

  pharmacyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.white,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
  },
  pharmacyRowFirst: { borderColor: colors.accentLight, backgroundColor: '#ecfeff' },
  pharmacyIcon: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  pharmacyName: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  pharmacyMeta: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  pharmacyPrice: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  pharmacySummary: { fontSize: 12, color: colors.textSecondary, marginTop: 10 },

  warningsBox: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 12, padding: 10, marginTop: 10, gap: 3 },
  warningsTitle: { fontSize: 12, fontWeight: '700', color: '#92400e' },
  warningsItem: { fontSize: 12, color: '#92400e' },

  citationsTitle: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginBottom: 4 },
  citationsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  citationChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  citationText: { fontSize: 10, color: colors.textSecondary },

  footer: { borderTopWidth: 1, borderTopColor: colors.outlineVariant, padding: 12, backgroundColor: colors.surfaceLowest, gap: 8 },
  rxRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  rxLabel: { fontSize: 12, color: colors.textSecondary },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textInput: {
    flex: 1, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.white,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
})