const ROOM_CODE = /^[A-Z2-9]{6}$/

export function normalizeRoomCode(value: string): string | null {
  const code = value.trim().toUpperCase()
  return ROOM_CODE.test(code) ? code : null
}

export function inviteUrlFor(origin: string, baseUrl: string, roomCode: string, quickStart: boolean): string | null {
  const code = normalizeRoomCode(roomCode)
  if (!code) return null
  const url = new URL(baseUrl, origin)
  if (quickStart) url.searchParams.set('quick', '1')
  url.hash = `/room/${code}`
  return url.toString()
}

export function pongHomeUrlFor(origin: string, baseUrl: string): string {
  return new URL(baseUrl, origin).toString()
}
