import type { FeelAnswer } from './types'

// Placeholder voice layer using the browser's built-in speech.
// Person 3 swaps these for Cartesia Sonic (speak) and Ink (listen) through Convex actions.

export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.85
    u.pitch = 0.95
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch { /* voice is optional */ }
}

/** Listens for one spoken answer. Resolves with the transcript, or null on timeout or no support. */
export function listen(timeoutMs = 7000): Promise<string | null> {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) return Promise.resolve(null)
  return new Promise((resolve) => {
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = false
    let done = false
    const finish = (v: string | null) => {
      if (done) return
      done = true
      try { rec.stop() } catch { /* already stopped */ }
      resolve(v)
    }
    rec.onresult = (e: any) => finish(e.results[0][0].transcript)
    rec.onerror = () => finish(null)
    rec.onend = () => finish(null)
    setTimeout(() => finish(null), timeoutMs)
    try { rec.start() } catch { finish(null) }
  })
}

/** Keyword fallback. Person 3 replaces this with the Claude action for fuzzy answers ("kind of floaty?"). */
export function interpret(text: string): FeelAnswer {
  const s = text.toLowerCase()
  if (/(drift|wander|distract|floaty|lost|thinking|sleep|tired)/.test(s)) return 'drifting'
  if (/(focus|present|here|breath|calm|good)/.test(s)) return 'focused'
  return 'unsure'
}
