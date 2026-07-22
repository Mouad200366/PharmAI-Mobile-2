// The backend wraps all DRF errors in { success, error: {...}, status_code }.
// This helper extracts the inner error object. Identical to the web app's
// api/errors.ts — same backend, same error shape.

interface ApiErrorResponse {
  success?: boolean
  error?: Record<string, string | string[]> | string
  status_code?: number
  detail?: string
}

export function extractErrors(err: unknown): Record<string, string> {
  const response = (err as { response?: { data?: ApiErrorResponse } })?.response?.data

  const raw =
    response && typeof response.error === 'object' && response.error !== null
      ? response.error
      : response ?? {}

  const out: Record<string, string> = {}

  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      out[key] = val[0] as string
    } else if (typeof val === 'string') {
      out[key] = val
    }
  }

  if (out.non_field_errors) {
    out.form = out.non_field_errors
    delete out.non_field_errors
  }
  if (out.detail && !out.form) {
    out.form = out.detail
    delete out.detail
  }

  if (Object.keys(out).length === 0) {
    out.form = 'Une erreur est survenue. Réessayez.'
  }

  return out
}

export function firstError(err: unknown): string {
  const errs = extractErrors(err)
  return errs.form ?? Object.values(errs)[0] ?? 'Une erreur est survenue.'
}
