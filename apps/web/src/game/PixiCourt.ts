import { Application, BlurFilter, Container, Graphics, Rectangle } from 'pixi.js'
import {
  BALL_SPEED_CAP,
  BALL_START_SPEED,
  COURT_PALETTE,
  GOAL_CREASE_DEPTH,
  GOAL_DEPTH,
  GOAL_WIDTH,
  PAL_IDENTITIES,
  RAIL_INSET,
  seatIdentityForColor,
  type BallState,
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
  low: { particles: 0.35, trail: 3, bloom: 0 },
  standard: { particles: 1, trail: 7, bloom: 8 },
  high: { particles: 1.7, trail: 11, bloom: 13 },
} as const

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export class PixiCourt {
  private readonly app = new Application()
  private readonly stage = new Container()
  private readonly staticLayer = new Graphics()
  private readonly trailLayer = new Graphics()
  private readonly bloomLayer = new Graphics()
  private readonly actorLayer = new Graphics()
  private readonly effectsLayer = new Graphics()
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
    this.bloomLayer.blendMode = 'add'
    this.effectsLayer.blendMode = 'add'
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
    const puck = state.balls[0]
    const speed = puck ? Math.hypot(puck.vx, puck.vy) : BALL_START_SPEED
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
        const player = state.players[event.playerId]
        this.burst(event.x, event.y, player?.color ?? COURT_PALETTE.paper.color, event.clean ? 22 : 10, event.clean ? 0.44 : 0.25)
        this.wave(event.x, event.y, player?.color ?? COURT_PALETTE.paper.color, event.clean ? 0.2 : 0.1)
        this.shake(event.clean ? 0.36 : 0.1)
      } else if (event.type === 'palSummoned') {
        const color = PAL_IDENTITIES[event.pal.type].color
        this.wave(event.pal.x, event.pal.y, color, event.pal.type === 'captain' ? 0.34 : 0.2)
        this.burst(event.pal.x, event.pal.y, color, event.pal.type === 'captain' ? 28 : 14, 0.32)
      } else if (event.type === 'palCommanded') {
        const pal = state.pals.find((candidate) => candidate.id === event.palId)
        if (pal) this.wave(pal.x, pal.y, PAL_IDENTITIES[event.palType].color, 0.2)
      } else if (event.type === 'palGrabbed' || event.type === 'palStole' || event.type === 'palTethered' || event.type === 'tetherBroken') {
        const color = event.type === 'palStole' ? PAL_IDENTITIES.guard.color : event.type === 'palTethered' || event.type === 'tetherBroken' ? PAL_IDENTITIES.striker.color : PAL_IDENTITIES[event.palType].color
        this.wave(event.x, event.y, color, event.type === 'palStole' ? 0.35 : 0.24)
        this.burst(event.x, event.y, color, event.type === 'palStole' ? 28 : 16, 0.38)
        this.shake(event.type === 'palStole' ? 0.45 : 0.22)
      } else if (event.type === 'palShot') {
        const color = PAL_IDENTITIES[event.palType].color
        this.wave(event.x, event.y, color, event.powered ? 0.48 : 0.29)
        this.burst(event.x, event.y, color, event.powered ? 45 : 24, event.powered ? 0.72 : 0.48)
        this.shake(event.powered ? 0.78 : 0.38)
      } else if (event.type === 'palDamaged' || event.type === 'palStunned') {
        const color = PAL_IDENTITIES[event.palType].color
        this.burst(event.x, event.y, color, event.type === 'palStunned' ? 25 : 11, 0.34)
        this.shake(event.type === 'palStunned' ? 0.32 : 0.12)
      } else if (event.type === 'starSpawned') {
        this.wave(event.star.x, event.star.y, 0xffef72, 0.62)
        this.burst(event.star.x, event.star.y, 0xffef72, 36, 0.55)
      } else if (event.type === 'palPowered' || event.type === 'palPowerUsed') {
        this.wave(event.x, event.y, 0xffef72, event.type === 'palPowered' ? 0.58 : 0.75)
        this.burst(event.x, event.y, 0xffef72, event.type === 'palPowered' ? 44 : 64, 0.7)
        this.shake(event.type === 'palPowerUsed' ? 0.8 : 0.42)
      } else if (event.type === 'score') {
        const scorer = state.players[event.scorerId]
        this.wave(0.5, state.players[event.againstPlayerId]?.side === 'top' ? 0 : 1, scorer?.color ?? COURT_PALETTE.paper.color, 0.78)
        this.burst(0.5, state.players[event.againstPlayerId]?.side === 'top' ? 0.01 : 0.99, scorer?.color ?? COURT_PALETTE.paper.color, 52, 0.82)
        this.shake(0.95)
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

  private unit(): number { return this.width }

  private drawCourt(): void {
    const g = this.staticLayer
    g.clear()
    const radius = Math.min(36, this.width * 0.08)
    g.roundRect(0, 0, this.width, this.height, radius).fill(COURT_PALETTE.floorDeep.color)
    const insetX = this.width * RAIL_INSET
    const insetY = this.height * RAIL_INSET
    g.roundRect(insetX, insetY, this.width - insetX * 2, this.height - insetY * 2, radius * 0.78)
      .fill(COURT_PALETTE.floor.color)

    for (let band = 0; band < 18; band += 1) {
      g.rect(insetX, insetY + (this.height - insetY * 2) * band / 18, this.width - insetX * 2, (this.height - insetY * 2) / 18)
        .fill({ color: band % 2 ? 0x103a2a : 0x184a36, alpha: 0.28 })
    }

    const goalLeft = (0.5 - GOAL_WIDTH / 2) * this.width
    const goalRight = (0.5 + GOAL_WIDTH / 2) * this.width
    const goalDepth = GOAL_DEPTH * this.height
    const rail = Math.max(4, this.width * 0.018)
    for (const top of [true, false]) {
      const edge = top ? insetY : this.height - insetY
      const back = top ? Math.max(1, edge - goalDepth) : Math.min(this.height - 1, edge + goalDepth)
      g.roundRect(goalLeft, Math.min(edge, back), goalRight - goalLeft, Math.abs(back - edge) + rail * 0.45, rail * 0.45)
        .fill({ color: 0x07110d, alpha: 0.76 })
        .stroke({ color: 0x6e9b83, width: 1.5, alpha: 0.75 })
      const creaseY = top ? edge + GOAL_CREASE_DEPTH * this.height : edge - GOAL_CREASE_DEPTH * this.height
      const creaseRadius = GOAL_WIDTH * this.width * 0.58
      const creaseStart = top ? Math.PI : 0
      g.moveTo(this.width / 2 + Math.cos(creaseStart) * creaseRadius, creaseY + Math.sin(creaseStart) * creaseRadius)
        .arc(this.width / 2, creaseY, creaseRadius, creaseStart, top ? Math.PI * 2 : Math.PI)
        .stroke({ color: 0x8ab49d, width: 1.5, alpha: 0.32 })
    }

    g.moveTo(insetX, insetY).lineTo(goalLeft, insetY).stroke({ color: 0x73947f, width: rail, alpha: 0.9 })
    g.moveTo(goalRight, insetY).lineTo(this.width - insetX, insetY).stroke({ color: 0x73947f, width: rail, alpha: 0.9 })
    g.moveTo(insetX, this.height - insetY).lineTo(goalLeft, this.height - insetY).stroke({ color: 0x73947f, width: rail, alpha: 0.9 })
    g.moveTo(goalRight, this.height - insetY).lineTo(this.width - insetX, this.height - insetY).stroke({ color: 0x73947f, width: rail, alpha: 0.9 })
    g.moveTo(insetX, insetY).lineTo(insetX, this.height - insetY).stroke({ color: 0x73947f, width: rail, alpha: 0.9 })
    g.moveTo(this.width - insetX, insetY).lineTo(this.width - insetX, this.height - insetY).stroke({ color: 0x73947f, width: rail, alpha: 0.9 })

    const lineWidth = Math.max(1, this.width * 0.004)
    g.moveTo(this.width * 0.08, this.height * 0.5).lineTo(this.width * 0.92, this.height * 0.5)
      .stroke({ color: 0x8aab98, width: lineWidth, alpha: 0.42 })
    g.circle(this.width / 2, this.height / 2, this.width * 0.18).stroke({ color: 0x8aab98, width: lineWidth, alpha: 0.35 })
    g.circle(this.width / 2, this.height / 2, this.width * 0.012).fill({ color: 0x8aab98, alpha: 0.5 })

    for (let row = 1; row < 18; row += 1) {
      for (let column = 1; column < 10; column += 1) {
        g.circle(column / 10 * this.width, row / 18 * this.height, Math.max(0.6, this.width * 0.0015))
          .fill({ color: 0xb5d0c0, alpha: (row + column) % 2 ? 0.12 : 0.07 })
      }
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
      const jump = previous ? Math.hypot((previous.x - point.x) * this.width, (previous.y - point.y) * this.height) : 0
      // Serves and goal resets teleport the authoritative puck. Never connect
      // the two samples into the giant diagonal line players used to see.
      if (jump > this.width * 0.22) points.length = 0
      if (!previous || jump > 1.5) points.push({ ...point, life: 1, color })
      for (const trail of points) trail.life -= deltaSeconds * (4.6 - this.heat * 0.8)
      while (points.length > this.density.trail || (points[0]?.life ?? 1) <= 0) points.shift()
      this.trails.set(ball.id, points)
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1]!
        const to = points[index]!
        const alpha = clamp01(to.life) * index / points.length
        const width = this.unit() * (0.0025 + this.heat * 0.004) * index / points.length
        g.moveTo(from.x * this.width, from.y * this.height).lineTo(to.x * this.width, to.y * this.height).stroke({ color: to.color, width, alpha: alpha * 0.75 })
        if (this.density.bloom > 0) bloom.moveTo(from.x * this.width, from.y * this.height).lineTo(to.x * this.width, to.y * this.height).stroke({ color: to.color, width: width * 2.4, alpha: alpha * 0.38 })
      }
    }
  }

  private drawActors(state: GameState): void {
    const g = this.actorLayer
    g.clear()
    if (state.powerStar) this.drawPowerStar(g, state.powerStar.x, state.powerStar.y)
    for (const player of Object.values(state.players)) this.drawMallet(g, player)
    for (const pal of state.pals) this.drawPal(g, pal, state)
    for (const ball of state.balls) this.drawPuck(g, ball, state)
  }

  private drawMallet(g: Graphics, player: PlayerState): void {
    const point = this.worldPoint(player.x, player.y)
    const radius = Math.max(14, player.radius * this.width)
    const identity = seatIdentityForColor(player.color)
    const speed = Math.hypot(player.vx, player.vy)
    if (speed > 0.08) {
      const tail = this.viewSide === 'top' ? { x: player.vx, y: player.vy } : { x: -player.vx, y: -player.vy }
      g.circle(point.x + tail.x * radius * 0.22, point.y + tail.y * radius * 0.22, radius * 1.18).fill({ color: player.color, alpha: 0.12 })
    }
    g.ellipse(point.x, point.y + radius * 0.34, radius * 1.02, radius * 0.66).fill({ color: 0x020806, alpha: 0.5 })
    if (this.focusPlayerIds.includes(player.id)) {
      g.circle(point.x, point.y, radius * (1.35 + Math.sin(this.clock * 5) * 0.04)).stroke({ color: COURT_PALETTE.paper.color, width: 2, alpha: 0.55 })
    }
    g.circle(point.x, point.y, radius).fill(player.color).stroke({ color: 0xfffdf7, width: 2.5, alpha: 0.7 })
    g.circle(point.x, point.y, radius * 0.58).fill({ color: 0x0b1611, alpha: 0.3 }).stroke({ color: 0xffffff, width: 1.2, alpha: 0.28 })
    g.ellipse(point.x - radius * 0.18, point.y - radius * 0.25, radius * 0.26, radius * 0.16).fill({ color: 0xffffff, alpha: 0.35 })
    if (identity.pattern === 'notch') {
      g.circle(point.x - radius * 0.78, point.y, radius * 0.13).fill(COURT_PALETTE.ink.color)
      g.circle(point.x + radius * 0.78, point.y, radius * 0.13).fill(COURT_PALETTE.ink.color)
    } else if (identity.pattern === 'bar') {
      g.roundRect(point.x - radius * 0.08, point.y - radius * 0.68, radius * 0.16, radius * 1.36, radius * 0.08).fill({ color: COURT_PALETTE.ink.color, alpha: 0.55 })
    } else if (identity.pattern === 'dots') {
      for (const x of [-0.35, 0, 0.35]) g.circle(point.x + x * radius, point.y, radius * 0.09).fill(COURT_PALETTE.ink.color)
    }
  }

  private drawPal(g: Graphics, pal: PalState, state: GameState): void {
    const identity = PAL_IDENTITIES[pal.type]
    const owner = state.players[pal.ownerId]
    const point = this.worldPoint(pal.x, pal.y)
    const radius = Math.max(pal.type === 'hatchling' ? 7 : 10, pal.radius * this.width)
    const spawning = pal.mode === 'spawning'
    const stunned = pal.mode === 'stunned'
    const pulse = 1 + Math.sin(this.clock * 7 + pal.spawnedAtTick) * 0.035
    const alpha = spawning ? 0.42 + clamp01(pal.stateTicks / 20) * 0.5 : 1

    if (spawning || pal.commanded) {
      g.circle(point.x, point.y, radius * (1.45 + Math.sin(this.clock * 8) * 0.12)).stroke({ color: identity.color, width: 2.2, alpha: spawning ? 0.68 : 0.9 })
    }
    if (pal.hasStar) {
      g.circle(point.x, point.y, radius * (1.65 + Math.sin(this.clock * 10) * 0.13)).stroke({ color: 0xffef72, width: 3, alpha: 0.88 })
      for (let index = 0; index < 4; index += 1) {
        const angle = this.clock * 2.4 + index * Math.PI / 2
        g.circle(point.x + Math.cos(angle) * radius * 1.55, point.y + Math.sin(angle) * radius * 1.55, radius * 0.13).fill(0xffef72)
      }
    }

    g.ellipse(point.x, point.y + radius * 0.5, radius * 1.02, radius * 0.48).fill({ color: 0x020806, alpha: 0.42 })
    if (pal.type === 'guard') this.drawGuard(g, point.x, point.y, radius * pulse, identity.color, owner?.color, alpha)
    else if (pal.type === 'striker') this.drawHook(g, point.x, point.y, radius * pulse, identity.color, owner?.color, alpha)
    else if (pal.type === 'captain') this.drawCaptain(g, point.x, point.y, radius * pulse, identity.color, owner?.color, alpha)
    else this.drawHatchling(g, point.x, point.y, radius * pulse, owner?.color, alpha)

    const ball = state.balls[0]
    const target = ball ? this.worldPoint(ball.x, ball.y) : point
    const lookX = Math.sign(target.x - point.x) * radius * 0.08
    const lookY = Math.sign(target.y - point.y) * radius * 0.05
    for (const offset of [-0.28, 0.28]) {
      g.circle(point.x + offset * radius, point.y - radius * 0.08, radius * 0.17).fill({ color: COURT_PALETTE.paper.color, alpha })
      g.circle(point.x + offset * radius + lookX, point.y - radius * 0.08 + lookY, radius * 0.075).fill({ color: COURT_PALETTE.ink.color, alpha })
    }
    if (stunned) {
      g.moveTo(point.x - radius * 0.34, point.y + radius * 0.34).lineTo(point.x + radius * 0.34, point.y + radius * 0.34).stroke({ color: COURT_PALETTE.ink.color, width: 2, alpha })
      for (let index = 0; index < 3; index += 1) {
        const angle = this.clock * 4 + index * Math.PI * 2 / 3
        this.starShape(g, point.x + Math.cos(angle) * radius * 1.1, point.y - radius * 0.9 + Math.sin(angle) * radius * 0.26, radius * 0.18, 0xffef72, 1)
      }
    } else {
      const mouthX = point.x + Math.cos(0.15) * radius * 0.28
      const mouthY = point.y + radius * 0.18 + Math.sin(0.15) * radius * 0.28
      g.moveTo(mouthX, mouthY).arc(point.x, point.y + radius * 0.18, radius * 0.28, 0.15, Math.PI - 0.15).stroke({ color: COURT_PALETTE.ink.color, width: 1.5, alpha: 0.75 })
    }

    if (pal.type !== 'hatchling') {
      const spacing = radius * 0.42
      const start = point.x - (pal.maxHealth - 1) * spacing / 2
      for (let index = 0; index < pal.maxHealth; index += 1) {
        g.circle(start + index * spacing, point.y - radius * 1.42, radius * 0.1)
          .fill({ color: index < pal.health ? 0xffef72 : 0x20352b, alpha: index < pal.health ? 1 : 0.7 })
      }
    }

    if (pal.type === 'striker' && ball?.tetherPalId === pal.id) {
      const puck = this.worldPoint(ball.x, ball.y)
      const bend = (puck.y + point.y) / 2 - radius * 1.3
      g.moveTo(point.x, point.y).bezierCurveTo(point.x + radius, bend, puck.x - radius, bend, puck.x, puck.y)
        .stroke({ color: 0xffbe96, width: Math.max(2, radius * 0.18), alpha: 0.9 })
      for (let index = 1; index < 5; index += 1) {
        const t = index / 5
        g.circle(point.x + (puck.x - point.x) * t, point.y + (puck.y - point.y) * t, radius * 0.08).fill({ color: 0xffe0c8, alpha: 0.72 })
      }
    }
  }

  private drawGuard(g: Graphics, x: number, y: number, r: number, color: number, ownerColor: number = color, alpha = 1): void {
    g.circle(x, y, r).fill({ color, alpha }).stroke({ color: ownerColor, width: 2.5, alpha })
    g.roundRect(x - r * 1.18, y - r * 0.58, r * 0.42, r * 1.16, r * 0.2).fill({ color: 0xb9efff, alpha })
    g.roundRect(x + r * 0.76, y - r * 0.58, r * 0.42, r * 1.16, r * 0.2).fill({ color: 0xb9efff, alpha })
    const shieldStart = Math.PI * 1.1
    g.moveTo(x + Math.cos(shieldStart) * r * 0.72, y + Math.sin(shieldStart) * r * 0.72)
      .arc(x, y, r * 0.72, shieldStart, Math.PI * 1.9).stroke({ color: 0xe6f9ff, width: r * 0.16, alpha: 0.7 })
  }

  private drawHook(g: Graphics, x: number, y: number, r: number, color: number, ownerColor: number = color, alpha = 1): void {
    g.circle(x, y, r).fill({ color, alpha }).stroke({ color: ownerColor, width: 2.2, alpha })
    g.circle(x - r * 0.88, y + r * 0.1, r * 0.3).stroke({ color: 0xffd3bc, width: r * 0.17, alpha })
    g.circle(x + r * 0.88, y + r * 0.1, r * 0.3).stroke({ color: 0xffd3bc, width: r * 0.17, alpha })
    g.circle(x, y + r * 0.48, r * 0.3).stroke({ color: 0x7b2d1f, width: r * 0.12, alpha })
  }

  private drawCaptain(g: Graphics, x: number, y: number, r: number, color: number, ownerColor: number = color, alpha = 1): void {
    g.poly([x - r * 0.9, y + r * 0.15, x, y + r * 1.4, x + r * 0.9, y + r * 0.15]).fill({ color: ownerColor, alpha: alpha * 0.78 })
    g.circle(x, y, r).fill({ color, alpha }).stroke({ color: ownerColor, width: 3, alpha })
    g.poly([
      x - r * 0.9, y - r * 0.7,
      x - r * 0.65, y - r * 1.48,
      x, y - r * 0.95,
      x + r * 0.65, y - r * 1.48,
      x + r * 0.9, y - r * 0.7,
    ]).fill({ color: 0xffe66e, alpha }).stroke({ color: 0x8d6d13, width: 1.2, alpha })
  }

  private drawHatchling(g: Graphics, x: number, y: number, r: number, ownerColor: number = COURT_PALETTE.paper.color, alpha = 1): void {
    g.circle(x, y, r).fill({ color: COURT_PALETTE.paper.color, alpha }).stroke({ color: ownerColor, width: 2, alpha })
    g.poly([x - r * 0.65, y - r * 0.65, x - r * 0.34, y - r * 1.08, x - r * 0.08, y - r * 0.7]).fill({ color: ownerColor, alpha })
    g.poly([x + r * 0.65, y - r * 0.65, x + r * 0.34, y - r * 1.08, x + r * 0.08, y - r * 0.7]).fill({ color: ownerColor, alpha })
  }

  private drawPowerStar(g: Graphics, x: number, y: number): void {
    const point = this.worldPoint(x, y)
    const radius = this.width * (0.055 + Math.sin(this.clock * 6) * 0.004)
    g.circle(point.x, point.y, radius * 1.5).fill({ color: 0xffef72, alpha: 0.1 })
    g.circle(point.x, point.y, radius * 1.25).stroke({ color: 0xffef72, width: 2.5, alpha: 0.7 })
    this.starShape(g, point.x, point.y, radius, 0xffef72, 1, this.clock * 0.7)
    g.circle(point.x - radius * 0.22, point.y - radius * 0.12, radius * 0.1).fill(0x503e12)
    g.circle(point.x + radius * 0.22, point.y - radius * 0.12, radius * 0.1).fill(0x503e12)
    g.moveTo(point.x + Math.cos(0.15) * radius * 0.28, point.y + radius * 0.08 + Math.sin(0.15) * radius * 0.28)
      .arc(point.x, point.y + radius * 0.08, radius * 0.28, 0.15, Math.PI - 0.15).stroke({ color: 0x503e12, width: 1.5 })
  }

  private drawPuck(g: Graphics, ball: BallState, state: GameState): void {
    const point = this.worldPoint(ball.x, ball.y)
    const radius = Math.max(7, ball.radius * this.width)
    const ownerColor = ball.lastToucherId ? state.players[ball.lastToucherId]?.color : undefined
    g.ellipse(point.x, point.y + radius * 0.35, radius * 1.15, radius * 0.7).fill({ color: 0x010403, alpha: 0.55 })
    g.circle(point.x, point.y, radius * 1.16).fill({ color: ownerColor ?? 0xdce9df, alpha: 0.85 })
    g.circle(point.x, point.y, radius).fill(0x101b16).stroke({ color: 0xffffff, width: 1.4, alpha: 0.68 })
    g.circle(point.x - radius * 0.25, point.y - radius * 0.26, radius * 0.3).fill({ color: 0xffffff, alpha: 0.62 })
    if (ball.carrierPalId) g.circle(point.x, point.y, radius * 1.7).stroke({ color: ownerColor ?? 0xffef72, width: 2, alpha: 0.66 })
    this.bloomLayer.circle(point.x, point.y, radius * (2.2 + this.heat)).fill({ color: ownerColor ?? COURT_PALETTE.paper.color, alpha: 0.15 + this.heat * 0.2 })
  }

  private drawEffects(deltaSeconds: number): void {
    const g = this.effectsLayer
    g.clear()
    for (const wave of this.waves) {
      wave.life -= deltaSeconds * 1.8
      const progress = 1 - clamp01(wave.life)
      const point = this.normalizedPoint(wave.x, wave.y)
      const radius = this.unit() * wave.reach * (0.18 + progress)
      g.circle(point.x * this.width, point.y * this.height, radius).stroke({ color: wave.color, width: Math.max(1, this.unit() * 0.009 * wave.life), alpha: wave.life * 0.75 })
    }
    this.waves = this.waves.filter((wave) => wave.life > 0)
    for (const particle of this.particles) {
      particle.life -= deltaSeconds * 2.3
      particle.x += particle.vx * deltaSeconds
      particle.y += particle.vy * deltaSeconds
      const point = this.normalizedPoint(particle.x, particle.y)
      g.circle(point.x * this.width, point.y * this.height, particle.size * this.unit() * clamp01(particle.life)).fill({ color: particle.color, alpha: clamp01(particle.life) })
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

  private starShape(g: Graphics, cx: number, cy: number, radius: number, color: number, alpha: number, rotation = 0): void {
    const points: number[] = []
    for (let index = 0; index < 10; index += 1) {
      const angle = rotation - Math.PI / 2 + index * Math.PI / 5
      const distance = index % 2 ? radius * 0.46 : radius
      points.push(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance)
    }
    g.poly(points).fill({ color, alpha }).stroke({ color: 0xfff9bf, width: Math.max(1, radius * 0.07), alpha })
  }
}
