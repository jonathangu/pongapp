import type { MatchCommand, MatchGame, MatchParty, MatchRole } from '@pongapp/game-core'
import type { PuzzlePresence, PuzzleServerMessage } from '@pongapp/protocol'
import { logDiagnostic } from './diagnostics'

const SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD ? 'https://pongapp-room.pongapp-room-worker.workers.dev' : 'http://127.0.0.1:8787')
const tokenKey = (code: string) => `starling.puzzle.room.${code}`
const readToken = (code: string) => { try { return localStorage.getItem(tokenKey(code)) ?? undefined } catch { return undefined } }
const keepToken = (code: string, token: string) => { try { localStorage.setItem(tokenKey(code), token) } catch { /* This session still works. */ } }
export const puzzleInvitation = () => /^#\/together\/([A-Z2-9]{6})$/i.exec(location.hash)?.[1]?.toUpperCase() ?? ''
export async function createPuzzleRoom(game: MatchGame) {
  const response = await fetch(SERVER + '/api/puzzle/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game }), signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('create_failed')
  const result = await response.json() as { code: string; token: string }
  if (!/^[A-Z2-9]{6}$/.test(result.code) || typeof result.token !== 'string') throw new Error('invalid_room')
  keepToken(result.code, result.token)
  return result.code
}
export class PuzzleConnection {
  party: MatchParty | null = null
  role: MatchRole = 0
  presence: PuzzlePresence = [false, false]
  connected = false
  private socket: WebSocket | null = null
  private token: string | undefined
  private disposed = false
  private stopped = false
  private attempts = 0
  private lastHeard = Date.now()
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval>
  constructor(readonly code: string, private receive: (message: PuzzleServerMessage) => void, private status: (message: string) => void) {
    this.token = readToken(code); this.connect()
    this.heartbeat = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        if (Date.now() - this.lastHeard > 25000) this.socket.close()
        else this.socket.send(JSON.stringify({ type: 'ping' }))
      }
    }, 10000)
  }
  private connect() {
    if (this.disposed || this.stopped) return
    this.status(this.attempts ? 'Reconnecting to your partner…' : 'Joining your shared board…')
    const url = new URL(`/api/puzzle/rooms/${this.code}`, SERVER); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url); this.socket = socket
    const timeout = setTimeout(() => { if (!this.connected && socket === this.socket) socket.close() }, 10000)
    socket.onopen = () => { this.lastHeard = Date.now(); socket.send(JSON.stringify({ type: 'hello', version: 1, ...(this.token ? { token: this.token } : {}) })) }
    socket.onmessage = event => {
      if (this.disposed || socket !== this.socket || typeof event.data !== 'string') return
      this.lastHeard = Date.now()
      let message: PuzzleServerMessage
      try { message = JSON.parse(event.data) as PuzzleServerMessage } catch { return }
      if (message.type === 'welcome') {
        clearTimeout(timeout); this.token = message.token; keepToken(this.code, message.token); this.role = message.role; this.connected = true; this.attempts = 0
        this.party = message.party; this.presence = message.presence; this.status(''); logDiagnostic('coop_connected', { value: message.role })
      } else if (message.type === 'state') {
        if (this.party && message.party.revision < this.party.revision) return
        this.party = message.party; this.presence = message.presence
      } else if (message.type === 'presence') this.presence = message.presence
      else if (message.type === 'error' && ['full', 'expired', 'invalid', 'replaced'].includes(message.code)) {
        this.stopped = true; this.connected = false
        this.status(message.code === 'full' ? 'This boat already has two people. Ask for a fresh invitation.' : message.code === 'replaced' ? 'Your game was opened in another tab.' : 'This invitation is no longer available. Start a new shared game.')
      }
      this.receive(message)
    }
    socket.onclose = () => {
      clearTimeout(timeout)
      if (socket !== this.socket || this.disposed || this.stopped) return
      this.connected = false; this.status('Connection paused. Rejoining your shared board…')
      logDiagnostic('coop_reconnecting')
      this.attempts++; this.reconnectTimer = setTimeout(() => this.connect(), Math.min(10000, 700 * 2 ** Math.min(this.attempts, 4)))
    }
    socket.onerror = () => { if (!this.disposed) this.status('Cannot reach your partner yet. Check your connection.') }
  }
  send(command: Omit<MatchCommand, 'revision'> & { a?: number; b?: number }): boolean {
    if (!this.connected || !this.party || this.socket?.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify({ type: command.kind, revision: this.party.revision, ...(command.kind === 'swap' ? { a: command.a, b: command.b } : {}) }))
    return true
  }
  dispose() { this.disposed = true; clearTimeout(this.reconnectTimer); clearInterval(this.heartbeat); this.socket?.close() }
}
