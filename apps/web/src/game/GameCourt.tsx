import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MALLET_SPEED,
  PAL_COST,
  PAL_ENERGY_MAX,
  PAL_IDENTITIES,
  PAL_PROFILE,
  TICK_RATE,
  canUsePalCard,
  secondsRemaining,
  seatIdentityForColor,
  type GameState,
  type PalType,
  type PlayerState,
} from '@pongapp/game-core'
import { GameAudio } from './audio'
import { PAL_SPRITE_URLS } from './palAssets'
import { screenPointToWorld, screenVectorToWorld, visiblePointerTarget, type CourtPoint } from './perspective'
import { PixiCourt, type CourtEffectsSettings, type CourtPerformanceSample } from './PixiCourt'

interface NetworkStatus {
  latencyMs: number | null
  latencyP95Ms: number | null
  jitterMs: number | null
  quality: 'good' | 'fair' | 'poor'
  reconnecting?: boolean
}

interface Props {
  getState: () => GameState
  subscribe: (listener: (state: GameState) => void) => () => void
  onTarget: (playerId: string, x: number, y: number) => void
  onPalAction: (playerId: string, type: PalType) => void
  onExit: () => void
  localPlayerIds: string[]
  settings: CourtEffectsSettings
  muted: boolean
  title: string
  subtitle: string
  onRematch?: () => void
  network?: NetworkStatus
  onPerformanceSample?: (sample: CourtPerformanceSample) => void
}

const PAL_ORDER: PalType[] = ['guard', 'striker', 'captain']
const PAL_SHORT_EFFECT: Record<PalType, string> = {
  guard: 'steal & clear',
  striker: 'rope & sling',
  captain: 'raid & shoot',
}
const PAL_CARD_LABEL: Record<PalType, string> = { guard: 'Bumper', striker: 'Hook', captain: 'Captain' }

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0
}

function secondsLabel(state: GameState): string {
  if (state.overtime) return 'FINAL VOLLEY'
  const seconds = secondsRemaining(state)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function countdownValue(state: GameState): number | null {
  if (state.phase !== 'countdown') return null
  return Math.max(1, Math.ceil(state.countdownTicks / TICK_RATE))
}

function resultLabel(state: GameState, player: PlayerState | undefined): string {
  if (!player) return 'Match complete'
  return state.winnerTeam === player.team ? 'You win!' : 'They win!'
}

function PalGlyph({ type }: { type: PalType }) {
  return <img src={PAL_SPRITE_URLS[type]} alt="" aria-hidden="true" />
}

function EnergyMeter({ player, flipped = false }: { player: PlayerState; flipped?: boolean }) {
  return (
    <div className={`pg-energy${flipped ? ' pg-energy--flipped' : ''}`} aria-label={`${player.palEnergy} of ${PAL_ENERGY_MAX} Pal energy`}>
      <span className="pg-energy__label">PAL POWER</span>
      <div className="pg-energy__pips">
        {Array.from({ length: PAL_ENERGY_MAX }, (_, index) => <i key={index} className={index < player.palEnergy ? 'is-full' : ''} />)}
      </div>
    </div>
  )
}

function PalTray({ state, player, onAction, top = false }: { state: GameState; player: PlayerState; onAction: (type: PalType) => void; top?: boolean }) {
  return (
    <div className={`pg-pal-console${top ? ' pg-pal-console--top' : ''}`}>
      <EnergyMeter player={player} flipped={top} />
      <div className="pg-pal-tray" aria-label={`${player.name} Pal cards`}>
        {PAL_ORDER.map((type) => {
          const identity = PAL_IDENTITIES[type]
          const active = state.pals.find((pal) => pal.ownerId === player.id && pal.type === type)
          const enabled = canUsePalCard(state, player, type)
          const hearts = active ? `${'♥'.repeat(active.health)}${'♡'.repeat(Math.max(0, active.maxHealth - active.health))}` : ''
          return (
            <button
              key={type}
              className={`pg-pal-card pg-pal-card--${type}${enabled ? ' is-ready' : ''}${active ? ' is-active' : ''}`}
              disabled={!enabled}
              onClick={() => onAction(type)}
              aria-label={active
                ? `Command ${identity.label}. ${hearts}. ${identity.effect}`
                : `Call ${identity.label}. Costs ${PAL_COST[type]} energy. ${identity.effect}`}
            >
              <span className="pg-pal-card__glyph"><PalGlyph type={type} /></span>
              <span className="pg-pal-card__copy">
                <strong>{PAL_CARD_LABEL[type]}</strong>
                <small>{active ? `${hearts} · command` : PAL_SHORT_EFFECT[type]}</small>
              </span>
              <span className="pg-pal-card__cost">{active ? 'GO!' : <>{PAL_PROFILE[type].cost}<i>✦</i></>}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function GameCourt(props: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PixiCourt | null>(null)
  const [state, setState] = useState(() => props.getState())
  const audio = useMemo(() => new GameAudio(), [])
  const localPlayers = props.localPlayerIds.map((id) => state.players[id]).filter((player): player is PlayerState => Boolean(player))
  const primaryPlayer = localPlayers[0]
  const viewSide = primaryPlayer?.side ?? 'bottom'
  const desired = useRef<Record<string, CourtPoint>>({})
  const heldKeys = useRef(new Set<string>())
  const pointerPlayers = useRef(new Map<number, string>())
  const performanceListener = useRef(props.onPerformanceSample)
  const lastUiTick = useRef(state.tick)
  const lastUiPhase = useRef(state.phase)

  useEffect(() => { audio.setMuted(props.muted) }, [audio, props.muted])
  useEffect(() => { performanceListener.current = props.onPerformanceSample }, [props.onPerformanceSample])
  useEffect(() => () => { void audio.destroy() }, [audio])

  useEffect(() => {
    const element = mountRef.current
    if (!element) return
    let cancelled = false
    const renderer = new PixiCourt(props.settings, props.localPlayerIds, viewSide)
    rendererRef.current = renderer
    let frame = 0
    let previous = performance.now()
    let sampleStartedAt = previous
    let frameGaps: number[] = []
    let renderDurations: number[] = []
    let resetAfterVisibilityChange = false
    const onVisibilityChange = () => { resetAfterVisibilityChange = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    void renderer.mount(element).then(() => {
      if (cancelled) return
      const draw = (now: number) => {
        if (resetAfterVisibilityChange) {
          resetAfterVisibilityChange = false
          previous = now
          sampleStartedAt = now
          frameGaps = []
          renderDurations = []
        }
        const frameGap = Math.max(0, now - previous)
        const delta = Math.min(0.05, frameGap / 1000)
        previous = now
        const renderStartedAt = performance.now()
        renderer.render(props.getState(), delta)
        const renderDuration = performance.now() - renderStartedAt
        frameGaps.push(frameGap)
        renderDurations.push(renderDuration)
        if (now - sampleStartedAt >= 10_000) {
          const frameGapP95Ms = Math.round(percentile(frameGaps, 0.95))
          const sample = {
            frameGapP95Ms,
            maxFrameGapMs: Math.round(Math.max(0, ...frameGaps)),
            renderP95Ms: Math.round(percentile(renderDurations, 0.95)),
            longFrameCount: frameGaps.filter((value) => value > 50).length,
            freezeCount: frameGaps.filter((value) => value > 250).length,
            ...renderer.performanceProfile(),
          }
          if (sample.freezeCount > 0 || frameGapP95Ms > 34 || sample.renderP95Ms > 18) renderer.setAdaptivePerformance(true)
          performanceListener.current?.({ ...sample, ...renderer.performanceProfile() })
          frameGaps = []
          renderDurations = []
          sampleStartedAt = now
        }
        frame = requestAnimationFrame(draw)
      }
      frame = requestAnimationFrame(draw)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      renderer.destroy()
      rendererRef.current = null
    }
  }, [props.getState, props.localPlayerIds.join('\u001f'), viewSide])

  useEffect(() => rendererRef.current?.updateSettings(props.settings), [props.settings])

  useEffect(() => props.subscribe((next) => {
    const urgent = next.phase !== lastUiPhase.current || next.events.some((event) => (
      event.type === 'score' || event.type === 'matchStart' || event.type === 'matchEnd'
      || event.type === 'palSummoned' || event.type === 'palDamaged' || event.type === 'palStunned'
      || event.type === 'palPowered' || event.type === 'starSpawned'
    ))
    if (urgent || next.tick - lastUiTick.current >= 6) {
      lastUiTick.current = next.tick
      lastUiPhase.current = next.phase
      setState(next)
    }
    rendererRef.current?.onEvents(next.events, next)
    for (const event of next.events) audio.play(event)
  }), [audio, props.subscribe])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      heldKeys.current.add(event.code)
      if (!primaryPlayer || event.repeat) return
      const type = event.code === 'Digit1' ? 'guard' : event.code === 'Digit2' ? 'striker' : event.code === 'Digit3' ? 'captain' : null
      if (type) props.onPalAction(primaryPlayer.id, type)
    }
    const up = (event: KeyboardEvent) => heldKeys.current.delete(event.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    let frame = 0
    let previous = performance.now()
    const move = (now: number) => {
      const delta = Math.min(0.05, (now - previous) / 1000)
      previous = now
      if (primaryPlayer) {
        const screenVector = {
          x: Number(heldKeys.current.has('ArrowRight') || heldKeys.current.has('KeyD')) - Number(heldKeys.current.has('ArrowLeft') || heldKeys.current.has('KeyA')),
          y: Number(heldKeys.current.has('ArrowDown') || heldKeys.current.has('KeyS')) - Number(heldKeys.current.has('ArrowUp') || heldKeys.current.has('KeyW')),
        }
        if (screenVector.x || screenVector.y) {
          const world = screenVectorToWorld(screenVector, viewSide)
          const length = Math.max(1, Math.hypot(world.x, world.y))
          const current = desired.current[primaryPlayer.id] ?? { x: primaryPlayer.x, y: primaryPlayer.y }
          const next = {
            x: Math.max(0, Math.min(1, current.x + world.x / length * MALLET_SPEED * delta)),
            y: Math.max(0, Math.min(1, current.y + world.y / length * MALLET_SPEED / state.config.courtLengthScale * delta)),
          }
          desired.current[primaryPlayer.id] = next
          props.onTarget(primaryPlayer.id, next.x, next.y)
        }
      }
      frame = requestAnimationFrame(move)
    }
    frame = requestAnimationFrame(move)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [primaryPlayer?.id, props.onPalAction, props.onTarget, state.config.courtLengthScale, viewSide])

  const targetFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const finger = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }
    let playerId = pointerPlayers.current.get(event.pointerId)
    if (!playerId) {
      const candidate = localPlayers.length > 1 && finger.y < 0.5
        ? localPlayers.find((player) => player.side === (viewSide === 'bottom' ? 'top' : 'bottom'))
        : primaryPlayer
      playerId = candidate?.id
      if (playerId) pointerPlayers.current.set(event.pointerId, playerId)
    }
    if (!playerId) return
    const player = localPlayers.find((candidate) => candidate.id === playerId)
    const target = visiblePointerTarget(finger, player?.side ?? viewSide, viewSide, rect.height, event.pointerType === 'touch')
    const world = screenPointToWorld(target, viewSide)
    desired.current[playerId] = world
    props.onTarget(playerId, world.x, world.y)
    if (event.pointerType === 'touch') rendererRef.current?.setControlPointer(event.pointerId, finger, target, player?.color ?? 0xdfff68)
  }, [localPlayers, primaryPlayer, props.onTarget, viewSide])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    void audio.unlock()
    event.currentTarget.setPointerCapture(event.pointerId)
    targetFromPointer(event)
  }
  const releasePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerPlayers.current.delete(event.pointerId)
    rendererRef.current?.clearControlPointer(event.pointerId)
  }

  const teams = Object.values(state.players).map((player) => ({
    player,
    score: state.scores[player.team] ?? 0,
    local: props.localPlayerIds.includes(player.id),
    identity: seatIdentityForColor(player.color),
  })).sort((a, b) => Number(a.local) - Number(b.local))
  const countdown = countdownValue(state)
  const winner = Object.values(state.players).find((player) => player.team === state.winnerTeam)
  const topLocal = localPlayers.length > 1 ? localPlayers.find((player) => player.side !== viewSide) : undefined

  return (
    <section className="pg-match" aria-label="Pal Duel air-hockey match">
      <header className="pg-match__topbar">
        <div><strong>{props.title}</strong><span>{props.subtitle}</span></div>
        <button onClick={props.onExit}>Exit</button>
      </header>

      {topLocal && <PalTray state={state} player={topLocal} top onAction={(type) => props.onPalAction(topLocal.id, type)} />}

      <div className="pg-match__hud">
        <div className="pg-duel-score">
          {teams.map(({ player, score, local, identity }) => (
            <div key={player.id} className={local ? 'is-you' : ''} style={{ ['--seat-color' as string]: identity.hex }}>
              <span>{local ? (localPlayers.length > 1 ? player.side === viewSide ? 'P1' : 'P2' : 'YOU') : player.name}</span><b>{score}</b>
            </div>
          ))}
        </div>
        <div className={`pg-match-clock${state.overtime ? ' is-overtime' : ''}`}>{secondsLabel(state)}</div>
        <div className={`pg-rally-chip${state.rallyHits >= 8 ? ' is-hot' : ''}`}><span>RALLY</span><b>{state.rallyHits}</b></div>
        {props.network && (
          <div className={`pg-network pg-network--${props.network.reconnecting ? 'poor' : props.network.quality}`} title={`Median ${props.network.latencyMs ?? '—'}ms · p95 ${props.network.latencyP95Ms ?? '—'}ms · jitter ${props.network.jitterMs ?? '—'}ms`}>
            <i />{props.network.reconnecting ? 'Reconnecting…' : props.network.quality === 'poor' ? 'Connection struggling' : props.network.latencyMs === null ? 'Edge connecting' : `${props.network.latencyMs}ms RTT`}
          </div>
        )}
      </div>

      <div
        ref={mountRef}
        className="pg-canvas-wrap pg-canvas-wrap--pal-duel"
        data-phase={state.phase}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) targetFromPointer(event) }}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
      >
        <div className="pg-court-ui" aria-hidden="true">
          {countdown !== null && <div className="pg-countdown" key={countdown}>{countdown}</div>}
          {state.phase === 'playing' && state.serveTicks > 0 && <div className="pg-serve-callout">{state.servingPlayerId === primaryPlayer?.id ? 'YOUR DROP · MOVE TO AIM' : 'THEIR DROP'}</div>}
        </div>
      </div>

      {primaryPlayer && <PalTray state={state} player={primaryPlayer} onAction={(type) => props.onPalAction(primaryPlayer.id, type)} />}

      {state.phase === 'finished' && (
        <div className="pg-result-overlay">
          <div className="pg-result-card">
            <p className="pg-kicker">Match complete</p>
            <h2>{resultLabel(state, primaryPlayer)}</h2>
            <p>{winner?.name} takes the duel.</p>
            {primaryPlayer && <div className="pg-result-stats"><span><b>{primaryPlayer.returns}</b> puck strikes</span><span><b>{primaryPlayer.palsSummoned}</b> Pals called</span><span><b>{primaryPlayer.palSteals}</b> steals</span><span><b>{state.longestRallyHits}</b> best rally</span></div>}
            <div className="pg-button-row">
              {props.onRematch && <button className="pg-primary-button" onClick={props.onRematch}>Rematch</button>}
              <button className="pg-secondary-button" onClick={props.onExit}>Home</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
