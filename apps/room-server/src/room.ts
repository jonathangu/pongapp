import {
  AI_DIFFICULTY_LABEL,
  aiInputs,
  buildMatchConfig,
  createAiMemory,
  createGame,
  normalizeGameState,
  restartGame,
  stepGame,
  type AiControllerMemory,
  type GameInput,
  type GameState,
} from '@pongapp/game-core'
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
const SNAPSHOT_EVERY_TICKS = 3

export class GameRoom {
  private readonly participants = new Map<string, InternalParticipant>()
  private readonly sockets = new Map<WebSocket, string | null>()
  private game: GameState | null = null
  private inputs: Record<string, GameInput> = {}
  private aiMemory: AiControllerMemory = createAiMemory()
  private loop: ReturnType<typeof setInterval> | null = null

  constructor(
    readonly config: StoredRoomConfig,
    private readonly onPersist: (record: StoredRoomRecord) => Promise<void>,
    restored?: StoredRoomRecord,
  ) {
    if (restored) {
      for (const restoredParticipant of restored.participants) {
        const participant = structuredClone(restoredParticipant)
        if (!participant.isAi) {
          participant.connected = false
          participant.disconnectedAt = Date.now()
        }
        this.participants.set(participant.id, participant)
      }
      this.game = restored.game ? normalizeGameState(structuredClone(restored.game)) : null
    } else {
      this.addAiParticipants()
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
    this.transferHost()
    await this.persist()
    this.broadcastLobby()
  }

  private addAiParticipants(): void {
    const maximum = this.config.mode === 'duel' ? 2 : 4
    const count = Math.min(this.config.aiSlots, maximum - 1)
    for (let index = maximum - count; index < maximum; index += 1) {
      const id = `ai-${index + 1}`
      this.participants.set(id, {
        id,
        guestId: id,
        profileId: null,
        displayName: count > 1
          ? `${AI_DIFFICULTY_LABEL[this.config.aiDifficulty]} ${index + 1}`
          : AI_DIFFICULTY_LABEL[this.config.aiDifficulty],
        ability: ['dash', 'bend', 'pulse', 'dash'][index] as InternalParticipant['ability'],
        slot: index,
        isHost: false,
        isAi: true,
        isReady: true,
        connected: true,
        reconnectToken: '',
        lastSeq: 0,
        lastTarget: 0.5,
        disconnectedAt: null,
      })
    }
  }

  private cleanupDisconnected(): void {
    if (this.game?.phase === 'playing') return
    const cutoff = Date.now() - RECONNECT_GRACE_MS
    for (const [id, participant] of this.participants) {
      if (!participant.isAi && !participant.connected && participant.disconnectedAt && participant.disconnectedAt < cutoff) this.participants.delete(id)
    }
    this.transferHost()
  }

  private async handleHello(socket: WebSocket, message: Extract<ClientMessage, { type: 'hello' }>): Promise<void> {
    this.cleanupDisconnected()
    const reconnect = [...this.participants.values()].find((participant) =>
      !participant.isAi && participant.guestId === message.guestId && Boolean(message.reconnectToken) && participant.reconnectToken === message.reconnectToken,
    )
    let participant = reconnect
    if (participant) {
      participant.connected = true
      participant.disconnectedAt = null
      participant.displayName = message.displayName
      participant.ability = message.ability
      if (this.game?.players[participant.id]) this.game.players[participant.id]!.isAi = false
    } else {
      const maxPlayers = this.config.mode === 'duel' ? 2 : 4
      const usedSlots = new Set([...this.participants.values()].map((candidate) => candidate.slot).filter((slot): slot is number => slot !== null))
      let slot: number | null = null
      if (message.role !== 'spectator') {
        for (let index = 0; index < maxPlayers; index += 1) {
          if (!usedSlots.has(index)) { slot = index; break }
        }
      }
      const id = crypto.randomUUID()
      participant = {
        id,
        guestId: message.guestId,
        profileId: null,
        displayName: message.displayName,
        ability: message.ability,
        slot,
        isHost: ![...this.participants.values()].some((candidate) => candidate.isHost && !candidate.isAi),
        isAi: false,
        isReady: false,
        connected: true,
        reconnectToken: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''),
        lastSeq: 0,
        lastTarget: 0.5,
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
  }

  private async handleParticipantMessage(socket: WebSocket, participant: InternalParticipant, message: ClientMessage): Promise<void> {
    if (message.type === 'ready' && participant.slot !== null && !participant.isAi) {
      participant.isReady = message.ready
      await this.persist()
      this.broadcastLobby()
      await this.maybeStart()
    } else if (message.type === 'input' && participant.slot !== null && message.seq > participant.lastSeq) {
      participant.lastSeq = message.seq
      participant.lastTarget = message.target
      this.inputs[participant.id] = { target: message.target, abilityPressed: message.abilityPressed }
    } else if (message.type === 'emote') {
      this.broadcast({ type: 'emote', playerId: participant.id, emote: message.emote })
    } else if (message.type === 'rematch' && participant.isHost && this.game?.phase === 'finished') {
      this.game = restartGame(this.game, Date.now() >>> 0)
      this.aiMemory = createAiMemory()
      for (const candidate of this.participants.values()) if (!candidate.isAi && candidate.slot !== null) candidate.isReady = true
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
    const players = [...this.participants.values()].filter((participant) => participant.slot !== null)
    const humans = players.filter((participant) => !participant.isAi && participant.connected)
    const required = this.config.mode === 'duel' ? 2 : this.config.mode === 'arena' ? 3 : 4
    if (players.length < required || humans.length === 0 || humans.some((participant) => !participant.isReady)) return
    const orderedHumans = humans.sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
    this.game = createGame(buildMatchConfig({
      mode: this.config.mode,
      humanPlayers: orderedHumans.map((candidate) => ({ id: candidate.id, name: candidate.displayName, ability: candidate.ability })),
      totalPlayers: this.config.mode === 'arena' ? Math.min(4, players.length) : required,
      aiDifficulty: this.config.aiDifficulty,
      itemIntensity: this.config.itemIntensity,
      mutator: this.config.mutator ?? 'none',
      seed: Date.now() >>> 0,
    }))
    this.aiMemory = createAiMemory()
    await this.persist()
    this.startLoop()
    this.broadcastLobby()
    this.broadcastSnapshot()
  }

  private startLoop(): void {
    if (this.loop) return
    this.loop = setInterval(() => this.tick(), 1000 / 60)
  }

  private tick(): void {
    if (!this.game) return
    for (const participant of this.participants.values()) {
      if (!participant.isAi && !participant.connected && participant.disconnectedAt && Date.now() - participant.disconnectedAt >= 2000) {
        const player = this.game.players[participant.id]
        if (player) {
          player.isAi = true
          player.aiDifficulty = this.config.aiDifficulty
        }
      }
    }
    const mergedInputs = { ...aiInputs(this.game, this.aiMemory), ...this.inputs }
    stepGame(this.game, mergedInputs)
    for (const input of Object.values(this.inputs)) input.abilityPressed = false
    if (this.game.tick % SNAPSHOT_EVERY_TICKS === 0 || this.game.events.length > 0) this.broadcastSnapshot()
    for (const event of this.game.events) this.broadcast({ type: 'event', event })
    if (this.game.tick % 60 === 0 || this.game.phase === 'finished') void this.persist()
    if (this.game.phase === 'finished') {
      if (this.loop) clearInterval(this.loop)
      this.loop = null
      this.broadcast({ type: 'result', state: this.game })
      this.broadcastLobby()
    }
  }

  private transferHost(): void {
    const connected = [...this.participants.values()]
      .filter((participant) => !participant.isAi && participant.connected)
      .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
    if (connected.some((participant) => participant.isHost)) return
    for (const participant of this.participants.values()) participant.isHost = false
    if (connected[0]) connected[0].isHost = true
  }

  private publicParticipant(participant: InternalParticipant): RoomParticipant {
    const { id, profileId, displayName, ability, slot, isHost, isAi, isReady, connected } = participant
    return { id, profileId, displayName, ability, slot, isHost, isAi, isReady, connected }
  }

  private lobby(): RoomLobby {
    return {
      roomCode: this.config.roomCode,
      mode: this.config.mode,
      itemIntensity: this.config.itemIntensity,
      mutator: this.config.mutator ?? 'none',
      aiDifficulty: this.config.aiDifficulty,
      aiSlots: this.config.aiSlots,
      participants: [...this.participants.values()]
        .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
        .map((participant) => this.publicParticipant(participant)),
      phase: this.game?.phase ?? 'lobby',
    }
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
    if (socket.readyState !== socket.OPEN) return
    try { socket.send(encodeServerMessage(message)) } catch { /* close/error owns cleanup */ }
  }

  private persist(): Promise<void> {
    return this.onPersist({
      config: this.config,
      participants: [...this.participants.values()],
      game: this.game,
      updatedAt: Date.now(),
    })
  }
}
