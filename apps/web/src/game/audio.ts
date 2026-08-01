import type { GameEvent } from '@pongapp/game-core'

export class GameAudio {
  private context: AudioContext | null = null
  private muted = false

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  async unlock(): Promise<void> {
    if (this.muted) return
    this.context ??= new AudioContext()
    if (this.context.state === 'suspended') await this.context.resume()
  }

  play(event: GameEvent): void {
    if (this.muted || !this.context) return
    if (event.type === 'hit') this.tone(event.perfect ? 620 : 420, 0.045, event.perfect ? 0.08 : 0.045)
    else if (event.type === 'score') this.sweep(240, 680, 0.24)
    else if (event.type === 'ability') this.sweep(360, 760, 0.12)
    else if (event.type === 'powerUp') this.sweep(520, 980, 0.18)
    else if (event.type === 'shield') this.tone(180, 0.14, 0.09, 'square')
    else if (event.type === 'warp') this.sweep(840, 180, 0.16)
    else if (event.type === 'matchStart') this.tone(760, 0.16, 0.08)
  }

  private tone(frequency: number, duration: number, gainValue: number, type: OscillatorType = 'sine'): void {
    if (!this.context) return
    const start = this.context.currentTime
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(gainValue, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain).connect(this.context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration)
  }

  private sweep(from: number, to: number, duration: number): void {
    if (!this.context) return
    const start = this.context.currentTime
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(from, start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + duration)
    gain.gain.setValueAtTime(0.07, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain).connect(this.context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration)
  }
}
