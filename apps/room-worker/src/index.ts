import { DurableObject } from 'cloudflare:workers'
import {
  advanceCoopGame,
  advanceVersusGame,
  createCoopGame,
  createVersusGame,
  restartCoopGame,
  restartVersusGame,
  type CoopInputs,
  type CoopGameState,
  type VersusGameState,
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
import { acceptClientTelemetry, allowedOrigin, classifyWebSocketClose, generateRoomCode, validRoomCode } from './helpers'

export { allowedOrigin, generateRoomCode, validRoomCode } from './helpers'

interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>
}

interface InternalParticipant extends RoomParticipant {
  guestId: string
  reconnectToken: string
  lastSeq: number
  lastPaddle: number
  disconnectedAt: number | null
}

interface StoredRoomRecord {
  version: typeof PROTOCOL_VERSION
  config: StoredRoomConfig
  participants: InternalParticipant[]
  game: CoopGameState | VersusGameState | null
  telemetryRoomId?: string
  matchSessionId?: string | null
  updatedAt: number
}

interface SocketAttachment {
  participantId: string | null
  connectionId: string
  clientSessionId: string | null
  connectedAt: number
  helloAt: number | null
  firstInputAt: number | null
  reconnectAttempt: number
  telemetryUiMask: number
  lastNetworkTelemetryAt: number | null
  lastPerformanceTelemetryAt: number | null
}

const MAX_BODY_BYTES = 16_384
const RECONNECT_GRACE_MS = 20_000
const SNAPSHOT_EVERY_TICKS = 2
const ROOM_STORAGE_KEY = 'room-v5'
const LEGACY_ROOM_STORAGE_KEY = 'room'

function displayRoomName(config: StoredRoomConfig): string {
  return config.roomName ?? (config.mode === 'versus' ? `${config.hostName}'s River Race` : `${config.hostName}'s Boat`)
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
  private game: CoopGameState | VersusGameState | null = null
  private inputs: CoopInputs = {}
  private loop: ReturnType<typeof setInterval> | null = null
  private telemetryRoomId: string = crypto.randomUUID()
  private matchSessionId: string | null = null
  private closedConnectionIds = new Set<string>()

  override async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded()
    const url = new URL(request.url)
    if (url.pathname === '/configure' && request.method === 'POST') {
      if (this.occupied) return new Response('exists', { status: 409 })
      const value = await request.json() as Partial<StoredRoomConfig>
      const parsed = createRoomRequestSchema.safeParse({ hostName: value.hostName, roomName: value.roomName, mode: value.mode })
      if (!parsed.success || typeof value.roomCode !== 'string' || !validRoomCode(value.roomCode)
        || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) {
        return new Response('invalid', { status: 400 })
      }
      this.config = { ...parsed.data, roomCode: value.roomCode, createdAt: value.createdAt }
      this.occupied = true
      await this.persist()
      this.logLifecycle('room_created')
      return new Response('created', { status: 201 })
    }

    if (url.pathname.endsWith('/websocket')) {
      if (!this.config) return new Response('Room not found', { status: 404 })
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      const connectionId = crypto.randomUUID()
      this.ctx.acceptWebSocket(server)
      server.serializeAttachment({
        participantId: null,
        connectionId,
        clientSessionId: null,
        connectedAt: Date.now(),
        helloAt: null,
        firstInputAt: null,
        reconnectAttempt: 0,
        telemetryUiMask: 0,
        lastNetworkTelemetryAt: null,
        lastPerformanceTelemetryAt: null,
      } satisfies SocketAttachment)
      this.logLifecycle('socket_opened', { connectionId })
      return new Response(null, { status: 101, webSocket: client })
    }
    return new Response('Not found', { status: 404 })
  }

  override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ensureLoaded()
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message)
    const parsed = parseWireMessage(raw)
    if (!parsed) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null
      try {
        const candidate = JSON.parse(raw) as { type?: unknown; version?: unknown }
        if (candidate.type === 'hello' && candidate.version !== PROTOCOL_VERSION) {
          this.logLifecycle('protocol_rejected', {
            connectionId: attachment?.connectionId ?? null,
            reason: 'version_mismatch',
            announcedVersion: typeof candidate.version === 'number' && Number.isInteger(candidate.version) ? candidate.version : null,
          })
          this.send(socket, { type: 'error', code: 'refresh_required', message: 'The river changed. Refresh to play Two Oars.', recoverable: false })
          return
        }
      } catch { /* invalid JSON uses the normal message below */ }
      this.logLifecycle('protocol_rejected', { connectionId: attachment?.connectionId ?? null, reason: 'invalid_message' })
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
      this.logLifecycle('protocol_rejected', { connectionId: attachment?.connectionId ?? null, reason: 'hello_required' })
      this.send(socket, { type: 'error', code: 'hello_required', message: 'Join the room before sending commands.', recoverable: false })
      return
    }
    await this.handleParticipantMessage(socket, participant, parsed)
  }

  override async webSocketClose(socket: WebSocket, code: number, _reason: string, wasClean: boolean): Promise<void> {
    // Also complete the handshake in local/older runtimes without automatic close replies.
    try { socket.close(code === 1005 || code === 1006 ? 1000 : code, 'Connection closed') } catch { /* already closed */ }
    await this.handleClose(socket, { code, wasClean, errorType: null })
  }

  override async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
    await this.handleClose(socket, {
      code: null,
      wasClean: false,
      errorType: error instanceof Error ? error.name : typeof error,
    })
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    const stored = await this.ctx.storage.get<StoredRoomRecord>(ROOM_STORAGE_KEY)
    const legacy = stored ? undefined : await this.ctx.storage.get(LEGACY_ROOM_STORAGE_KEY)
    this.occupied = Boolean(stored || legacy)
    if ((stored?.version === PROTOCOL_VERSION || stored?.version === 5) && stored.config) {
      this.config = stored.config
      this.telemetryRoomId = stored.telemetryRoomId ?? crypto.randomUUID()
      this.matchSessionId = stored.matchSessionId ?? null
      this.participants = new Map(stored.participants.map((participant) => [participant.id, participant]))
      this.game = stored.game && (stored.game.rulesetVersion === 7 || stored.game.rulesetVersion === 6) ? stored.game : null
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
    if (this.config) this.logLifecycle('room_loaded')
  }

  private async handleClose(socket: WebSocket, close: { code: number | null; wasClean: boolean; errorType: string | null }): Promise<void> {
    await this.ensureLoaded()
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    const connectionId = attachment?.connectionId ?? 'unknown'
    if (this.closedConnectionIds.has(connectionId)) return
    this.closedConnectionIds.add(connectionId)
    const participantId = attachment?.participantId
    if (!participantId) {
      this.logLifecycle('socket_closed_before_hello', {
        connectionId,
        closeCategory: classifyWebSocketClose(close.code),
        closeCode: close.code,
        wasClean: close.wasClean,
        errorType: close.errorType,
        connectedMs: typeof attachment?.connectedAt === 'number' ? Date.now() - attachment.connectedAt : null,
      })
      return
    }
    const hasReplacement = this.ctx.getWebSockets().some((candidate) => {
      if (candidate === socket) return false
      return (candidate.deserializeAttachment() as SocketAttachment | null)?.participantId === participantId
    })
    const participant = this.participants.get(participantId)
    if (!participant) return
    const closeDetail = {
      connectionId,
      clientSessionId: attachment?.clientSessionId ?? null,
      slot: participant.slot,
      closeCategory: classifyWebSocketClose(close.code),
      closeCode: close.code,
      wasClean: close.wasClean,
      errorType: close.errorType,
      connectedMs: typeof attachment?.connectedAt === 'number' ? Date.now() - attachment.connectedAt : null,
      firstInputSeen: typeof attachment?.firstInputAt === 'number',
      replacementPresent: hasReplacement,
    }
    if (hasReplacement) {
      this.logLifecycle('socket_closed', closeDetail)
      return
    }
    participant.connected = false
    participant.disconnectedAt = Date.now()
    this.inputs[participant.id] = { paddle: 0 }
    this.transferHost()
    await this.persist()
    this.logLifecycle('socket_closed', closeDetail)
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
    const acceptedAt = Date.now()
    const initialAttachment = socket.deserializeAttachment() as SocketAttachment
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

    const nextAttachment = {
      ...initialAttachment,
      participantId: participant.id,
      clientSessionId: message.clientSessionId ?? null,
      helloAt: acceptedAt,
      reconnectAttempt: message.reconnectAttempt ?? 0,
    } satisfies SocketAttachment
    // Publish replacement ownership before closing the previous socket so its
    // close handler can never transiently mark the participant disconnected.
    socket.serializeAttachment(nextAttachment)
    for (const existingSocket of this.ctx.getWebSockets()) {
      const existing = existingSocket.deserializeAttachment() as SocketAttachment | null
      if (existingSocket !== socket && existing?.participantId === participant.id) {
        this.logLifecycle('socket_replaced', {
          connectionId: existing.connectionId,
          replacementConnectionId: nextAttachment.connectionId,
          clientSessionId: existing.clientSessionId,
          replacementClientSessionId: nextAttachment.clientSessionId,
          slot: participant.slot,
        })
        existingSocket.close(4001, 'reconnected elsewhere')
      }
    }
    await this.persist()
    this.logLifecycle(reconnected ? 'participant_reconnected' : 'participant_joined', {
      connectionId: nextAttachment.connectionId,
      clientSessionId: nextAttachment.clientSessionId,
      reconnectAttempt: nextAttachment.reconnectAttempt,
      hadReconnectToken: Boolean(message.reconnectToken),
      requestedRole: message.role,
      assignedRole: participant.slot === null ? 'spectator' : 'player',
      slot: participant.slot,
      helloLatencyMs: acceptedAt - nextAttachment.connectedAt,
    })
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
      for (const target of this.ctx.getWebSockets()) {
        if ((target.deserializeAttachment() as SocketAttachment | null)?.participantId === message.targetId) {
          this.send(target, { type: 'peerSignal', fromId: participant.id, data: message.data })
        }
      }
      return
    }
    if (message.type === 'input' && participant.slot !== null && message.seq > participant.lastSeq) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null
      if (attachment && !attachment.firstInputAt && message.controlActive === true) {
        attachment.firstInputAt = Date.now()
        socket.serializeAttachment(attachment)
        this.logLifecycle('control_input_first', {
          connectionId: attachment.connectionId,
          clientSessionId: attachment.clientSessionId,
          slot: participant.slot,
          msAfterHello: attachment.helloAt ? attachment.firstInputAt - attachment.helloAt : null,
        })
      }
      participant.lastSeq = message.seq
      participant.lastPaddle = message.paddle
      this.inputs[participant.id] = { paddle: message.paddle }
    } else if (message.type === 'emote') {
      this.broadcast({ type: 'emote', playerId: participant.id, emote: message.emote })
    } else if (message.type === 'clientTelemetry') {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null
      if (!attachment) return
      const now = Date.now()
      const decision = acceptClientTelemetry(
        message.event,
        attachment.telemetryUiMask ?? 0,
        attachment.lastNetworkTelemetryAt ?? null,
        attachment.lastPerformanceTelemetryAt ?? null,
        now,
      )
      if (!decision.accepted) return
      attachment.telemetryUiMask = decision.uiMask
      attachment.lastNetworkTelemetryAt = decision.lastNetworkAt
      attachment.lastPerformanceTelemetryAt = decision.lastPerformanceAt
      socket.serializeAttachment(attachment)
      this.logLifecycle(`client_${message.event}`, {
        connectionId: attachment.connectionId ?? null,
        clientSessionId: attachment.clientSessionId ?? null,
        slot: participant.slot,
        latencyMs: message.latencyMs ?? null,
        latencyP95Ms: message.latencyP95Ms ?? null,
        jitterMs: message.jitterMs ?? null,
        snapshotGapP95Ms: message.snapshotGapP95Ms ?? null,
        connectionQuality: message.connectionQuality ?? null,
        frameGapP95Ms: message.frameGapP95Ms ?? null,
        maxFrameGapMs: message.maxFrameGapMs ?? null,
        renderP95Ms: message.renderP95Ms ?? null,
        longFrameCount: message.longFrameCount ?? null,
        freezeCount: message.freezeCount ?? null,
        rendererResolution: message.rendererResolution ?? null,
        renderQuality: message.renderQuality ?? null,
      })
    } else if (message.type === 'rematch' && this.game?.phase === 'finished') {
      this.game = this.game.rulesetVersion === 6
        ? restartVersusGame(this.game, Date.now() >>> 0)
        : restartCoopGame(this.game, Date.now() >>> 0)
      this.matchSessionId = crypto.randomUUID()
      this.inputs = {}
      await this.persist()
      this.logLifecycle('rematch_started')
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
    this.matchSessionId = crypto.randomUUID()
    const roster = players.slice(0, 2).map((candidate) => ({ id: candidate.id, name: candidate.displayName }))
    this.game = this.config?.mode === 'versus'
      ? createVersusGame(roster, Date.now() >>> 0)
      : createCoopGame(roster, Date.now() >>> 0)
    await this.persist()
    this.logLifecycle('match_started', {
      msAfterRoomCreated: this.config ? Date.now() - this.config.createdAt : null,
    })
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
      this.logLifecycle('match_finished', this.game.rulesetVersion === 6 ? {
        durationSeconds: Math.round(this.game.tick / 6) / 10,
        mode: 'versus',
      } : {
        durationSeconds: Math.round(this.game.tick / 6) / 10,
        mode: 'coop', score: this.game.score, distance: Math.round(this.game.distance), bestStreak: this.game.bestStreak,
      })
      this.broadcast({ type: 'result', state: this.game })
      this.broadcastLobby()
    }
  }

  /**
   * Correlation IDs below are random, server-only identifiers. Lifecycle logs
   * never include room codes, room/player names, guest or participant IDs,
   * reconnect/access tokens, client text, or input coordinates.
   */
  private logLifecycle(action: string, detail: Record<string, string | number | boolean | null | undefined> = {}): void {
    const participants = [...this.participants.values()]
    console.info({
      event: 'pongapp.room.lifecycle.v2',
      schemaVersion: 2,
      action,
      roomSessionId: this.telemetryRoomId,
      supportTraceId: this.telemetryRoomId.slice(0, 8).toUpperCase(),
      matchSessionId: this.matchSessionId,
      phase: this.game?.phase ?? (this.config ? 'lobby' : 'unconfigured'),
      gameTick: this.game?.tick ?? null,
      roomAgeMs: this.config ? Math.max(0, Date.now() - this.config.createdAt) : null,
      connectedPlayers: participants.filter((participant) => participant.connected && participant.slot !== null).length,
      connectedSpectators: participants.filter((participant) => participant.connected && participant.slot === null).length,
      reservedPlayerSlots: participants.filter((participant) => participant.slot !== null).length,
      ...detail,
    })
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
      supportTraceId: this.telemetryRoomId.slice(0, 8).toUpperCase(),
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
      telemetryRoomId: this.telemetryRoomId,
      matchSessionId: this.matchSessionId,
      updatedAt: Date.now(),
    } satisfies StoredRoomRecord)
  }
}
