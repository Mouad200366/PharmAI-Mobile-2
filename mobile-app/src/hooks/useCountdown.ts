import { useState, useEffect, useCallback } from 'react'

// Identical to the web app's useCountdown.ts -- pure React/JS logic, no DOM
// APIs involved, so it ports over unchanged.
export function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds)
  const [running, setRunning] = useState(true)

  useEffect(() => {
    if (!running || seconds <= 0) return
    const id = setInterval(() => setSeconds((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [running, seconds])

  const reset = useCallback(
    (s = initialSeconds) => {
      setSeconds(s)
      setRunning(true)
    },
    [initialSeconds],
  )

  const formatted = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  return { seconds, formatted, expired: seconds <= 0, reset }
}