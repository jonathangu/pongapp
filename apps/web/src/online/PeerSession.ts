import { restartCoopGame, restartVersusGame } from '@pongapp/game-core'
import type { OnlineGameState } from '@pongapp/protocol'
import { neutralControl, stepLocal, validControl, type Controls } from './LocalSimulation'

export interface PeerStatus { path: 'connecting' | 'local' | 'direct' | 'relay'; rtt: number | null; paused: boolean }
interface Frame { kind: 'frame'; epoch: string; state: OnlineGameState; controls: Controls; consumed: Controls }

/** One private peer, one canonical host, a predicted 60 Hz simulation on each phone. */
export class PeerSession {
  private pc: RTCPeerConnection | null = null
  private controlChannel: RTCDataChannel | null = null
  private stateChannel: RTCDataChannel | null = null
  private candidates: RTCIceCandidateInit[] = []
  private signalChain = Promise.resolve()
  private controls: Controls = {}
  private consumed: Controls = {}
  private state: OnlineGameState
  private epoch = ''
  private retiredEpochs = new Set<string>()
  private lastFrame = -1
  private lastPeerAt = performance.now()
  private lastTime = performance.now()
  private lastSend = 0
  private lastInput = 0
  private accumulator = 0
  private timer: number
  private statsTimer: number
  private ready = false
  private remoteActive = true
  private disposed = false
  private status: PeerStatus = { path: 'connecting', rtt: null, paused: true }

  constructor(private readonly id: string, private readonly remoteId: string, private readonly host: boolean,
    initial: OnlineGameState, private readonly relay: (data: string) => void,
    private readonly publish: (state: OnlineGameState) => void, private readonly report: (status: PeerStatus) => void) {
    this.state = structuredClone(initial)
    this.controls[id] = neutralControl(); this.controls[remoteId] = neutralControl()
    if (host) this.epoch = crypto.randomUUID()
    this.timer = window.setInterval(() => this.tick(), 1000 / 60)
    this.statsTimer = window.setInterval(() => { void this.stats(); this.send({ kind: 'ping', at: performance.now() }) }, 1000)
    void this.negotiate()
  }

  getState(): OnlineGameState { return this.state }
  setPaddle(paddle: number): void { this.controls[this.id]!.paddle = paddle; this.controls[this.id]!.seq += 1; this.sendControl() }
  tap(): void { this.controls[this.id]!.taps += 1; this.controls[this.id]!.seq += 1; this.sendControl() }
  flare(): void { this.controls[this.id]!.flares += 1; this.controls[this.id]!.seq += 1; this.sendControl() }
  rematch(): void {
    if (this.state.phase !== 'finished') return
    if (!this.host) { this.send({ kind: 'rematch' }); return }
    this.state = this.state.rulesetVersion === 6 ? restartVersusGame(this.state) : restartCoopGame(this.state)
    this.epoch = crypto.randomUUID(); this.lastFrame = -1
    this.controls[this.id]!.paddle = 0; this.controls[this.remoteId]!.paddle = 0
    this.consumed = structuredClone(this.controls)
    this.sendFrame(); this.publish(this.state)
  }
  receiveRelay(data: string): void { this.receive(data) }
  close(): void { this.disposed = true; clearInterval(this.timer); clearInterval(this.statsTimer); this.pc?.close() }

  private async negotiate(): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') { this.setStatus({ path: 'relay' }); return }
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); this.pc = pc
      pc.onicecandidate = ({ candidate }) => { if (candidate) this.relay(JSON.stringify({ kind: 'ice', candidate: candidate.toJSON() })) }
      pc.ondatachannel = ({ channel }) => this.attach(channel)
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') this.setStatus({ path: 'relay' })
      }
      if (this.host) {
        this.attach(pc.createDataChannel('controls', { ordered: true }))
        this.attach(pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }))
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer)
        this.relay(JSON.stringify({ kind: 'sdp', description: pc.localDescription }))
      }
    } catch { this.setStatus({ path: 'relay' }) }
  }
  private attach(channel: RTCDataChannel): void {
    if (channel.label === 'controls') this.controlChannel = channel
    else this.stateChannel = channel
    channel.onmessage = ({ data }) => { if (typeof data === 'string') this.receive(data) }
    channel.onopen = () => { this.setStatus({ path: 'direct' }); this.sendControl(); if (this.host) this.sendFrame(); void this.stats() }
    channel.onclose = () => this.setStatus({ path: 'relay' })
    channel.onerror = () => this.setStatus({ path: 'relay' })
  }
  private receive(raw: string): void {
    if (this.disposed || raw.length > 60000) return
    let m: Record<string, unknown>
    try { m = JSON.parse(raw) as Record<string, unknown>; if (!m || typeof m !== 'object') return } catch { return }
    if (m.kind === 'sdp' || m.kind === 'ice') {
      this.signalChain = this.signalChain.then(async () => {
        const pc = this.pc; if (!pc || this.disposed) return
        if (m.kind === 'sdp') {
          const description = m.description as RTCSessionDescriptionInit
          if (!description || (this.host ? description.type !== 'answer' : description.type !== 'offer')) return
          await pc.setRemoteDescription(description)
          for (const candidate of this.candidates.splice(0)) await pc.addIceCandidate(candidate)
          if (!this.host) { const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); this.relay(JSON.stringify({ kind: 'sdp', description: pc.localDescription })) }
        } else if (m.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(m.candidate as RTCIceCandidateInit)
          else this.candidates.push(m.candidate as RTCIceCandidateInit)
        }
      }).catch(() => this.setStatus({ path: 'relay' }))
      return
    }
    this.lastPeerAt = performance.now()
    if (m.kind === 'input' && validControl(m.control)) {
      this.remoteActive = m.active !== false
      if (m.control.seq >= this.controls[this.remoteId]!.seq && m.control.taps-this.controls[this.remoteId]!.taps<=64 && m.control.flares-this.controls[this.remoteId]!.flares<=64) this.controls[this.remoteId] = { ...m.control }
      if (this.host && !this.ready) { this.ready = true; this.sendFrame() }
    } else if (m.kind === 'frame' && !this.host) {
      const f = m as unknown as Frame
      if (typeof f.epoch !== 'string' || !f.state || f.state.rulesetVersion !== this.state.rulesetVersion || !Number.isSafeInteger(f.state.tick)) return
      if (this.retiredEpochs.has(f.epoch)) return
      if (!f.controls || !f.consumed || !validControl(f.controls[this.id]) || !validControl(f.controls[this.remoteId])) return
      if (f.epoch === this.epoch && f.state.tick <= this.lastFrame) return
      const fresh = f.epoch !== this.epoch
      if (fresh && this.epoch) this.retiredEpochs.add(this.epoch)
      const oldTick = this.state.tick
      const own = this.controls[this.id]!
      this.epoch = f.epoch; this.lastFrame = f.state.tick
      this.state = structuredClone(f.state); this.consumed = structuredClone(f.consumed)
      this.controls = structuredClone(f.controls)
      // Reapply locally issued controls not yet represented by the host snapshot.
      if (!fresh && own.seq > this.controls[this.id]!.seq) this.controls[this.id] = own
      const ahead = fresh ? 0 : Math.min(8, Math.max(0, oldTick - this.state.tick, Math.round((this.status.rtt ?? 0) * .03)))
      for (let i = 0; i < ahead; i += 1) stepLocal(this.state, this.controls, this.consumed)
      this.ready = true; this.publish(this.state)
    } else if (m.kind === 'ping' && typeof m.at === 'number') this.send({ kind: 'pong', at: m.at })
    else if (m.kind === 'pong' && typeof m.at === 'number') this.setStatus({ rtt: Math.round(Math.max(0, performance.now() - m.at)) })
    else if (m.kind === 'rematch' && this.host) this.rematch()
  }
  private tick(): void {
    const now = performance.now()
    const elapsed = Math.min(100, now - this.lastTime); this.lastTime = now
    const paused = !this.ready || !this.remoteActive || now - this.lastPeerAt > 1600 || document.visibilityState === 'hidden'
    if (paused !== this.status.paused) this.setStatus({ paused })
    if (now - this.lastInput >= 100) { this.sendControl(); this.lastInput = now }
    if (!paused) {
      this.accumulator += elapsed
      let steps = 0
      while (this.accumulator >= 1000 / 60 && steps < 6) {
        stepLocal(this.state, this.controls, this.consumed); this.accumulator -= 1000 / 60; steps += 1
      }
      if (steps) this.publish(this.state)
    } else this.accumulator = 0
    if (this.host && this.ready && now - this.lastSend >= (this.direct() ? 50 : 100)) { this.sendFrame(); this.lastSend = now }
    if (this.status.path === 'connecting' && now - this.lastPeerAt < 150 && this.ready) this.setStatus({ path: 'relay' })
  }
  private sendControl(): void { this.send({ kind: 'input', control: this.controls[this.id], active: document.visibilityState === 'visible' }) }
  private sendFrame(): void { this.send({ kind: 'frame', epoch: this.epoch, state: this.state, controls: this.controls, consumed: this.consumed }, true) }
  private direct(): boolean { return this.controlChannel?.readyState === 'open' && this.pc?.connectionState === 'connected' }
  private send(message: unknown, snapshot = false): void {
    if (this.disposed) return
    const raw = JSON.stringify(message)
    const channel = snapshot ? this.stateChannel : this.controlChannel
    if (this.direct() && channel?.readyState === 'open' && channel.bufferedAmount < 32000) {
      try { channel.send(raw); return } catch { /* relay resumes the same simulation */ }
    }
    this.relay(raw)
  }
  private setStatus(patch: Partial<PeerStatus>): void { this.status = { ...this.status, ...patch }; if (!this.disposed) this.report(this.status) }
  private async stats(): Promise<void> {
    const pc = this.pc; if (!pc || !this.direct()) return
    try {
      const stats = await pc.getStats()
      let selected: string | undefined
      stats.forEach((s) => { if (s.type === 'transport') selected = s.selectedCandidatePairId })
      stats.forEach((s) => {
        if (s.type !== 'candidate-pair' || !(selected ? s.id === selected : s.nominated && s.state === 'succeeded')) return
        const local = stats.get(s.localCandidateId); const remote = stats.get(s.remoteCandidateId)
        this.setStatus({ path: local?.candidateType === 'host' && remote?.candidateType === 'host' ? 'local' : local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relay' : 'direct' })
      })
    } catch { /* retain the observed path */ }
  }
}

export function peerLabel(status?: PeerStatus | null): string {
  if (!status) return 'Connecting phones'
  const name = status.path === 'local' ? 'Local Wi-Fi' : status.path === 'direct' ? 'Direct peer' : status.path === 'relay' ? 'Relay' : 'Connecting'
  return `${name}${status.rtt === null ? '' : ` · ${status.rtt}ms`}`
}
