/**
 * The court renderer.
 *
 * This replaces a version that redrew every shape, including the static court
 * furniture, into one `Graphics` per frame and lit nothing. Four things drove
 * the rewrite, in the order they matter:
 *
 * 1. **The court is furniture, not animation.** Lines, floor, bezel and lane
 *    ticks only change when the canvas changes size, yet they were cleared and
 *    re-tessellated 60 times a second next to the ball. They now live in their
 *    own layer behind a `layoutWidth` check and are rebuilt on resize only.
 * 2. **Two frame loops were running.** `Application` defaults to
 *    `autoStart: true`, so Pixi's ticker rendered every frame while `GameCourt`
 *    drove a second `requestAnimationFrame` that mutated the same graphics. We
 *    now init with `autoStart: false` and call `app.render()` exactly once per
 *    host frame, so the mutation and the draw cannot disagree.
 * 3. **Sim time and display time are different clocks.** The simulation is a
 *    fixed 60Hz, so on a 120Hz phone every local ball position was shown twice.
 *    `sinceTick` measures how far we are past the last state we were handed and
 *    can extrapolate the ball and paddles along their own velocity, capped at
 *    one tick. Online disables this because `RoomClient` already owns its
 *    prediction. Capped, because
 *    extrapolation past a bounce points the wrong way: one tick of overshoot at
 *    the speed cap is 0.019 of the court, a little over one ball radius, and
 *    invisible. Anything longer is a ball travelling through a paddle.
 * 4. **Nothing on screen answered "is this rally going well?"** Pong's entire
 *    tension curve is `BALL_SPEED_RAMP` compounding across a rally, and the old
 *    renderer drew a 0.48 ball and a 1.12 ball identically. `heat` is that ramp
 *    normalised to 0..1 and it now drives rim brightness, bloom, trail length,
 *    ball stretch and particle count together. One number, many channels — so
 *    the escalation still reads with effects turned down.
 *
 * Hitstop now belongs to game-core, where local and authoritative online play
 * freeze on the same ticks. The renderer's responsibility is smaller but
 * essential: never extrapolate through that freeze, or the ball creeps forward
 * and snaps back while the simulation is correctly holding still.
 *
 * Effect density is a real budget, not a taste setting. `low` drops every
 * full-screen filter. Standard and high keep one persistent bloom pass, while
 * RGB split and shader shockwave attach only for a few frames around a perfect
 * return, goal or power-up and then release their render textures.
 */

import { Application, BlurFilter, Container, Graphics, Rectangle } from 'pixi.js'
import { ShockwaveFilter } from 'pixi-filters/shockwave'
import type { AbilityId, GameEvent, GameMode, GameState, ItemIntensity, PlayerState, Side } from '@pongapp/game-core'
import {
  ABILITY_COOLDOWNS,
  BALL_SPEED_CAP,
  BALL_START_SPEED,
  BASE_PADDLE_LENGTH,
  COURT_PALETTE,
  GROWN_PADDLE_LENGTH,
  PADDLE_OFFSET,
  POWER_UP_IDENTITIES,
  TICK_SECONDS,
  seatIdentityForColor,
  serveVelocityForPlayer,
  type SeatIdentity,
} from '@pongapp/game-core'
import { courtRotationForSide } from './perspective'
import { ballPredictionEnabled } from './prediction'

export interface CourtEffectsSettings {
  reducedMotion: boolean
  screenShake: boolean
  effectDensity: 'low' | 'standard' | 'high'
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  decay: number
  color: number
  size: number
}

interface TrailPoint { x: number; y: number; life: number }
interface Shockwave { x: number; y: number; life: number; color: number; reach: number }
interface WallFlash { side: Side; life: number; color: number }
interface ImpactSlice { x: number; y: number; angle: number; life: number; color: number }
interface AbilityBurst {
  x: number
  y: number
  side: Side
  ability: AbilityId
  life: number
  color: number
  fromPosition: number
  toPosition: number
}
interface GoalFlash { side: Side; life: number; color: number }
interface PostEffect {
  elapsed: number
  duration: number
  strength: number
  centerX: number
  centerY: number
  amplitude: number
  wavelength: number
  speed: number
  radius: number
}

interface ArenaTheme {
  key: string
  floor: number
  floorDeep: number
  line: number
  accent: number
  aura: number
}

function arenaTheme(mode: GameMode, items: ItemIntensity): ArenaTheme {
  if (mode === 'arena') {
    return { key: `midnight-${items}`, floor: 0x10383a, floorDeep: 0x0a2329, line: 0x315a66, accent: 0x67d4ff, aura: items === 'wild' ? 0xb59cff : 0x2c865f }
  }
  if (mode === 'crosscourt') {
    return { key: `championship-${items}`, floor: 0x283426, floorDeep: 0x151f19, line: 0x60704e, accent: 0xecffa6, aura: 0xf36f44 }
  }
  return { key: `forest-${items}`, floor: COURT_PALETTE.floor.color, floorDeep: COURT_PALETTE.floorDeep.color, line: COURT_PALETTE.line.color, accent: COURT_PALETTE.accent.color, aura: items === 'wild' ? 0xb59cff : 0x1b6847 }
}

/**
 * Per-density budget. `bloom` is a blur strength and `0` means the filter is
 * never attached, not that it is attached and weak — an attached filter still
 * costs a render texture and a full-screen pass whatever its strength.
 */
const DENSITY = {
  low: { particles: 0.4, trail: 8, bloom: 0, quality: 2, waves: false },
  standard: { particles: 1, trail: 16, bloom: 9, quality: 3, waves: true },
  high: { particles: 1.8, trail: 26, bloom: 15, quality: 4, waves: true },
} as const

/** Frame-rate independent approach: `retainedPerSecond` is the gap left after one second. */
function approach(current: number, target: number, retainedPerSecond: number, dt: number): number {
  return target + (current - target) * Math.pow(retainedPerSecond, dt)
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export class PixiCourt {
  private readonly app = new Application()
  private readonly stage = new Container()

  /** Rebuilt on resize only. */
  private readonly backdrop = new Graphics()
  private readonly floor = new Graphics()
  private readonly bezel = new Graphics()

  /** Rebuilt every frame. */
  private readonly rim = new Graphics()
  private readonly walls = new Graphics()
  private readonly trail = new Graphics()
  private readonly actors = new Graphics()
  private readonly overlays = new Graphics()
  private readonly particlesLayer = new Graphics()

  /** Additive, blurred, and skipped entirely at `low` density. */
  private readonly bloomLayer = new Container()
  private readonly bloomGraphics = new Graphics()
  private bloomFilter: BlurFilter | null = null
  private shaderShockwaveFilter: ShockwaveFilter | null = null
  private postEffect: PostEffect | null = null

  private particles: Particle[] = []
  private trails = new Map<string, TrailPoint[]>()
  private shockwaves: Shockwave[] = []
  private wallFlashes: WallFlash[] = []
  private impactSlices: ImpactSlice[] = []
  private abilityBursts: AbilityBurst[] = []
  private goalFlash: GoalFlash | null = null

  private trauma = 0
  private punch = 0
  private heat = 0
  private clock = 0
  private sinceTick = 0
  private lastTick = -1
  private width = 0
  private layoutWidth = -1
  private resizeObserver: ResizeObserver | null = null
  private settings: CourtEffectsSettings
  private readonly focusPlayerIds: Set<string>
  private readonly viewSide: Side
  private theme = arenaTheme('duel', 'standard')

  constructor(settings: CourtEffectsSettings, focusPlayerIds: string[] = [], viewSide: Side = 'bottom') {
    this.settings = settings
    this.focusPlayerIds = new Set(focusPlayerIds)
    this.viewSide = viewSide
  }

  async mount(element: HTMLElement): Promise<void> {
    await this.app.init({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      // The host drives the frame; see note 2 in the header.
      autoStart: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: element,
    })
    element.appendChild(this.app.canvas)
    this.app.stage.addChild(this.stage)
    this.stage.filterArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height)
    this.bloomLayer.addChild(this.bloomGraphics)
    this.bloomLayer.blendMode = 'add'
    this.trail.blendMode = 'add'
    this.overlays.blendMode = 'add'
    this.particlesLayer.blendMode = 'add'
    this.stage.addChild(
      this.backdrop,
      this.floor,
      this.walls,
      this.rim,
      this.bloomLayer,
      this.trail,
      this.actors,
      this.overlays,
      this.particlesLayer,
      this.bezel,
    )
    this.applyDensity()

    // `resizeTo` only listens to `window.resize` (see Pixi's ResizePlugin), so a
    // court that changes size because the surrounding layout changed — not the
    // window — would keep rendering at the old size. Observe the element too.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.app.resize()
        this.stage.filterArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height)
      })
      this.resizeObserver.observe(element)
    }
  }

  updateSettings(settings: CourtEffectsSettings): void {
    const densityChanged = settings.effectDensity !== this.settings.effectDensity
    this.settings = settings
    if (densityChanged) this.applyDensity()
    if (settings.reducedMotion || settings.effectDensity === 'low') {
      this.particles = []
      this.shockwaves = []
      this.impactSlices = []
      this.abilityBursts = []
      this.goalFlash = null
      this.detachPostEffect()
      this.trauma = 0
      this.punch = 0
    }
  }

  render(state: GameState, deltaSeconds: number, extrapolate = true): void {
    const size = Math.min(this.app.screen.width, this.app.screen.height)
    if (size <= 0) return
    this.width = size
    this.clock += deltaSeconds

    const nextTheme = arenaTheme(state.config.mode, state.config.itemIntensity)
    if (nextTheme.key !== this.theme.key) {
      this.theme = nextTheme
      this.layoutWidth = -1
    }

    if (state.tick !== this.lastTick) {
      this.lastTick = state.tick
      this.sinceTick = 0
    } else {
      this.sinceTick += deltaSeconds
    }
    const ahead = extrapolate && ballPredictionEnabled(state)
      ? Math.min(this.sinceTick, TICK_SECONDS)
      : 0

    this.updateHeat(state, deltaSeconds)
    this.applyCamera(deltaSeconds)

    if (this.layoutWidth !== size) {
      this.layoutWidth = size
      this.drawStaticLayers()
    }

    this.bloomGraphics.clear()
    this.overlays.clear()
    this.drawRim(state)
    this.drawWalls(deltaSeconds)
    this.drawTrails(state, deltaSeconds, ahead)
    this.drawActors(state, ahead)
    this.drawOverlays(state, deltaSeconds)
    this.updateParticles(deltaSeconds)
    this.updatePostEffect(deltaSeconds)

    this.app.render()
  }

  onEvents(events: GameEvent[], state: GameState): void {
    for (const event of events) {
      if (event.type === 'hit') {
        const ball = state.balls.find((candidate) => candidate.id === event.ballId)
        const player = state.players[event.playerId]
        if (!ball || !player) continue
        // Sparks leave the paddle the way the ball does. The old renderer sprayed
        // a full circle, which reads as an explosion at the wall rather than as a
        // return.
        this.cone(ball.x, ball.y, Math.atan2(ball.vy, ball.vx), player.color, event.perfect ? 20 : 9, event.perfect ? 1.15 : 0.7)
        this.wave(ball.x, ball.y, player.color, event.perfect ? 0.16 : 0.085)
        if (event.perfect && !this.settings.reducedMotion) {
          this.impactSlices.push({ x: ball.x, y: ball.y, angle: Math.atan2(ball.vy, ball.vx), life: 1, color: player.color })
        }
        this.shake(event.perfect ? 0.34 : 0.1)
        this.zoom(event.perfect ? 0.012 : 0.004)
      } else if (event.type === 'score') {
        const defender = state.players[event.againstPlayerId]
        const scorer = event.scorerId ? state.players[event.scorerId] : undefined
        const color = scorer?.color ?? COURT_PALETTE.paper.color
        if (defender) {
          this.wallFlashes.push({ side: defender.side, life: 1, color })
          this.goalSpray(defender.side, color)
          this.goalFlash = { side: defender.side, life: 1, color }
          const anchor = this.goalAnchor(defender.side)
          this.triggerPostEffect(anchor.x, anchor.y, 'goal')
        }
        this.shake(0.85)
        this.zoom(0.026)
      } else if (event.type === 'ability') {
        const player = state.players[event.playerId]
        if (player && !this.settings.reducedMotion) {
          const anchor = this.playerAnchor(player)
          this.abilityBursts.push({
            ...anchor,
            side: player.side,
            ability: event.ability,
            life: 1,
            color: player.color,
            // Older room snapshots did not carry endpoints. Falling back to
            // the authoritative current position keeps a rolling web/worker
            // deploy safe; it simply omits the trail for that one event.
            fromPosition: event.fromPosition ?? player.position,
            toPosition: event.toPosition ?? player.position,
          })
          // Dash is movement along a wall. A radial wave and sparks fired into
          // the court made it look like a weapon; its dedicated afterimages
          // below now show only the actual start, direction and landing point.
          if (event.ability !== 'dash') {
            this.wave(anchor.x, anchor.y, player.color, event.ability === 'pulse' ? 0.24 : 0.14)
          }
        }
      } else if (event.type === 'powerUp') {
        const identity = POWER_UP_IDENTITIES[event.powerUp]
        for (const ball of state.balls) {
          this.cone(ball.x, ball.y, Math.atan2(ball.vy, ball.vx), identity.color, 22, 1.4)
          this.wave(ball.x, ball.y, identity.color, 0.22)
        }
        this.shake(0.3)
      } else if (event.type === 'warp') {
        const ball = state.balls.find((candidate) => candidate.id === event.ballId)
        if (ball) {
          // A warped ball teleports; clearing its trail stops a stripe being drawn
          // straight across the court between the two gates.
          this.trails.delete(ball.id)
          this.wave(ball.x, ball.y, POWER_UP_IDENTITIES.warp.color, 0.18)
        }
      } else if (event.type === 'shield') {
        const defender = state.players[event.playerId]
        if (defender) {
          this.wallFlashes.push({ side: defender.side, life: 1, color: COURT_PALETTE.paper.color })
          this.shake(0.45)
          this.zoom(0.016)
        }
      } else if (event.type === 'rallyHot') {
        // The court already brightens with `heat`; this is the moment that
        // escalation becomes worth points, so it gets its own beat. A ring from
        // the centre outward rather than at the ball: the whole court just
        // changed value, not one contact.
        this.wave(0.5, 0.5, this.theme.accent, event.multiplier >= 3 ? 0.62 : 0.44)
        this.shake(event.multiplier >= 3 ? 0.4 : 0.22)
        this.zoom(event.multiplier >= 3 ? 0.014 : 0.008)
      } else if (event.type === 'matchEnd') {
        const winner = Object.values(state.players).find((player) => player.team === event.winnerTeam)
        const color = winner?.color ?? COURT_PALETTE.accent.color
        this.goalFlash = { side: winner?.side ?? 'top', life: 1.25, color }
        for (const side of ['left', 'right', 'top', 'bottom'] as const) this.goalSpray(side, color)
        this.wave(0.5, 0.5, color, 0.65)
        this.triggerPostEffect(0.5, 0.5, 'goal')
        this.shake(0.6)
      }
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.detachPostEffect()
    this.bloomLayer.filters = null
    this.bloomFilter?.destroy()
    this.shaderShockwaveFilter?.destroy()
    this.bloomFilter = null
    this.shaderShockwaveFilter = null
    this.app.destroy(true, { children: true, texture: true })
  }

  // ---------------------------------------------------------------- internals

  private get density() { return DENSITY[this.settings.effectDensity] }

  private point(value: number): number { return value * this.width }

  private playerAnchor(player: PlayerState): { x: number; y: number } {
    return this.anchorAt(player.side, player.position)
  }

  private anchorAt(side: Side, position: number): { x: number; y: number } {
    if (side === 'left') return { x: PADDLE_OFFSET, y: position }
    if (side === 'right') return { x: 1 - PADDLE_OFFSET, y: position }
    if (side === 'top') return { x: position, y: PADDLE_OFFSET }
    return { x: position, y: 1 - PADDLE_OFFSET }
  }

  private goalAnchor(side: Side): { x: number; y: number } {
    if (side === 'left') return { x: 0.04, y: 0.5 }
    if (side === 'right') return { x: 0.96, y: 0.5 }
    if (side === 'top') return { x: 0.5, y: 0.04 }
    return { x: 0.5, y: 0.96 }
  }

  /**
   * Shader post-processing is reserved for the ball being dead.
   *
   * It used to fire on perfect returns and power-up pickups too, alongside an
   * `RGBSplitFilter` that offset the red and blue channels of the whole stage.
   * Two things went wrong with that, and players reported both as bugs rather
   * than as effects:
   *
   * - Splitting red and blue apart with green fixed fringes every straight
   *   high-contrast edge in *magenta*. The court's centre cross, rim and lane
   *   ticks are exactly those edges, so a good return appeared to draw strange
   *   purple lines across furniture that had nothing to do with the hit.
   * - The shockwave warps the image in an expanding ring — including the ball
   *   you are tracking. On a goal that is a flourish over a dead ball; on a
   *   perfect return, which happens several times per rally, it distorts the
   *   thing the player is trying to follow, mid-rally.
   *
   * So: goals only, no channel splitting, and gentler. Perfect returns keep
   * their local feedback — spark cone, shockwave ring, camera punch — all of
   * which are drawn *at the ball* and leave the rest of the court alone.
   */
  private triggerPostEffect(x: number, y: number, kind: 'goal'): void {
    if (this.settings.reducedMotion || this.settings.effectDensity === 'low' || this.width <= 0) return
    const high = this.settings.effectDensity === 'high'
    void kind
    const config = { duration: 0.4, strength: 0, amplitude: high ? 7 : 4.5, wavelength: 132, speed: 900, radius: this.width * 0.86 }

    this.shaderShockwaveFilter ??= new ShockwaveFilter({
      center: { x: x * this.width, y: y * this.width },
      amplitude: config.amplitude,
      wavelength: config.wavelength,
      speed: config.speed,
      brightness: 1.16,
      radius: config.radius,
      time: 0,
    })
    this.postEffect = {
      elapsed: 0,
      centerX: x * this.width,
      centerY: y * this.width,
      ...config,
    }
    this.shaderShockwaveFilter.center = { x: this.postEffect.centerX, y: this.postEffect.centerY }
    this.shaderShockwaveFilter.time = 0
    this.stage.filters = [this.shaderShockwaveFilter]
  }

  private updatePostEffect(deltaSeconds: number): void {
    const effect = this.postEffect
    const shockwave = this.shaderShockwaveFilter
    if (!effect || !shockwave) return

    effect.elapsed += deltaSeconds
    const progress = Math.min(1, effect.elapsed / effect.duration)
    if (progress >= 1) {
      this.detachPostEffect()
      return
    }

    const fade = (1 - progress) ** 2
    shockwave.center = { x: effect.centerX, y: effect.centerY }
    shockwave.time = effect.elapsed
    shockwave.amplitude = effect.amplitude * (0.38 + fade * 0.62)
    shockwave.wavelength = effect.wavelength
    shockwave.speed = effect.speed
    shockwave.radius = effect.radius
    shockwave.brightness = 1 + fade * 0.22
  }

  private detachPostEffect(): void {
    this.postEffect = null
    this.stage.filters = null
    if (this.shaderShockwaveFilter) this.shaderShockwaveFilter.time = 0
  }

  private applyDensity(): void {
    const strength = this.density.bloom
    this.bloomLayer.filters = null
    this.bloomFilter?.destroy()
    this.bloomFilter = null
    if (strength <= 0) {
      this.bloomLayer.visible = false
      return
    }
    this.bloomLayer.visible = true
    this.bloomFilter = new BlurFilter({ strength, quality: this.density.quality })
    this.bloomLayer.filters = [this.bloomFilter]
  }

  private shake(amount: number): void {
    if (this.settings.reducedMotion || !this.settings.screenShake) return
    this.trauma = Math.min(1, this.trauma + amount)
  }

  private zoom(amount: number): void {
    if (this.settings.reducedMotion) return
    this.punch = Math.min(0.05, this.punch + amount)
  }

  private updateHeat(state: GameState, deltaSeconds: number): void {
    let fastest = 0
    for (const ball of state.balls) fastest = Math.max(fastest, Math.hypot(ball.vx, ball.vy))
    const target = state.phase === 'playing'
      ? clamp01((fastest - BALL_START_SPEED) / (BALL_SPEED_CAP - BALL_START_SPEED))
      : 0
    this.heat = approach(this.heat, target, 0.08, deltaSeconds)
  }

  /**
   * Trauma-squared camera. Amplitude falls off as trauma², so a routine bump
   * settles almost immediately while a goal keeps its weight, and the offset is
   * sampled from summed sines rather than `Math.random()` — white noise per
   * frame is a buzz, sine is a camera being knocked.
   */
  private applyCamera(deltaSeconds: number): void {
    this.trauma = Math.max(0, this.trauma - deltaSeconds * 1.9)
    this.punch = approach(this.punch, 0, 0.0006, deltaSeconds)

    const w = this.width
    const half = w / 2
    const amplitude = w * 0.022 * this.trauma * this.trauma
    const t = this.clock * 24
    const shakeX = (Math.sin(t) + Math.sin(t * 2.31 + 1.7) * 0.5) * amplitude * 0.7
    const shakeY = (Math.sin(t * 1.37 + 2.1) + Math.sin(t * 3.11 + 0.4) * 0.5) * amplitude * 0.7

    // Pivot at the court centre so the punch scales about the middle of play
    // rather than the top-left of the canvas. The world is also rotated around
    // this same pivot so every client sees their own paddle on the bottom wall.
    this.stage.pivot.set(half, half)
    this.stage.scale.set(1 + this.punch)
    this.stage.rotation = courtRotationForSide(this.viewSide)
    this.stage.position.set(
      (this.app.screen.width - w) / 2 + half + shakeX,
      (this.app.screen.height - w) / 2 + half + shakeY,
    )
  }

  private drawStaticLayers(): void {
    const w = this.width
    const inset = w * 0.018
    const ink = COURT_PALETTE.ink.color
    const accent = this.theme.accent

    // A radial pool of light under the court, stacked from circles rather than a
    // gradient fill so it costs nothing at runtime — drawn once per resize and
    // then never touched again.
    this.backdrop.clear()
    for (let step = 8; step >= 1; step -= 1) {
      this.backdrop.circle(w / 2, w / 2, w * (0.22 + step * 0.062)).fill({ color: this.theme.aura, alpha: 0.02 })
    }

    this.floor.clear()
      .roundRect(inset, inset, w - inset * 2, w - inset * 2, w * 0.045)
      .fill({ color: this.theme.floor })
    // A darker core reads as depth without a texture: the eye takes the lighter
    // border as the court lifting toward the walls.
    this.floor
      .roundRect(w * 0.14, w * 0.14, w * 0.72, w * 0.72, w * 0.06)
      .fill({ color: this.theme.floorDeep, alpha: 0.6 })

    // Centre cross, dashed so it does not compete with the ball trail.
    this.dashed(this.floor, w / 2, w * 0.06, w / 2, w * 0.94, w * 0.026, w * 0.022)
    this.dashed(this.floor, w * 0.06, w / 2, w * 0.94, w / 2, w * 0.026, w * 0.022)
    this.floor.stroke({ color: accent, alpha: 0.16, width: Math.max(1, w * 0.0016) })

    this.floor.circle(w / 2, w / 2, w * 0.105).stroke({ color: accent, alpha: 0.14, width: Math.max(1, w * 0.0016) })
    this.floor.circle(w / 2, w / 2, w * 0.028).stroke({ color: accent, alpha: 0.1, width: Math.max(1, w * 0.0014) })

    // Lane ticks mark 0.08 and 0.92 — the actual clamp on paddle travel in
    // `updatePlayers`. Players were guessing where a paddle stops; the court now
    // says so, and the marks stay honest because they are derived from the same
    // constant the simulation clamps to.
    for (const mark of [0.08, 0.5, 0.92]) {
      const along = this.point(mark)
      const depth = w * (mark === 0.5 ? 0.022 : 0.014)
      const lane = this.point(PADDLE_OFFSET)
      this.floor.moveTo(lane - depth, along).lineTo(lane + depth, along)
      this.floor.moveTo(w - lane - depth, along).lineTo(w - lane + depth, along)
      this.floor.moveTo(along, lane - depth).lineTo(along, lane + depth)
      this.floor.moveTo(along, w - lane - depth).lineTo(along, w - lane + depth)
    }
    this.floor.stroke({ color: accent, alpha: 0.3, width: Math.max(1, w * 0.002) })

    this.bezel.clear()
      .roundRect(inset, inset, w - inset * 2, w - inset * 2, w * 0.045)
      .stroke({ color: this.theme.line, width: Math.max(2, w * 0.005) })
    this.bezel
      .roundRect(inset * 0.35, inset * 0.35, w - inset * 0.7, w - inset * 0.7, w * 0.055)
      .stroke({ color: ink, alpha: 0.55, width: Math.max(2, w * 0.012) })
  }

  private dashed(graphics: Graphics, x1: number, y1: number, x2: number, y2: number, dash: number, gap: number): void {
    const length = Math.hypot(x2 - x1, y2 - y1)
    const stepX = (x2 - x1) / length
    const stepY = (y2 - y1) / length
    for (let travelled = 0; travelled < length; travelled += dash + gap) {
      const end = Math.min(length, travelled + dash)
      graphics.moveTo(x1 + stepX * travelled, y1 + stepY * travelled).lineTo(x1 + stepX * end, y1 + stepY * end)
    }
  }

  /** The rim is the heat gauge: it brightens and thickens as the rally accelerates. */
  private drawRim(state: GameState): void {
    const w = this.width
    const inset = w * 0.045
    const breathe = this.settings.reducedMotion ? 0 : Math.sin(this.clock * 2.2) * 0.04
    const intensity = 0.22 + this.heat * 0.55 + breathe * this.heat

    this.rim.clear()
      .roundRect(inset, inset, w - inset * 2, w - inset * 2, w * 0.03)
      .stroke({ color: this.theme.accent, alpha: intensity, width: Math.max(1, w * (0.0018 + this.heat * 0.0032)) })

    if (this.bloomFilter && this.heat > 0.05) {
      this.bloomGraphics
        .roundRect(inset, inset, w - inset * 2, w - inset * 2, w * 0.03)
        .stroke({ color: this.theme.accent, alpha: this.heat * 0.32, width: Math.max(1, w * 0.003) })
    }

    // At high rally heat, short energy packets chase around the four rails. The
    // effect is confined to the bezel so the ball remains the brightest mover.
    if (this.heat > 0.32 && !this.settings.reducedMotion) {
      const travel = 0.11 + ((this.clock * (0.19 + this.heat * 0.12)) % 0.72)
      const span = 0.055 + this.heat * 0.045
      const a = this.point(travel)
      const b = this.point(Math.min(0.89, travel + span))
      const edge = this.point(0.045)
      this.rim.moveTo(a, edge).lineTo(b, edge)
      this.rim.moveTo(w - a, w - edge).lineTo(w - b, w - edge)
      this.rim.moveTo(edge, w - a).lineTo(edge, w - b)
      this.rim.moveTo(w - edge, a).lineTo(w - edge, b)
      this.rim.stroke({ color: this.theme.aura, alpha: 0.35 + this.heat * 0.5, width: Math.max(2, w * 0.006), cap: 'round' })
    }

    // Gravity well and warp gates are world effects, so they belong with the
    // court rather than with the actors that pass through them.
    if (state.worldEffects.gravityTicks > 0) {
      const identity = POWER_UP_IDENTITIES.gravity
      for (let ring = 1; ring <= 3; ring += 1) {
        const phase = (this.clock * 0.55 + ring / 3) % 1
        this.rim.circle(w / 2, w / 2, this.point(0.02 + phase * 0.13))
          .stroke({ color: identity.color, alpha: 0.4 * (1 - phase), width: Math.max(2, w * 0.004) })
      }
      this.bloomGraphics.circle(w / 2, w / 2, this.point(0.05)).fill({ color: identity.color, alpha: 0.35 })
    }
    if (state.worldEffects.warpTicks > 0) {
      this.drawGate(0.32, 0.5, POWER_UP_IDENTITIES.warp.color, 1)
      this.drawGate(0.68, 0.5, this.theme.accent, -1)
    }
  }

  private drawGate(x: number, y: number, color: number, spin: number): void {
    const w = this.width
    const cx = this.point(x)
    const cy = this.point(y)
    // 0.035 is the capture radius `updateWorldEffects` tests against. Drawing the
    // gate at any other size teaches the player the wrong hitbox.
    const radius = this.point(0.035)
    const angle = this.clock * 2.4 * spin
    for (let arc = 0; arc < 3; arc += 1) {
      const start = angle + (arc * Math.PI * 2) / 3
      this.rim.arc(cx, cy, radius, start, start + 1.25)
        .stroke({ color, alpha: 0.85, width: Math.max(3, w * 0.007), cap: 'round' })
    }
    this.bloomGraphics.circle(cx, cy, radius * 0.9).fill({ color, alpha: 0.4 })
  }

  /** Goal-mouth flashes: the wall that just conceded is painted in the scorer's colour. */
  private drawWalls(deltaSeconds: number): void {
    const w = this.width
    this.walls.clear()
    for (const flash of this.wallFlashes) {
      flash.life -= deltaSeconds * 1.5
      if (flash.life <= 0) continue
      const band = w * 0.09
      if (flash.side === 'left') this.walls.rect(0, 0, band, w)
      else if (flash.side === 'right') this.walls.rect(w - band, 0, band, w)
      else if (flash.side === 'top') this.walls.rect(0, 0, w, band)
      else this.walls.rect(0, w - band, w, band)
      this.walls.fill({ color: flash.color, alpha: clamp01(flash.life) * 0.45 })
    }
    this.wallFlashes = this.wallFlashes.filter((flash) => flash.life > 0)
  }

  private drawActors(state: GameState, ahead: number): void {
    this.actors.clear()
    for (const player of Object.values(state.players)) this.drawPaddle(player, state, ahead)
    for (const ball of state.balls) {
      const owner = ball.lastToucherId ? state.players[ball.lastToucherId] : undefined
      const color = owner?.color ?? COURT_PALETTE.paper.color
      const x = clamp01(ball.x + ball.vx * ahead)
      const y = clamp01(ball.y + ball.vy * ahead)
      const speed = Math.hypot(ball.vx, ball.vy)
      const radius = Math.max(4, this.point(ball.radius))

      // Squash and stretch along the direction of travel, with the product held
      // at 1 so the ball never looks like it grew.
      const stretch = 1 + 0.38 * clamp01(speed / BALL_SPEED_CAP)
      if (this.heat > 0.45 && !this.settings.reducedMotion) {
        const direction = Math.atan2(ball.vy, ball.vx)
        const offset = (radius * (0.35 + this.heat * 0.55)) / this.width
        const dx = Math.cos(direction + Math.PI / 2) * offset
        const dy = Math.sin(direction + Math.PI / 2) * offset
        this.rotatedEllipse(this.actors, x - dx, y - dy, radius * stretch, radius / stretch, direction)
        this.actors.fill({ color: 0x67d4ff, alpha: this.heat * 0.2 })
        this.rotatedEllipse(this.actors, x + dx, y + dy, radius * stretch, radius / stretch, direction)
        this.actors.fill({ color: 0xf36f44, alpha: this.heat * 0.17 })
      }
      this.rotatedEllipse(this.actors, x, y, radius * stretch, radius / stretch, Math.atan2(ball.vy, ball.vx))
      this.actors.fill({ color: COURT_PALETTE.paper.color })
        .stroke({ color, alpha: 0.9, width: Math.max(2, this.width * (0.003 + this.heat * 0.003)) })

      if (this.bloomFilter) {
        this.bloomGraphics.circle(this.point(x), this.point(y), radius * (1.7 + this.heat * 1.4))
          .fill({ color, alpha: 0.34 + this.heat * 0.3 })
      }
    }
    this.drawPowerUp(state)
  }

  private drawPaddle(player: PlayerState, state: GameState, ahead: number): void {
    const w = this.width
    const seat = seatIdentityForColor(player.color)
    const length = this.point(player.growTicks > 0 ? GROWN_PADDLE_LENGTH : BASE_PADDLE_LENGTH)
    const thickness = Math.max(8, w * 0.019)
    const offset = this.point(PADDLE_OFFSET)
    const position = Math.min(0.92, Math.max(0.08, player.position + player.velocity * ahead))
    const along = this.point(position)
    const horizontal = player.side === 'top' || player.side === 'bottom'

    const x = horizontal ? along - length / 2 : (player.side === 'left' ? offset : w - offset) - thickness / 2
    const y = horizontal ? (player.side === 'top' ? offset : w - offset) - thickness / 2 : along - length / 2
    const width = horizontal ? length : thickness
    const height = horizontal ? thickness : length

    this.actors.roundRect(x, y, width, height, thickness / 2).fill({ color: player.color })
    // A single highlight along the paddle face gives it a lit edge without a
    // second material or a texture.
    this.actors.roundRect(
      horizontal ? x + length * 0.06 : x + thickness * 0.24,
      horizontal ? y + thickness * 0.24 : y + length * 0.06,
      horizontal ? length * 0.88 : thickness * 0.28,
      horizontal ? thickness * 0.28 : length * 0.88,
      thickness * 0.14,
    ).fill({ color: COURT_PALETTE.paper.color, alpha: 0.22 })

    this.drawSeatMark(seat, x, y, width, height, horizontal, length, thickness)
    this.drawCooldown(player, x, y, width, height, horizontal, length, thickness)
    if (this.focusPlayerIds.has(player.id)) this.drawFocusMarker(player.side, x, y, width, height, thickness)

    if (this.bloomFilter) {
      const ready = player.cooldownTicks <= 0 ? 0.3 : 0
      this.bloomGraphics.roundRect(x, y, width, height, thickness / 2)
        .fill({ color: player.color, alpha: 0.2 + ready + this.heat * 0.18 })
    }

    if (player.guardTicks > 0) this.drawGuard(player.side, player.color)
    if (player.pulseTicks > 0) {
      const centreX = horizontal ? along : player.side === 'left' ? offset : w - offset
      const centreY = horizontal ? (player.side === 'top' ? offset : w - offset) : along
      this.overlays.circle(centreX, centreY, length * 0.78)
        .stroke({ color: player.color, alpha: 0.6, width: Math.max(2, w * 0.006) })
    }
    if (state.phase === 'countdown' && !this.settings.reducedMotion) {
      // A pre-serve breath on every paddle: the court is alive before the ball is.
      const pulse = 0.5 + Math.sin(this.clock * 4 + seat.index) * 0.5
      this.overlays.roundRect(x - thickness * 0.35, y - thickness * 0.35, width + thickness * 0.7, height + thickness * 0.7, thickness)
        .stroke({ color: player.color, alpha: 0.12 + pulse * 0.2, width: Math.max(1, w * 0.0025) })
    }
  }

  /** A persistent outline and outward arrow identify the paddle owned by this client. */
  private drawFocusMarker(side: Side, x: number, y: number, width: number, height: number, thickness: number): void {
    const pad = Math.max(2, thickness * 0.42)
    this.overlays.roundRect(x - pad, y - pad, width + pad * 2, height + pad * 2, thickness)
      .stroke({ color: COURT_PALETTE.paper.color, alpha: 0.82, width: Math.max(2, thickness * 0.2) })

    const centreX = x + width / 2
    const centreY = y + height / 2
    const outwardX = side === 'left' ? -1 : side === 'right' ? 1 : 0
    const outwardY = side === 'top' ? -1 : side === 'bottom' ? 1 : 0
    const perpendicularX = -outwardY
    const perpendicularY = outwardX
    const tipDistance = thickness * 2.5
    const baseDistance = thickness * 1.55
    const wing = thickness * 0.55
    this.overlays.poly([
      centreX + outwardX * tipDistance,
      centreY + outwardY * tipDistance,
      centreX + outwardX * baseDistance + perpendicularX * wing,
      centreY + outwardY * baseDistance + perpendicularY * wing,
      centreX + outwardX * baseDistance - perpendicularX * wing,
      centreY + outwardY * baseDistance - perpendicularY * wing,
    ]).fill({ color: COURT_PALETTE.paper.color, alpha: 0.9 })
  }

  /**
   * Colour-independent seat marks, cut into the paddle in court ink.
   *
   * PLAN.md promised "accessible player patterns" and colour alone did not
   * deliver them: seats 2 and 3 are a cyan/violet pair that collapse toward each
   * other under deuteranopia and in a greyscale screenshot. Count and presence
   * survive that and survive the ~8px paddle a phone actually draws; fine shape
   * does not, so none of these ask the eye to resolve an outline.
   */
  private drawSeatMark(
    seat: SeatIdentity,
    x: number,
    y: number,
    width: number,
    height: number,
    horizontal: boolean,
    length: number,
    thickness: number,
  ): void {
    if (seat.pattern === 'solid') return
    const ink = COURT_PALETTE.ink.color
    const alpha = 0.6
    const markThickness = thickness * 0.34
    const centreX = x + width / 2
    const centreY = y + height / 2

    if (seat.pattern === 'bar') {
      const size = length * 0.16
      this.actors.roundRect(
        horizontal ? centreX - size / 2 : centreX - markThickness / 2,
        horizontal ? centreY - markThickness / 2 : centreY - size / 2,
        horizontal ? size : markThickness,
        horizontal ? markThickness : size,
        markThickness / 2,
      ).fill({ color: ink, alpha })
      return
    }

    if (seat.pattern === 'notch') {
      const size = length * 0.1
      for (const side of [-1, 1]) {
        const shift = side * length * 0.33
        this.actors.roundRect(
          horizontal ? centreX + shift - size / 2 : centreX - markThickness / 2,
          horizontal ? centreY - markThickness / 2 : centreY + shift - size / 2,
          horizontal ? size : markThickness,
          horizontal ? markThickness : size,
          markThickness / 2,
        ).fill({ color: ink, alpha })
      }
      return
    }

    const radius = thickness * 0.19
    for (const step of [-1, 0, 1]) {
      const shift = step * length * 0.2
      this.actors.circle(
        horizontal ? centreX + shift : centreX,
        horizontal ? centreY : centreY + shift,
        radius,
      ).fill({ color: ink, alpha })
    }
  }

  /**
   * Ability readiness, drawn on the paddle.
   *
   * It used to live only in a button below the court, which is the one place a
   * player mid-rally is not looking. The bar runs along the outward face so it
   * never overlaps the contact surface, and it fills *toward* ready rather than
   * draining, because the useful question is "how soon" and not "how long ago".
   */
  private drawCooldown(
    player: PlayerState,
    x: number,
    y: number,
    width: number,
    height: number,
    horizontal: boolean,
    length: number,
    thickness: number,
  ): void {
    const total = ABILITY_COOLDOWNS[player.ability]
    const ready = player.cooldownTicks <= 0
    const progress = ready ? 1 : clamp01(1 - player.cooldownTicks / total)
    const bar = thickness * 0.18
    const gap = thickness * 0.5
    // The track is deliberately shorter than the paddle. A full-length bar in
    // paper white sat close enough to the paddle to read as a second paddle, or
    // as the wall — exactly the confusion a readability aid must not create.
    const track = length * 0.62
    const outward = player.side === 'left' || player.side === 'top' ? -1 : 1
    const filled = track * progress
    const start = (length - track) / 2

    const trackX = horizontal ? x + start : x + (outward < 0 ? -gap : width + gap - bar)
    const trackY = horizontal ? y + (outward < 0 ? -gap : height + gap - bar) : y + start

    this.overlays
      .roundRect(trackX, trackY, horizontal ? track : bar, horizontal ? bar : track, bar / 2)
      .fill({ color: COURT_PALETTE.ink.color, alpha: 0.45 })
    this.overlays.roundRect(
      horizontal ? trackX + (track - filled) / 2 : trackX,
      horizontal ? trackY : trackY + (track - filled) / 2,
      horizontal ? filled : bar,
      horizontal ? bar : filled,
      bar / 2,
    ).fill({ color: player.color, alpha: ready ? 0.95 : 0.55 })
  }

  private drawGuard(side: Side, color: number): void {
    const w = this.width
    const gap = w * 0.012
    if (side === 'left') this.overlays.moveTo(gap, w * 0.08).lineTo(gap, w * 0.92)
    else if (side === 'right') this.overlays.moveTo(w - gap, w * 0.08).lineTo(w - gap, w * 0.92)
    else if (side === 'top') this.overlays.moveTo(w * 0.08, gap).lineTo(w * 0.92, gap)
    else this.overlays.moveTo(w * 0.08, w - gap).lineTo(w * 0.92, w - gap)
    this.overlays.stroke({ color, alpha: 0.7, width: Math.max(3, w * 0.008), cap: 'round' })
    if (this.bloomFilter) {
      this.bloomGraphics.circle(
        side === 'left' ? gap : side === 'right' ? w - gap : w / 2,
        side === 'top' ? gap : side === 'bottom' ? w - gap : w / 2,
        w * 0.03,
      ).fill({ color, alpha: 0.3 })
    }
  }

  private drawPowerUp(state: GameState): void {
    if (!state.powerUp) return
    const identity = POWER_UP_IDENTITIES[state.powerUp.id]
    const w = this.width
    const cx = this.point(state.powerUp.x)
    const cy = this.point(state.powerUp.y)
    // 0.028 is the capture radius in `updatePowerUp`; the orb is drawn to match.
    const radius = this.point(0.028)
    const pulse = this.settings.reducedMotion ? 1 : 1 + Math.sin(this.clock * 5) * 0.09

    this.actors.circle(cx, cy, radius * pulse).fill({ color: COURT_PALETTE.ink.color, alpha: 0.85 })
    this.actors.circle(cx, cy, radius * pulse)
      .stroke({ color: identity.color, alpha: 0.95, width: Math.max(2, w * 0.005) })
    this.drawPowerGlyph(identity.glyph, cx, cy, radius * 0.56, identity.color)
    if (this.bloomFilter) {
      this.bloomGraphics.circle(cx, cy, radius * 1.8).fill({ color: identity.color, alpha: 0.3 })
    }
  }

  /**
   * Vector glyphs, not letters.
   *
   * The orb used to be labelled `id[0]`, which gives **G** for both Grow and
   * Gravity — the two power-ups least alike in effect — and it was set in
   * Manrope, so before the webfont loaded it was a fallback letter at a
   * different width. Shapes have neither problem.
   */
  private drawPowerGlyph(glyph: string, cx: number, cy: number, size: number, color: number): void {
    const stroke = { color, alpha: 1, width: Math.max(2, size * 0.28), cap: 'round' as const, join: 'round' as const }
    if (glyph === 'extend') {
      this.actors.moveTo(cx - size, cy).lineTo(cx + size, cy).stroke(stroke)
      this.actors.moveTo(cx - size * 0.45, cy - size * 0.5).lineTo(cx - size, cy).lineTo(cx - size * 0.45, cy + size * 0.5).stroke(stroke)
      this.actors.moveTo(cx + size * 0.45, cy - size * 0.5).lineTo(cx + size, cy).lineTo(cx + size * 0.45, cy + size * 0.5).stroke(stroke)
    } else if (glyph === 'chevron') {
      for (const shift of [-size * 0.5, size * 0.25]) {
        this.actors.moveTo(cx + shift - size * 0.2, cy - size * 0.6)
          .lineTo(cx + shift + size * 0.35, cy)
          .lineTo(cx + shift - size * 0.2, cy + size * 0.6)
          .stroke(stroke)
      }
    } else if (glyph === 'orbs') {
      this.actors.circle(cx, cy - size * 0.45, size * 0.34).fill({ color })
      this.actors.circle(cx - size * 0.55, cy + size * 0.4, size * 0.34).fill({ color })
      this.actors.circle(cx + size * 0.55, cy + size * 0.4, size * 0.34).fill({ color })
    } else if (glyph === 'gate') {
      this.actors.arc(cx - size * 0.35, cy, size * 0.75, Math.PI * 0.55, Math.PI * 1.45).stroke(stroke)
      this.actors.arc(cx + size * 0.35, cy, size * 0.75, Math.PI * 1.55, Math.PI * 0.45).stroke(stroke)
    } else {
      this.actors.circle(cx, cy, size * 0.9).stroke(stroke)
      this.actors.circle(cx, cy, size * 0.3).fill({ color })
    }
  }

  private drawOverlays(state: GameState, deltaSeconds: number): void {
    const w = this.width
    for (const wave of this.shockwaves) {
      wave.life -= deltaSeconds * 2.6
      if (wave.life <= 0) continue
      const progress = 1 - wave.life
      this.overlays.circle(this.point(wave.x), this.point(wave.y), this.point(wave.reach * progress))
        .stroke({ color: wave.color, alpha: wave.life * 0.55, width: Math.max(1, w * 0.006 * wave.life) })
    }
    this.shockwaves = this.shockwaves.filter((wave) => wave.life > 0)

    if (this.goalFlash) {
      this.goalFlash.life -= deltaSeconds * 1.45
      const life = Math.max(0, this.goalFlash.life)
      if (life > 0) {
        const band = w * (0.12 + (1 - Math.min(1, life)) * 0.1)
        this.overlays.rect(0, 0, w, w).fill({ color: this.goalFlash.color, alpha: life * life * 0.11 })
        if (this.goalFlash.side === 'left') this.overlays.rect(0, 0, band, w)
        else if (this.goalFlash.side === 'right') this.overlays.rect(w - band, 0, band, w)
        else if (this.goalFlash.side === 'top') this.overlays.rect(0, 0, w, band)
        else this.overlays.rect(0, w - band, w, band)
        this.overlays.fill({ color: this.goalFlash.color, alpha: life * 0.26 })
      } else {
        this.goalFlash = null
      }
    }

    for (const slice of this.impactSlices) {
      slice.life -= deltaSeconds * 4.2
      if (slice.life <= 0) continue
      const cx = this.point(slice.x)
      const cy = this.point(slice.y)
      const angle = slice.angle + Math.PI / 2
      const span = w * (0.03 + 0.09 * slice.life)
      const dx = Math.cos(angle) * span
      const dy = Math.sin(angle) * span
      // One line, in the striker's own colour. It used to be three: a cyan copy
      // and an ember copy flanking the real one, hard-coded to seats 2 and 3 and
      // therefore meaningless in a duel where neither seat is playing. Together
      // with the channel split they read as the screen tearing, not as contact.
      this.overlays.moveTo(cx - dx, cy - dy).lineTo(cx + dx, cy + dy)
        .stroke({ color: slice.color, alpha: slice.life * 0.9, width: Math.max(2, w * 0.007), cap: 'round' })
    }
    this.impactSlices = this.impactSlices.filter((slice) => slice.life > 0)

    for (const burst of this.abilityBursts) {
      burst.life -= deltaSeconds * 2.5
      if (burst.life <= 0) continue
      const progress = 1 - burst.life
      const cx = this.point(burst.x)
      const cy = this.point(burst.y)
      const radius = w * (0.03 + progress * 0.12)
      if (burst.ability === 'dash') {
        this.drawDashBurst(burst)
      } else if (burst.ability === 'pulse') {
        for (let ring = 0; ring < 3; ring += 1) {
          this.overlays.circle(cx, cy, radius * (0.62 + ring * 0.28))
            .stroke({ color: burst.color, alpha: burst.life * (0.72 - ring * 0.16), width: Math.max(1, w * 0.006) })
        }
      } else if (burst.ability === 'guard') {
        const points: number[] = []
        for (let index = 0; index < 6; index += 1) {
          const angle = -Math.PI / 2 + index * Math.PI / 3
          points.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
        }
        this.overlays.poly(points).stroke({ color: burst.color, alpha: burst.life * 0.82, width: Math.max(2, w * 0.007), join: 'round' })
      } else if (burst.ability === 'bend') {
        const spin = this.clock * 5
        for (let arc = 0; arc < 3; arc += 1) {
          const start = spin + arc * Math.PI * 2 / 3
          this.overlays.arc(cx, cy, radius * (0.72 + arc * 0.12), start, start + 1.5)
            .stroke({ color: burst.color, alpha: burst.life * 0.75, width: Math.max(2, w * 0.006), cap: 'round' })
        }
      }
    }
    this.abilityBursts = this.abilityBursts.filter((burst) => burst.life > 0)

    // The serve telegraph is instructional, not decoration. The chevrons use
    // game-core's exact serve vector and update with the server's paddle, so
    // moving during the pause visibly aims the launch. They remain in reduced
    // motion mode; only the expanding ring is removed.
    if (state.serveTicks > 0 && state.phase === 'playing') {
      if (!this.settings.reducedMotion) {
        const pulse = (this.clock * 1.6) % 1
        this.overlays.circle(w / 2, w / 2, this.point(0.03 + pulse * 0.09))
          .stroke({ color: COURT_PALETTE.paper.color, alpha: (1 - pulse) * 0.5, width: Math.max(1, w * 0.004) })
      }
      const server = state.servingPlayerId ? state.players[state.servingPlayerId] : undefined
      if (server) this.drawServeAim(server)
    }
  }

  /** Three compact chevrons read as direction without becoming another trail. */
  private drawServeAim(server: PlayerState): void {
    const velocity = serveVelocityForPlayer(server)
    const speed = Math.hypot(velocity.vx, velocity.vy) || 1
    const forwardX = velocity.vx / speed
    const forwardY = velocity.vy / speed
    const sideX = -forwardY
    const sideY = forwardX
    const centre = this.width / 2
    for (let index = 0; index < 3; index += 1) {
      const distance = this.width * (0.052 + index * 0.033)
      const wing = this.width * (0.011 + index * 0.0015)
      const depth = this.width * 0.018
      const tipX = centre + forwardX * distance
      const tipY = centre + forwardY * distance
      const backX = tipX - forwardX * depth
      const backY = tipY - forwardY * depth
      this.overlays
        .moveTo(backX + sideX * wing, backY + sideY * wing)
        .lineTo(tipX, tipY)
        .lineTo(backX - sideX * wing, backY - sideY * wing)
        .stroke({ color: server.color, alpha: 0.48 + index * 0.18, width: Math.max(2, this.width * 0.005), cap: 'round', join: 'round' })
    }
  }

  /**
   * Dash is represented as movement, not an explosion: three fading copies of
   * the paddle connect its real start and finish, and one arrow states the
   * direction. There are intentionally no radial rings or inward-facing rays.
   */
  private drawDashBurst(burst: AbilityBurst): void {
    const w = this.width
    const from = this.anchorAt(burst.side, burst.fromPosition)
    const to = this.anchorAt(burst.side, burst.toPosition)
    const fromX = this.point(from.x)
    const fromY = this.point(from.y)
    const toX = this.point(to.x)
    const toY = this.point(to.y)
    const dx = toX - fromX
    const dy = toY - fromY
    const distance = Math.hypot(dx, dy)
    if (distance < 1) return

    const horizontal = burst.side === 'top' || burst.side === 'bottom'
    const length = this.point(BASE_PADDLE_LENGTH * 0.72)
    const thickness = Math.max(7, w * 0.015)
    for (let index = 0; index < 3; index += 1) {
      const progress = (index + 1) / 4
      const centreX = fromX + dx * progress
      const centreY = fromY + dy * progress
      this.overlays.roundRect(
        centreX - (horizontal ? length : thickness) / 2,
        centreY - (horizontal ? thickness : length) / 2,
        horizontal ? length : thickness,
        horizontal ? thickness : length,
        thickness / 2,
      ).fill({ color: burst.color, alpha: burst.life * (0.12 + index * 0.1) })
    }

    const directionX = dx / distance
    const directionY = dy / distance
    const perpendicularX = -directionY
    const perpendicularY = directionX
    const arrowX = fromX + dx * 0.72
    const arrowY = fromY + dy * 0.72
    const arrowLength = Math.min(w * 0.055, distance * 0.22)
    const wing = Math.min(w * 0.022, distance * 0.1)
    this.overlays.poly([
      arrowX + directionX * arrowLength,
      arrowY + directionY * arrowLength,
      arrowX - directionX * arrowLength + perpendicularX * wing,
      arrowY - directionY * arrowLength + perpendicularY * wing,
      arrowX - directionX * arrowLength - perpendicularX * wing,
      arrowY - directionY * arrowLength - perpendicularY * wing,
    ]).fill({ color: COURT_PALETTE.paper.color, alpha: burst.life * 0.9 })
  }

  private drawTrails(state: GameState, deltaSeconds: number, ahead: number): void {
    const maximum = this.settings.reducedMotion
      ? 4
      : Math.round(this.density.trail * (0.7 + this.heat * 0.5))

    for (const ball of state.balls) {
      const points = this.trails.get(ball.id) ?? []
      points.push({ x: ball.x + ball.vx * ahead, y: ball.y + ball.vy * ahead, life: 1 })
      while (points.length > maximum) points.shift()
      for (const point of points) point.life -= deltaSeconds * 2.7
      this.trails.set(ball.id, points.filter((point) => point.life > 0))
    }
    // Multiball spawns and expires transient balls, so trails outlive their ball
    // unless they are reaped here. Deleting the current key mid-iteration is
    // defined behaviour for Map, so no snapshot of the keys is needed.
    for (const id of this.trails.keys()) {
      if (!state.balls.some((ball) => ball.id === id)) this.trails.delete(id)
    }

    this.trail.clear()
    for (const [ballId, points] of this.trails) {
      if (points.length < 2) continue
      const ball = state.balls.find((candidate) => candidate.id === ballId)
      const owner = ball?.lastToucherId ? state.players[ball.lastToucherId] : undefined
      const color = owner?.color ?? COURT_PALETTE.paper.color
      const head = Math.max(3, this.point(ball?.radius ?? 0.015)) * 1.05

      // Quads rather than one polyline: a constant-width, constant-alpha stroke
      // reads as a wire dragged behind the ball. Tapering both width and alpha
      // toward the tail is what makes it read as motion.
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1]!
        const to = points[index]!
        const fromWeight = index / points.length
        const toWeight = (index + 1) / points.length
        const dx = to.x - from.x
        const dy = to.y - from.y
        const span = Math.hypot(dx, dy) || 1
        const nx = (-dy / span) * head
        const ny = (dx / span) * head
        const fx = this.point(from.x)
        const fy = this.point(from.y)
        const tx = this.point(to.x)
        const ty = this.point(to.y)
        this.trail.poly([
          fx + nx * fromWeight, fy + ny * fromWeight,
          tx + nx * toWeight, ty + ny * toWeight,
          tx - nx * toWeight, ty - ny * toWeight,
          fx - nx * fromWeight, fy - ny * fromWeight,
        ]).fill({ color, alpha: 0.06 + 0.3 * toWeight * clamp01(to.life) })
      }
    }
  }

  private wave(x: number, y: number, color: number, reach: number): void {
    if (this.settings.reducedMotion || !this.density.waves) return
    this.shockwaves.push({ x, y, life: 1, color, reach })
  }

  /** A spark cone aimed along `angle`, so an impact reads as a deflection. */
  private cone(x: number, y: number, angle: number, color: number, requested: number, spreadScale: number): void {
    if (this.settings.reducedMotion) return
    const count = Math.round(requested * this.density.particles)
    for (let index = 0; index < count; index += 1) {
      const direction = angle + (Math.random() - 0.5) * 1.5 * spreadScale
      const speed = 0.16 + Math.random() * 0.5
      this.particles.push({
        x,
        y,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        life: 1,
        decay: 1.9 + Math.random() * 1.4,
        color,
        size: 1.6 + Math.random() * 3.4,
      })
    }
  }

  private goalSpray(side: Side, color: number): void {
    const inward = side === 'left' ? 0 : side === 'right' ? Math.PI : side === 'top' ? Math.PI / 2 : -Math.PI / 2
    const horizontal = side === 'top' || side === 'bottom'
    for (let index = 0; index < 14; index += 1) {
      const along = 0.12 + Math.random() * 0.76
      this.cone(
        horizontal ? along : side === 'left' ? 0.02 : 0.98,
        horizontal ? (side === 'top' ? 0.02 : 0.98) : along,
        inward,
        color,
        3,
        0.8,
      )
    }
  }

  private updateParticles(deltaSeconds: number): void {
    this.particlesLayer.clear()
    for (const particle of this.particles) {
      particle.x += particle.vx * deltaSeconds
      particle.y += particle.vy * deltaSeconds
      const drag = Math.pow(0.12, deltaSeconds)
      particle.vx *= drag
      particle.vy *= drag
      particle.life -= deltaSeconds * particle.decay
      if (particle.life <= 0) continue
      this.particlesLayer
        .circle(this.point(particle.x), this.point(particle.y), particle.size * Math.max(0.2, particle.life))
        .fill({ color: particle.color, alpha: Math.max(0, particle.life) * 0.85 })
    }
    this.particles = this.particles.filter((particle) => particle.life > 0)
  }

  /**
   * Pixi `Graphics` has no rotated-ellipse primitive and `Graphics.rotation`
   * would spin the whole layer, so the path is tessellated. Twenty segments is
   * indistinguishable from a curve at the sizes a ball is ever drawn.
   */
  private rotatedEllipse(graphics: Graphics, x: number, y: number, rx: number, ry: number, rotation: number): void {
    const cx = this.point(x)
    const cy = this.point(y)
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const segments = 20
    for (let index = 0; index <= segments; index += 1) {
      const theta = (index / segments) * Math.PI * 2
      const px = Math.cos(theta) * rx
      const py = Math.sin(theta) * ry
      const rotatedX = cx + px * cos - py * sin
      const rotatedY = cy + px * sin + py * cos
      if (index === 0) graphics.moveTo(rotatedX, rotatedY)
      else graphics.lineTo(rotatedX, rotatedY)
    }
    graphics.closePath()
  }
}
