import { DurableObject } from 'cloudflare:workers'
import {
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
import { allowedOrigin, generateRoomCode } from './helpers'

export { allowedOrigin, generateRoomCode } from './helpers'

interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>
}

interface InternalParticipant extends RoomParticipant {
  guestId: string
  reconnectToken: string
  lastSeq: number
  lastTarget: number
  disconnectedAt: number | null
}

interface SocketAttachment { participantId: string | null }

const RECONNECT_GRACE_MS = 20_000
const SNAPSHOT_EVERY_TICKS = 3

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

function validRoomCode(value: string): boolean {
  return /^[A-Z2-9]{6}$/.test(value)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
    if (url.pathname === '/api/health') return json(request, { status: 'ok', service: 'pongapp-room', protocol: PROTOCOL_VERSION })

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const origin = request.headers.get('origin')
      if (origin && !allowedOrigin(origin)) return json(request, { error: 'origin_not_allowed' }, 403)
      let body: unknown
      try { body = await request.json() } catch { return json(request, { error: 'invalid_json' }, 400) }
      const parsed = createRoomRequestSchema.safeParse(body)
      if (!parsed.success) return json(request, { error: 'invalid_room_config' }, 400)

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const roomCode = generateRoomCode()
        const id = env.ROOMS.idFromName(roomCode)
        const response = await env.ROOMS.get(id).fetch('https://room.internal/configure', {
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
      return env.ROOMS.get(env.ROOMS.idFromName(roomCode)).fetch(request)
    }
    return json(request, { error: 'not_found' }, 404)
  },
} satisfies ExportedHandler<Env>

export class GameRoom extends DurableObject<Env> {
  private loaded = false
  private config: StoredRoomConfig | null = null
  private participants = new Map<string, InternalParticipant>()
  private game: GameState | null = null
  private inputs: Record<string, GameInput> = {}
  private aiMemory: AiControllerMemory = createAiMemory()
  private loop: ReturnType<typeof setInterval> | null = null

  override async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded()
    const url = new URL(request.url)
    if (url.pathname === '/configure' && request.method === 'POST') {
      if (this.config) return new Response('exists', { status: 409 })
      const value = await request.json() as StoredRoomConfig
      const parsed = createRoomRequestSchema.safeParse(value)
      if (!parsed.success || !validRoomCode(value.roomCode)) return new Response('invalid', { status: 400 })
      this.config = { ...value, ...parsed.data }
      this.addAiParticipants()
      await this.persist()
      return new Response('created', { status: 201 })
    }

    if (url.pathname.endsWith('/websocket')) {
      if (!this.config) return new Response('Room not found', { status: 404 })
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
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
    const parsed = parseWireMessage(typeof message === 'string' ? message : new TextDecoder().decode(message))
    if (!parsed) {
      this.send(socket, { type: 'error', code: 'invalid_message', message: 'That room message was invalid.', recoverable: true })
      return
    }
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    if (parsed.type === 'hello') {
      await this.handleHello(socket, parsed)
      return
    }
    const participant = attachment?.participantId ? this.participants.get(attachment.participantId) : undefined
    if (!participant) {
      this.send(socket, { type: 'error', code: 'hello_required', message: 'Join the room before sending commands.', recoverable: false })
      return
    }
    await this.handleParticipantMessage(socket, participant, parsed)
  }

  override async webSocketClose(socket: WebSocket): Promise<void> {
    await this.ensureLoaded()
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    const participant = attachment?.participantId ? this.participants.get(attachment.participantId) : undefined
    if (!participant) return
    participant.connected = false
    participant.disconnectedAt = Date.now()
    this.transferHost()
    await this.persist()
    this.broadcastLobby()
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket)
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    const stored = await this.ctx.storage.get<{
      config: StoredRoomConfig | null
      participants: InternalParticipant[]
      game: GameState | null
    }>('room')
    if (stored) {
      this.config = stored.config
      this.participants = new Map(stored.participants.map((participant) => [participant.id, participant]))
      this.game = stored.game ? normalizeGameState(stored.game) : null
      if (this.game && this.game.phase !== 'finished') this.startLoop()
    }
    this.loaded = true
  }

  private addAiParticipants(): void {
    if (!this.config) return
    const maximum = this.config.mode === 'duel' ? 2 : 4
    const count = Math.min(this.config.aiSlots, maximum - 1)
    for (let index = maximum - count; index < maximum; index += 1) {
      const id = `ai-${index + 1}`
      this.participants.set(id, {
        id,
        guestId: id,
        profileId: null,
        displayName: ['Rookie', 'Rally', 'Pro', 'Ace'][index] ?? `AI ${index + 1}`,
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
    if (!this.config) return
    this.cleanupDisconnected()
    const reconnect = [...this.participants.values()].find((participant) =>
      !participant.isAi && participant.guestId === message.guestId && message.reconnectToken && participant.reconnectToken === message.reconnectToken,
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
    socket.serializeAttachment({ participantId: participant.id } satisfies SocketAttachment)
    await this.persist()
    this.send(socket, { type: 'welcome', version: PROTOCOL_VERSION, clientId: participant.id, reconnectToken: participant.reconnectToken, participant: this.publicParticipant(participant), lobby: this.lobby() })
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
      this.game = restartGame(this.game, (Date.now() >>> 0))
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
    if (!this.config || this.game) return
    const players = [...this.participants.values()].filter((participant) => participant.slot !== null)
    const humans = players.filter((participant) => !participant.isAi && participant.connected)
    const required = this.config.mode === 'duel' ? 2 : this.config.mode === 'arena' ? 3 : 4
    if (players.length < required || humans.length === 0 || humans.some((participant) => !participant.isReady)) return
    const orderedHumans = humans.sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
    const matchConfig = buildMatchConfig({
      mode: this.config.mode,
      humanPlayers: orderedHumans.map((participant) => ({ id: participant.id, name: participant.displayName, ability: participant.ability })),
      totalPlayers: this.config.mode === 'arena' ? Math.min(4, players.length) : required,
      aiDifficulty: this.config.aiDifficulty,
      itemIntensity: this.config.itemIntensity,
      mutator: this.config.mutator ?? 'none',
      seed: Date.now() >>> 0,
    })
    this.game = createGame(matchConfig)
    this.aiMemory = createAiMemory()
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
    for (const participant of this.participants.values()) {
      if (!participant.isAi && !participant.connected && participant.disconnectedAt && Date.now() - participant.disconnectedAt >= 2000) {
        const player = this.game.players[participant.id]
        if (player) { player.isAi = true; player.aiDifficulty = this.config?.aiDifficulty ?? 'rally' }
      }
    }
    const mergedInputs = { ...aiInputs(this.game, this.aiMemory), ...this.inputs }
    stepGame(this.game, mergedInputs)
    for (const input of Object.values(this.inputs)) input.abilityPressed = false
    if (
      this.game.tick % SNAPSHOT_EVERY_TICKS === 0
      // RoomClient renders effects from snapshots. Snapshot every event tick so
      // ordinary hits, skills, power-ups and warps cannot fall between the
      // three-tick cadence and disappear online.
      || this.game.events.length > 0
    ) this.broadcastSnapshot()
    for (const event of this.game.events) this.broadcast({ type: 'event', event })
    if (this.game.tick % 60 === 0 || this.game.phase === 'finished') await this.persist()
    if (this.game.phase === 'finished') {
      if (this.loop) clearInterval(this.loop)
      this.loop = null
      this.broadcast({ type: 'result', state: this.game })
      this.broadcastLobby()
    }
  }

  private transferHost(): void {
    const connected = [...this.participants.values()].filter((participant) => !participant.isAi && participant.connected)
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
    if (!this.config) throw new Error('Room is not configured')
    return {
      roomCode: this.config.roomCode,
      mode: this.config.mode,
      itemIntensity: this.config.itemIntensity,
      mutator: this.config.mutator ?? 'none',
      aiDifficulty: this.config.aiDifficulty,
      aiSlots: this.config.aiSlots,
      participants: [...this.participants.values()].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99)).map((participant) => this.publicParticipant(participant)),
      phase: this.game?.phase ?? 'lobby',
    }
  }

  private broadcastLobby(): void { if (this.config) this.broadcast({ type: 'lobby', lobby: this.lobby() }) }

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
    try { socket.send(encodeServerMessage(message)) } catch { /* the close handler owns cleanup */ }
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put('room', {
      config: this.config,
      participants: [...this.participants.values()],
      game: this.game,
    })
  }
}
