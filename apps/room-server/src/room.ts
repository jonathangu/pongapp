import {
  aiInputs,
  buildMatchConfig,
  createAiMemory,
  createGame,
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
const SNAPSHOT_EVERY_TICKS = 2

export class GameRoom {
  private readonly participants = new Map<string, InternalParticipant>()
  private readonly sockets = new Map<WebSocket, string | null>()
  private game: GameState | null = null
  private inputs: Record<string, GameInput> = {}
  private aiMemory: AiControllerMemory = createAiMemory()
  private loop: ReturnType<typeof setInterval> | null = null
  private balanceSummaryLogged = false

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
      this.game = restored.game?.rulesetVersion === 3 ? structuredClone(restored.game) : null
      if (this.game) {
        for (const player of Object.values(this.game.players)) player.isAi = true
      }
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
          this.send(socket, { type: 'error', code: 'refresh_required', message: 'Pal Duel became air hockey. Refresh to play the new version.', recoverable: false })
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
    const player = this.game?.players[participant.id]
    if (player && this.game?.phase !== 'finished') {
      player.isAi = true
      player.aiDifficulty = 'rally'
    }
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
      const player = this.game?.players[participant.id]
      if (player) {
        player.isAi = false
        player.aiDifficulty = undefined
      }
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
        lastTargetX: 0.5,
        lastTargetY: slot === 1 ? 0.18 : 0.82,
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
    if (message.type === 'input' && participant.slot !== null && message.seq > participant.lastSeq) {
      participant.lastSeq = message.seq
      participant.lastTargetX = message.targetX
      participant.lastTargetY = message.targetY
      this.inputs[participant.id] = {
        targetX: message.targetX,
        targetY: message.targetY,
        palAction: message.palAction ?? this.inputs[participant.id]?.palAction ?? null,
      }
    } else if (message.type === 'emote') {
      this.broadcast({ type: 'emote', playerId: participant.id, emote: message.emote })
    } else if (message.type === 'rematch' && this.game?.phase === 'finished') {
      this.game = restartGame(this.game, Date.now() >>> 0)
      this.aiMemory = createAiMemory()
      this.balanceSummaryLogged = false
      for (const candidate of this.participants.values()) {
        const player = this.game.players[candidate.id]
        if (player) {
          player.isAi = !candidate.connected
          player.aiDifficulty = candidate.connected ? undefined : 'rally'
        }
      }
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
    this.game = createGame(buildMatchConfig({
      humanPlayers: players.slice(0, 2).map((candidate) => ({ id: candidate.id, name: candidate.displayName })),
      seed: Date.now() >>> 0,
    }))
    this.aiMemory = createAiMemory()
    this.balanceSummaryLogged = false
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
    const automatic = aiInputs(this.game, this.aiMemory)
    stepGame(this.game, { ...this.inputs, ...automatic })
    this.logBalanceEvents()
    for (const input of Object.values(this.inputs)) input.palAction = null
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

  /**
   * Structured balance telemetry deliberately excludes room codes, player IDs,
   * names, guest IDs, reconnect tokens, and input coordinates. It describes
   * only the rules and anonymous top/bottom outcomes of online matches.
   */
  private logBalanceEvents(): void {
    const game = this.game
    if (!game) return
    const players = Object.values(game.players).sort((a, b) => a.side.localeCompare(b.side))
    for (const event of game.events) {
      if (event.type !== 'score') continue
      const defender = game.players[event.againstPlayerId]
      const scorer = game.players[event.scorerId]
      console.info(JSON.stringify({
        event: 'pongapp.balance.goal.v1',
        rulesetVersion: game.rulesetVersion,
        tick: game.tick,
        rallyHits: event.rallyHits,
        scorerSide: scorer?.side ?? null,
        defenderSide: defender?.side ?? null,
        defenderCamping: event.defenderCamping,
        goalNumber: Object.values(game.scores).reduce((total, score) => total + score, 0),
        score: players.map((player) => ({ side: player.side, points: game.scores[player.team] ?? 0 })),
      }))
    }
    if (game.phase !== 'finished' || this.balanceSummaryLogged) return
    this.balanceSummaryLogged = true
    console.info(JSON.stringify({
      event: 'pongapp.balance.match.v1',
      rulesetVersion: game.rulesetVersion,
      durationSeconds: Math.round(game.tick / 6) / 10,
      overtime: game.overtime,
      longestRallyHits: game.longestRallyHits,
      players: players.map((player) => ({
        side: player.side,
        isAi: player.isAi,
        points: game.scores[player.team] ?? 0,
        returns: player.returns,
        cleanStrikes: player.cleanStrikes,
        palsSummoned: player.palsSummoned,
        palHits: player.palHits,
        palSteals: player.palSteals,
        goalCampSeconds: Math.round((player.goalCampTicks ?? 0) / 6) / 10,
        goalsConceded: player.goalsConceded ?? 0,
        campedGoalsConceded: player.campedGoalsConceded ?? 0,
        openPostShots: player.openPostShots ?? 0,
        bankShots: player.bankShots ?? 0,
      })),
    }))
  }

  private publicParticipant(participant: InternalParticipant): RoomParticipant {
    const { id, profileId, displayName, slot, isHost, isAi, connected } = participant
    return { id, profileId, displayName, slot, isHost, isAi, connected }
  }

  private lobby(): RoomLobby {
    return {
      roomCode: this.config.roomCode,
      participants: [...this.participants.values()].map((participant) => this.publicParticipant(participant)),
      phase: this.game?.phase ?? 'lobby',
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
