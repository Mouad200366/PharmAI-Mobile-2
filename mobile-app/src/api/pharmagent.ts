// Client for the PharmAgent AI assistant service. Same *separate* backend
// as on web (its own FastAPI service — LangGraph + RAG + local Ollama LLM
// — running on its own port, not proxied through the Django API). Types
// and event-parsing logic are a direct port of the web app's
// api/pharmagent.ts.
//
// The transport is NOT a port, though: web's version reads
// `response.body.getReader()` off a `fetch()` call, but React Native's
// fetch (built on top of Android/iOS native networking) doesn't expose a
// streaming ReadableStream body the way browsers do. The standard RN
// workaround -- used here instead of adding a new SSE dependency -- is
// XMLHttpRequest with `onprogress`: RN's XHR delivers `responseText` as it
// grows during the request, so each progress tick contains the full text
// so far and we diff against what we've already parsed. Same blank-line
// SSE framing as the web version once we have the text.
import { PHARMAGENT_URL } from '../config/env'

export interface AssistRequest {
  user_query: string
  user_lat?: number
  user_lng?: number
  has_prescription?: boolean
}

export interface PharmacyOption {
  id?: string | number
  name?: string
  pharmacy_name?: string
  distance_km?: number
  price?: number
  is_night_shift?: boolean
}

export type PharmacyOptions = Record<string, PharmacyOption[]>

export type ValidationStatus = 'APPROVED' | 'REJECTED' | 'EMERGENCY' | 'UNKNOWN' | string

export interface AssistFinalPayload {
  type: 'final'
  status: ValidationStatus
  final_answer: string
  recommended_medicines: string[]
  pharmacy_summary: string
  pharmacy_options: PharmacyOptions
  citations: string[]
  warnings: string[]
  issues_summary: string
  emergency_response: string | null
  trace: string[]
}

export interface AssistStepPayload {
  type: 'agent_step'
  agent: string
  trace: string[]
  intent: string | null
  recommended_medicines: string[]
}

export interface AssistErrorPayload {
  type: 'error'
  error: string
}

export type AssistEvent = AssistStepPayload | AssistFinalPayload | AssistErrorPayload

/**
 * Streams the /assist-stream SSE endpoint, invoking onEvent for every
 * agent_step / final / error event as it arrives. Resolves once the
 * stream closes. Rejects if the connection itself fails (server down,
 * network error, non-2xx status) -- the caller should catch this
 * separately from in-stream {type: 'error'} events, which are reported via
 * onEvent instead since the connection itself succeeded.
 *
 * Returns an `abort()` function the caller can use to cancel mid-stream
 * (XHR has no AbortSignal support, unlike fetch on web).
 */
export function streamAssist(
  request: AssistRequest,
  onEvent: (event: AssistEvent) => void,
): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  let parsedLength = 0
  let buffer = ''

  function processNewText(fullText: string) {
    const newText = fullText.slice(parsedLength)
    parsedLength = fullText.length
    buffer += newText

    // SSE messages are separated by a blank line.
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const line = part.replace(/^data:\s*/, '').trim()
      if (!line) continue
      try {
        onEvent(JSON.parse(line) as AssistEvent)
      } catch {
        // Malformed SSE line -- skip it, same as the web reference does.
      }
    }
  }

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open('POST', `${PHARMAGENT_URL}/assist-stream`)
    xhr.setRequestHeader('Content-Type', 'application/json')

    xhr.onprogress = () => processNewText(xhr.responseText)

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`PharmAgent server error: ${xhr.status}`))
        return
      }
      processNewText(xhr.responseText)
      resolve()
    }

    xhr.onerror = () => reject(new Error('PharmAgent server error: network request failed'))
    xhr.onabort = () => resolve()

    xhr.send(
      JSON.stringify({
        user_lat: 33.5731,
        user_lng: -7.5898,
        has_prescription: false,
        ...request,
      }),
    )
  })

  return { promise, abort: () => xhr.abort() }
}