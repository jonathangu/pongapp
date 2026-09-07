import { DurableObject } from 'cloudflare:workers'
import { validateVoyage } from '@pongapp/game-core'
import type { VoyageDirector } from './index'
import { MAX_RESCUE_CREW, MAX_RESCUE_HUMANS, RESCUE_CREW_COLORS, advanceRescueGame, applyRescueAction, createRescueCrew, createRescueGame, decodeRescueSave, neutralRescueInput, restartRescueGame, type RescueInput, type RescueState } from '@pongapp/game-core'
import { RESCUE_PROTOCOL_VERSION, encodeRescueMessage, parseRescueClientMessage, parseRescueRoomRequest, rescueFrame,
  type RescuePresence, type RescueRoomRequest, type RescueServerMessage } from '@pongapp/protocol'

interface RescueRoomEnv { RESCUE_ROOMS: DurableObjectNamespace<RescueRoom>; VOYAGES: DurableObjectNamespace<VoyageDirector> }
interface Member { id: string; guestId: string; name: string; token: string; connected: boolean; disconnectedAt: number | null; seq: number }
interface RecordData { protocol: number; config: RescueRoomRequest & { code: string }; state: RescueState; members: Member[]; started: boolean; savedAt: number }
interface Attachment { id: string | null; at: number; lastMessageAt: number; messages: number }
const STORAGE = 'starling-room-v1', GRACE = 20_000, ROOM_TTL = 24 * 60 * 60 * 1000

/** Separate endpoint and version protect the shipped classic modes during rollout. */
export class RescueRoom extends DurableObject<RescueRoomEnv> {
  private record: RecordData | null = null
  private inputs: Record<string, RescueInput> = {}
  private presses: Record<string, number> = {}
  private commands: Record<string, RescueInput> = {}
  private loop: ReturnType<typeof setInterval> | null = null
  private lastTime = 0
  private accumulator = 0
  private saving = false
  private eventQueue: RescueState['events'] = []
  private sinceFrame = 0
  private frameCount = 0
  constructor(ctx: DurableObjectState, env: RescueRoomEnv) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<RecordData>(STORAGE)
      if (stored?.protocol === RESCUE_PROTOCOL_VERSION && Date.now() - stored.savedAt < ROOM_TTL) {
        this.record = stored
        for (const member of stored.members) {
          member.connected = ctx.getWebSockets().some(socket => (socket.deserializeAttachment() as Attachment | null)?.id === member.id)
          member.disconnectedAt = member.connected ? null : Date.now()
          this.inputs[member.id] = neutralRescueInput(Math.max(0, member.seq))
        }
        stored.state.paused = true
        if (ctx.getWebSockets().length) this.start()
      }
    })
  }
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/configure' && request.method === 'POST') {
      if (this.record) return new Response('exists', { status: 409 })
      const raw = await request.json() as RescueRoomRequest & { code: string }, config = parseRescueRoomRequest(raw)
      if (!config || !/^[A-Z2-9]{6}$/.test(raw.code)) return new Response('invalid', { status: 400 })
      const state = (config.save ? decodeRescueSave(config.save) : null) ?? createRescueGame({ seed: config.seed, biome: config.biome, solo: true, story: config.story, players: [{ id: 'pending-host', name: config.name }] }); state.paused = true
      for (const crew of state.crew) if (crew.origin === 'human') { crew.pet = true; crew.lastSeq = -1; crew.lastButtons = 0 }
      delete config.save
      if (config.voyageKey && !state.voyage) {
        try { const response = await this.env.VOYAGES.get(this.env.VOYAGES.idFromName('ark-v1-global-budget')).fetch('https://voyage.internal/api/voyages?key=' + encodeURIComponent(config.voyageKey)); const result = await response.json() as { pack?: unknown }; const pack = validateVoyage(result.pack); if (pack?.source === 'generated') state.voyage = pack } catch { /* Read-only cached recipe lookup: opening a game never generates or spends. */ }
      }
      this.record = { protocol: RESCUE_PROTOCOL_VERSION, config: { ...config, code: raw.code }, state, members: [], started: false, savedAt: Date.now() }
      await this.persist(); await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL)
      return new Response('created', { status: 201 })
    }
    if (!this.record) return new Response('Room not found or expired', { status: 404 })
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 })
    if (this.ctx.getWebSockets().length >= MAX_RESCUE_HUMANS + 4) return new Response('Room connections full', { status: 429 })
    const pair = new WebSocketPair(), client = pair[0], server = pair[1]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ id: null, at: Date.now(), lastMessageAt: Date.now(), messages: 0 } satisfies Attachment)
    this.start()
    return new Response(null, { status: 101, webSocket: client })
  }
  override async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || !this.record) return
    const attachment = socket.deserializeAttachment() as Attachment
    const now = Date.now()
    if (now - attachment.lastMessageAt >= 1000) { attachment.messages = 0; attachment.lastMessageAt = now }
    attachment.messages++; socket.serializeAttachment(attachment)
    if (attachment.messages > 100) { socket.close(4008, 'Input rate exceeded'); return }
    const message = parseRescueClientMessage(raw)
    if (!message) { this.send(socket, { type: 'error', code: 'refresh_required', message: 'Update the game and reopen this invitation.' }); socket.close(4002, 'Invalid protocol'); return }
    if (message.type === 'ping') { this.send(socket, { type: 'pong', at: message.at, serverAt: now }); return }
    if (message.type === 'hello') {
      if (attachment.id) return
      const r = this.record
      let member = r.members.find(m => m.guestId === message.guestId)
      if (member) {
        if (message.token !== member.token) { this.send(socket, { type: 'error', code: 'reconnect_token', message: 'This explorer is already in the ship. Reopen the original tab.' }); socket.close(4003, 'Invalid reconnect token'); return }
        for (const other of this.ctx.getWebSockets()) if (other !== socket && (other.deserializeAttachment() as Attachment).id === member.id) other.close(4001, 'Explorer moved to another tab')
      } else {
        if (r.members.length >= MAX_RESCUE_HUMANS) {
          const retired = r.members.find(m => !m.connected && m.disconnectedAt && now - m.disconnectedAt > GRACE)
          if (retired) r.members = r.members.filter(m => m.id !== retired.id)
          else { this.send(socket, { type: 'error', code: 'room_full', message: `This ship has reached its ${MAX_RESCUE_HUMANS}-player capacity. Start another expedition.` }); socket.close(4004, 'Room full'); return }
        }
        member = { id: crypto.randomUUID(), guestId: message.guestId, name: message.name, token: crypto.randomUUID() + crypto.randomUUID(), connected: true, disconnectedAt: null, seq: -1 }
        let crew = r.state.crew.find(c => c.origin === 'human' && !r.members.some(m => m.id === c.id))
        if (!crew && r.state.story) crew = r.state.crew.find(c => c.id === r.state.story!.sonId && c.pet && !r.members.some(m => m.id === c.id))
        if (!crew) {
          if (r.state.crew.length >= MAX_RESCUE_CREW) { this.send(socket, { type: 'error', code: 'crew_full', message: 'The ship roster is full.' }); return }
          crew = createRescueCrew(member.id, member.name, true); crew.x = (r.members.length % 6 - 2.5) * .55; r.state.crew.push(crew)
        }
        r.members.push(member)
        const previousId = crew.id
        crew.id = member.id; crew.name = member.name; crew.pet = false; crew.origin = 'human'; crew.color = RESCUE_CREW_COLORS[(r.members.length - 1) % RESCUE_CREW_COLORS.length]!
        if (r.state.story?.motherId === previousId) r.state.story.motherId = crew.id
        if (r.state.story?.sonId === previousId) { r.state.story.sonId = crew.id; crew.color = 'gold'; crew.commandSeq = -1 }
        for (const gem of r.state.gems) if (gem.heldBy === previousId) gem.heldBy = crew.id
      }
      member.connected = true; member.disconnectedAt = null
      const crew = r.state.crew.find(p => p.id === member!.id)!
      crew.pet = false; this.inputs[member.id] = neutralRescueInput(Math.max(0, member.seq))
      delete this.presses[member.id]; delete this.commands[member.id]
      attachment.id = member.id; socket.serializeAttachment(attachment)
      r.started = true; r.state.paused = false; r.state.solo = r.members.filter(m => m.connected).length <= 1
      this.send(socket, { type: 'welcome', version: RESCUE_PROTOCOL_VERSION, playerId: member.id, token: member.token, code: r.config.code, state: r.state, presence: this.presence(), started: r.started })
      this.broadcast(true); await this.persist(); this.start(); return
    }
    const member = this.record.members.find(m => m.id === attachment.id)
    if (!member) return
    if (message.type === 'input') {
      if (message.epoch !== this.record.state.epoch || message.input.seq <= member.seq) return
      member.seq = message.input.seq
      if (message.input.active) {
        this.presses[member.id] = (this.presses[member.id] ?? 0) | message.input.buttons & ~(this.inputs[member.id]?.buttons ?? 0)
        if (message.input.command) this.commands[member.id] = message.input
      } else { delete this.presses[member.id]; delete this.commands[member.id] }
      this.inputs[member.id] = message.input
    } else if (message.type === 'action' && message.epoch === this.record.state.epoch) {
      const host = this.record.members.find(m => m.connected)
      if (host?.id !== member.id) { this.send(socket, { type: 'error', code: 'host_action', message: 'The connected captain chooses the shared story, docking, crew and ship upgrades.' }); return }
      const updated = applyRescueAction(this.record.state, message.action)
      if (!updated) { this.send(socket, { type: 'error', code: 'action_unavailable', message: 'Approach slowly, dock first, or check your available salvage.' }); return }
      const changed = updated.epoch !== this.record.state.epoch
      this.record.state = updated
      if (changed) { this.presses = {}; this.commands = {}; for (const m of this.record.members) { m.seq = -1; this.inputs[m.id] = neutralRescueInput() } }
      this.eventQueue.push(...updated.events); this.broadcastWelcomeStates(); await this.persist()
    } else if (message.type === 'rematch' && message.epoch === this.record.state.epoch && this.record.state.phase !== 'playing' && !this.record.state.story?.pending && this.record.members.find(m => m.connected)?.id === member.id) {
      this.record.state = restartRescueGame(this.record.state, message.next && this.record.state.phase === 'won')
      this.record.state.paused = !this.record.members.some(m => m.connected)
      this.presses = {}; this.commands = {}
      for (const m of this.record.members) { m.seq = -1; this.inputs[m.id] = neutralRescueInput() }
      this.eventQueue = []; this.broadcastWelcomeStates(); await this.persist()
    }
  }
  override async webSocketClose(socket: WebSocket) { await this.disconnected(socket) }
  override async webSocketError(socket: WebSocket) { await this.disconnected(socket) }
  override async alarm() {
    if (!this.ctx.getWebSockets().length) { this.stop(); this.record = null; await this.ctx.storage.deleteAll() }
    else await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL)
  }
  private async disconnected(socket: WebSocket) {
    if (!this.record) return
    const id = (socket.deserializeAttachment() as Attachment | null)?.id
    if (this.ctx.getWebSockets().some(other => other !== socket && other.readyState === WebSocket.OPEN && (other.deserializeAttachment() as Attachment | null)?.id === id)) return
    const member = this.record.members.find(m => m.id === id)
    if (member) { member.connected = false; member.disconnectedAt = Date.now(); this.inputs[member.id] = neutralRescueInput(Math.max(0, member.seq)); this.record.state.paused = !this.record.members.some(m => m.connected); this.record.state.solo = this.record.members.filter(m => m.connected).length <= 1 }
    this.broadcast(true); await this.persist()
    if (!this.record.members.some(m => m.connected)) this.stop()
  }
  private presence(): RescuePresence[] { return this.record!.members.map(m => ({ id: m.id, name: m.name, connected: m.connected, pet: this.record!.state.crew.find(c => c.id === m.id)?.pet ?? false })) }
  private start() {
    if (this.loop) return
    this.lastTime = Date.now(); this.accumulator = 0
    this.loop = setInterval(() => this.tick(), 1000 / 60)
  }
  private stop() { if (this.loop) clearInterval(this.loop); this.loop = null }
  private tick() {
    const r = this.record
    if (!r) { this.stop(); return }
    const now = Date.now(), elapsed = Math.max(0, Math.min(100, now - this.lastTime)); this.lastTime = now
    for (const socket of this.ctx.getWebSockets()) { const a = socket.deserializeAttachment() as Attachment; if (!a.id && now - a.at > 10000) socket.close(4000, 'Hello timeout') }
    if (!r.members.some(m => m.connected)) { if (!this.ctx.getWebSockets().length) this.stop(); return }
    for (const member of r.members) if (!member.connected && member.disconnectedAt && now - member.disconnectedAt > GRACE) {
      const crew = r.state.crew.find(c => c.id === member.id)!; crew.pet = true
    }
    if (r.started) { r.state.paused = !r.members.some(m => m.connected); r.state.solo = r.members.filter(m => m.connected).length <= 1 }
    this.accumulator += elapsed / 1000
    let steps = 0
    while (this.accumulator >= 1 / 60 && steps < 4) {
      if (r.started) {
        const sampled: Record<string, RescueInput> = {}
        for (const [id, input] of Object.entries(this.inputs)) {
          const command = this.commands[id]
          sampled[id] = { ...input, buttons: input.buttons | (this.presses[id] ?? 0), ...(command ? { command: command.command, commandCrew: command.commandCrew } : {}) }
        }
        advanceRescueGame(r.state, sampled); this.presses = {}; this.commands = {}; this.eventQueue.push(...r.state.events)
      }
      this.accumulator -= 1 / 60; steps++; this.sinceFrame++
    }
    if (steps === 4) this.accumulator = Math.min(this.accumulator, 1 / 60)
    if (this.sinceFrame >= 6) { this.sinceFrame = 0; this.broadcast(++this.frameCount % 10 === 0) }
    if (r.state.tick > 0 && r.state.tick % 180 === 0 && !this.saving) void this.persist()
  }
  private send(socket: WebSocket, message: RescueServerMessage) { try { socket.send(encodeRescueMessage(message)) } catch { /* close callback releases the seat */ } }
  private broadcast(fog = false) {
    if (!this.record) return
    const r = this.record, state = { ...r.state, events: this.eventQueue.slice(-120) }
    const frame = rescueFrame(state, Object.fromEntries(r.members.map(m => [m.id, m.seq])), this.presence(), r.started, fog)
    const encoded = encodeRescueMessage(frame)
    for (const socket of this.ctx.getWebSockets()) if ((socket.deserializeAttachment() as Attachment | null)?.id) try { socket.send(encoded) } catch { /* lifecycle callback */ }
    this.eventQueue = []
  }
  private broadcastWelcomeStates() {
    for (const socket of this.ctx.getWebSockets()) {
      const member = this.record!.members.find(m => m.id === (socket.deserializeAttachment() as Attachment | null)?.id)
      if (member) this.send(socket, { type: 'welcome', version: RESCUE_PROTOCOL_VERSION, playerId: member.id, token: member.token, code: this.record!.config.code, state: this.record!.state, presence: this.presence(), started: this.record!.started })
    }
  }
  private async persist() {
    if (!this.record || this.saving) return
    this.saving = true
    try { this.record.savedAt = Date.now(); await this.ctx.storage.put(STORAGE, this.record) } finally { this.saving = false }
  }
}
