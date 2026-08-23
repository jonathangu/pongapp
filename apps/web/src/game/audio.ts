import type { GameEvent } from '@pongapp/game-core'

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

  play(event: GameEvent, emphasize = false): void {
    if (this.muted || !this.context || !this.master) return

    if (event.type === 'countdown') {
      this.tone(event.value === 1 ? 660 : 440, 0.09, 0.055, 'sine')
    } else if (event.type === 'matchStart') {
      this.tone(520, 0.13, 0.055, 'triangle', 0, 780)
      this.tone(1040, 0.1, 0.035, 'sine', 0.07)
    } else if (event.type === 'hit') {
      const energy = Math.min(1, Math.max(0, event.speed / 1.42))
      this.noise(0.035, 0.018 + energy * 0.032, 2100 + energy * 2400)
      this.tone(event.clean ? 180 : 250 + energy * 190, event.clean ? 0.13 : 0.055, event.clean ? 0.09 : 0.045, event.clean ? 'square' : 'triangle')
      if (emphasize) {
        this.noise(0.055, 0.065, 4800)
        this.tone(118, 0.12, 0.11, 'square', 0, 72)
        this.tone(1080, 0.055, 0.055, 'triangle', 0.012, 1560)
      }
      if (event.clean) {
        this.tone(760, 0.12, 0.07, 'sine', 0.012, 1180)
        this.tone(1520, 0.07, 0.035, 'sine', 0.02)
      } else if (event.shot === 'smash') {
        this.tone(132, 0.09, 0.065, 'square', 0, 240)
      } else if (event.shot === 'bank') {
        this.tone(640, 0.11, 0.04, 'sine', 0, 310)
      }
    } else if (event.type === 'rallyHot') {
      // Rises with each step, so the second milestone is audibly above the first.
      const base = event.level === 'blazing' ? 880 : 660
      this.tone(base, 0.11, 0.05, 'triangle', 0, base * 1.5)
      this.tone(base * 1.5, 0.09, 0.032, 'sine', 0.06)
    } else if (event.type === 'score') {
      this.noise(0.24, 0.105, 1150)
      this.tone(82, 0.42, 0.15, 'sine', 0, 46)
      this.tone(220, 0.28, 0.08, 'sawtooth', 0.015, 720)
      this.tone(980, 0.16, 0.04, 'triangle', 0.11, 1380)
    } else if (event.type === 'palSummoned') {
      const notes = event.pal.type === 'captain' ? [220, 440, 660, 990] : event.pal.type === 'striker' ? [360, 760] : [260, 520]
      for (const [index, frequency] of notes.entries()) this.tone(frequency, 0.18, 0.045, 'triangle', index * 0.045, frequency * 1.2)
    } else if (event.type === 'palCommanded') {
      this.tone(event.palType === 'captain' ? 260 : 420, 0.1, 0.05, 'square', 0, 880)
      this.tone(1080, 0.06, 0.03, 'sine', 0.04)
    } else if (event.type === 'palGrabbed') {
      this.tone(event.palType === 'captain' ? 180 : 310, 0.14, 0.07, 'square', 0, event.palType === 'striker' ? 1100 : 760)
      this.tone(980, 0.1, 0.04, 'sine', 0.025, 1380)
    } else if (event.type === 'palStole') {
      this.tone(280, 0.17, 0.08, 'square', 0, 940)
      this.noise(0.1, 0.045, 4400)
    } else if (event.type === 'palTethered') {
      this.tone(920, 0.22, 0.045, 'sawtooth', 0, 220)
      this.noise(0.12, 0.025, 3200)
    } else if (event.type === 'tetherBroken') {
      this.noise(0.09, 0.065, 5700)
      this.tone(720, 0.08, 0.04, 'square', 0, 180)
    } else if (event.type === 'palShot') {
      this.tone(event.powered ? 92 : 150, event.powered ? 0.32 : 0.17, event.powered ? 0.14 : 0.085, 'sawtooth', 0, event.powered ? 1240 : 740)
      this.noise(event.powered ? 0.22 : 0.1, event.powered ? 0.11 : 0.05, 3700)
      if (event.shot === 'bank') {
        this.tone(1180, 0.12, 0.052, 'triangle', 0.045, 430)
        this.tone(760, 0.09, 0.035, 'sine', 0.1, 1260)
      }
    } else if (event.type === 'palDamaged') {
      this.tone(180 + event.health * 26, 0.08, 0.04, 'square', 0, 110)
    } else if (event.type === 'palStunned') {
      for (const [index, frequency] of [760, 620, 480].entries()) this.tone(frequency, 0.12, 0.03, 'sine', index * 0.06)
    } else if (event.type === 'starSpawned') {
      for (const [index, frequency] of [523, 784, 1047].entries()) this.tone(frequency, 0.3, 0.045, 'sine', index * 0.065)
    } else if (event.type === 'palPowered') {
      for (const [index, frequency] of [392, 659, 988, 1318].entries()) this.tone(frequency, 0.36, 0.05, 'triangle', index * 0.045)
      this.noise(0.3, 0.03, 5200)
    } else if (event.type === 'palPowerUsed') {
      this.tone(82, 0.38, 0.16, 'sawtooth', 0, 1380)
      this.noise(0.28, 0.12, 4200)
    } else if (event.type === 'palRetreated') {
      this.tone(420, 0.16, 0.035, 'triangle', 0, 120)
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
