import type { RescueEvent, RescueState } from '@pongapp/game-core'

// Original score: Lantern Wake. D major / B minor, 84 BPM, 16-bar phrase.
// Authored here, synthesized locally; no streamed audio, sampled recording or generation API.
export const LANTERN_CHORDS = [[50, 57, 61, 66], [47, 54, 59, 62], [43, 50, 57, 62], [45, 52, 57, 61], [50, 57, 62, 66], [54, 57, 61, 64], [43, 50, 55, 59], [45, 52, 57, 64]]
export const LANTERN_MELODY = [74, 0, 78, 76, 0, 74, 69, 0, 71, 74, 0, 78, 76, 0, 74, 0, 71, 0, 74, 73, 69, 0, 66, 0, 69, 73, 0, 76, 74, 0, 0, 0]
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
export interface RescueAudioSettings { music: number; effects: number }
export class RescueAudio {
  private context: AudioContext | null = null
  private music: GainNode | null = null
  private fx: GainNode | null = null
  private reverb: ConvolverNode | null = null
  private noise: AudioBuffer | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private nextBeat = 0
  private beat = 0
  private intensity = 0
  private lastEvent = 0
  private epoch = 0
  private settings: RescueAudioSettings = { music: .5, effects: .65 }
  private voices = 0
  private analyser: AnalyserNode | null = null
  private samples = new Float32Array(256)
  private disposed = false
  private visibility = () => { if (document.hidden) void this.context?.suspend(); else if (!this.disposed) void this.context?.resume().catch(() => {}) }
  async unlock() {
    if (this.disposed) return
    if (!this.context) {
      const c = new AudioContext(); this.context = c
      const master = c.createGain(); master.gain.value = .7
      const limiter = c.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 8; master.connect(limiter)
      this.analyser = c.createAnalyser(); this.analyser.fftSize = 256; limiter.connect(this.analyser); this.analyser.connect(c.destination)
      this.music = c.createGain(); this.fx = c.createGain(); this.music.connect(master); this.fx.connect(master)
      this.reverb = c.createConvolver(); const impulse = c.createBuffer(2, Math.floor(c.sampleRate * 1.7), c.sampleRate)
      let seed = 9372
      for (let channel = 0; channel < 2; channel++) { const data = impulse.getChannelData(channel); for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = (seed / 0xffffffff * 2 - 1) * Math.exp(-i / c.sampleRate * 4) * .25 } }
      this.reverb.buffer = impulse; const wet = c.createGain(); wet.gain.value = .22; this.reverb.connect(wet); wet.connect(this.music)
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
      const data = this.noise.getChannelData(0); let previous = 0
      for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; previous = (previous + (seed / 0xffffffff * 2 - 1) * .08) / 1.025; data[i] = previous * 4 }
      this.nextBeat = c.currentTime + .1; this.setSettings(this.settings)
      this.timer = setInterval(() => this.schedule(), 60); document.addEventListener('visibilitychange', this.visibility)
    }
    await this.context.resume()
  }
  setSettings(settings: RescueAudioSettings) {
    this.settings = settings
    const at = this.context?.currentTime ?? 0
    this.music?.gain.setTargetAtTime(settings.music * .35, at, .08); this.fx?.gain.setTargetAtTime(settings.effects * .5, at, .08)
  }
  private note(midi: number, at: number, length: number, volume: number, target: GainNode, kind: OscillatorType = 'sine', slide?: number) {
    const c = this.context!
    if (this.voices > 96) return
    this.voices++
    const osc = c.createOscillator(), gain = c.createGain(), filter = c.createBiquadFilter()
    osc.type = kind; osc.frequency.setValueAtTime(frequency(midi), at)
    if (slide !== undefined) osc.frequency.exponentialRampToValueAtTime(frequency(slide), at + length)
    filter.type = 'lowpass'; filter.frequency.value = kind === 'sawtooth' ? 950 : 4000
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(Math.max(.0001, volume), at + Math.min(.035, length / 8)); gain.gain.exponentialRampToValueAtTime(.0001, at + length)
    osc.connect(filter); filter.connect(gain); gain.connect(target)
    if (target === this.music && this.reverb) gain.connect(this.reverb)
    osc.start(at); osc.stop(at + length + .03)
    osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); this.voices-- }
  }
  private hiss(at: number, length: number, volume: number, frequency: number, target: GainNode) {
    if (!this.noise || this.voices > 96) return
    const c = this.context!, source = c.createBufferSource(), gain = c.createGain(), filter = c.createBiquadFilter()
    this.voices++; source.buffer = this.noise; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = frequency
    gain.gain.setValueAtTime(Math.max(.0001, volume), at); gain.gain.exponentialRampToValueAtTime(.0001, at + length)
    source.connect(filter); filter.connect(gain); gain.connect(target); source.start(at); source.stop(at + length)
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.voices-- }
  }
  private schedule() {
    const c = this.context
    if (!c || c.state !== 'running' || !this.music || this.disposed) return
    if (this.nextBeat < c.currentTime) this.nextBeat = c.currentTime + .06
    const eighth = 60 / 84 / 2
    while (this.nextBeat < c.currentTime + .2) {
      const beat = this.beat++, chord = LANTERN_CHORDS[Math.floor(beat / 16) % LANTERN_CHORDS.length]!, at = this.nextBeat
      if (beat % 8 === 0) for (const tone of chord) this.note(tone + 12, at, 3.8, .065, this.music, 'triangle')
      this.note(chord[[0, 2, 1, 3, 2, 1, 3, 2][beat % 8]!]! + 12, at, 1.1, .11, this.music)
      if (beat % 4 === 0) this.note(chord[0]! - 12, at, 1.25, .16, this.music, 'triangle')
      const melody = LANTERN_MELODY[beat % 32]!
      if (melody && Math.floor(beat / 32) % 2 === 0) { this.note(melody, at, 1.1, .105, this.music); this.note(melody + 12, at, .5, .02, this.music) }
      if (beat % 4 === 0) this.note(42, at, .18, .07 + this.intensity * .16, this.music, 'sine', 23)
      if (beat % 4 === 2) this.hiss(at, .14, .045 + this.intensity * .07, 1900, this.music)
      if (this.intensity > .3) this.hiss(at, .035, .018 * this.intensity, 8000, this.music)
      if (this.intensity > .5 && beat % 2 === 0) this.note(chord[beat % 4]! + 12, at, .13, .06 * this.intensity, this.music, 'sawtooth')
      this.nextBeat += eighth
    }
  }
  update(s: RescueState) {
    this.intensity = Math.min(1, s.enemies.length / 8 + (s.ship.hp < 5 ? .35 : 0) + s.weather.intensity * .25)
    if (this.epoch !== s.epoch) { this.epoch = s.epoch; this.lastEvent = 0 }
    if (!this.context || this.context.state !== 'running' || !this.fx) return
    for (const e of s.events) { if (e.id <= this.lastEvent) continue; this.lastEvent = e.id; this.event(e) }
  }
  private event(e: RescueEvent) {
    const c = this.context!, fx = this.fx!, at = c.currentTime
    if (e.kind === 'shot') this.note(e.value ? 58 : 85, at, .10, .1, fx, 'triangle', e.value ? 48 : 66)
    else if (e.kind === 'beam' || e.kind === 'starburst') { this.note(95, at, .65, .25, fx, 'sawtooth', 39); this.hiss(at, .5, .15, 2800, fx) }
    else if (e.kind === 'together') { for (const [i, n] of [62, 69, 74, 81].entries()) this.note(n, at + i * .05, .6, .14, fx, 'triangle'); this.hiss(at, .3, .12, 1800, fx) }
    else if (e.kind === 'shield') { this.note(86, at, .28, .18, fx); this.note(93, at, .36, .1, fx) }
    else if (e.kind === 'hit' || e.kind === 'boom') { this.hiss(at, e.kind === 'boom' ? .7 : .15, .25, 1000, fx); this.note(43, at, .28, .2, fx, 'sine', 22) }
    else if (e.kind === 'thunder') { this.hiss(at, 1.8, .65, 450, fx); this.note(29, at, 1.4, .24, fx, 'sine', 17) }
    else if (['rescue', 'recruit', 'reunion', 'win', 'meal', 'upgrade', 'socket'].includes(e.kind)) for (const [i, n] of [74, 78, 81, 86].entries()) this.note(n, at + i * .10, .8, .16, fx)
    else if (e.kind === 'lose') for (const [i, n] of [62, 59, 54, 47].entries()) this.note(n, at + i * .22, 1.4, .16, fx, 'triangle')
    else if (e.kind === 'seat' || e.kind === 'order' || e.kind === 'dock') this.note(e.kind === 'dock' ? 62 : 79, at, .15, .1, fx)
  }
  stats() { this.analyser?.getFloatTimeDomainData(this.samples); const rms = Math.sqrt(this.samples.reduce((sum, value) => sum + value * value, 0) / this.samples.length); return { state: this.context?.state ?? 'locked', voices: this.voices, beat: this.beat, music: this.settings.music, effects: this.settings.effects, rms } }
  dispose() { this.disposed = true; if (this.timer) clearInterval(this.timer); document.removeEventListener('visibilitychange', this.visibility); void this.context?.close() }
}
