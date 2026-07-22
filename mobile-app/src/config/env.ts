import Constants from 'expo-constants'

// Values come from app.json -> expo.extra, overridable at runtime later
// (e.g. via a settings screen) if you want to point at a different backend
// without rebuilding.
const extra = Constants.expoConfig?.extra ?? {}

export const API_BASE_URL: string = extra.apiBaseUrl ?? 'http://127.0.0.1:8000/api/v1'
export const WS_BASE_URL: string = extra.wsBaseUrl ?? 'ws://127.0.0.1:8000/ws'
// PharmAgent is a *separate* backend from the Django API (its own FastAPI
// service — LangGraph + RAG + local Ollama LLM) running on its own port.
// Same "replace 127.0.0.1 with your LAN IP for a physical device" caveat
// as above applies here too.
export const PHARMAGENT_URL: string = extra.pharmagentUrl ?? 'http://127.0.0.1:8001'
// NOTE: on a physical device or emulator, 127.0.0.1 refers to the device
// itself, not your dev machine. Replace with your machine's LAN IP
// (e.g. http://192.168.1.23:8000/api/v1) in app.json, or use `expo start`
// with a tunnel.
