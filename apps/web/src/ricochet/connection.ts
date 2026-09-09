import type { RicochetAction, RicochetGame, RicochetParty, Seat } from '@pongapp/game-core/ricochet'
import type { RicochetServerMessage, RicochetPresence } from '@pongapp/protocol/ricochet'

const SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD ? 'https://pongapp-room.pongapp-room-worker.workers.dev' : 'http://127.0.0.1:8787')
const key = (code: string) => `starling.ricochet.room.${code}`
const readToken = (code: string) => { try { return localStorage.getItem(key(code)) ?? undefined } catch { return undefined } }
const saveToken = (code: string, token: string) => { try { localStorage.setItem(key(code), token) } catch { /* Current socket still works. */ } }
export const ricochetInvitation = () => /^#\/ricochet\/together\/([A-Z2-9]{6})$/i.exec(location.hash)?.[1]?.toUpperCase() ?? ''
export async function createRicochetRoom(game: RicochetGame): Promise<string> {
  const response = await fetch(SERVER + '/api/ricochet/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game }), signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('create_failed')
  const result = await response.json() as { code: string; token: string }
  if (!/^[A-Z2-9]{6}$/.test(result.code) || typeof result.token !== 'string') throw new Error('invalid_room')
  saveToken(result.code, result.token); return result.code
}
type Edit = Extract<RicochetAction, { kind: 'aim' | 'reflector' }>
export class RicochetConnection {
  party: RicochetParty | null = null
  seat: Seat = 0
  presence: RicochetPresence = [false, false]
  connected = false
  clockOffset = 0
  private socket: WebSocket | null = null
  private token: string | undefined
  private disposed = false
  private stopped = false
  private attempts = 0
  private lastHeard = Date.now()
  private lastEdit = 0
  private sequence = 0
  private queued: Edit | null = null
  private inFlight: { requestId: number; action: RicochetAction; layoutRevision: number } | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private helloTimer: ReturnType<typeof setTimeout> | undefined
  private ackTimer: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval>
  get pending() { return Boolean(this.queued || this.inFlight) }
  constructor(readonly code: string, private receive: (message: RicochetServerMessage) => void, private status: (message: string) => void) {
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
    this.status(this.attempts ? 'Reconnecting. Your last confirmed setup is safe…' : 'Joining your rescue boat…')
    const url = new URL(`/api/ricochet/rooms/${this.code}`, SERVER); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url); this.socket = socket
    this.helloTimer = setTimeout(() => { if (!this.connected && socket === this.socket) socket.close() }, 10000)
    socket.onopen = () => { this.lastHeard = Date.now(); socket.send(JSON.stringify({ type: 'hello', version: 1, ...(this.token ? { token: this.token } : {}) })) }
    socket.onmessage = event => {
      if (this.disposed || socket !== this.socket || typeof event.data !== 'string' || event.data.length > 256000) return
      this.lastHeard = Date.now()
      let message: RicochetServerMessage
      try { message = JSON.parse(event.data) as RicochetServerMessage } catch { return }
      if ('serverAt' in message && Number.isFinite(message.serverAt)) this.clockOffset = message.serverAt - Date.now()
      if (message.type === 'welcome') {
        if (message.version !== 1) { this.stopped = true; this.status('Please reload to join this prototype.'); socket.close(); return }
        clearTimeout(this.helloTimer); this.token = message.token; saveToken(this.code, message.token)
        this.seat = message.seat; this.connected = true; this.attempts = 0
        this.party = message.party; this.presence = message.presence; this.status('')
      } else if (message.type === 'state') {
        if (this.party && message.party.revision < this.party.revision) return
        if (this.party && this.party.layoutRevision !== message.party.layoutRevision) {
          this.queued = null
          if (this.inFlight && (this.inFlight.action.kind === 'aim' || this.inFlight.action.kind === 'reflector') && this.inFlight.layoutRevision !== message.party.layoutRevision) {
            this.inFlight = null; clearTimeout(this.ackTimer)
          }
        }
        this.party = message.party; this.presence = message.presence
        if (message.ack?.seat === this.seat && message.ack.requestId === this.inFlight?.requestId) {
          this.inFlight = null; clearTimeout(this.ackTimer)
        }
      } else if (message.type === 'error') {
        if (this.inFlight && message.requestId === this.inFlight.requestId) {
          // Rebase a stale edit only after the server's following fresh snapshot.
          if (message.code === 'stale' && (this.inFlight.action.kind === 'aim' || this.inFlight.action.kind === 'reflector')) this.queued ??= this.inFlight.action
          else this.queued = null
          this.inFlight = null; clearTimeout(this.ackTimer)
        }
        if (message.fatal) {
          this.stopped = true; this.connected = false; this.queued = null; this.inFlight = null
          this.status(message.code === 'full' ? 'This boat already has two people. Start a fresh invitation.' : message.code === 'replaced' ? 'This seat was opened in another tab.' : 'This invitation is unavailable. You can still play solo.')
        }
      }
      this.receive(message)
      if (message.type === 'state' || message.type === 'welcome') this.flush()
    }
    socket.onclose = () => {
      clearTimeout(this.helloTimer); clearTimeout(this.ackTimer)
      if (socket !== this.socket || this.disposed || this.stopped) return
      this.connected = false; this.inFlight = null; this.queued = null
      this.status('Connection paused. Restoring your last confirmed setup…')
      this.attempts++; this.reconnectTimer = setTimeout(() => this.connect(), Math.min(10000, 700 * 2 ** Math.min(this.attempts, 4)))
    }
    socket.onerror = () => { if (!this.disposed && !this.stopped) this.status('Cannot reach your partner yet. Check your connection.') }
  }
  edit(action: Edit) { if (this.connected) { this.queued = action; this.flush() } }
  private flush() {
    if (!this.queued || this.inFlight || !this.connected || !this.party) return
    clearTimeout(this.flushTimer)
    const delay = 150 - (Date.now() - this.lastEdit)
    if (delay > 0) { this.flushTimer = setTimeout(() => this.flush(), delay); return }
    const action = this.queued; this.queued = null; this.lastEdit = Date.now()
    if (action.kind === 'aim' ? this.seat !== this.party.launcher : this.seat === this.party.launcher) return
    this.transmit(action)
  }
  send(action: RicochetAction): boolean {
    if (this.pending) return false
    return this.transmit(action)
  }
  private transmit(action: RicochetAction): boolean {
    if (!this.connected || !this.party || this.socket?.readyState !== WebSocket.OPEN) return false
    const requestId = ++this.sequence, { kind, ...fields } = action
    this.inFlight = { requestId, action, layoutRevision: this.party.layoutRevision }
    this.socket.send(JSON.stringify({ type: kind, ...fields, requestId, revision: this.party.revision }))
    this.ackTimer = setTimeout(() => { if (this.inFlight?.requestId === requestId) this.socket?.close() }, 7000)
    return true
  }
  dispose() {
    this.disposed = true; this.connected = false
    clearTimeout(this.reconnectTimer); clearTimeout(this.flushTimer); clearTimeout(this.helloTimer); clearTimeout(this.ackTimer); clearInterval(this.heartbeat)
    this.socket?.close()
  }
}
