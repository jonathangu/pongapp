const CREATE_ORIGINS = new Set([
  'https://www.jonathangu.com',
  'https://jonathangu.com',
  'https://jonathangu.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('')
}

export function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null
  return CREATE_ORIGINS.has(origin) ? origin : null
}

export function validRoomCode(value: string): boolean {
  return /^[A-Z2-9]{6}$/.test(value)
}

export function classifyWebSocketClose(code: number | null): 'replaced' | 'normal' | 'going_away' | 'abnormal' | 'error' | 'other' {
  if (code === 4001) return 'replaced'
  if (code === 1000) return 'normal'
  if (code === 1001) return 'going_away'
  if (code === 1006) return 'abnormal'
  if (code === null) return 'error'
  return 'other'
}

export function acceptClientTelemetry(
  event: 'control_surface_visible' | 'room_full_visible' | 'network_sample',
  uiMask: number,
  lastNetworkAt: number | null,
  now: number,
): { accepted: boolean; uiMask: number; lastNetworkAt: number | null } {
  const signalBit = event === 'control_surface_visible' ? 1 : event === 'room_full_visible' ? 2 : 0
  if (signalBit && (uiMask & signalBit) !== 0) return { accepted: false, uiMask, lastNetworkAt }
  if (event === 'network_sample' && lastNetworkAt !== null && now - lastNetworkAt < 15_000) {
    return { accepted: false, uiMask, lastNetworkAt }
  }
  return {
    accepted: true,
    uiMask: signalBit ? uiMask | signalBit : uiMask,
    lastNetworkAt: event === 'network_sample' ? now : lastNetworkAt,
  }
}
