import { useSyncExternalStore } from 'react'
import { api } from '../../convex/_generated/api'
import { convex } from './backend'
import type { FeelAnswer } from './types'

// TIDE's voice, both directions, through Cartesia. The user's eyes are closed, so this is the
// only way the session can talk to them or hear them.
//
// Speaking: Sonic 3.6 lines, generated server-side (convex/voice.ts) and cached, are downloaded
// and decoded before the session starts, then played through Web Audio the instant they're due.
// Listening: only while a Feel Check waits for an answer, the mic streams 16 kHz PCM to Ink 2
// with a short-lived STT-only token. Audio is never stored; only the transcript goes on.
// There is no browser-speech fallback: if Cartesia is unreachable the screen says so.

export type VoiceStatus = 'off' | 'loading' | 'ready' | 'unavailable'
export type MicStatus = 'off' | 'ready' | 'denied'

const SAMPLE_RATE = 16000
const STT_VERSION = '2026-08-14'
/** Words people say with their eyes closed; biases Ink 2 toward them in a noisy room. */
const KEYTERMS = ['focused', 'drifting', 'sleepy', 'wandering', 'restless', 'present', 'distracted']

let ctx: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
let playing: AudioBufferSourceNode | null = null
let voiceStatus: VoiceStatus = 'off'
let micStatus: MicStatus = 'off'
let mic: MediaStream | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/**
 * Call from a tap. iOS only lets a page play sound after a user gesture, so the session's first
 * cue would otherwise be silent: resuming the context and playing one silent sample unlocks it.
 */
export function unlockAudio() {
  try {
    const a = audio()
    void a.resume()
    const src = a.createBufferSource()
    src.buffer = a.createBuffer(1, 1, a.sampleRate)
    src.connect(a.destination)
    src.start()
  } catch { /* no Web Audio: the voice stays unavailable */ }
}

/** Ask for the microphone while the user's eyes are still open (call from a tap). The track stays muted until a Feel Check. */
export async function prepareMic(): Promise<MicStatus> {
  if (mic) return micStatus
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
    mic.getAudioTracks().forEach((t) => (t.enabled = false))
    micStatus = 'ready'
  } catch {
    micStatus = 'denied'
  }
  emit()
  return micStatus
}

/** Release the microphone (end of session). */
export function releaseMic() {
  mic?.getTracks().forEach((t) => t.stop())
  mic = null
  micStatus = 'off'
  emit()
}

async function decode(url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`audio ${res.status}`)
  return await audio().decodeAudioData(await res.arrayBuffer())
}

/** Generate (or fetch from the cache) and decode every line of a session, before eyes close. */
export async function prepareVoice(lines: string[]): Promise<VoiceStatus> {
  if (!convex) { voiceStatus = 'unavailable'; emit(); return voiceStatus }
  const todo = [...new Set(lines.map((l) => l.trim()).filter(Boolean))].filter((l) => !buffers.has(l))
  if (!todo.length && voiceStatus === 'ready') return voiceStatus
  voiceStatus = 'loading'
  emit()
  try {
    const urls = await convex.action(api.voice.prefetch, { texts: todo })
    await Promise.all(Object.entries(urls).map(async ([text, url]) => buffers.set(text, await decode(url))))
    voiceStatus = 'ready'
  } catch (e) {
    console.warn('Cartesia voice unavailable', e)
    voiceStatus = 'unavailable'
  }
  emit()
  return voiceStatus
}

/** Speak one line. Resolves when it has finished playing (or straight away if the voice is unavailable). */
export async function speak(text: string): Promise<void> {
  const line = text.trim()
  if (!line || voiceStatus === 'unavailable') return
  let buf = buffers.get(line)
  if (!buf && convex) {
    // A line nobody prefetched: generate it now (a short delay the first time, cached after).
    try {
      buf = await decode(await convex.action(api.voice.speak, { text: line }))
      buffers.set(line, buf)
    } catch (e) {
      console.warn('Cartesia line failed', e)
      return
    }
  }
  if (!buf) return
  stopSpeaking()
  const a = audio()
  void a.resume()
  const src = a.createBufferSource()
  src.buffer = buf
  src.connect(a.destination)
  playing = src
  await new Promise<void>((resolve) => {
    src.onended = () => { if (playing === src) playing = null; resolve() }
    src.start()
  })
}

export function stopSpeaking() {
  try { playing?.stop() } catch { /* already stopped */ }
  playing = null
}

export function toPcm16(input: Float32Array, fromRate: number): Int16Array<ArrayBuffer> {
  const ratio = fromRate / SAMPLE_RATE
  const out = new Int16Array(new ArrayBuffer(Math.floor(input.length / ratio) * 2))
  for (let i = 0; i < out.length; i++) {
    // Average the samples that fall into this output sample (a cheap low-pass while downsampling).
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)))
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff
  }
  return out
}

function sttUrl(path: 'turns' | 'manual', token: string) {
  const u = new URL(`wss://api.cartesia.ai/stt/${path === 'turns' ? 'turns/' : ''}websocket`)
  u.searchParams.set('model', 'ink-2')
  u.searchParams.set('encoding', 'pcm_s16le')
  u.searchParams.set('sample_rate', String(SAMPLE_RATE))
  u.searchParams.set('cartesia_version', STT_VERSION)
  u.searchParams.set('access_token', token)
  KEYTERMS.forEach((k) => u.searchParams.append('keyterm', k))
  if (path === 'turns') {
    // Answers are a word or a short phrase, often hesitant: wait through an "uh…", end soon after.
    u.searchParams.set('turn_start_threshold', '0.8')
    u.searchParams.set('turn_eager_end_threshold', '0.5')
    u.searchParams.set('turn_end_threshold', '0.2')
    u.searchParams.set('turn_end_timeout_ms', '2500')
  }
  return u.toString()
}

/**
 * Listen for one spoken answer. Resolves with the transcript, or null on silence, a denied mic,
 * or no connection. Ink 2's turn detection decides when the answer is finished; if that endpoint
 * refuses the token, falls back to the manual endpoint and finalizes after a pause.
 */
export async function listen(timeoutMs = 9000): Promise<string | null> {
  if (!convex || !mic || micStatus !== 'ready') return null
  let token: string
  try {
    token = (await convex.action(api.voice.sttToken, {})).token
  } catch (e) {
    console.warn('Ink 2 token failed', e)
    return null
  }
  const heard = await stream('turns', token, timeoutMs)
  if (heard !== undefined) return heard
  return (await stream('manual', token, timeoutMs)) ?? null
}

/** undefined: the connection never opened (try the other endpoint). */
function stream(path: 'turns' | 'manual', token: string, timeoutMs: number): Promise<string | null | undefined> {
  return new Promise((resolve) => {
    const a = audio()
    const ws = new WebSocket(sttUrl(path, token))
    ws.binaryType = 'arraybuffer'
    const track = mic!.getAudioTracks()[0]
    const source = a.createMediaStreamSource(mic!)
    const proc = a.createScriptProcessor(4096, 1, 1)
    const mute = a.createGain()
    mute.gain.value = 0
    let opened = false, done = false, transcript = '', spoke = false, quietSince = 0

    const finish = (value: string | null | undefined) => {
      if (done) return
      done = true
      clearTimeout(timer)
      track.enabled = false
      proc.onaudioprocess = null
      try { source.disconnect(); proc.disconnect(); mute.disconnect() } catch { /* already disconnected */ }
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(path === 'turns' ? JSON.stringify({ type: 'close' }) : 'close')
        ws.close()
      } catch { /* closing anyway */ }
      resolve(value)
    }
    const timer = window.setTimeout(() => {
      if (path === 'manual' && opened && ws.readyState === WebSocket.OPEN) { ws.send('finalize'); window.setTimeout(() => finish(transcript || null), 1500) }
      else finish(opened ? transcript || null : undefined)
    }, timeoutMs)

    ws.onopen = () => {
      opened = true
      track.enabled = true
      source.connect(proc)
      proc.connect(mute)
      mute.connect(a.destination)
      proc.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const input = e.inputBuffer.getChannelData(0)
        ws.send(toPcm16(input, a.sampleRate))
        if (path === 'manual') {
          // The manual endpoint has no turn detection: finalize after ~1.2 s of quiet once they've spoken.
          const level = Math.sqrt(input.reduce((s, x) => s + x * x, 0) / input.length)
          if (level > 0.02) { spoke = true; quietSince = 0 }
          else if (spoke && !quietSince) quietSince = performance.now()
          else if (spoke && performance.now() - quietSince > 1200) { spoke = false; ws.send('finalize') }
        }
      }
    }
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      let msg: { type?: string; transcript?: string; text?: string; is_final?: boolean }
      try { msg = JSON.parse(e.data) } catch { return }
      if (msg.type === 'error') { console.warn('Ink 2 error', msg); finish(opened ? transcript || null : undefined); return }
      if (path === 'turns') {
        if (msg.transcript) transcript = msg.transcript
        if (msg.type === 'turn.end') finish(transcript || null)
      } else {
        if (msg.type === 'transcript' && msg.text && msg.is_final) transcript = `${transcript} ${msg.text}`.trim()
        if (msg.type === 'flush_done' || msg.type === 'done') finish(transcript || null)
      }
    }
    ws.onerror = () => finish(opened ? transcript || null : undefined)
    ws.onclose = () => finish(opened ? transcript || null : undefined)
  })
}

function snapshot() { return `${voiceStatus}|${micStatus}` }
/** Voice and mic status for the session screen. */
export function useVoiceStatus(): { voice: VoiceStatus; mic: MicStatus } {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, snapshot)
  const [voice, m] = s.split('|') as [VoiceStatus, MicStatus]
  return { voice, mic: m }
}

/** Keyword reading used only without a backend; with Convex, feel.answer reads the transcript (keywords, then Claude). */
export function interpret(text: string): FeelAnswer {
  const s = text.toLowerCase()
  if (/(drift|wander|distract|floaty|lost|thinking|sleep|tired)/.test(s)) return 'drifting'
  if (/(focus|present|here|breath|calm|good)/.test(s)) return 'focused'
  return 'unsure'
}
