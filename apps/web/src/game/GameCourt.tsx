import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PAL_COST,
  PAL_ENERGY_MAX,
  PAL_IDENTITIES,
  PADDLE_SPEED,
  TICK_RATE,
  canSummonPal,
  secondsRemaining,
  seatIdentityForColor,
  type GameState,
  type PalType,
  type PlayerState,
} from '@pongapp/game-core'
import { GameAudio } from './audio'
import { screenFractionToLogical } from './perspective'
import { PixiCourt, type CourtEffectsSettings } from './PixiCourt'

interface NetworkStatus {
  latencyMs: number | null
  latencyP95Ms: number | null
  jitterMs: number | null
  quality: 'good' | 'fair' | 'poor'
}

interface Props {
  getState: () => GameState
  subscribe: (listener: (state: GameState) => void) => () => void
  onTarget: (playerId: string, target: number) => void
  onSummon: (playerId: string, type: PalType) => void
  onExit: () => void
  localPlayerIds: string[]
  settings: CourtEffectsSettings
  muted: boolean
  title: string
  subtitle: string
  onRematch?: () => void
  network?: NetworkStatus
}

const PAL_ORDER: PalType[] = ['guard', 'striker', 'captain']
const PAL_SHORT_EFFECT: Record<PalType, string> = {
  guard: 'blocks one',
  striker: 'fast curve',
  captain: 'splits in two',
}
const PAL_CARD_LABEL: Record<PalType, string> = { guard: 'Guard', striker: 'Striker', captain: 'Captain' }

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
  if (type === 'guard') return <span aria-hidden="true">◖━◗</span>
  if (type === 'striker') return <span aria-hidden="true">➤</span>
  return <span aria-hidden="true">♛</span>
}

function EnergyMeter({ player, flipped = false }: { player: PlayerState; flipped?: boolean }) {
  return (
    <div className={`pg-energy${flipped ? ' pg-energy--flipped' : ''}`} aria-label={`${player.palEnergy} of ${PAL_ENERGY_MAX} summon energy`}>
      <span className="pg-energy__label">PAL POWER</span>
      <div className="pg-energy__pips">
        {Array.from({ length: PAL_ENERGY_MAX }, (_, index) => <i key={index} className={index < player.palEnergy ? 'is-full' : ''} />)}
      </div>
    </div>
  )
}

function PalTray({ state, player, onSummon, top = false }: { state: GameState; player: PlayerState; onSummon: (type: PalType) => void; top?: boolean }) {
  return (
    <div className={`pg-pal-console${top ? ' pg-pal-console--top' : ''}`}>
      <EnergyMeter player={player} flipped={top} />
      <div className="pg-pal-tray" aria-label={`${player.name} summon cards`}>
        {PAL_ORDER.map((type) => {
          const identity = PAL_IDENTITIES[type]
          const enabled = canSummonPal(state, player, type)
          return (
            <button
              key={type}
              className={`pg-pal-card pg-pal-card--${type}${enabled ? ' is-ready' : ''}`}
              disabled={!enabled}
              onClick={() => onSummon(type)}
              aria-label={`Summon ${identity.label}. Costs ${PAL_COST[type]} energy. ${identity.effect}`}
            >
              <span className="pg-pal-card__glyph"><PalGlyph type={type} /></span>
              <span className="pg-pal-card__copy"><strong>{PAL_CARD_LABEL[type]}</strong><small>{PAL_SHORT_EFFECT[type]}</small></span>
              <span className="pg-pal-card__cost">{PAL_COST[type]}<i>✦</i></span>
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
  const [moment, setMoment] = useState<string | null>(null)
  const [coach, setCoach] = useState<string | null>(() => {
    try { return localStorage.getItem('pongapp.pal-tutorial.v1') ? null : 'YOU are the bottom paddle. Drag anywhere on the court.' } catch { return null }
  })
  const momentTimer = useRef(0)
  const coachTimer = useRef(0)
  const audio = useMemo(() => new GameAudio(), [])
  const localPlayers = props.localPlayerIds.map((id) => state.players[id]).filter((player): player is PlayerState => Boolean(player))
  const primaryPlayer = localPlayers[0]
  const viewSide = primaryPlayer?.side ?? 'bottom'
  const desired = useRef<Record<string, number>>({})
  const heldKeys = useRef(new Set<string>())

  useEffect(() => {
    audio.setMuted(props.muted)
  }, [audio, props.muted])

  useEffect(() => () => { void audio.destroy() }, [audio])

  useEffect(() => {
    const element = mountRef.current
    if (!element) return
    let cancelled = false
    const renderer = new PixiCourt(props.settings, props.localPlayerIds, viewSide)
    rendererRef.current = renderer
    let frame = 0
    let previous = performance.now()
    void renderer.mount(element).then(() => {
      if (cancelled) return
      const draw = (now: number) => {
        const delta = Math.min(0.05, Math.max(0, (now - previous) / 1000))
        previous = now
        renderer.render(props.getState(), delta)
        frame = requestAnimationFrame(draw)
      }
      frame = requestAnimationFrame(draw)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      renderer.destroy()
      rendererRef.current = null
    }
  }, [props.getState, props.localPlayerIds.join('\u001f'), viewSide])

  useEffect(() => rendererRef.current?.updateSettings(props.settings), [props.settings])

  useEffect(() => props.subscribe((next) => {
    setState(next)
    rendererRef.current?.onEvents(next.events, next)
    for (const event of next.events) {
      audio.play(event)
      let label: string | null = null
      if (event.type === 'palSummoned') label = `${next.players[event.playerId]?.name ?? 'Player'} calls ${PAL_IDENTITIES[event.pal.type].label}`
      else if (event.type === 'palHit') label = `${PAL_IDENTITIES[event.palType].label} saves it!`
      else if (event.type === 'hit' && event.perfect) label = 'PERFECT — bonus energy!'
      else if (event.type === 'rallyHot') label = event.level === 'blazing' ? 'BLAZING RALLY' : 'HOT RALLY'
      else if (event.type === 'score') label = `${next.players[event.scorerId]?.name ?? 'Player'} scores`
      if (label) {
        window.clearTimeout(momentTimer.current)
        setMoment(label)
        momentTimer.current = window.setTimeout(() => setMoment(null), 1200)
      }
      if (!primaryPlayer) continue
      if (event.type === 'matchStart' && coach) setCoach('Tap a Pal card. Each helper returns one ball, then pops!')
      if (event.type === 'palSummoned' && event.playerId === primaryPlayer.id && coach) setCoach('Good summon. The portal flashes for 0.2 seconds before your Pal can block.')
      if (event.type === 'palSummoned' && event.playerId !== primaryPlayer.id && coach) setCoach('Enemy Pal! Aim around it—or make it spend its one save.')
      if (event.type === 'energyChanged' && event.playerId === primaryPlayer.id && event.energy === PAL_ENERGY_MAX && coach) setCoach('CAPTAIN READY — one hit, then two Hatchlings!')
      if (event.type === 'palHit' && event.playerId === primaryPlayer.id && coach) {
        setCoach('That is Pal Duel. Paddle skill wins; smart summons steal rallies.')
        window.clearTimeout(coachTimer.current)
        coachTimer.current = window.setTimeout(() => {
          setCoach(null)
          try { localStorage.setItem('pongapp.pal-tutorial.v1', 'seen') } catch { /* private browsing */ }
        }, 3500)
      }
    }
  }), [audio, coach, primaryPlayer?.id, props.subscribe])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      heldKeys.current.add(event.code)
      if (!primaryPlayer || event.repeat) return
      const type = event.code === 'Digit1' || event.code === 'KeyQ' ? 'guard' : event.code === 'Digit2' || event.code === 'KeyW' ? 'striker' : event.code === 'Digit3' || event.code === 'KeyE' ? 'captain' : null
      if (type) props.onSummon(primaryPlayer.id, type)
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
        let direction = 0
        if (heldKeys.current.has('ArrowLeft') || heldKeys.current.has('KeyA')) direction -= 1
        if (heldKeys.current.has('ArrowRight') || heldKeys.current.has('KeyD')) direction += 1
        if (direction) {
          const current = desired.current[primaryPlayer.id] ?? primaryPlayer.position
          const logical = viewSide === 'top' ? -direction : direction
          desired.current[primaryPlayer.id] = Math.max(0.08, Math.min(0.92, current + logical * PADDLE_SPEED * delta))
          props.onTarget(primaryPlayer.id, desired.current[primaryPlayer.id]!)
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
  }, [primaryPlayer?.id, props.onSummon, props.onTarget, viewSide])

  const targetFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    const player = localPlayers.length > 1 && y < 0.5 ? localPlayers.find((candidate) => candidate.side === 'top') : primaryPlayer
    if (!player) return
    const logical = screenFractionToLogical(x, player.side, viewSide)
    desired.current[player.id] = logical
    props.onTarget(player.id, logical)
  }, [localPlayers, primaryPlayer, props.onTarget, viewSide])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    void audio.unlock()
    event.currentTarget.setPointerCapture(event.pointerId)
    targetFromPointer(event)
  }

  const teams = Object.values(state.players).map((player) => ({
    player,
    score: state.scores[player.team] ?? 0,
    local: props.localPlayerIds.includes(player.id),
    identity: seatIdentityForColor(player.color),
  })).sort((a, b) => Number(a.local) - Number(b.local))
  const countdown = countdownValue(state)
  const winner = Object.values(state.players).find((player) => player.team === state.winnerTeam)
  const topLocal = localPlayers.length > 1 ? localPlayers.find((player) => player.side === 'top') : undefined

  return (
    <section className="pg-match" aria-label="Pal Duel match">
      <header className="pg-match__topbar">
        <div><strong>{props.title}</strong><span>{props.subtitle}</span></div>
        <button onClick={props.onExit}>Exit</button>
      </header>

      {topLocal && <PalTray state={state} player={topLocal} top onSummon={(type) => props.onSummon(topLocal.id, type)} />}

      <div className="pg-match__hud">
        <div className="pg-duel-score">
          {teams.map(({ player, score, local, identity }) => (
            <div key={player.id} className={local ? 'is-you' : ''} style={{ ['--seat-color' as string]: identity.hex }}>
              <span>{local ? (localPlayers.length > 1 ? player.side === 'bottom' ? 'P1' : 'P2' : 'YOU') : player.name}</span><b>{score}</b>
            </div>
          ))}
        </div>
        <div className={`pg-match-clock${state.overtime ? ' is-overtime' : ''}`}>{secondsLabel(state)}</div>
        <div className={`pg-rally-chip${state.rallyHits >= 8 ? ' is-hot' : ''}`}><span>RALLY</span><b>{state.rallyHits}</b></div>
        {props.network && props.network.quality !== 'good' && (
          <div className={`pg-network pg-network--${props.network.quality}`} title={`Median ${props.network.latencyMs ?? '—'}ms · p95 ${props.network.latencyP95Ms ?? '—'}ms · jitter ${props.network.jitterMs ?? '—'}ms`}>
            {props.network.quality === 'poor' ? 'Connection struggling' : `${props.network.latencyMs ?? '—'}ms`}
          </div>
        )}
      </div>

      <div
        ref={mountRef}
        className="pg-canvas-wrap pg-canvas-wrap--pal-duel"
        data-phase={state.phase}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) targetFromPointer(event) }}
      >
        <div className="pg-court-ui" aria-hidden="true">
          {moment && <div className="pg-moment" key={moment}>{moment}</div>}
          {coach && <div className="pg-coach"><span>PAL COACH</span><strong>{coach}</strong></div>}
          {countdown !== null && <div className="pg-countdown" key={countdown}>{countdown}</div>}
          {state.phase === 'playing' && state.serveTicks > 0 && <div className="pg-serve-callout">{state.servingPlayerId === primaryPlayer?.id ? 'YOUR SERVE · paddle position aims it' : 'THEIR SERVE'}</div>}
        </div>
      </div>

      {primaryPlayer && <PalTray state={state} player={primaryPlayer} onSummon={(type) => props.onSummon(primaryPlayer.id, type)} />}

      {state.phase === 'finished' && (
        <div className="pg-result-overlay">
          <div className="pg-result-card">
            <p className="pg-kicker">Match complete</p>
            <h2>{resultLabel(state, primaryPlayer)}</h2>
            <p>{winner?.name} takes the duel.</p>
            {primaryPlayer && <div className="pg-result-stats"><span><b>{primaryPlayer.returns}</b> paddle returns</span><span><b>{primaryPlayer.palHits}</b> Pal saves</span><span><b>{state.longestRallyHits}</b> best rally</span></div>}
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
