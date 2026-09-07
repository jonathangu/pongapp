import { DurableObject } from 'cloudflare:workers'
import { applyMatchCommand, createMatchGame, createMatchParty, restoreMatchGame, type MatchParty, type MatchRole } from '@pongapp/game-core'
import { parsePuzzleClient, type PuzzlePresence, type PuzzleServerMessage } from '@pongapp/protocol'

type RecordData = { party: MatchParty; tokens: string[]; savedAt: number; trace: string }
type Attachment = { role: MatchRole | null; window: number; messages: number }
const KEY = 'puzzle-v1', TTL = 7 * 24 * 60 * 60 * 1000

/** Turn-based persistence, no simulation loop. Old rescue/arcade rooms are untouched. */
export class PuzzleRoom extends DurableObject {
  private record: RecordData | null = null
  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => { this.record = await ctx.storage.get<RecordData>(KEY) ?? null })
  }
  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/configure' && request.method === 'POST') {
      if (this.record) return new Response('exists', { status: 409 })
      const body = await request.json() as { game?: unknown }
      if (!body || typeof body !== 'object') return new Response('invalid', { status: 400 })
      const game = body.game ? restoreMatchGame(JSON.stringify(body.game)) : createMatchGame()
      if (!game) return new Response('invalid', { status: 400 })
      const token = crypto.randomUUID()
      this.record = { party: createMatchParty(game), tokens: [token], savedAt: Date.now(), trace: crypto.randomUUID().slice(0, 8) }
      await this.persist()
      return Response.json({ token }, { status: 201 })
    }
    if (!this.record) return new Response('Room expired', { status: 404 })
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 })
    if (this.ctx.getWebSockets().length >= 6) return new Response('Too many connections', { status: 429 })
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].serializeAttachment({ role: null, window: Date.now(), messages: 0 } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: pair[0] })
  }
  override async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || !this.record) return
    await this.ctx.blockConcurrencyWhile(async () => {
      const record = this.record!, attachment = socket.deserializeAttachment() as Attachment, now = Date.now()
      if (now - attachment.window > 1000) { attachment.window = now; attachment.messages = 0 }
      attachment.messages++; socket.serializeAttachment(attachment)
      if (attachment.messages > 20) { socket.close(4008, 'Slow down'); return }
      const message = parsePuzzleClient(raw)
      if (!message) { this.send(socket, { type: 'error', code: 'invalid' }); return }
      if (message.type === 'ping') { this.send(socket, { type: 'pong' }); return }
      if (message.type === 'hello') {
        if (attachment.role !== null) return
        let role = message.token ? record.tokens.indexOf(message.token) : -1
        if (message.token && role === -1) { this.send(socket, { type: 'error', code: 'invalid' }); socket.close(4003, 'Invalid token'); return }
        if (role === -1) {
          if (record.tokens.length >= 2) { this.send(socket, { type: 'error', code: 'full' }); socket.close(4004, 'Two people aboard'); return }
          role = 1; record.tokens.push(crypto.randomUUID())
        }
        attachment.role = role as MatchRole; socket.serializeAttachment(attachment)
        for (const other of this.ctx.getWebSockets()) if (other !== socket && (other.deserializeAttachment() as Attachment).role === role) {
          this.send(other, { type: 'error', code: 'replaced' }); other.close(4001, 'Reopened')
        }
        await this.persist()
        this.send(socket, { type: 'welcome', version: 1, token: record.tokens[role]!, role: role as MatchRole, party: record.party, presence: this.presence() })
        this.broadcast({ type: 'presence', presence: this.presence() })
        this.log('joined', role); return
      }
      if (attachment.role === null) { this.send(socket, { type: 'error', code: 'invalid' }); return }
      const before = record.party.game
      const command = message.type === 'swap' ? { kind: 'swap' as const, revision: message.revision, a: message.a, b: message.b } : { kind: message.type, revision: message.revision }
      const result = applyMatchCommand(record.party, attachment.role, command)
      if (!result.accepted) {
        this.send(socket, { type: 'error', code: result.reason ?? 'unavailable' })
        this.send(socket, { type: 'state', party: record.party, presence: this.presence() }); return
      }
      record.party = result.party
      await this.persist()
      this.broadcast({ type: 'state', party: record.party, presence: this.presence(), ...(message.type === 'swap' ? { move: { before, a: message.a, b: message.b, role: attachment.role, teamwork: Boolean(result.teamwork) } } : {}) })
      if (message.type === 'next') this.log('next_level', attachment.role)
    })
  }
  override async webSocketClose(socket: WebSocket) { try { socket.close() } catch {} this.broadcast({ type: 'presence', presence: this.presence(socket) }) }
  override async webSocketError(socket: WebSocket) { this.broadcast({ type: 'presence', presence: this.presence(socket) }) }
  override async alarm() {
    if (!this.ctx.getWebSockets().length) { await this.ctx.storage.deleteAll(); this.record = null }
    else await this.ctx.storage.setAlarm(Date.now() + TTL)
  }
  private presence(exclude?: WebSocket): PuzzlePresence {
    return [0, 1].map(role => this.ctx.getWebSockets().some(socket => socket !== exclude && (socket.deserializeAttachment() as Attachment).role === role)) as PuzzlePresence
  }
  private send(socket: WebSocket, message: PuzzleServerMessage) { try { socket.send(JSON.stringify(message)) } catch {} }
  private broadcast(message: PuzzleServerMessage) { for (const socket of this.ctx.getWebSockets()) this.send(socket, message) }
  private async persist() { if (this.record) { this.record.savedAt = Date.now(); await this.ctx.storage.put(KEY, this.record); await this.ctx.storage.setAlarm(Date.now() + TTL) } }
  private log(action: string, role: number) { console.info({ event: 'starling.puzzle.room.v1', action, supportTraceId: this.record?.trace, role, level: this.record?.party.game.level, revision: this.record?.party.revision }) }
}
