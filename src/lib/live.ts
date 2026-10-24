import type { FeelCheck, Reading } from './types'

// Live feed from the phone to the coach view.
// For now this uses BroadcastChannel (works between tabs in one browser).
// Person 3 swaps it for a Convex mutation (phone) + reactive query (laptop).

export type LiveMsg =
  | { kind: 'start'; lengthSec: number }
  | { kind: 'breath'; v: number }
  | { kind: 'reading'; r: Reading }
  | { kind: 'feel'; f: FeelCheck }
  | { kind: 'asking' }
  | { kind: 'end' }

const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tide-live') : null

export const publish = (m: LiveMsg) => ch?.postMessage(m)

export function subscribe(cb: (m: LiveMsg) => void) {
  if (!ch) return () => {}
  const h = (e: MessageEvent<LiveMsg>) => cb(e.data)
  ch.addEventListener('message', h)
  return () => ch.removeEventListener('message', h)
}
