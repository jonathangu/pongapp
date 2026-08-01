const CREATE_ORIGINS = new Set([
  'https://www.jonathangu.com',
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
