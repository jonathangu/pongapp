import { Application, BlurFilter, Container, Graphics, Rectangle } from 'pixi.js'
import {
  BALL_SPEED_CAP,
  BALL_START_SPEED,
  BASE_PADDLE_LENGTH,
  COURT_PALETTE,
  PADDLE_OFFSET,
  PAL_IDENTITIES,
  PAL_PROFILE,
  palCoordinates,
  seatIdentityForColor,
  type GameEvent,
  type GameState,
  type PalState,
  type PlayerState,
  type Side,
} from '@pongapp/game-core'

export interface CourtEffectsSettings {
  reducedMotion: boolean
  screenShake: boolean
  effectDensity: 'low' | 'standard' | 'high'
}

interface TrailPoint { x: number; y: number; life: number; color: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; size: number; color: number }
interface Wave { x: number; y: number; life: number; color: number; reach: number }

const DENSITY = {
  low: { particles: 0.35, trail: 8, bloom: 0 },
  standard: { particles: 1, trail: 18, bloom: 8 },
  high: { particles: 1.7, trail: 28, bloom: 13 },
} as const

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export class PixiCourt {
  private readonly app = new Application()
  private readonly stage = new Container()
  private readonly staticLayer = new Graphics()
  private readonly trailLayer = new Graphics()
  private readonly actorLayer = new Graphics()
  private readonly effectsLayer = new Graphics()
  private readonly bloomLayer = new Graphics()
  private bloomFilter: BlurFilter | null = null
  private resizeObserver: ResizeObserver | null = null
  private settings: CourtEffectsSettings
  private width = 0
  private height = 0
  private layoutKey = ''
  private clock = 0
  private heat = 0
  private trauma = 0
  private trails = new Map<string, TrailPoint[]>()
  private particles: Particle[] = []
  private waves: Wave[] = []

  constructor(settings: CourtEffectsSettings, private readonly focusPlayerIds: string[] = [], private readonly viewSide: Side = 'bottom') {
    this.settings = settings
  }

  async mount(element: HTMLElement): Promise<void> {
    await this.app.init({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      autoStart: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: element,
    })
    element.appendChild(this.app.canvas)
    this.app.stage.addChild(this.stage)
    this.trailLayer.blendMode = 'add'
    this.effectsLayer.blendMode = 'add'
    this.bloomLayer.blendMode = 'add'
    this.stage.addChild(this.staticLayer, this.trailLayer, this.bloomLayer, this.actorLayer, this.effectsLayer)
    this.applyDensity()
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.app.resize()
        this.stage.filterArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height)
      })
      this.resizeObserver.observe(element)
    }
  }

  updateSettings(settings: CourtEffectsSettings): void {
    const changed = settings.effectDensity !== this.settings.effectDensity
    this.settings = settings
    if (changed) this.applyDensity()
    if (settings.reducedMotion) {
      this.trauma = 0
      this.particles = []
    }
  }

  render(state: GameState, deltaSeconds: number): void {
    this.width = this.app.screen.width
    this.height = this.app.screen.height
    if (this.width <= 0 || this.height <= 0) return
    this.clock += deltaSeconds
    const layoutKey = `${Math.round(this.width)}x${Math.round(this.height)}`
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey
      this.drawCourt()
    }
    const ball = state.balls[0]
    const speed = ball ? Math.hypot(ball.vx, ball.vy) : BALL_START_SPEED
    const targetHeat = clamp01((speed - BALL_START_SPEED) / (BALL_SPEED_CAP - BALL_START_SPEED))
    this.heat += (targetHeat - this.heat) * Math.min(1, deltaSeconds * 5)
    this.applyCamera(deltaSeconds)
    this.drawTrail(state, deltaSeconds)
    this.drawActors(state)
    this.drawEffects(deltaSeconds)
    this.app.render()
  }

  onEvents(events: GameEvent[], state: GameState): void {
    for (const event of events) {
      if (event.type === 'hit') {
        const ball = state.balls.find((candidate) => candidate.id === event.ballId)
        const player = state.players[event.playerId]
        if (!ball || !player) continue
        this.burst(ball.x, ball.y, player.color, event.perfect ? 20 : 9, event.perfect ? 0.42 : 0.24)
        this.wave(ball.x, ball.y, player.color, event.perfect ? 0.2 : 0.1)
        this.shake(event.perfect ? 0.42 : 0.1)
      } else if (event.type === 'palSummoned') {
        const point = palCoordinates(event.pal)
        const color = PAL_IDENTITIES[event.pal.type].color
        this.wave(point.x, point.y, color, event.pal.type === 'captain' ? 0.3 : 0.18)
        this.burst(point.x, point.y, color, event.pal.type === 'captain' ? 24 : 12, 0.3)
      } else if (event.type === 'palArmed') {
        this.wave(event.x, event.y, PAL_IDENTITIES[event.palType].color, 0.11)
      } else if (event.type === 'palHit') {
        const color = PAL_IDENTITIES[event.palType].color
        this.wave(event.x, event.y, color, event.palType === 'captain' ? 0.32 : 0.2)
        this.burst(event.x, event.y, color, event.palType === 'captain' ? 34 : 20, event.palType === 'captain' ? 0.58 : 0.4)
        this.shake(event.palType === 'captain' ? 0.62 : 0.28)
      } else if (event.type === 'score') {
        const defender = state.players[event.againstPlayerId]
        const scorer = state.players[event.scorerId]
        const y = defender?.side === 'top' ? 0.02 : 0.98
        this.wave(0.5, y, scorer?.color ?? COURT_PALETTE.paper.color, 0.7)
        this.burst(0.5, y, scorer?.color ?? COURT_PALETTE.paper.color, 42, 0.75)
        this.shake(0.9)
      } else if (event.type === 'rallyHot') {
        this.wave(0.5, 0.5, event.level === 'blazing' ? 0xf36f44 : COURT_PALETTE.accent.color, event.level === 'blazing' ? 0.72 : 0.5)
        this.shake(event.level === 'blazing' ? 0.44 : 0.24)
      } else if (event.type === 'matchEnd') {
        const winner = Object.values(state.players).find((player) => player.team === event.winnerTeam)
        this.wave(0.5, 0.5, winner?.color ?? COURT_PALETTE.accent.color, 0.9)
        this.burst(0.5, 0.5, winner?.color ?? COURT_PALETTE.accent.color, 70, 0.9)
      }
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect()
    this.bloomFilter?.destroy()
    this.app.destroy(true, { children: true, texture: true })
  }

  private get density() { return DENSITY[this.settings.effectDensity] }

  private applyDensity(): void {
    this.bloomLayer.filters = null
    this.bloomFilter?.destroy()
    this.bloomFilter = null
    if (this.density.bloom > 0) {
      this.bloomFilter = new BlurFilter({ strength: this.density.bloom, quality: 2 })
      this.bloomLayer.filters = [this.bloomFilter]
    }
  }

  private worldPoint(x: number, y: number): { x: number; y: number } {
    if (this.viewSide === 'top') return { x: (1 - x) * this.width, y: (1 - y) * this.height }
    return { x: x * this.width, y: y * this.height }
  }

  private normalizedPoint(x: number, y: number): { x: number; y: number } {
    return this.viewSide === 'top' ? { x: 1 - x, y: 1 - y } : { x, y }
  }

  private unit(): number { return Math.min(this.width, this.height) }

  private drawCourt(): void {
    const g = this.staticLayer
    g.clear()
    g.roundRect(0, 0, this.width, this.height, Math.min(34, this.width * 0.07)).fill(COURT_PALETTE.floorDeep.color)
    const inset = Math.max(6, this.width * 0.018)
    g.roundRect(inset, inset, this.width - inset * 2, this.height - inset * 2, Math.min(28, this.width * 0.06))
      .fill(COURT_PALETTE.floor.color)
      .stroke({ color: 0x2b7051, width: Math.max(2, this.width * 0.008), alpha: 0.8 })

    for (let band = 0; band < 12; band += 1) {
      g.rect(inset, inset + (this.height - inset * 2) * band / 12, this.width - inset * 2, (this.height - inset * 2) / 12)
        .fill({ color: band % 2 ? 0x123c2d : 0x164633, alpha: 0.42 })
    }
    g.moveTo(this.width * 0.08, this.height * 0.5).lineTo(this.width * 0.92, this.height * 0.5)
      .stroke({ color: 0x76927e, width: Math.max(1, this.width * 0.004), alpha: 0.45 })
    g.moveTo(this.width * 0.5, this.height * 0.08).lineTo(this.width * 0.5, this.height * 0.92)
      .stroke({ color: 0x557663, width: Math.max(1, this.width * 0.003), alpha: 0.26 })
    for (const y of [0.18, 0.3, 0.4, 0.6, 0.7, 0.82]) {
      g.moveTo(this.width * 0.14, this.height * y).lineTo(this.width * 0.2, this.height * y)
        .stroke({ color: 0x90ab98, width: 1, alpha: 0.24 })
      g.moveTo(this.width * 0.8, this.height * y).lineTo(this.width * 0.86, this.height * y)
        .stroke({ color: 0x90ab98, width: 1, alpha: 0.24 })
    }
  }

  private drawTrail(state: GameState, deltaSeconds: number): void {
    const g = this.trailLayer
    const bloom = this.bloomLayer
    g.clear()
    bloom.clear()
    for (const ball of state.balls) {
      const owner = ball.lastToucherId ? state.players[ball.lastToucherId] : undefined
      const color = owner?.color ?? COURT_PALETTE.paper.color
      const points = this.trails.get(ball.id) ?? []
      const point = this.normalizedPoint(ball.x, ball.y)
      const previous = points.at(-1)
      if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 0.002) points.push({ ...point, life: 1, color })
      for (const trail of points) trail.life -= deltaSeconds * (1.7 - this.heat * 0.7)
      while (points.length > this.density.trail || (points[0]?.life ?? 1) <= 0) points.shift()
      this.trails.set(ball.id, points)
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1]!
        const to = points[index]!
        const alpha = clamp01(to.life) * index / points.length
        const width = this.unit() * (0.004 + this.heat * 0.008) * index / points.length
        g.moveTo(from.x * this.width, from.y * this.height).lineTo(to.x * this.width, to.y * this.height)
          .stroke({ color: to.color, width, alpha: alpha * 0.75 })
        if (this.density.bloom > 0) {
          bloom.moveTo(from.x * this.width, from.y * this.height).lineTo(to.x * this.width, to.y * this.height)
            .stroke({ color: to.color, width: width * 2.4, alpha: alpha * 0.38 })
        }
      }
    }
  }

  private drawActors(state: GameState): void {
    const g = this.actorLayer
    g.clear()
    for (const player of Object.values(state.players)) this.drawPaddle(g, player)
    for (const pal of state.pals) this.drawPal(g, pal, state)
    for (const ball of state.balls) this.drawBall(g, ball.x, ball.y, ball.vx, ball.vy, ball.lastToucherId ? state.players[ball.lastToucherId]?.color : undefined)
  }

  private drawPaddle(g: Graphics, player: PlayerState): void {
    const y = player.side === 'top' ? PADDLE_OFFSET : 1 - PADDLE_OFFSET
    const point = this.worldPoint(player.position, y)
    const length = BASE_PADDLE_LENGTH * this.width
    const thickness = Math.max(8, this.width * 0.026)
    const identity = seatIdentityForColor(player.color)
    g.roundRect(point.x - length / 2, point.y - thickness / 2, length, thickness, thickness / 2)
      .fill({ color: 0x06110d, alpha: 0.55 })
    g.roundRect(point.x - length / 2, point.y - thickness * 0.7, length, thickness, thickness / 2)
      .fill(player.color)
      .stroke({ color: COURT_PALETTE.paper.color, width: this.focusPlayerIds.includes(player.id) ? 2 : 1, alpha: 0.58 })
    if (identity.pattern === 'notch') {
      g.circle(point.x - length * 0.36, point.y - thickness * 0.2, thickness * 0.18).fill(COURT_PALETTE.ink.color)
      g.circle(point.x + length * 0.36, point.y - thickness * 0.2, thickness * 0.18).fill(COURT_PALETTE.ink.color)
    }
  }

  private drawPal(g: Graphics, pal: PalState, state: GameState): void {
    const identity = PAL_IDENTITIES[pal.type]
    const profile = PAL_PROFILE[pal.type]
    const point = palCoordinates(pal)
    const screen = this.worldPoint(point.x, point.y)
    const length = profile.length * this.width
    const thickness = Math.max(9, this.width * (pal.type === 'captain' ? 0.038 : 0.03))
    const armed = state.tick >= pal.armedAtTick
    const armProgress = clamp01((state.tick - pal.spawnedAtTick) / Math.max(1, pal.armedAtTick - pal.spawnedAtTick))
    const alpha = armed ? 1 : 0.3 + armProgress * 0.5
    const pulse = 1 + Math.sin(this.clock * 7 + pal.phase) * 0.025
    const owner = state.players[pal.ownerId]

    if (!armed) {
      const radius = length * (0.44 + armProgress * 0.22)
      g.circle(screen.x, screen.y, radius).stroke({ color: identity.color, width: 2, alpha: 0.25 + armProgress * 0.55 })
      g.circle(screen.x, screen.y, radius * 0.62).stroke({ color: owner?.color ?? identity.color, width: 1, alpha: 0.55 })
    }

    const bodyLength = length * pulse
    g.roundRect(screen.x - bodyLength / 2, screen.y - thickness / 2, bodyLength, thickness, thickness * 0.46)
      .fill({ color: identity.color, alpha })
      .stroke({ color: owner?.color ?? COURT_PALETTE.paper.color, width: pal.type === 'captain' ? 3 : 1.5, alpha })

    if (pal.type === 'guard') {
      g.roundRect(screen.x - bodyLength * 0.53, screen.y - thickness * 0.38, thickness * 0.45, thickness * 0.76, thickness * 0.2).fill({ color: 0xb4efff, alpha })
      g.roundRect(screen.x + bodyLength * 0.53 - thickness * 0.45, screen.y - thickness * 0.38, thickness * 0.45, thickness * 0.76, thickness * 0.2).fill({ color: 0xb4efff, alpha })
    } else if (pal.type === 'striker') {
      const facing = pal.side === 'top' ? 1 : -1
      g.poly([
        screen.x - bodyLength * 0.35, screen.y,
        screen.x - bodyLength * 0.55, screen.y - facing * thickness * 0.65,
        screen.x - bodyLength * 0.08, screen.y - facing * thickness * 0.35,
      ]).fill({ color: 0xffb18f, alpha })
      g.poly([
        screen.x + bodyLength * 0.35, screen.y,
        screen.x + bodyLength * 0.55, screen.y - facing * thickness * 0.65,
        screen.x + bodyLength * 0.08, screen.y - facing * thickness * 0.35,
      ]).fill({ color: 0xffb18f, alpha })
    } else if (pal.type === 'captain') {
      const crownY = screen.y + (pal.side === 'top' ? thickness * 0.72 : -thickness * 0.72)
      g.poly([
        screen.x - thickness, crownY,
        screen.x - thickness * 0.7, crownY - thickness * 0.75,
        screen.x, crownY - thickness * 0.25,
        screen.x + thickness * 0.7, crownY - thickness * 0.75,
        screen.x + thickness, crownY,
      ]).fill({ color: 0xffe66e, alpha })
    }

    const ball = state.balls[0]
    const ballPoint = ball ? this.worldPoint(ball.x, ball.y) : screen
    const eyeShift = clamp01(Math.abs(ballPoint.x - screen.x) / this.width) * Math.sign(ballPoint.x - screen.x) * thickness * 0.12
    const eyeY = screen.y - thickness * 0.06
    for (const offset of [-0.16, 0.16]) {
      g.circle(screen.x + bodyLength * offset, eyeY, thickness * 0.14).fill({ color: COURT_PALETTE.paper.color, alpha })
      g.circle(screen.x + bodyLength * offset + eyeShift, eyeY, thickness * 0.065).fill({ color: COURT_PALETTE.ink.color, alpha })
    }
    const footY = screen.y + (pal.side === 'top' ? -thickness * 0.65 : thickness * 0.65)
    g.roundRect(screen.x - bodyLength * 0.29, footY, thickness * 0.32, thickness * 0.18, thickness * 0.09).fill({ color: owner?.color ?? identity.color, alpha })
    g.roundRect(screen.x + bodyLength * 0.29 - thickness * 0.32, footY, thickness * 0.32, thickness * 0.18, thickness * 0.09).fill({ color: owner?.color ?? identity.color, alpha })
  }

  private drawBall(g: Graphics, x: number, y: number, vx: number, vy: number, ownerColor?: number): void {
    const point = this.worldPoint(x, y)
    const radius = Math.max(5, this.width * 0.018)
    const speed = Math.hypot(vx, vy)
    const stretch = 1 + clamp01((speed - BALL_START_SPEED) / (BALL_SPEED_CAP - BALL_START_SPEED)) * 0.7
    const angle = Math.atan2(this.viewSide === 'top' ? -vy : vy, this.viewSide === 'top' ? -vx : vx)
    this.rotatedEllipse(g, point.x, point.y, radius * stretch, radius / Math.sqrt(stretch), angle, ownerColor ?? COURT_PALETTE.paper.color, 1)
    this.bloomLayer.circle(point.x, point.y, radius * (2.2 + this.heat)).fill({ color: ownerColor ?? COURT_PALETTE.paper.color, alpha: 0.18 + this.heat * 0.18 })
    g.circle(point.x - radius * 0.25, point.y - radius * 0.28, radius * 0.24).fill({ color: 0xffffff, alpha: 0.8 })
  }

  private drawEffects(deltaSeconds: number): void {
    const g = this.effectsLayer
    g.clear()
    for (const wave of this.waves) {
      wave.life -= deltaSeconds * 1.8
      const progress = 1 - clamp01(wave.life)
      const point = this.normalizedPoint(wave.x, wave.y)
      const radius = this.unit() * wave.reach * (0.18 + progress)
      g.circle(point.x * this.width, point.y * this.height, radius)
        .stroke({ color: wave.color, width: Math.max(1, this.unit() * 0.009 * wave.life), alpha: wave.life * 0.75 })
    }
    this.waves = this.waves.filter((wave) => wave.life > 0)
    for (const particle of this.particles) {
      particle.life -= deltaSeconds * 2.3
      particle.x += particle.vx * deltaSeconds
      particle.y += particle.vy * deltaSeconds
      const point = this.normalizedPoint(particle.x, particle.y)
      g.circle(point.x * this.width, point.y * this.height, particle.size * this.unit() * clamp01(particle.life))
        .fill({ color: particle.color, alpha: clamp01(particle.life) })
    }
    this.particles = this.particles.filter((particle) => particle.life > 0)
  }

  private wave(x: number, y: number, color: number, reach: number): void {
    this.waves.push({ x, y, color, reach, life: 1 })
  }

  private burst(x: number, y: number, color: number, count: number, strength: number): void {
    if (this.settings.reducedMotion) return
    const total = Math.round(count * this.density.particles)
    for (let index = 0; index < total; index += 1) {
      const angle = index / Math.max(1, total) * Math.PI * 2 + Math.sin(index * 13.7) * 0.2
      const speed = strength * (0.35 + ((index * 47) % 100) / 100)
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, size: 0.003 + index % 3 * 0.0015, color })
    }
  }

  private shake(amount: number): void {
    if (!this.settings.reducedMotion && this.settings.screenShake) this.trauma = Math.min(1, this.trauma + amount)
  }

  private applyCamera(deltaSeconds: number): void {
    this.trauma = Math.max(0, this.trauma - deltaSeconds * 2.5)
    if (this.trauma <= 0) {
      this.stage.position.set(0, 0)
      this.stage.scale.set(1)
      return
    }
    const shake = this.trauma * this.trauma
    this.stage.position.set(Math.sin(this.clock * 83) * shake * 7, Math.cos(this.clock * 67) * shake * 7)
    this.stage.scale.set(1 + shake * 0.007)
  }

  private rotatedEllipse(g: Graphics, cx: number, cy: number, rx: number, ry: number, rotation: number, color: number, alpha: number): void {
    const points: number[] = []
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    for (let index = 0; index < 18; index += 1) {
      const angle = index / 18 * Math.PI * 2
      const x = Math.cos(angle) * rx
      const y = Math.sin(angle) * ry
      points.push(cx + x * cos - y * sin, cy + x * sin + y * cos)
    }
    g.poly(points).fill({ color, alpha })
  }
}
