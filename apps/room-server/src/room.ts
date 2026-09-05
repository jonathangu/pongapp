import { advanceCoopGame, advanceVersusGame, createCoopGame, createVersusGame, restartCoopGame, restartVersusGame, type CoopGameState, type CoopInputs, type VersusGameState } from '@pongapp/game-core'
import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  parseWireMessage,
  type ClientMessage,
  type RoomLobby,
  type RoomParticipant,
  type ServerMessage,
  type StoredRoomConfig,
} from '@pongapp/protocol'
import type WebSocket from 'ws'
import type { StoredParticipant, StoredRoomRecord } from './persistence'

interface InternalParticipant extends StoredParticipant {}

const RECONNECT_GRACE_MS = 20_000
const SNAPSHOT_EVERY_TICKS = 2

export class GameRoom {
  private readonly participants = new Map<string, InternalParticipant>()
  private readonly sockets = new Map<WebSocket, string | null>()
  private game: CoopGameState | VersusGameState | null = null
  private inputs: CoopInputs = {}
  private loop: ReturnType<typeof setInterval> | null = null

  constructor(
    readonly config: StoredRoomConfig,
    private readonly onPersist: (record: StoredRoomRecord) => Promise<void>,
    restored?: StoredRoomRecord,
  ) {
    if (restored) {
      for (const restoredParticipant of restored.participants) {
        const participant = structuredClone(restoredParticipant)
        participant.connected = false
        participant.disconnectedAt = Date.now()
        this.participants.set(participant.id, participant)
      }
      this.game = restored.game && (restored.game.rulesetVersion === 5 || restored.game.rulesetVersion === 6) ? structuredClone(restored.game) : null
    }
    if (this.game && this.game.phase !== 'finished') this.startLoop()
  }

  async initialize(): Promise<void> {
    await this.persist()
  }

  connect(socket: WebSocket): void {
    this.sockets.set(socket, null)
    socket.on('message', (data) => void this.handleRawMessage(socket, data.toString()))
    socket.on('close', () => void this.handleClose(socket))
    socket.on('error', () => void this.handleClose(socket))
  }

  stop(): void {
    if (this.loop) clearInterval(this.loop)
    this.loop = null
    for (const socket of this.sockets.keys()) socket.close(1012, 'server restarting')
    this.sockets.clear()
  }

  private async handleRawMessage(socket: WebSocket, raw: string): Promise<void> {
    const parsed = parseWireMessage(raw)
    if (!parsed) {
      try {
        const candidate = JSON.parse(raw) as { type?: unknown; version?: unknown }
        if (candidate.type === 'hello' && candidate.version !== PROTOCOL_VERSION) {
          this.send(socket, { type: 'error', code: 'refresh_required', message: 'The river changed. Refresh to play Two Oars.', recoverable: false })
          return
        }
      } catch { /* invalid JSON uses the normal message below */ }
      this.send(socket, { type: 'error', code: 'invalid_message', message: 'That room message was invalid.', recoverable: true })
      return
    }
    if (parsed.type === 'hello') {
      await this.handleHello(socket, parsed)
      return
    }
    const participantId = this.sockets.get(socket)
    const participant = participantId ? this.participants.get(participantId) : undefined
    if (!participant) {
      this.send(socket, { type: 'error', code: 'hello_required', message: 'Join the room before sending commands.', recoverable: false })
      return
    }
    await this.handleParticipantMessage(socket, participant, parsed)
  }

  private async handleClose(socket: WebSocket): Promise<void> {
    if (!this.sockets.has(socket)) return
    const participantId = this.sockets.get(socket)
    this.sockets.delete(socket)
    if (!participantId || [...this.sockets.values()].includes(participantId)) return
    const participant = this.participants.get(participantId)
    if (!participant) return
    participant.connected = false
    participant.disconnectedAt = Date.now()
    this.inputs[participant.id] = { paddle: 0 }
    this.transferHost()
    await this.persist()
    this.broadcastLobby()
  }

  private cleanupDisconnected(): void {
    if (this.game?.phase === 'playing') return
    const cutoff = Date.now() - RECONNECT_GRACE_MS
    for (const [id, participant] of this.participants) {
      if (!participant.connected && participant.disconnectedAt && participant.disconnectedAt < cutoff) this.participants.delete(id)
    }
    this.transferHost()
  }

  private async handleHello(socket: WebSocket, message: Extract<ClientMessage, { type: 'hello' }>): Promise<void> {
    this.cleanupDisconnected()
    let participant = [...this.participants.values()].find((candidate) =>
      candidate.guestId === message.guestId
      && Boolean(message.reconnectToken)
      && candidate.reconnectToken === message.reconnectToken,
    )
    if (participant) {
      participant.connected = true
      participant.disconnectedAt = null
      participant.displayName = message.displayName
    } else {
      const usedSlots = new Set([...this.participants.values()].map((candidate) => candidate.slot).filter((slot): slot is number => slot !== null))
      let slot: number | null = null
      if (message.role !== 'spectator') {
        if (!usedSlots.has(0)) slot = 0
        else if (!usedSlots.has(1)) slot = 1
      }
      const id = crypto.randomUUID()
      participant = {
        id,
        guestId: message.guestId,
        profileId: null,
        displayName: message.displayName,
        slot,
        isHost: ![...this.participants.values()].some((candidate) => candidate.isHost),
        isAi: false,
        connected: true,
        reconnectToken: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''),
        lastSeq: 0,
        lastPaddle: 0,
        disconnectedAt: null,
      }
      this.participants.set(id, participant)
    }

    for (const [existingSocket, existingParticipantId] of this.sockets) {
      if (existingSocket !== socket && existingParticipantId === participant.id) existingSocket.close(4001, 'reconnected elsewhere')
    }
    this.sockets.set(socket, participant.id)
    await this.persist()
    this.send(socket, {
      type: 'welcome',
      version: PROTOCOL_VERSION,
      clientId: participant.id,
      reconnectToken: participant.reconnectToken,
      participant: this.publicParticipant(participant),
      lobby: this.lobby(),
    })
    if (this.game) this.send(socket, { type: 'snapshot', serverTick: this.game.tick, acknowledgedSeq: participant.lastSeq, state: this.game })
    this.broadcastLobby()
    await this.maybeStart()
  }

  private async handleParticipantMessage(socket: WebSocket, participant: InternalParticipant, message: ClientMessage): Promise<void> {
    if (message.type === 'peerSignal') {
      if (participant.slot === null || participant.id === message.targetId) return
      if (this.participants.get(message.targetId)?.slot == null) return
      for (const [target, id] of this.sockets) if (id === message.targetId) this.send(target, { type: 'peerSignal', fromId: participant.id, data: message.data })
      return
    }
    if (message.type === 'input' && participant.slot !== null && message.seq > participant.lastSeq) {
      participant.lastSeq = message.seq
      participant.lastPaddle = message.paddle
      this.inputs[participant.id] = { paddle: message.paddle }
    } else if (message.type === 'emote') {
      this.broadcast({ type: 'emote', playerId: participant.id, emote: message.emote })
    } else if (message.type === 'rematch' && this.game?.phase === 'finished') {
      this.game = this.game.rulesetVersion === 6 ? restartVersusGame(this.game, Date.now() >>> 0) : restartCoopGame(this.game, Date.now() >>> 0)
      this.inputs = {}
      await this.persist()
      this.startLoop()
      this.broadcastLobby()
      this.broadcastSnapshot()
    } else if (message.type === 'ping') {
      this.send(socket, { type: 'pong', sentAt: message.sentAt, serverAt: Date.now() })
    }
  }

  private async maybeStart(): Promise<void> {
    if (this.game) return
    const players = [...this.participants.values()]
      .filter((participant) => participant.slot !== null && participant.connected)
      .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
    if (players.length < 2) return
    const roster = players.slice(0, 2).map((candidate) => ({ id: candidate.id, name: candidate.displayName }))
    this.game = this.config.mode === 'versus' ? createVersusGame(roster, Date.now() >>> 0) : createCoopGame(roster, Date.now() >>> 0)
    await this.persist()
    this.startLoop()
    this.broadcastLobby()
    this.broadcastSnapshot()
  }

  private startLoop(): void {
    if (this.loop) return
    this.loop = setInterval(() => void this.tick(), 1000 / 60)
  }

  private async tick(): Promise<void> {
    if (!this.game) return
    if (this.game.rulesetVersion === 6) advanceVersusGame(this.game, this.inputs)
    else advanceCoopGame(this.game, this.inputs)
    const important = this.game.events.length > 0
    if (this.game.tick % SNAPSHOT_EVERY_TICKS === 0 || important) this.broadcastSnapshot()
    if (important || this.game.tick % 60 === 0) await this.persist()
    if (this.game.phase === 'finished') {
      if (this.loop) clearInterval(this.loop)
      this.loop = null
      this.broadcast({ type: 'result', state: this.game })
      this.broadcastLobby()
    }
  }

  private publicParticipant(participant: InternalParticipant): RoomParticipant {
    const { id, profileId, displayName, slot, isHost, isAi, connected } = participant
    return { id, profileId, displayName, slot, isHost, isAi, connected }
  }

  private lobby(): RoomLobby {
    return {
      roomCode: this.config.roomCode,
      roomName: this.config.roomName ?? (this.config.mode === 'versus' ? `${this.config.hostName}'s River Race` : `${this.config.hostName}'s Boat`),
      supportTraceId: this.config.roomCode,
      participants: [...this.participants.values()].map((participant) => this.publicParticipant(participant)),
      phase: this.game?.phase ?? 'lobby',
      mode: this.config.mode,
    }
  }

  private transferHost(): void {
    const current = [...this.participants.values()].find((candidate) => candidate.isHost && candidate.connected)
    if (current) return
    for (const candidate of this.participants.values()) candidate.isHost = false
    const replacement = [...this.participants.values()].find((candidate) => candidate.connected)
    if (replacement) replacement.isHost = true
  }

  private async persist(): Promise<void> {
    await this.onPersist({
      config: this.config,
      participants: [...this.participants.values()].map((participant) => structuredClone(participant)),
      game: this.game ? structuredClone(this.game) : null,
      updatedAt: Date.now(),
    })
  }

  private broadcastLobby(): void {
    this.broadcast({ type: 'lobby', lobby: this.lobby() })
  }

  private broadcastSnapshot(): void {
    if (!this.game) return
    for (const [socket, participantId] of this.sockets) {
      const participant = participantId ? this.participants.get(participantId) : undefined
      this.send(socket, { type: 'snapshot', serverTick: this.game.tick, acknowledgedSeq: participant?.lastSeq ?? 0, state: this.game })
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const socket of this.sockets.keys()) this.send(socket, message)
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    try { socket.send(encodeServerMessage(message)) } catch { /* close owns cleanup */ }
  }
}
