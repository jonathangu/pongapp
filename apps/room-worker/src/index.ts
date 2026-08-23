import { DurableObject } from 'cloudflare:workers'
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
  createRoomRequestSchema,
  encodeServerMessage,
  parseWireMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomLobby,
  type RoomParticipant,
  type ServerMessage,
  type StoredRoomConfig,
} from '@pongapp/protocol'
import { allowedOrigin, generateRoomCode, validRoomCode } from './helpers'

export { allowedOrigin, generateRoomCode, validRoomCode } from './helpers'

interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>
}

interface InternalParticipant extends RoomParticipant {
  guestId: string
  reconnectToken: string
  lastSeq: number
  lastTargetX: number
  lastTargetY: number
  disconnectedAt: number | null
}

interface StoredRoomRecord {
  version: typeof PROTOCOL_VERSION
  config: StoredRoomConfig
  participants: InternalParticipant[]
  game: GameState | null
  updatedAt: number
}

interface SocketAttachment {
  participantId: string | null
}

const MAX_BODY_BYTES = 16_384
const RECONNECT_GRACE_MS = 20_000
const SNAPSHOT_EVERY_TICKS = 2
const ROOM_STORAGE_KEY = 'room-v3'
const LEGACY_ROOM_STORAGE_KEY = 'room'

function displayRoomName(config: StoredRoomConfig): string {
  return config.roomName ?? `${config.hostName}'s Arena`
}

function corsHeaders(request: Request): HeadersInit {
  const origin = allowedOrigin(request.headers.get('origin'))
  return {
    'access-control-allow-origin': origin ?? 'https://www.jonathangu.com',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

function json(request: Request, value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: corsHeaders(request) })
}

async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error('body_too_large')
  return JSON.parse(raw) as unknown
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
    if (url.pathname === '/api/health') {
      return json(request, {
        status: 'ok',
        service: 'pongapp-room',
        protocol: PROTOCOL_VERSION,
        runtime: 'cloudflare-durable-objects',
        region: request.cf?.colo ?? 'edge',
      })
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const origin = request.headers.get('origin')
      if (origin && !allowedOrigin(origin)) return json(request, { error: 'origin_not_allowed' }, 403)
      let body: unknown
      try { body = await readJson(request) } catch { return json(request, { error: 'invalid_json' }, 400) }
      const parsed = createRoomRequestSchema.safeParse(body)
      if (!parsed.success) return json(request, { error: 'invalid_room_config' }, 400)

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const roomCode = generateRoomCode()
        const stub = env.ROOMS.get(env.ROOMS.idFromName(roomCode))
        const response = await stub.fetch('https://room.internal/configure', {
          method: 'POST',
          body: JSON.stringify({ ...parsed.data, roomCode, createdAt: Date.now() }),
        })
        if (response.status === 201) return json(request, { roomCode }, 201)
        if (response.status !== 409) return json(request, { error: 'room_create_failed' }, 500)
      }
      return json(request, { error: 'room_code_collision' }, 503)
    }

    const match = /^\/api\/rooms\/([A-Z2-9]{6})\/websocket$/.exec(url.pathname)
    if (match && request.method === 'GET') {
      const roomCode = match[1]!
      if (!validRoomCode(roomCode)) return json(request, { error: 'invalid_room_code' }, 400)
      const origin = request.headers.get('origin')
      if (origin && !allowedOrigin(origin)) return json(request, { error: 'origin_not_allowed' }, 403)
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return json(request, { error: 'websocket_required' }, 426)
      }
      return env.ROOMS.get(env.ROOMS.idFromName(roomCode)).fetch(request)
    }
    return json(request, { error: 'not_found' }, 404)
  },
} satisfies ExportedHandler<Env>

export class GameRoom extends DurableObject<Env> {
  private loaded = false
  private occupied = false
  private config: StoredRoomConfig | null = null
  private participants = new Map<string, InternalParticipant>()
  private game: GameState | null = null
  private inputs: Record<string, GameInput> = {}
  private aiMemory: AiControllerMemory = createAiMemory()
  private loop: ReturnType<typeof setInterval> | null = null
  private balanceSummaryLogged = false

  override async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded()
    const url = new URL(request.url)
    if (url.pathname === '/configure' && request.method === 'POST') {
      if (this.occupied) return new Response('exists', { status: 409 })
      const value = await request.json() as Partial<StoredRoomConfig>
      const parsed = createRoomRequestSchema.safeParse({ hostName: value.hostName, roomName: value.roomName })
      if (!parsed.success || typeof value.roomCode !== 'string' || !validRoomCode(value.roomCode)
        || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) {
        return new Response('invalid', { status: 400 })
      }
      this.config = { ...parsed.data, roomCode: value.roomCode, createdAt: value.createdAt }
      this.occupied = true
      await this.persist()
      return new Response('created', { status: 201 })
    }

    if (url.pathname.endsWith('/websocket')) {
      if (!this.config) return new Response('Room not found', { status: 404 })
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      this.ctx.acceptWebSocket(server)
      server.serializeAttachment({ participantId: null } satisfies SocketAttachment)
      return new Response(null, { status: 101, webSocket: client })
    }
    return new Response('Not found', { status: 404 })
  }

  override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ensureLoaded()
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message)
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
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    const participant = attachment?.participantId ? this.participants.get(attachment.participantId) : undefined
    if (!participant) {
      this.send(socket, { type: 'error', code: 'hello_required', message: 'Join the room before sending commands.', recoverable: false })
      return
    }
    await this.handleParticipantMessage(socket, participant, parsed)
  }

  override async webSocketClose(socket: WebSocket): Promise<void> {
    await this.handleClose(socket)
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    await this.handleClose(socket)
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    const stored = await this.ctx.storage.get<StoredRoomRecord>(ROOM_STORAGE_KEY)
    const legacy = stored ? undefined : await this.ctx.storage.get(LEGACY_ROOM_STORAGE_KEY)
    this.occupied = Boolean(stored || legacy)
    if (stored?.version === PROTOCOL_VERSION && stored.config) {
      this.config = stored.config
      this.participants = new Map(stored.participants.map((participant) => [participant.id, participant]))
      this.game = stored.game?.rulesetVersion === 3 ? stored.game : null
      const connectedIds = new Set(this.ctx.getWebSockets().map((socket) =>
        (socket.deserializeAttachment() as SocketAttachment | null)?.participantId,
      ).filter((id): id is string => Boolean(id)))
      for (const participant of this.participants.values()) {
        participant.connected = connectedIds.has(participant.id)
        if (!participant.connected) participant.disconnectedAt ??= Date.now()
      }
      if (this.game && this.game.phase !== 'finished') this.startLoop()
    }
    this.loaded = true
  }

  private async handleClose(socket: WebSocket): Promise<void> {
    await this.ensureLoaded()
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    const participantId = attachment?.participantId
    if (!participantId) return
    const hasReplacement = this.ctx.getWebSockets().some((candidate) => {
      if (candidate === socket) return false
      return (candidate.deserializeAttachment() as SocketAttachment | null)?.participantId === participantId
    })
    if (hasReplacement) return
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
    console.info(JSON.stringify({
      event: 'pongapp.room.connection.v1',
      action: 'left',
      slot: participant.slot,
      phase: this.lobby().phase,
      connectedPlayers: [...this.participants.values()].filter((candidate) => candidate.connected && candidate.slot !== null).length,
    }))
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
    const reconnected = Boolean(participant)
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

    for (const existingSocket of this.ctx.getWebSockets()) {
      const existing = existingSocket.deserializeAttachment() as SocketAttachment | null
      if (existingSocket !== socket && existing?.participantId === participant.id) existingSocket.close(4001, 'reconnected elsewhere')
    }
    socket.serializeAttachment({ participantId: participant.id } satisfies SocketAttachment)
    await this.persist()
    console.info(JSON.stringify({
      event: 'pongapp.room.connection.v1',
      action: reconnected ? 'reconnected' : 'joined',
      slot: participant.slot,
      phase: this.lobby().phase,
      connectedPlayers: [...this.participants.values()].filter((candidate) => candidate.connected && candidate.slot !== null).length,
    }))
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

  /** Balance records deliberately exclude room codes, names, IDs, tokens, and input coordinates. */
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
    if (!this.config) throw new Error('Room is not configured')
    return {
      roomCode: this.config.roomCode,
      roomName: displayRoomName(this.config),
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

  private broadcastLobby(): void {
    if (this.config) this.broadcast({ type: 'lobby', lobby: this.lobby() })
  }

  private broadcastSnapshot(): void {
    if (!this.game) return
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null
      const participant = attachment?.participantId ? this.participants.get(attachment.participantId) : undefined
      this.send(socket, { type: 'snapshot', serverTick: this.game.tick, acknowledgedSeq: participant?.lastSeq ?? 0, state: this.game })
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const socket of this.ctx.getWebSockets()) this.send(socket, message)
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    try { socket.send(encodeServerMessage(message)) } catch { /* close owns cleanup */ }
  }

  private async persist(): Promise<void> {
    if (!this.config) return
    await this.ctx.storage.put(ROOM_STORAGE_KEY, {
      version: PROTOCOL_VERSION,
      config: this.config,
      participants: [...this.participants.values()],
      game: this.game,
      updatedAt: Date.now(),
    } satisfies StoredRoomRecord)
  }
}
