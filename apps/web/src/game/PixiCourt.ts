import { Application, BlurFilter, Container, Graphics, Text } from 'pixi.js'
import type { GameEvent, GameState, PlayerState, PowerUpId, Side } from '@pongapp/game-core'
import { BASE_PADDLE_LENGTH, GROWN_PADDLE_LENGTH, PADDLE_OFFSET } from '@pongapp/game-core'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: number
  size: number
}

interface TrailPoint { x: number; y: number; life: number }

export interface CourtEffectsSettings {
  reducedMotion: boolean
  screenShake: boolean
  effectDensity: 'low' | 'standard' | 'high'
}

const POWER_COLORS: Record<PowerUpId, number> = {
  grow: 0xdfff68,
  overdrive: 0xf36f44,
  multiball: 0xfffdf7,
  warp: 0xb59cff,
  gravity: 0x67d4ff,
}

export class PixiCourt {
  private readonly app = new Application()
  private readonly stage = new Container()
  private readonly court = new Graphics()
  private readonly trail = new Graphics()
  private readonly actors = new Graphics()
  private readonly particlesLayer = new Graphics()
  private readonly glow = new Graphics()
  private readonly powerLabel = new Text({
    text: '',
    style: { fontFamily: 'Manrope', fontSize: 13, fontWeight: '800', fill: 0x12231b },
  })
  private particles: Particle[] = []
  private trails = new Map<string, TrailPoint[]>()
  private shake = 0
  private width = 0
  private settings: CourtEffectsSettings

  constructor(settings: CourtEffectsSettings) {
    this.settings = settings
  }

  async mount(element: HTMLElement): Promise<void> {
    await this.app.init({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: element,
    })
    element.appendChild(this.app.canvas)
    this.app.stage.addChild(this.stage)
    this.stage.addChild(this.court, this.trail, this.glow, this.actors, this.particlesLayer, this.powerLabel)
    this.glow.filters = [new BlurFilter({ strength: 12, quality: 3 })]
  }

  updateSettings(settings: CourtEffectsSettings): void {
    this.settings = settings
  }

  render(state: GameState, deltaSeconds: number): void {
    this.width = Math.min(this.app.screen.width, this.app.screen.height)
    if (this.width <= 0) return
    const offsetX = (this.app.screen.width - this.width) / 2
    const offsetY = (this.app.screen.height - this.width) / 2
    const shakeAmount = this.settings.screenShake && !this.settings.reducedMotion ? this.shake : 0
    this.stage.x = offsetX + (Math.random() - 0.5) * shakeAmount
    this.stage.y = offsetY + (Math.random() - 0.5) * shakeAmount
    this.shake *= Math.pow(0.04, deltaSeconds)
    this.drawCourt(state)
    this.drawTrails(state, deltaSeconds)
    this.drawActors(state)
    this.updateParticles(deltaSeconds)
  }

  onEvents(events: GameEvent[], state: GameState): void {
    for (const event of events) {
      if (event.type === 'hit') {
        const ball = state.balls.find((candidate) => candidate.id === event.ballId)
        const player = state.players[event.playerId]
        if (ball && player) this.burst(ball.x, ball.y, player.color, event.perfect ? 18 : 8)
        if (event.perfect) this.shake = Math.max(this.shake, 5)
      } else if (event.type === 'score') {
        const defender = state.players[event.againstPlayerId]
        if (defender) this.goalBurst(defender.side, defender.color)
        this.shake = 12
      } else if (event.type === 'powerUp' || event.type === 'warp') {
        for (const ball of state.balls) this.burst(ball.x, ball.y, 0xdfff68, 20)
      } else if (event.type === 'shield') {
        const defender = state.players[event.playerId]
        if (defender) this.goalBurst(defender.side, 0xfffdf7)
      }
    }
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: true })
  }

  private point(value: number): number { return value * this.width }

  private drawCourt(state: GameState): void {
    const w = this.width
    const inset = w * 0.018
    this.court.clear()
      .roundRect(inset, inset, w - inset * 2, w - inset * 2, w * 0.045)
      .fill({ color: 0x123f2e })
      .stroke({ color: 0x334d3d, width: Math.max(2, w * 0.005) })
      .roundRect(w * 0.045, w * 0.045, w * 0.91, w * 0.91, w * 0.03)
      .stroke({ color: 0xdfff68, alpha: 0.38, width: Math.max(1, w * 0.002) })
      .moveTo(w / 2, w * 0.045).lineTo(w / 2, w * 0.955)
      .moveTo(w * 0.045, w / 2).lineTo(w * 0.955, w / 2)
      .stroke({ color: 0xdfff68, alpha: 0.2, width: Math.max(1, w * 0.0015) })
      .circle(w / 2, w / 2, w * 0.105)
      .stroke({ color: 0xdfff68, alpha: 0.12, width: Math.max(1, w * 0.0015) })

    this.glow.clear()
    if (state.worldEffects.gravityTicks > 0) {
      this.glow.circle(w / 2, w / 2, w * 0.085).fill({ color: 0x67d4ff, alpha: 0.45 })
    }
    if (state.worldEffects.warpTicks > 0) {
      this.drawGate(this.glow, 0.32, 0.5, 0xb59cff, state.tick)
      this.drawGate(this.glow, 0.68, 0.5, 0xdfff68, -state.tick)
    }
  }

  private drawGate(graphics: Graphics, x: number, y: number, color: number, tick: number): void {
    const pulse = 1 + Math.sin(tick / 9) * 0.14
    graphics.circle(this.point(x), this.point(y), this.point(0.034) * pulse)
      .stroke({ color, alpha: 0.75, width: Math.max(3, this.width * 0.008) })
  }

  private drawActors(state: GameState): void {
    const w = this.width
    this.actors.clear()
    for (const player of Object.values(state.players)) this.drawPaddle(player)

    for (const ball of state.balls) {
      const owner = ball.lastToucherId ? state.players[ball.lastToucherId] : undefined
      const color = owner?.color ?? 0xfffdf7
      this.actors.circle(this.point(ball.x), this.point(ball.y), Math.max(4, this.point(ball.radius)))
        .fill({ color: 0xfffdf7 })
        .stroke({ color, alpha: 0.8, width: Math.max(2, w * 0.004) })
    }

    if (state.powerUp) {
      const color = POWER_COLORS[state.powerUp.id]
      const pulse = 1 + Math.sin(state.tick / 8) * 0.16
      this.actors.circle(this.point(state.powerUp.x), this.point(state.powerUp.y), this.point(0.027) * pulse)
        .fill({ color })
        .stroke({ color: 0xfffdf7, alpha: 0.8, width: Math.max(1, w * 0.003) })
      this.powerLabel.text = state.powerUp.id.slice(0, 1).toUpperCase()
      this.powerLabel.anchor.set(0.5)
      this.powerLabel.x = this.point(state.powerUp.x)
      this.powerLabel.y = this.point(state.powerUp.y)
      this.powerLabel.visible = true
    } else {
      this.powerLabel.visible = false
    }
  }

  private drawPaddle(player: PlayerState): void {
    const w = this.width
    const length = this.point(player.growTicks > 0 ? GROWN_PADDLE_LENGTH : BASE_PADDLE_LENGTH)
    const thickness = Math.max(8, w * 0.018)
    const offset = this.point(PADDLE_OFFSET)
    const coordinate = this.point(player.position)
    let x = 0; let y = 0; let width = thickness; let height = length
    if (player.side === 'left') { x = offset - thickness / 2; y = coordinate - length / 2 }
    else if (player.side === 'right') { x = w - offset - thickness / 2; y = coordinate - length / 2 }
    else if (player.side === 'top') { x = coordinate - length / 2; y = offset - thickness / 2; width = length; height = thickness }
    else { x = coordinate - length / 2; y = w - offset - thickness / 2; width = length; height = thickness }

    this.actors.roundRect(x, y, width, height, thickness / 2).fill({ color: player.color })
    if (player.guardTicks > 0) {
      this.drawGuard(player.side, player.color)
    }
    if (player.pulseTicks > 0) {
      this.actors.circle(
        player.side === 'left' ? offset : player.side === 'right' ? w - offset : coordinate,
        player.side === 'top' ? offset : player.side === 'bottom' ? w - offset : coordinate,
        length * 0.75,
      ).stroke({ color: player.color, alpha: 0.55, width: Math.max(2, w * 0.006) })
    }
  }

  private drawGuard(side: Side, color: number): void {
    const w = this.width
    const gap = w * 0.012
    if (side === 'left') this.actors.moveTo(gap, w * 0.08).lineTo(gap, w * 0.92)
    else if (side === 'right') this.actors.moveTo(w - gap, w * 0.08).lineTo(w - gap, w * 0.92)
    else if (side === 'top') this.actors.moveTo(w * 0.08, gap).lineTo(w * 0.92, gap)
    else this.actors.moveTo(w * 0.08, w - gap).lineTo(w * 0.92, w - gap)
    this.actors.stroke({ color, alpha: 0.6, width: Math.max(3, w * 0.008) })
  }

  private drawTrails(state: GameState, deltaSeconds: number): void {
    for (const ball of state.balls) {
      const points = this.trails.get(ball.id) ?? []
      points.push({ x: ball.x, y: ball.y, life: 1 })
      const maximum = this.settings.effectDensity === 'high' ? 24 : this.settings.effectDensity === 'low' ? 8 : 15
      while (points.length > maximum) points.shift()
      for (const point of points) point.life -= deltaSeconds * 2.7
      this.trails.set(ball.id, points.filter((point) => point.life > 0))
    }
    this.trail.clear()
    for (const [ballId, points] of this.trails) {
      const ball = state.balls.find((candidate) => candidate.id === ballId)
      const owner = ball?.lastToucherId ? state.players[ball.lastToucherId] : undefined
      const color = owner?.color ?? 0xfffdf7
      if (points.length < 2) continue
      this.trail.moveTo(this.point(points[0]!.x), this.point(points[0]!.y))
      for (const point of points.slice(1)) this.trail.lineTo(this.point(point.x), this.point(point.y))
      this.trail.stroke({ color, alpha: 0.35, width: Math.max(2, this.width * 0.009) })
    }
  }

  private burst(x: number, y: number, color: number, requestedCount: number): void {
    if (this.settings.reducedMotion) return
    const multiplier = this.settings.effectDensity === 'high' ? 1.5 : this.settings.effectDensity === 'low' ? 0.5 : 1
    const count = Math.round(requestedCount * multiplier)
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.12 + Math.random() * 0.38
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color, size: 2 + Math.random() * 4 })
    }
  }

  private goalBurst(side: Side, color: number): void {
    const horizontal = side === 'top' || side === 'bottom'
    for (let index = 0; index < 28; index += 1) {
      const coordinate = 0.1 + Math.random() * 0.8
      this.burst(horizontal ? coordinate : side === 'left' ? 0.02 : 0.98, horizontal ? side === 'top' ? 0.02 : 0.98 : coordinate, color, 1)
    }
  }

  private updateParticles(deltaSeconds: number): void {
    this.particlesLayer.clear()
    for (const particle of this.particles) {
      particle.x += particle.vx * deltaSeconds
      particle.y += particle.vy * deltaSeconds
      particle.vx *= Math.pow(0.16, deltaSeconds)
      particle.vy *= Math.pow(0.16, deltaSeconds)
      particle.life -= deltaSeconds * 2.2
      this.particlesLayer.circle(this.point(particle.x), this.point(particle.y), particle.size * Math.max(0.2, particle.life))
        .fill({ color: particle.color, alpha: Math.max(0, particle.life) })
    }
    this.particles = this.particles.filter((particle) => particle.life > 0)
  }
}
