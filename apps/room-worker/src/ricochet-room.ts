import { DurableObject } from 'cloudflare:workers'
import { applyRicochetCommand, clearRicochetReadiness, createRicochetGame, createRicochetParty, restoreRicochetGame,
  type RicochetCommand, type RicochetParty, type Seat } from '@pongapp/game-core/ricochet'
import { parseRicochetClient, type RicochetPresence, type RicochetServerMessage } from '@pongapp/protocol/ricochet'

type RecordData = { party: RicochetParty; tokens: string[]; savedAt: number; trace: string }
type Attachment = { seat: Seat | null; window: number; messages: number }
const KEY = 'ricochet-v1', TTL = 7 * 24 * 60 * 60 * 1000

/** Additive experimental rooms. Hibernates between edits; no live physics tick. */
export class RicochetRoom extends DurableObject {
  private record: RecordData | null = null
  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => { this.record = await ctx.storage.get<RecordData>(KEY) ?? null })
  }
  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/configure' && request.method === 'POST') {
      if (this.record) return new Response('exists', { status: 409 })
      let body: { game?: unknown }
      try { body = await request.json() as { game?: unknown } } catch { return new Response('invalid', { status: 400 }) }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'game')) return new Response('invalid', { status: 400 })
      const game = Object.hasOwn(body, 'game') ? restoreRicochetGame(JSON.stringify(body.game)) : createRicochetGame()
      if (!game) return new Response('invalid', { status: 400 })
      const token = crypto.randomUUID()
      this.record = { party: createRicochetParty(game), tokens: [token], savedAt: Date.now(), trace: crypto.randomUUID().slice(0, 8) }
      await this.persist()
      return Response.json({ token }, { status: 201 })
    }
    if (!this.record) return new Response('Room expired', { status: 404 })
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 })
    if (this.ctx.getWebSockets().length >= 6) return new Response('Too many connections', { status: 429 })
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].serializeAttachment({ seat: null, window: Date.now(), messages: 0 } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: pair[0] })
  }
  override async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || !this.record) return
    await this.ctx.blockConcurrencyWhile(async () => {
      const record = this.record!, attachment = socket.deserializeAttachment() as Attachment, now = Date.now()
      if (now - attachment.window >= 1000) { attachment.window = now; attachment.messages = 0 }
      attachment.messages++; socket.serializeAttachment(attachment)
      if (attachment.messages > 20) { socket.close(4008, 'Slow down'); return }
      const message = parseRicochetClient(raw)
      if (!message) { this.send(socket, { type: 'error', code: 'invalid' }); return }
      if (message.type === 'ping') { this.send(socket, { type: 'pong', serverAt: now }); return }
      if (message.type === 'hello') {
        if (attachment.seat !== null) return
        let seat = message.token ? record.tokens.indexOf(message.token) : -1
        if (message.token && seat === -1) { this.send(socket, { type: 'error', code: 'invalid', fatal: true }); socket.close(4003, 'Invalid token'); return }
        if (seat === -1) {
          if (record.tokens.length >= 2) { this.send(socket, { type: 'error', code: 'full', fatal: true }); socket.close(4004, 'Two people aboard'); return }
          seat = 1; record.tokens.push(crypto.randomUUID())
        }
        attachment.seat = seat as Seat; socket.serializeAttachment(attachment)
        for (const other of this.ctx.getWebSockets()) if (other !== socket && (other.deserializeAttachment() as Attachment).seat === seat) {
          const old = other.deserializeAttachment() as Attachment; old.seat = null; other.serializeAttachment(old)
          this.send(other, { type: 'error', code: 'replaced', fatal: true }); other.close(4001, 'Reopened')
        }
        record.party = clearRicochetReadiness(record.party)
        await this.persist()
        this.send(socket, { type: 'welcome', version: 1, token: record.tokens[seat]!, seat: seat as Seat, party: record.party, presence: this.presence(), serverAt: now })
        this.broadcastState(); this.log('joined', seat); return
      }
      if (attachment.seat === null) { this.send(socket, { type: 'error', code: 'invalid', fatal: true }); socket.close(4003, 'Join first'); return }
      const { type, requestId, ...fields } = message
      const command = { kind: type, ...fields } as RicochetCommand
      const result = applyRicochetCommand(record.party, attachment.seat, command, now, this.presence())
      if (!result.accepted) {
        this.send(socket, { type: 'error', code: result.reason ?? 'unavailable', requestId })
        this.send(socket, { type: 'state', party: record.party, presence: this.presence(), serverAt: now }); return
      }
      record.party = result.party; await this.persist()
      this.broadcastState({ seat: attachment.seat, requestId })
      if (message.type === 'launch' || message.type === 'next') this.log(message.type, attachment.seat)
    })
  }
  override async webSocketClose(socket: WebSocket) { await this.disconnected(socket) }
  override async webSocketError(socket: WebSocket) { await this.disconnected(socket) }
  private async disconnected(socket: WebSocket) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const attachment = socket.deserializeAttachment() as Attachment | null
      if (attachment) { attachment.seat = null; socket.serializeAttachment(attachment) }
      try { socket.close() } catch { /* Already closed. */ }
      if (this.record && !this.presence().every(Boolean)) {
        const before = this.record.party; this.record.party = clearRicochetReadiness(before)
        if (this.record.party !== before) await this.persist()
      }
      this.broadcastState()
    })
  }
  override async alarm() {
    if (!this.ctx.getWebSockets().length) { await this.ctx.storage.deleteAll(); this.record = null }
    else await this.ctx.storage.setAlarm(Date.now() + TTL)
  }
  private presence(): RicochetPresence {
    return [0, 1].map(seat => this.ctx.getWebSockets().some(socket => socket.readyState === 1 && (socket.deserializeAttachment() as Attachment).seat === seat)) as RicochetPresence
  }
  private send(socket: WebSocket, message: RicochetServerMessage) { try { socket.send(JSON.stringify(message)) } catch { /* Close callback updates presence. */ } }
  private broadcastState(ack?: { seat: Seat; requestId: number }) {
    if (!this.record) return
    const message: RicochetServerMessage = { type: 'state', party: this.record.party, presence: this.presence(), serverAt: Date.now(), ...(ack ? { ack } : {}) }
    // Never send a party snapshot or token to an unauthenticated extra socket.
    for (const socket of this.ctx.getWebSockets()) if ((socket.deserializeAttachment() as Attachment).seat !== null) this.send(socket, message)
  }
  private async persist() { if (this.record) { this.record.savedAt = Date.now(); await this.ctx.storage.put(KEY, this.record); await this.ctx.storage.setAlarm(Date.now() + TTL) } }
  private log(action: string, seat: number) { console.info({ event: 'starling.ricochet.room.v1', action, supportTraceId: this.record?.trace,
    seat, scene: this.record?.party.game.scene, revision: this.record?.party.revision }) }
}
