import type { VersusGameState } from '@pongapp/game-core'
import { PROTOCOL_VERSION, type ClientMessage, type CreateRoomRequest, type RoomLobby, type RoomParticipant, type ServerMessage } from '@pongapp/protocol'

export interface VersusClientView {
  status: 'idle' | 'connecting' | 'lobby' | 'playing' | 'closed' | 'error'
  roomCode: string
  lobby: RoomLobby | null
  gameState: VersusGameState | null
  participant: RoomParticipant | null
  error: string | null
  latencyMs: number | null
}
export interface VersusIdentity { guestId: string; displayName: string }

function socketUrl(serverUrl: string, roomCode: string): string {
  const url = new URL(`/api/rooms/${roomCode}/websocket`, serverUrl); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; return url.toString()
}

export class VersusClient {
  private socket: WebSocket | null = null
  private listeners = new Set<(view: VersusClientView) => void>()
  private stateListeners = new Set<(state: VersusGameState) => void>()
  private view: VersusClientView
  private reconnectToken: string | undefined
  private seq = 0; private reconnects = 0; private reconnectTimer = 0; private pingTimer = 0; private healthTimer = 0
  private lastMessageAt = 0; private closed = false
  private readonly sessionId = crypto.randomUUID()

  constructor(private readonly serverUrl: string, private readonly roomCode: string, private readonly identity: VersusIdentity) {
    this.view = { status: 'idle', roomCode, lobby: null, gameState: null, participant: null, error: null, latencyMs: null }
    try { this.reconnectToken = localStorage.getItem(`pongapp.room.${roomCode}.token`) ?? undefined } catch { /* unavailable */ }
  }
  static async createRoom(serverUrl: string, request: CreateRoomRequest): Promise<string> {
    const response = await fetch(new URL('/api/rooms', serverUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
    if (!response.ok) throw new Error('Could not start the race.')
    const body = await response.json() as { roomCode?: string }
    if (!body.roomCode) throw new Error('The race link was invalid.')
    return body.roomCode
  }
  connect(): void {
    this.closed = false; this.patch({ status: 'connecting', error: null })
    const socket = new WebSocket(socketUrl(this.serverUrl, this.roomCode)); this.socket = socket
    socket.addEventListener('open', () => {
      if (socket !== this.socket) return
      this.lastMessageAt = performance.now()
      this.send({ type: 'hello', version: PROTOCOL_VERSION, guestId: this.identity.guestId, displayName: this.identity.displayName, role: 'player', reconnectToken: this.reconnectToken, clientSessionId: this.sessionId, reconnectAttempt: this.reconnects })
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping', sentAt: Date.now() }), 2000)
      this.healthTimer = window.setInterval(() => this.checkHealth(), 500)
      this.send({ type: 'ping', sentAt: Date.now() })
    })
    socket.addEventListener('message', (event) => { if (socket === this.socket) { this.lastMessageAt = performance.now(); this.onMessage(String(event.data)) } })
    socket.addEventListener('close', (event) => this.onClose(socket, event.code))
  }
  subscribe(listener: (view: VersusClientView) => void): () => void { this.listeners.add(listener); listener(this.view); return () => this.listeners.delete(listener) }
  subscribeState(listener: (state: VersusGameState) => void): () => void { this.stateListeners.add(listener); if (this.view.gameState) listener(this.view.gameState); return () => this.stateListeners.delete(listener) }
  tap(): void {
    if (this.socket?.readyState !== WebSocket.OPEN || this.view.participant?.slot === null) return
    this.seq += 1; this.send({ type: 'input', seq: this.seq, paddle: 1, controlActive: true })
    window.setTimeout(() => { this.seq += 1; this.send({ type: 'input', seq: this.seq, paddle: 0, controlActive: true }) }, 45)
  }
  rematch(): void { this.send({ type: 'rematch' }) }
  close(): void { this.closed = true; window.clearTimeout(this.reconnectTimer); window.clearInterval(this.pingTimer); window.clearInterval(this.healthTimer); this.socket?.close(1000, 'left race'); this.socket = null }
  private send(message: ClientMessage): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)) }
  private onMessage(raw: string): void {
    let message: ServerMessage; try { message = JSON.parse(raw) as ServerMessage } catch { return }
    if (message.type === 'welcome') {
      this.reconnects = 0; this.reconnectToken = message.reconnectToken
      try { localStorage.setItem(`pongapp.room.${this.roomCode}.token`, message.reconnectToken) } catch { /* unavailable */ }
      this.patch({ participant: message.participant, lobby: message.lobby, status: message.lobby.phase === 'lobby' ? 'lobby' : 'playing' })
    } else if (message.type === 'lobby') {
      this.patch({ lobby: message.lobby, participant: message.lobby.participants.find((person) => person.id === this.view.participant?.id) ?? this.view.participant, status: message.lobby.phase === 'lobby' ? 'lobby' : 'playing' })
    } else if ((message.type === 'snapshot' || message.type === 'result') && message.state.rulesetVersion === 6) {
      this.view = { ...this.view, gameState: message.state, status: 'playing' }
      for (const listener of this.listeners) listener(this.view); for (const listener of this.stateListeners) listener(message.state)
    } else if (message.type === 'pong') this.patch({ latencyMs: Math.max(0, Date.now() - message.sentAt) })
    else if (message.type === 'error') this.patch({ status: message.recoverable ? this.view.status : 'error', error: message.message })
  }
  private checkHealth(): void { if (document.visibilityState !== 'visible' || this.socket?.readyState !== WebSocket.OPEN || performance.now() - this.lastMessageAt < 2200) return; const stale = this.socket; this.socket = null; stale.close(4002, 'stale'); this.reconnect() }
  private onClose(socket: WebSocket, code: number): void { if (socket !== this.socket || this.closed) return; this.socket = null; if (code === 4001) { this.patch({ status: 'closed', error: 'This racer moved to another tab.' }); return }; this.reconnect() }
  private reconnect(): void { window.clearInterval(this.pingTimer); window.clearInterval(this.healthTimer); if (this.reconnects >= 5) { this.patch({ status: 'error', error: 'The race connection was lost.' }); return }; this.reconnects += 1; this.patch({ status: 'connecting' }); this.reconnectTimer = window.setTimeout(() => this.connect(), Math.min(2200, 250 * 2 ** (this.reconnects - 1))) }
  private patch(next: Partial<VersusClientView>): void { this.view = { ...this.view, ...next }; for (const listener of this.listeners) listener(this.view) }
}
