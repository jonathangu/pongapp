import type { ShotEvent } from '@pongapp/game-core/ricochet'

/** Original synthesized effects: no sample downloads or third-party sound assets. */
export class RescueSound {
  private context: AudioContext | null = null
  private lastAt = -1
  enabled = true
  unlock() {
    if (!this.enabled) return
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}) } catch { /* Play remains silent and usable. */ }
  }
  play(event: ShotEvent, index = 0) {
    const ctx = this.context
    if (!this.enabled || !ctx || ctx.state !== 'running' || document.hidden) return
    const at = ctx.currentTime
    if (at - this.lastAt < .045 && event.kind === 'rescue') return
    this.lastAt = at
    const frequencies = event.kind === 'split' ? [523, 659, 784] : event.kind === 'focus' ? [262, 392, 523] : event.kind === 'burst' ? [98, 147] :
      event.kind === 'rescue' ? [659 * 2 ** (Math.min(index % 8, 6) / 12), 988] : event.kind === 'launch' ? [220, 440] : [392]
    frequencies.forEach((frequency, i) => {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain(), start = at + i * .036
      oscillator.type = event.kind === 'burst' ? 'triangle' : 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      if (event.kind === 'launch' || event.kind === 'focus') oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.8, start + .18)
      if (event.kind === 'burst') oscillator.frequency.exponentialRampToValueAtTime(frequency * .4, start + .3)
      const duration = event.kind === 'burst' ? .42 : event.kind === 'bounce' ? .12 : .28
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(event.kind === 'burst' ? .12 : .055, start + .012)
      gain.gain.exponentialRampToValueAtTime(.001, start + duration)
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + duration + .02)
    })
  }
  dispose() { void this.context?.close(); this.context = null }
}
