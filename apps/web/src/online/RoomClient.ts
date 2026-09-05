import { COOP_TICK_RATE, type CoopGameState } from '@pongapp/game-core'
import { PROTOCOL_VERSION, type ClientMessage, type CreateRoomRequest, type RoomLobby, type RoomParticipant, type ServerMessage } from '@pongapp/protocol'
import { PeerSession, type PeerStatus } from './PeerSession'

export type RoomClientStatus = 'idle' | 'connecting' | 'lobby' | 'playing' | 'closed' | 'error'
export type ConnectionQuality = 'good' | 'fair' | 'poor'
export interface RoomClientView {
  peer?: PeerStatus
  status: RoomClientStatus; roomCode: string; lobby: RoomLobby | null; gameState: CoopGameState | null
  participant: RoomParticipant | null; error: string | null; latencyMs: number | null; latencyP95Ms: number | null
  jitterMs: number | null; snapshotGapP95Ms: number | null; connectionQuality: ConnectionQuality
}
export interface RoomIdentity { guestId: string; displayName: string; role?: 'player' | 'spectator' }
export interface ClientPerformanceSample {
  frameGapP95Ms: number; maxFrameGapMs: number; renderP95Ms: number; longFrameCount: number; freezeCount: number
  rendererResolution: number; renderQuality: 'full' | 'adaptive'
}
interface SnapshotSample { state: CoopGameState; receivedAt: number }

function websocketUrl(serverUrl: string, roomCode: string): string {
  const url = new URL(`/api/rooms/${roomCode}/websocket`, serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
function percentile(sorted: number[], fraction: number): number { return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0 }
export function shouldReconnectAfterClose(code: number): boolean { return code !== 4001 }
export function hasRoomInputToFlush(paddleChanged: boolean): boolean { return paddleChanged }
export function remoteInterpolationDelayTicks(quality: ConnectionQuality, gap: number | null): number {
  if (quality === 'poor' || (gap ?? 0) > 90) return 4
  if (quality === 'fair' || (gap ?? 0) > 48) return 2.5
  return 1.5
}
function cloneState(state: CoopGameState): CoopGameState {
  return { ...state, boat: { ...state.boat }, paddles: { ...state.paddles }, players: Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, { ...player }])), objects: state.objects.map((object) => ({ ...object })), events: state.events.map((event) => ({ ...event })) }
}

export class RoomClient {
  private peer: PeerSession | null = null
  private queuedSignals: Array<{ fromId: string; data: string }> = []
  private socket: WebSocket | null = null
  private listeners = new Set<(view: RoomClientView) => void>()
  private stateListeners = new Set<(state: CoopGameState) => void>()
  private view: RoomClientView
  private reconnectToken: string | undefined
  private inputSeq = 0
  private paddle = 0
  private paddleChanged = false
  private inputTimer = 0; private pingTimer = 0; private healthTimer = 0; private reconnectTimer = 0
  private lastMessageAt = 0; private closedByUser = false; private reconnectAttempt = 0; private connectionSequence = 0
  private readonly clientSessionId = crypto.randomUUID()
  private controlActivated = false
  private snapshots: SnapshotSample[] = []
  private latencySamples: number[] = []; private snapshotGapSamples: number[] = []; private networkSampleCount = 0
  private lastNetworkTelemetryAt = 0; private lastReportedConnectionQuality: ConnectionQuality | null = null

  constructor(private readonly serverUrl: string, private readonly roomCode: string, private readonly identity: RoomIdentity) {
    this.view = { status: 'idle', roomCode, lobby: null, gameState: null, participant: null, error: null, latencyMs: null, latencyP95Ms: null, jitterMs: null, snapshotGapP95Ms: null, connectionQuality: 'good' }
    try { this.reconnectToken = localStorage.getItem(`pongapp.room.${roomCode}.token`) ?? undefined } catch { /* storage unavailable */ }
  }
  static async createRoom(serverUrl: string, request: CreateRoomRequest): Promise<string> {
    const response = await fetch(new URL('/api/rooms', serverUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
    if (!response.ok) throw new Error(response.status === 429 ? 'Too many boats launched. Try again in a minute.' : 'Could not launch the boat.')
    const payload = await response.json() as { roomCode?: string }
    if (!payload.roomCode) throw new Error('The room server returned an invalid response.')
    return payload.roomCode
  }
  connect(): void {
    this.closedByUser = false; this.connectionSequence += 1; this.patch({ status: 'connecting', error: null })
    const socket = new WebSocket(websocketUrl(this.serverUrl, this.roomCode)); this.socket = socket
    socket.addEventListener('open', () => {
      if (socket !== this.socket) return
      this.lastMessageAt = performance.now()
      this.send({ type: 'hello', version: PROTOCOL_VERSION, guestId: this.identity.guestId, displayName: this.identity.displayName, role: this.identity.role ?? 'player', reconnectToken: this.reconnectToken, clientSessionId: this.clientSessionId, reconnectAttempt: Math.max(0, this.connectionSequence - 1) })
      this.inputTimer = window.setInterval(() => this.flushInput(), 1000 / 30)
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping', sentAt: Date.now() }), 2000)
      this.healthTimer = window.setInterval(() => this.checkConnectionHealth(), 500)
      this.send({ type: 'ping', sentAt: Date.now() })
    })
    socket.addEventListener('message', (event) => { if (socket === this.socket) { this.lastMessageAt = performance.now(); this.onMessage(String(event.data)) } })
    socket.addEventListener('close', (event) => this.onClose(socket, event))
    socket.addEventListener('error', () => { if (socket === this.socket) this.patch({ status: 'connecting', error: null }) })
  }
  subscribe(listener: (view: RoomClientView) => void): () => void { this.listeners.add(listener); listener(this.view); return () => this.listeners.delete(listener) }
  subscribeState(listener: (state: CoopGameState) => void): () => void { this.stateListeners.add(listener); if (this.view.gameState) listener(this.view.gameState); return () => this.stateListeners.delete(listener) }
  getRenderState(): CoopGameState {
    const local = this.peer?.getState()
    if (local?.rulesetVersion === 5) return local
    const latest = this.snapshots.at(-1)
    if (!latest) { if (!this.view.gameState) throw new Error('No river snapshot is available.'); return cloneState(this.view.gameState) }
    const clone = cloneState(latest.state); const previous = this.snapshots.at(-2)
    if (!previous) return clone
    const renderTick = latest.state.tick + (performance.now() - latest.receivedAt) / 1000 * COOP_TICK_RATE - remoteInterpolationDelayTicks(this.view.connectionQuality, this.view.snapshotGapP95Ms)
    const amount = Math.max(0, Math.min(1, (renderTick - previous.state.tick) / Math.max(1, latest.state.tick - previous.state.tick)))
    clone.boat.x = previous.state.boat.x + (latest.state.boat.x - previous.state.boat.x) * amount
    clone.boat.heading = previous.state.boat.heading + (latest.state.boat.heading - previous.state.boat.heading) * amount
    return clone
  }
  setPaddle(power: number): void { const next = Math.max(0, Math.min(1, power)); if (next === this.paddle) return; this.paddle = next; if (this.peer) { this.peer.setPaddle(next); return }; this.paddleChanged = true; this.controlActivated = true; this.flushInput() }
  flare(): void { this.peer?.flare() }
  reportTelemetry(event: 'control_surface_visible' | 'room_full_visible'): void { this.send({ type: 'clientTelemetry', event }) }
  reportPerformance(sample: ClientPerformanceSample): void { this.send({ type: 'clientTelemetry', event: 'performance_sample', ...sample }) }
  sendEmote(emote: 'gg' | 'wow' | 'nice' | 'oops'): void { this.send({ type: 'emote', emote }) }
  rematch(): void { if (this.peer) this.peer.rematch(); else this.send({ type: 'rematch' }) }
  close(): void { this.peer?.close(); this.peer = null; this.closedByUser = true; window.clearInterval(this.inputTimer); window.clearInterval(this.pingTimer); window.clearInterval(this.healthTimer); window.clearTimeout(this.reconnectTimer); this.socket?.close(1000, 'player left'); this.socket = null; this.snapshots = []; this.patch({ status: 'closed' }) }
  private flushInput(): void {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.view.participant || this.view.participant.slot === null || this.socket.bufferedAmount > 4_096 || !hasRoomInputToFlush(this.paddleChanged)) return
    this.inputSeq += 1; this.paddleChanged = false
    this.send({ type: 'input', seq: this.inputSeq, paddle: this.paddle, controlActive: this.controlActivated })
  }
  private send(message: ClientMessage): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)) }
  private onMessage(raw: string): void {
    let message: ServerMessage; try { message = JSON.parse(raw) as ServerMessage } catch { return }
    if (message.type === 'peerSignal') {
      if (this.peer) this.peer.receiveRelay(message.data)
      else if (this.queuedSignals.length < 64) this.queuedSignals.push(message)
      return
    }
    if (message.type === 'welcome') {
      this.reconnectAttempt = 0; this.reconnectToken = message.reconnectToken
      try { localStorage.setItem(`pongapp.room.${this.roomCode}.token`, message.reconnectToken) } catch { /* storage unavailable */ }
      this.patch({ participant: message.participant, lobby: message.lobby, status: message.lobby.phase === 'lobby' ? 'lobby' : 'playing' })
    } else if (message.type === 'lobby') {
      const participant = message.lobby.participants.find((candidate) => candidate.id === this.view.participant?.id) ?? this.view.participant
      this.patch({ participant, lobby: message.lobby, status: message.lobby.phase === 'lobby' ? 'lobby' : 'playing' })
    } else if (message.type === 'snapshot' || message.type === 'result') {
      if (message.state.rulesetVersion !== 5) return
      if (this.peer) return
      const me = this.view.participant
      const other = this.view.lobby?.participants.find((p) => p.slot !== null && p.id !== me?.id)
      if (me && me.slot !== null && other) {
        this.peer = new PeerSession(me.id, other.id, me.slot === 0, message.state,
          (data) => this.send({ type: 'peerSignal', targetId: other.id, data }),
          (state) => {
            if (state.rulesetVersion !== 5) return
            this.view = { ...this.view, gameState: state, status: 'playing' }
            // HUD updates are throttled; the canvas reads local state every frame.
            if (state.tick % 6 === 0 || state.events.length || state.phase === 'finished') for (const listener of this.listeners) listener(this.view)
            for (const listener of this.stateListeners) listener(state)
          },
          (peer) => this.patch({ peer }))
        this.peer.setPaddle(this.paddle)
        for (const signal of this.queuedSignals.splice(0)) if (signal.fromId === other.id) this.peer.receiveRelay(signal.data)
      }
      const now = performance.now(); const previousReceipt = this.snapshots.at(-1)?.receivedAt
      if (previousReceipt !== undefined) { this.snapshotGapSamples.push(now - previousReceipt); if (this.snapshotGapSamples.length > 60) this.snapshotGapSamples.shift() }
      this.snapshots.push({ state: message.state, receivedAt: now }); if (this.snapshots.length > 4) this.snapshots.shift()
      this.view = { ...this.view, gameState: message.state, status: 'playing' }
      for (const listener of this.listeners) listener(this.view); for (const listener of this.stateListeners) listener(message.state)
    } else if (message.type === 'pong') this.recordLatency(Math.max(0, Date.now() - message.sentAt))
    else if (message.type === 'error') this.patch({ status: message.recoverable ? this.view.status : 'error', error: message.message })
  }
  private recordLatency(sample: number): void {
    this.networkSampleCount += 1; this.latencySamples.push(sample); if (this.latencySamples.length > 30) this.latencySamples.shift()
    const sorted = [...this.latencySamples].sort((a, b) => a - b); const median = Math.round(percentile(sorted, 0.5)); const p95 = Math.round(percentile(sorted, 0.95))
    const jitter = this.latencySamples.length < 2 ? 0 : Math.round(this.latencySamples.slice(1).reduce((sum, value, index) => sum + Math.abs(value - this.latencySamples[index]!), 0) / (this.latencySamples.length - 1))
    const gaps = [...this.snapshotGapSamples].sort((a, b) => a - b); const gapP95 = gaps.length ? Math.round(percentile(gaps, 0.95)) : null
    const quality: ConnectionQuality = median > 120 || jitter > 45 || (gapP95 ?? 0) > 100 ? 'poor' : median > 70 || jitter > 25 || (gapP95 ?? 0) > 60 ? 'fair' : 'good'
    this.patch({ latencyMs: median, latencyP95Ms: p95, jitterMs: jitter, snapshotGapP95Ms: gapP95, connectionQuality: quality })
    const now = Date.now()
    if (this.networkSampleCount >= 5 && (quality !== this.lastReportedConnectionQuality || now - this.lastNetworkTelemetryAt >= 30_000)) { this.lastReportedConnectionQuality = quality; this.lastNetworkTelemetryAt = now; this.send({ type: 'clientTelemetry', event: 'network_sample', latencyMs: median, latencyP95Ms: p95, jitterMs: jitter, snapshotGapP95Ms: gapP95, connectionQuality: quality }) }
  }
  private checkConnectionHealth(): void { if (document.visibilityState !== 'visible' || this.socket?.readyState !== WebSocket.OPEN || this.view.status !== 'playing' || performance.now() - this.lastMessageAt < 2_000) return; const stale = this.socket; this.socket = null; stale.close(4002, 'stale stream'); this.scheduleReconnect() }
  private onClose(socket: WebSocket, event: CloseEvent): void {
    if (socket !== this.socket) return
    window.clearInterval(this.inputTimer); window.clearInterval(this.pingTimer); window.clearInterval(this.healthTimer)
    if (this.closedByUser) return
    if (!shouldReconnectAfterClose(event.code)) { this.peer?.close(); this.socket = null; this.patch({ status: 'closed', error: 'This oar moved to another tab or device. Continue playing there.' }); return }
    this.socket = null; this.scheduleReconnect()
  }
  private scheduleReconnect(): void { if (this.peer && this.view.peer && !this.view.peer.paused && this.view.peer.path !== 'relay') this.reconnectAttempt = 0; window.clearInterval(this.inputTimer); window.clearInterval(this.pingTimer); window.clearInterval(this.healthTimer); window.clearTimeout(this.reconnectTimer); if (this.reconnectAttempt >= 4) { this.patch({ status: 'error', error: 'Connection lost. Return home and open the invite again.' }); return } this.reconnectAttempt += 1; this.patch({ status: 'connecting', error: null }); this.reconnectTimer = window.setTimeout(() => this.connect(), Math.min(2_000, 250 * 2 ** (this.reconnectAttempt - 1))) }
  private patch(next: Partial<RoomClientView>): void { this.view = { ...this.view, ...next }; for (const listener of this.listeners) listener(this.view) }
}
