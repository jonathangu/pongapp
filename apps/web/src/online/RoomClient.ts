import { TICK_RATE, type BallState, type GameState, type PalType } from '@pongapp/game-core'
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type CreateRoomRequest,
  type RoomLobby,
  type RoomParticipant,
  type ServerMessage,
} from '@pongapp/protocol'
import { advanceLocalPaddlePreview, ballPredictionEnabled, interpolatePosition, worldPredictionEnabled } from '../game/prediction'

export type RoomClientStatus = 'idle' | 'connecting' | 'lobby' | 'playing' | 'closed' | 'error'
export type ConnectionQuality = 'good' | 'fair' | 'poor'

export interface RoomClientView {
  status: RoomClientStatus
  roomCode: string
  lobby: RoomLobby | null
  gameState: GameState | null
  participant: RoomParticipant | null
  error: string | null
  latencyMs: number | null
  latencyP95Ms: number | null
  jitterMs: number | null
  snapshotGapP95Ms: number | null
  connectionQuality: ConnectionQuality
}

export interface RoomIdentity {
  guestId: string
  displayName: string
  role?: 'player' | 'spectator'
}

interface SnapshotSample {
  state: GameState
  receivedAt: number
}

interface RenderBall extends BallState {
  renderedAt: number
}

function websocketUrl(serverUrl: string, roomCode: string): string {
  const url = new URL(`/api/rooms/${roomCode}/websocket`, serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0
}

export class RoomClient {
  private socket: WebSocket | null = null
  private listeners = new Set<(view: RoomClientView) => void>()
  private stateListeners = new Set<(state: GameState) => void>()
  private view: RoomClientView
  private reconnectToken: string | undefined
  private inputSeq = 0
  private acknowledgedInputSeq = 0
  private latestTargetSeq = 0
  private targetChangedSinceFlush = false
  private latestTarget = 0.5
  private pendingSummon: PalType | null = null
  private inputTimer = 0
  private pingTimer = 0
  private closedByUser = false
  private reconnectAttempt = 0
  private snapshots: SnapshotSample[] = []
  private renderBall: RenderBall | null = null
  private localRenderPosition: number | null = null
  private localRenderAt = 0
  private localRenderPlayerId: string | null = null
  private latencySamples: number[] = []
  private snapshotGapSamples: number[] = []

  constructor(
    private readonly serverUrl: string,
    private readonly roomCode: string,
    private readonly identity: RoomIdentity,
  ) {
    this.view = {
      status: 'idle', roomCode, lobby: null, gameState: null, participant: null, error: null,
      latencyMs: null, latencyP95Ms: null, jitterMs: null, snapshotGapP95Ms: null, connectionQuality: 'good',
    }
    try { this.reconnectToken = localStorage.getItem(`pongapp.room.${roomCode}.token`) ?? undefined } catch { /* no storage */ }
  }

  static async createRoom(serverUrl: string, request: CreateRoomRequest): Promise<string> {
    const response = await fetch(new URL('/api/rooms', serverUrl), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
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
        type: 'hello', version: PROTOCOL_VERSION, guestId: this.identity.guestId,
        displayName: this.identity.displayName, role: this.identity.role ?? 'player', reconnectToken: this.reconnectToken,
      })
      this.inputTimer = window.setInterval(() => this.flushInput(), 1000 / 60)
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping', sentAt: Date.now() }), 2000)
      this.send({ type: 'ping', sentAt: Date.now() })
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

  getRenderState(): GameState {
    const source = this.view.gameState
    if (!source) throw new Error('No game snapshot is available.')
    const clone = structuredClone(source)
    const now = performance.now()
    this.renderRemotePaddle(clone, now)
    this.renderLocalPaddle(clone, now)
    this.renderPredictedBall(clone, now)
    return clone
  }

  setTarget(target: number): void {
    const next = Math.max(0, Math.min(1, target))
    if (Math.abs(next - this.latestTarget) > 0.0001) this.targetChangedSinceFlush = true
    this.latestTarget = next
  }

  summon(type: PalType): void {
    this.pendingSummon = type
    this.flushInput()
  }

  sendEmote(emote: 'gg' | 'wow' | 'nice' | 'oops'): void { this.send({ type: 'emote', emote }) }
  rematch(): void { this.send({ type: 'rematch' }) }

  close(): void {
    this.closedByUser = true
    window.clearInterval(this.inputTimer)
    window.clearInterval(this.pingTimer)
    this.socket?.close(1000, 'player left')
    this.socket = null
    this.resetRenderState()
    this.patch({ status: 'closed' })
  }

  private flushInput(): void {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.view.participant || this.view.participant.slot === null) return
    this.inputSeq += 1
    if (this.targetChangedSinceFlush) {
      this.latestTargetSeq = this.inputSeq
      this.targetChangedSinceFlush = false
    }
    this.send({ type: 'input', seq: this.inputSeq, target: this.latestTarget, summon: this.pendingSummon })
    this.pendingSummon = null
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
      if (message.type === 'snapshot') {
        this.inputSeq = Math.max(this.inputSeq, message.acknowledgedSeq)
        this.acknowledgedInputSeq = message.acknowledgedSeq
      }
      const now = performance.now()
      const previousReceipt = this.snapshots.at(-1)?.receivedAt
      if (previousReceipt !== undefined) {
        this.snapshotGapSamples.push(now - previousReceipt)
        if (this.snapshotGapSamples.length > 60) this.snapshotGapSamples.shift()
      }
      this.snapshots.push({ state: structuredClone(gameState), receivedAt: now })
      if (this.snapshots.length > 5) this.snapshots.shift()
      const localId = this.view.participant?.id
      const local = localId ? gameState.players[localId] : undefined
      const previousTick = this.view.gameState?.tick
      if (local && (this.localRenderPlayerId !== local.id || previousTick === undefined || gameState.tick < previousTick)) {
        this.resetLocalPreview(local.id, local.position)
      }
      this.patch({ gameState, status: 'playing' })
      for (const listener of this.stateListeners) listener(gameState)
    } else if (message.type === 'pong') {
      this.recordLatency(Math.max(0, Date.now() - message.sentAt))
    } else if (message.type === 'error') {
      this.patch({ status: message.recoverable ? this.view.status : 'error', error: message.message })
    }
  }

  private renderRemotePaddle(clone: GameState, now: number): void {
    const localId = this.view.participant?.id
    const latest = this.snapshots.at(-1)
    if (!latest || this.snapshots.length < 2) return
    const renderTick = latest.state.tick + (now - latest.receivedAt) / 1000 * TICK_RATE - 3
    let before = this.snapshots[0]!
    let after = latest
    for (let index = 0; index < this.snapshots.length - 1; index += 1) {
      const one = this.snapshots[index]!
      const two = this.snapshots[index + 1]!
      if (one.state.tick <= renderTick && two.state.tick >= renderTick) { before = one; after = two; break }
    }
    const span = Math.max(1, after.state.tick - before.state.tick)
    const amount = (renderTick - before.state.tick) / span
    for (const player of Object.values(clone.players)) {
      if (player.id === localId) continue
      const from = before.state.players[player.id]
      const to = after.state.players[player.id]
      if (from && to) player.position = interpolatePosition(from.position, to.position, amount)
      else if (renderTick > latest.state.tick) player.position = Math.max(0.08, Math.min(0.92, player.position + player.velocity * Math.min(0.05, (renderTick - latest.state.tick) / TICK_RATE)))
    }
    const blend = Math.min(1, Math.max(0, amount))
    for (const pal of clone.pals) {
      const from = before.state.pals.find((candidate) => candidate.id === pal.id)
      const to = after.state.pals.find((candidate) => candidate.id === pal.id)
      if (from && to) pal.position = from.position + (to.position - from.position) * blend
    }
  }

  private renderLocalPaddle(clone: GameState, now: number): void {
    const local = this.view.participant?.id ? clone.players[this.view.participant.id] : undefined
    if (!local) return
    if (this.localRenderPlayerId !== local.id || this.localRenderPosition === null) this.resetLocalPreview(local.id, local.position)
    const delta = Math.min(0.05, Math.max(0, (now - this.localRenderAt) / 1000))
    this.localRenderAt = now
    if (worldPredictionEnabled(clone)) {
      const serverHasLatestTarget = !this.targetChangedSinceFlush && this.acknowledgedInputSeq >= this.latestTargetSeq
      const authority = serverHasLatestTarget ? local.position : this.localRenderPosition!
      const previous = this.localRenderPosition!
      this.localRenderPosition = advanceLocalPaddlePreview(previous, authority, this.latestTarget, delta)
      local.position = this.localRenderPosition
      if (delta > 0) local.velocity = (this.localRenderPosition - previous) / delta
    } else {
      local.position = this.localRenderPosition!
      local.velocity = 0
    }
  }

  private renderPredictedBall(clone: GameState, now: number): void {
    const authoritative = clone.balls[0]
    if (!authoritative) return
    const hardEvent = clone.events.some((event) => event.type === 'score' || event.type === 'matchStart')
    if (!this.renderBall || this.renderBall.id !== authoritative.id || hardEvent) {
      this.renderBall = { ...authoritative, renderedAt: now }
    }
    const render = this.renderBall
    const delta = Math.min(0.05, Math.max(0, (now - render.renderedAt) / 1000))
    render.renderedAt = now
    if (ballPredictionEnabled(clone)) {
      render.x += render.vx * delta
      render.y += render.vy * delta / clone.config.courtLengthScale
      if (render.x - render.radius < 0 && render.vx < 0) { render.x = render.radius; render.vx = Math.abs(render.vx) }
      if (render.x + render.radius > 1 && render.vx > 0) { render.x = 1 - render.radius; render.vx = -Math.abs(render.vx) }
      const error = Math.hypot(authoritative.x - render.x, authoritative.y - render.y)
      if (error > 0.12) { render.x = authoritative.x; render.y = authoritative.y }
      else {
        const correction = 1 - Math.exp(-delta / 0.08)
        render.x += (authoritative.x - render.x) * correction
        render.y += (authoritative.y - render.y) * correction
      }
      render.vx = authoritative.vx
      render.vy = authoritative.vy
      render.spin = authoritative.spin
    } else {
      render.x = authoritative.x
      render.y = authoritative.y
      render.vx = authoritative.vx
      render.vy = authoritative.vy
    }
    clone.balls[0] = { ...render }
  }

  private recordLatency(sample: number): void {
    this.latencySamples.push(sample)
    if (this.latencySamples.length > 30) this.latencySamples.shift()
    const sorted = [...this.latencySamples].sort((a, b) => a - b)
    const median = Math.round(percentile(sorted, 0.5))
    const p95 = Math.round(percentile(sorted, 0.95))
    const jitter = this.latencySamples.length < 2 ? 0 : Math.round(this.latencySamples.slice(1).reduce((sum, value, index) => sum + Math.abs(value - this.latencySamples[index]!), 0) / (this.latencySamples.length - 1))
    const gaps = [...this.snapshotGapSamples].sort((a, b) => a - b)
    const gapP95 = gaps.length ? Math.round(percentile(gaps, 0.95)) : null
    const quality: ConnectionQuality = median > 120 || jitter > 45 || (gapP95 ?? 0) > 100
      ? 'poor'
      : median > 70 || jitter > 25 || (gapP95 ?? 0) > 60 ? 'fair' : 'good'
    this.patch({ latencyMs: median, latencyP95Ms: p95, jitterMs: jitter, snapshotGapP95Ms: gapP95, connectionQuality: quality })
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

  private resetLocalPreview(playerId: string | null = null, position: number | null = null): void {
    this.localRenderPlayerId = playerId
    this.localRenderPosition = position
    this.localRenderAt = performance.now()
  }

  private resetRenderState(): void {
    this.snapshots = []
    this.snapshotGapSamples = []
    this.renderBall = null
    this.resetLocalPreview()
  }

  private patch(next: Partial<RoomClientView>): void {
    this.view = { ...this.view, ...next }
    for (const listener of this.listeners) listener(this.view)
  }
}
