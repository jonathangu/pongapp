import type { GameState } from '@pongapp/game-core'
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type CreateRoomRequest,
  type RoomLobby,
  type RoomParticipant,
  type ServerMessage,
} from '@pongapp/protocol'
import { ballPredictionEnabled, predictedHumanTarget, worldPredictionEnabled } from '../game/prediction'

export type RoomClientStatus = 'idle' | 'connecting' | 'lobby' | 'playing' | 'closed' | 'error'

export interface RoomClientView {
  status: RoomClientStatus
  roomCode: string
  lobby: RoomLobby | null
  gameState: GameState | null
  participant: RoomParticipant | null
  error: string | null
  latencyMs: number | null
}

export interface RoomIdentity {
  guestId: string
  displayName: string
  ability: 'dash' | 'bend' | 'guard' | 'pulse'
  role?: 'player' | 'spectator'
}

function websocketUrl(serverUrl: string, roomCode: string): string {
  const url = new URL(`/api/rooms/${roomCode}/websocket`, serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export class RoomClient {
  private socket: WebSocket | null = null
  private listeners = new Set<(view: RoomClientView) => void>()
  private stateListeners = new Set<(state: GameState) => void>()
  private view: RoomClientView
  private reconnectToken: string | undefined
  private inputSeq = 0
  private latestTarget = 0.5
  private abilityPressed = false
  private inputTimer = 0
  private pingTimer = 0
  private closedByUser = false
  private reconnectAttempt = 0
  private latestSnapshotAt = 0

  constructor(
    private readonly serverUrl: string,
    private readonly roomCode: string,
    private readonly identity: RoomIdentity,
  ) {
    this.view = { status: 'idle', roomCode, lobby: null, gameState: null, participant: null, error: null, latencyMs: null }
    try { this.reconnectToken = localStorage.getItem(`pongapp.room.${roomCode}.token`) ?? undefined } catch { /* no storage */ }
  }

  static async createRoom(serverUrl: string, request: CreateRoomRequest): Promise<string> {
    const response = await fetch(new URL('/api/rooms', serverUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!response.ok) throw new Error(response.status === 429 ? 'Too many rooms created. Try again in a minute.' : 'Could not create the room.')
    const payload = await response.json() as { roomCode?: string }
    if (!payload.roomCode) throw new Error('The room server returned an invalid response.')
    return payload.roomCode
  }

  connect(): void {
    this.closedByUser = false
    this.patch({ status: 'connecting', error: null })
    const socket = new WebSocket(websocketUrl(this.serverUrl, this.roomCode))
    this.socket = socket
    socket.addEventListener('open', () => {
      this.reconnectAttempt = 0
      this.send({
        type: 'hello',
        version: PROTOCOL_VERSION,
        guestId: this.identity.guestId,
        displayName: this.identity.displayName,
        ability: this.identity.ability,
        role: this.identity.role ?? 'player',
        reconnectToken: this.reconnectToken,
      })
      this.inputTimer = window.setInterval(() => this.flushInput(), 1000 / 30)
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping', sentAt: Date.now() }), 2000)
    })
    socket.addEventListener('message', (event) => this.onMessage(String(event.data)))
    socket.addEventListener('close', () => this.onClose())
    socket.addEventListener('error', () => this.patch({ status: 'error', error: 'The room connection failed.' }))
  }

  subscribe(listener: (view: RoomClientView) => void): () => void {
    this.listeners.add(listener)
    listener(this.view)
    return () => this.listeners.delete(listener)
  }

  subscribeState(listener: (state: GameState) => void): () => void {
    this.stateListeners.add(listener)
    if (this.view.gameState) listener(this.view.gameState)
    return () => this.stateListeners.delete(listener)
  }

  getView(): RoomClientView { return this.view }

  getRenderState(): GameState {
    const source = this.view.gameState
    if (!source) throw new Error('No game snapshot is available.')
    const clone = structuredClone(source)
    const elapsed = Math.min(0.075, Math.max(0, (performance.now() - this.latestSnapshotAt) / 1000))
    if (ballPredictionEnabled(clone)) {
      for (const ball of clone.balls) {
        ball.x += ball.vx * elapsed
        ball.y += ball.vy * elapsed
      }
    }
    const local = this.view.participant?.id ? clone.players[this.view.participant.id] : undefined
    if (local && worldPredictionEnabled(clone)) {
      const target = predictedHumanTarget(clone, this.latestTarget)
      local.position += (target - local.position) * Math.min(1, elapsed * 18)
    }
    return clone
  }

  setReady(ready: boolean): void { this.send({ type: 'ready', ready }) }
  setTarget(target: number): void { this.latestTarget = Math.max(0, Math.min(1, target)) }
  useAbility(): void { this.abilityPressed = true }
  sendEmote(emote: 'gg' | 'wow' | 'nice' | 'oops'): void { this.send({ type: 'emote', emote }) }
  rematch(): void { this.send({ type: 'rematch' }) }

  close(): void {
    this.closedByUser = true
    window.clearInterval(this.inputTimer)
    window.clearInterval(this.pingTimer)
    this.socket?.close(1000, 'player left')
    this.socket = null
    this.patch({ status: 'closed' })
  }

  private flushInput(): void {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.view.participant || this.view.participant.slot === null) return
    this.inputSeq += 1
    this.send({ type: 'input', seq: this.inputSeq, target: this.latestTarget, abilityPressed: this.abilityPressed })
    this.abilityPressed = false
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
  }

  private onMessage(raw: string): void {
    let message: ServerMessage
    try { message = JSON.parse(raw) as ServerMessage } catch { return }
    if (message.type === 'welcome') {
      this.reconnectToken = message.reconnectToken
      try { localStorage.setItem(`pongapp.room.${this.roomCode}.token`, message.reconnectToken) } catch { /* no storage */ }
      this.patch({ participant: message.participant, lobby: message.lobby, status: message.lobby.phase === 'lobby' ? 'lobby' : 'playing' })
    } else if (message.type === 'lobby') {
      const participant = message.lobby.participants.find((candidate) => candidate.id === this.view.participant?.id) ?? this.view.participant
      this.patch({ participant, lobby: message.lobby, status: message.lobby.phase === 'lobby' ? 'lobby' : 'playing' })
    } else if (message.type === 'snapshot' || message.type === 'result') {
      const gameState = message.state
      this.latestSnapshotAt = performance.now()
      this.patch({ gameState, status: 'playing' })
      for (const listener of this.stateListeners) listener(gameState)
    } else if (message.type === 'pong') {
      this.patch({ latencyMs: Math.max(0, Date.now() - message.sentAt) })
    } else if (message.type === 'error') {
      this.patch({ status: message.recoverable ? this.view.status : 'error', error: message.message })
    }
  }

  private onClose(): void {
    window.clearInterval(this.inputTimer)
    window.clearInterval(this.pingTimer)
    if (this.closedByUser) return
    if (this.reconnectAttempt >= 4) {
      this.patch({ status: 'error', error: 'Connection lost. Return home and rejoin the room.' })
      return
    }
    this.reconnectAttempt += 1
    window.setTimeout(() => this.connect(), Math.min(4000, 500 * 2 ** this.reconnectAttempt))
  }

  private patch(next: Partial<RoomClientView>): void {
    this.view = { ...this.view, ...next }
    for (const listener of this.listeners) listener(this.view)
  }
}
