'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal typings for the Web Speech API (not in the standard DOM lib).
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>
}
interface SpeechRecognitionErrorLike { error?: string }
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onstart: (() => void) | null
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null
}
type RecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Push-to-talk speech-to-text via the browser's built-in Web Speech API.
 * `onFinal` fires with the recognized text. `supported` is false where the API
 * isn't available (e.g. Firefox), so callers can hide the mic.
 */
export function useVoiceInput(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Raw diagnostic (error name + message + permission/device state) so we can
  // tell a site block from a global setting from an enterprise policy.
  const [detail, setDetail] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  useEffect(() => { onFinalRef.current = onFinal }, [onFinal])

  useEffect(() => {
    setSupported(getRecognitionCtor() != null)
    return () => recRef.current?.stop()
  }, [])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(async () => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    setError(null)
    setDetail(null)

    // The mic needs a SECURE context (https or localhost). On a LAN IP like
    // 192.168.x.x the browser silently refuses — surface that precisely.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setError('insecure')
      return
    }

    // Explicitly request microphone access — this is what triggers the browser's
    // permission prompt when it hasn't been decided yet. (If the user previously
    // BLOCKED the mic, the browser suppresses the prompt and this rejects; they
    // must reset the site permission once.) We release the stream immediately;
    // SpeechRecognition opens its own.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
    } catch (e) {
      // Surface the REAL reason instead of assuming "blocked".
      const name = e instanceof Error ? e.name : ''
      const message = e instanceof Error ? e.message : String(e)

      // Probe the browser for ground truth: permission state + how many audio
      // input devices it can even see + whether the setting is policy-managed.
      let permState = 'unknown'
      try {
        const p = await navigator.permissions?.query({ name: 'microphone' as PermissionName })
        permState = p?.state ?? 'unknown'
      } catch { /* permissions API not available */ }
      let inputCount = -1
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        inputCount = devices.filter((d) => d.kind === 'audioinput').length
      } catch { /* ignore */ }

      setDetail(`${name}: ${message} · permission=${permState} · audioInputs=${inputCount} · secure=${window.isSecureContext}`)
      setError(
        name === 'SecurityError' ? 'insecure'
          : name === 'NotAllowedError' ? 'not-allowed'
          : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'audio-capture'
            : name === 'NotReadableError' ? 'in-use'
              : (name || 'error'),
      )
      return
    }

    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.continuous = false
    rec.interimResults = false
    // Reflect the REAL state: only "listening" once recognition actually starts.
    rec.onstart = () => setListening(true)
    rec.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) text += r[0].transcript
      }
      if (text.trim()) onFinalRef.current(text.trim())
    }
    rec.onend = () => setListening(false)
    rec.onerror = (e) => {
      // 'not-allowed' = mic permission blocked; 'no-speech' = heard nothing.
      setError(e?.error ?? 'error')
      setListening(false)
    }
    recRef.current = rec
    try {
      rec.start()
    } catch {
      // start() throws if a prior recognition is still active — reset.
      setListening(false)
    }
  }, [])

  return { supported, listening, error, detail, start, stop }
}
