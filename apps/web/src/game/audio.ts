import type { AbilityId, GameEvent } from '@pongapp/game-core'

/**
 * A compact procedural sound engine. Every cue is layered from short Web Audio
 * voices, so online and local play share the same zero-download soundscape and
 * every skill remains recognisable even when the court is visually crowded.
 */
export class GameAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private muted = false

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.72, this.context.currentTime, 0.015)
    }
  }

  async unlock(): Promise<void> {
    if (this.muted) return
    if (!this.context) this.createGraph()
    if (this.context?.state === 'suspended') await this.context.resume()
  }

  async destroy(): Promise<void> {
    const context = this.context
    this.context = null
    this.master = null
    this.noiseBuffer = null
    if (context && context.state !== 'closed') await context.close()
  }

  play(event: GameEvent): void {
    if (this.muted || !this.context || !this.master) return

    if (event.type === 'countdown') {
      this.tone(event.value === 1 ? 660 : 440, 0.09, 0.055, 'sine')
    } else if (event.type === 'matchStart') {
      this.tone(520, 0.13, 0.055, 'triangle', 0, 780)
      this.tone(1040, 0.1, 0.035, 'sine', 0.07)
    } else if (event.type === 'hit') {
      const energy = Math.min(1, Math.max(0, event.speed / 1.25))
      this.noise(0.035, 0.018 + energy * 0.032, 2100 + energy * 2400)
      this.tone(event.perfect ? 180 : 250 + energy * 190, event.perfect ? 0.13 : 0.055, event.perfect ? 0.09 : 0.045, event.perfect ? 'square' : 'triangle')
      if (event.perfect) {
        this.tone(760, 0.12, 0.07, 'sine', 0.012, 1180)
        this.tone(1520, 0.07, 0.035, 'sine', 0.02)
      }
    } else if (event.type === 'rallyHot') {
      // Rises with each step, so the second milestone is audibly above the first.
      const base = event.multiplier >= 3 ? 880 : 660
      this.tone(base, 0.11, 0.05, 'triangle', 0, base * 1.5)
      this.tone(base * 1.5, 0.09, 0.032, 'sine', 0.06)
    } else if (event.type === 'score') {
      this.noise(0.24, 0.105, 1150)
      this.tone(82, 0.42, 0.15, 'sine', 0, 46)
      this.tone(220, 0.28, 0.08, 'sawtooth', 0.015, 720)
      this.tone(980, 0.16, 0.04, 'triangle', 0.11, 1380)
    } else if (event.type === 'ability') {
      this.ability(event.ability)
    } else if (event.type === 'powerUp') {
      this.tone(360, 0.22, 0.055, 'triangle', 0, 920)
      this.tone(720, 0.17, 0.035, 'sine', 0.05, 1240)
      this.noise(0.12, 0.026, 5200)
    } else if (event.type === 'powerUpSpawn') {
      this.tone(880, 0.14, 0.025, 'sine', 0, 1120)
    } else if (event.type === 'shield') {
      this.tone(112, 0.25, 0.11, 'square', 0, 74)
      this.tone(420, 0.18, 0.045, 'triangle', 0.02, 250)
      this.noise(0.16, 0.035, 680)
    } else if (event.type === 'warp') {
      this.tone(980, 0.19, 0.055, 'sine', 0, 130)
      this.noise(0.2, 0.04, 3400, 0, 420)
    } else if (event.type === 'matchEnd') {
      for (const [index, frequency] of [261.6, 329.6, 392, 523.3].entries()) {
        this.tone(frequency, 0.62, 0.045, 'sine', index * 0.055)
      }
      this.noise(0.45, 0.05, 2600)
    }
  }

  private createGraph(): void {
    const context = new AudioContext({ latencyHint: 'interactive' })
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.knee.value = 12
    compressor.ratio.value = 5
    compressor.attack.value = 0.003
    compressor.release.value = 0.18
    const master = context.createGain()
    master.gain.value = this.muted ? 0 : 0.72
    master.connect(compressor).connect(context.destination)

    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.5), context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1

    this.context = context
    this.master = master
    this.noiseBuffer = buffer
  }

  private ability(ability: AbilityId): void {
    if (ability === 'dash') {
      this.tone(180, 0.12, 0.065, 'sawtooth', 0, 820)
      this.noise(0.095, 0.038, 3800)
    } else if (ability === 'bend') {
      this.tone(340, 0.24, 0.05, 'sine', 0, 690)
      this.tone(356, 0.24, 0.035, 'sine', 0, 520)
    } else if (ability === 'guard') {
      this.tone(128, 0.28, 0.09, 'square', 0, 96)
      this.tone(256, 0.2, 0.045, 'triangle', 0.035)
    } else {
      this.tone(310, 0.09, 0.06, 'sine')
      this.tone(620, 0.12, 0.055, 'sine', 0.045)
      this.tone(930, 0.15, 0.04, 'sine', 0.09)
    }
  }

  private tone(
    frequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType = 'sine',
    delay = 0,
    slideTo?: number,
  ): void {
    const context = this.context
    const master = this.master
    if (!context || !master) return
    const start = context.currentTime + delay
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(Math.max(30, frequency), start)
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain).connect(master)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  private noise(duration: number, gainValue: number, filterFrequency: number, delay = 0, slideTo?: number): void {
    const context = this.context
    const master = this.master
    if (!context || !master || !this.noiseBuffer) return
    const start = context.currentTime + delay
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = this.noiseBuffer
    filter.type = 'bandpass'
    filter.Q.value = 0.72
    filter.frequency.setValueAtTime(filterFrequency, start)
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, start + duration)
    gain.gain.setValueAtTime(gainValue, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.connect(filter).connect(gain).connect(master)
    source.start(start)
    source.stop(start + duration)
  }
}
