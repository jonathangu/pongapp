import { advanceRescueGame, applyRescueAction, createRescueGame, encodeRescueSave, neutralRescueInput, restartRescueGame, resumeRescueSolo, type RescueAction, type RescueInput, type RescueState, type VoyagePack } from '@pongapp/game-core'
import { mergeRescueFrame, RESCUE_PROTOCOL_VERSION, type RescuePresence, type RescueServerMessage } from '@pongapp/protocol'

export type RescueSessionOptions = { name: string; guestId: string; saved?: RescueState; online?: boolean; code?: string; server: string; voyage?: VoyagePack }
export const SAVE_KEY = 'starling-rescue.save.v2'
export class RescueSession {
  state: RescueState
  authoritative: RescueState
  playerId: string
  code: string | null = null
  presence: RescuePresence[] = []
  status = 'Setting sail'
  error = ''
  latency = 0
  connected = false
  private socket: WebSocket | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private abort = new AbortController()
  private disposed = false
  private pending: RescueInput[] = []
  private seq = 0
  private counter = 0
  private lastSentButtons = 0
  private attempts = 0
  private token = ''
  private lastSaved = 0
  private lastSavedTick = -1
  private connecting = false
  private terminal = false
  private lastReceived = 0
  private connectionCheck: ReturnType<typeof setInterval> | null = null
  private offline = () => {
    if (this.disposed || this.terminal) return
    this.clearRetry(); this.releaseSocket(); this.connected = false; this.pending = []
    this.status = 'Offline · your crew will hold the ship'
  }
  private online = () => {
    if (this.disposed || this.terminal || this.connected) return
    this.clearRetry(); this.attempts++; void this.connect()
  }
  constructor(readonly options: RescueSessionOptions) {
    this.state = options.saved ? resumeRescueSolo(options.saved) : createRescueGame({ players: [{ id: options.guestId, name: options.name }], seed: crypto.getRandomValues(new Uint32Array(1))[0]!, voyage: options.voyage?.source === 'generated' ? options.voyage : null })
    this.authoritative = this.state; this.playerId = this.state.crew.find(c => !c.pet)!.id
    if (options.online) {
      window.addEventListener('offline', this.offline); window.addEventListener('online', this.online)
      this.connectionCheck = setInterval(() => {
        if (this.disposed || this.terminal || !this.socket || performance.now() - this.lastReceived < 8000) return
        this.clearRetry(); this.releaseSocket(); this.connected = false; this.pending = []
        this.status = 'Connection lost · your crew will hold the ship'
        if (navigator.onLine) { this.attempts++; void this.connect() }
      }, 1000)
      void this.connect()
    }
    else { this.connected = true; this.status = 'Solo · offline ready' }
  }
  get isHost() { return !this.options.online || this.presence.find(p => p.connected)?.id === this.playerId }
  private clearRetry() { if (this.retry) clearTimeout(this.retry); this.retry = null }
  private releaseSocket() {
    const socket = this.socket; this.socket = null
    if (!socket) return
    socket.onopen = null; socket.onmessage = null; socket.onclose = null; socket.onerror = null
    try { socket.close(1000, 'Connection recovery') } catch { /* A connecting or failed transport may already be closed. */ }
  }
  private async connect() {
    if (this.disposed || this.terminal || this.connecting || this.socket) return
    if (!navigator.onLine) { this.offline(); return }
    this.connecting = true
    try {
      if (!this.code) {
        this.code = this.options.code ?? null
        if (!this.code) {
          const response = await fetch(this.options.server + '/api/rescue/rooms', { method: 'POST', signal: this.abort.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: this.options.name, guestId: this.options.guestId, biome: this.state.biome, seed: this.state.initialSeed, ...(this.state.voyage?.source === 'generated' ? { voyageKey: this.state.voyage.key } : {}), ...(this.options.saved ? { save: encodeRescueSave(this.options.saved) } : {}) }) })
          if (!response.ok) throw new Error('The invitation could not be created. Try again when connected.')
          const body = await response.json() as { roomCode: string }; this.code = body.roomCode
        }
        try { this.token = localStorage.getItem(`starling.token.${this.code}.${this.options.guestId}`) ?? '' } catch { /* device storage optional */ }
      }
      if (this.disposed || !navigator.onLine) return
      this.status = this.attempts ? 'Reconnecting…' : 'Joining your ship…'
      this.lastReceived = performance.now()
      const socket = new WebSocket(this.options.server.replace(/^http/, 'ws') + `/api/rescue/rooms/${this.code}/websocket`); this.socket = socket
      socket.onopen = () => { if (this.socket === socket && !this.disposed) socket.send(JSON.stringify({ type: 'hello', version: RESCUE_PROTOCOL_VERSION, name: this.options.name, guestId: this.options.guestId, ...(this.token ? { token: this.token } : {}) })) }
      socket.onmessage = event => {
        if (this.disposed || this.socket !== socket || typeof event.data !== 'string') return
        this.lastReceived = performance.now()
        let message: RescueServerMessage
        try { message = JSON.parse(event.data) as RescueServerMessage } catch { this.error = 'An unreadable update arrived. Reconnect to continue.'; return }
        if (message.type === 'welcome') {
          this.authoritative = message.state; this.state = structuredClone(message.state); this.playerId = message.playerId; this.token = message.token; this.presence = message.presence
          this.seq = Math.max(this.seq, (this.state.crew.find(c => c.id === this.playerId)?.lastSeq ?? -1) + 1); this.pending = []
          this.connected = true; this.attempts = 0; this.error = ''; this.status = `Online · ${message.code}`
          try { localStorage.setItem(`starling.token.${message.code}.${this.options.guestId}`, message.token) } catch { /* ephemeral reconnect still works */ }
          history.replaceState(null, '', `#/rescue/${message.code}`)
        } else if (message.type === 'frame' && this.connected) {
          if (message.state.epoch !== this.authoritative.epoch || message.state.tick < this.authoritative.tick) return
          this.authoritative = mergeRescueFrame(this.authoritative, message); this.presence = message.presence
          this.pending = this.pending.filter(i => i.seq > (message.acks[this.playerId] ?? -1)).slice(-12)
          this.state = structuredClone(this.authoritative)
          const events = this.state.events
          for (const input of this.pending) advanceRescueGame(this.state, { [this.playerId]: input })
          this.state.events = events
        } else if (message.type === 'pong') this.latency = Math.round(performance.now() - message.at)
        else if (message.type === 'error') this.error = message.message
      }
      socket.onclose = event => {
        if (this.socket !== socket) return
        this.socket = null
        this.connected = false; this.pending = []
        if (this.disposed) return
        if ([4001, 4002, 4003, 4004].includes(event.code)) { this.terminal = true; this.status = 'Connection closed'; if (!this.error) this.error = 'This invitation needs a fresh tab or game update.'; return }
        this.status = 'Connection lost · your crew will hold the ship'
        this.clearRetry()
        if (navigator.onLine) this.retry = setTimeout(() => { this.retry = null; this.attempts++; void this.connect() }, Math.min(10000, 700 * 2 ** this.attempts))
      }
      socket.onerror = () => { if (this.socket === socket && !this.disposed) this.status = 'Checking connection…' }
    } catch (error) { if (!this.disposed) { this.error = error instanceof Error ? error.message : 'Cannot connect right now.'; this.status = 'Offline' } }
    finally { this.connecting = false }
  }
  tick(input: RescueInput) {
    if (this.disposed || !this.connected) return
    input.seq = ++this.seq
    if (this.options.online) {
      this.pending.push({ ...input }); this.pending = this.pending.slice(-12)
      if (++this.counter % 2 === 0 || input.command || input.buttons !== this.lastSentButtons) { this.send({ type: 'input', epoch: this.state.epoch, input }); this.lastSentButtons = input.buttons }
      if (this.counter % 180 === 0) this.send({ type: 'ping', at: performance.now() })
    }
    advanceRescueGame(this.state, { [this.playerId]: input })
    if (!this.options.online) this.authoritative = this.state
    if (performance.now() - this.lastSaved > 15000 && this.authoritative.tick !== this.lastSavedTick) this.save()
  }
  private send(message: unknown) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)) }
  command(station: RescueInput['command'], crew: string) {
    const input = neutralRescueInput(++this.seq); input.command = station; input.commandCrew = crew
    if (this.options.online) this.send({ type: 'input', epoch: this.state.epoch, input })
    advanceRescueGame(this.state, { [this.playerId]: input })
  }
  action(action: RescueAction) {
    this.error = ''
    if (this.options.online) this.send({ type: 'action', epoch: this.state.epoch, action })
    else { const next = applyRescueAction(this.state, action); if (next) { this.state = next; this.authoritative = next; this.save() } else this.error = 'Approach a dock slowly, or check your salvage.' }
  }
  rematch(next: boolean) {
    if (this.options.online) this.send({ type: 'rematch', epoch: this.state.epoch, next })
    else { this.state = restartRescueGame(this.state, next && this.state.phase === 'won'); this.authoritative = this.state; this.save() }
  }
  save() {
    this.lastSaved = performance.now(); this.lastSavedTick = this.authoritative.tick
    try { const raw = encodeRescueSave(this.authoritative); localStorage.setItem(SAVE_KEY, raw); return raw }
    catch { this.error = 'Device save unavailable. Use Export save to keep your voyage.'; return null }
  }
  exportSave() { return encodeRescueSave(this.authoritative) }
  dispose() {
    if (this.disposed) return
    this.save(); this.disposed = true; this.abort.abort(); this.clearRetry(); this.releaseSocket()
    if (this.connectionCheck) clearInterval(this.connectionCheck)
    window.removeEventListener('offline', this.offline); window.removeEventListener('online', this.online)
  }
}
