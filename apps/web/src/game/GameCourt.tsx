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
import { screenPointToWorld, screenVectorToWorld, type CourtPoint } from './perspective'
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
}

const PAL_ORDER: PalType[] = ['guard', 'striker', 'captain']
const PAL_SHORT_EFFECT: Record<PalType, string> = {
  guard: 'steal & clear',
  striker: 'rope & sling',
  captain: 'raid & shoot',
}
const PAL_CARD_LABEL: Record<PalType, string> = { guard: 'Bumper', striker: 'Hook', captain: 'Captain' }

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
  if (type === 'guard') return <span aria-hidden="true">◖●◗</span>
  if (type === 'striker') return <span aria-hidden="true">〰➤</span>
  return <span aria-hidden="true">♛</span>
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
                <strong>{active ? `GO, ${PAL_CARD_LABEL[type]}!` : PAL_CARD_LABEL[type]}</strong>
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

function eventMoment(state: GameState): string | null {
  const event = state.events.at(-1)
  if (!event) return null
  const playerName = 'playerId' in event ? state.players[event.playerId]?.name ?? 'Player' : 'Player'
  if (event.type === 'palSummoned') return `${playerName} calls ${PAL_IDENTITIES[event.pal.type].label}`
  if (event.type === 'palCommanded') return `${PAL_IDENTITIES[event.palType].label}: GO!`
  if (event.type === 'palGrabbed') return `${PAL_IDENTITIES[event.palType].label} GRABS IT!`
  if (event.type === 'palStole') return 'BUMPER STEAL!'
  if (event.type === 'palTethered') return 'HOOK: YOINK!'
  if (event.type === 'tetherBroken') return 'ROPE CUT!'
  if (event.type === 'palShot') return event.powered ? 'STAR SHOT!' : `${PAL_IDENTITIES[event.palType].label} FIRES!`
  if (event.type === 'palStunned') return `${PAL_IDENTITIES[event.palType].label} is dizzy!`
  if (event.type === 'palPowered') return `${PAL_IDENTITIES[event.palType].label} GOT THE STAR!`
  if (event.type === 'starSpawned') return 'POWER STAR!'
  if (event.type === 'hit' && event.clean) return 'CLEAN STRIKE!'
  if (event.type === 'rallyHot') return event.level === 'blazing' ? 'BLAZING RALLY' : 'HOT RALLY'
  if (event.type === 'score') return `${state.players[event.scorerId]?.name ?? 'Player'} SCORES!`
  return null
}

export function GameCourt(props: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PixiCourt | null>(null)
  const [state, setState] = useState(() => props.getState())
  const [moment, setMoment] = useState<string | null>(null)
  const [coach, setCoach] = useState<string | null>(() => {
    try { return localStorage.getItem('pongapp.air-hockey-tutorial.v1') ? null : 'YOU are the round mallet at the bottom. Drag it anywhere—up, down, left, or right.' } catch { return null }
  })
  const momentTimer = useRef(0)
  const coachTimer = useRef(0)
  const audio = useMemo(() => new GameAudio(), [])
  const localPlayers = props.localPlayerIds.map((id) => state.players[id]).filter((player): player is PlayerState => Boolean(player))
  const primaryPlayer = localPlayers[0]
  const viewSide = primaryPlayer?.side ?? 'bottom'
  const desired = useRef<Record<string, CourtPoint>>({})
  const heldKeys = useRef(new Set<string>())
  const pointerPlayers = useRef(new Map<number, string>())

  useEffect(() => { audio.setMuted(props.muted) }, [audio, props.muted])
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
    for (const event of next.events) audio.play(event)
    const label = eventMoment(next)
    if (label) {
      window.clearTimeout(momentTimer.current)
      setMoment(label)
      momentTimer.current = window.setTimeout(() => setMoment(null), 1250)
    }
    if (!primaryPlayer || !coach) return
    for (const event of next.events) {
      if (event.type === 'matchStart') setCoach('Call a Pal with a card. It stays, has hearts, and thinks for itself.')
      if (event.type === 'palSummoned' && event.playerId === primaryPlayer.id) setCoach('Tap that lit card again to command its signature move.')
      if (event.type === 'palGrabbed' && event.playerId !== primaryPlayer.id) setCoach('Enemy carrying the puck! Ram the carrier, intercept it, or let Bumper steal it.')
      if (event.type === 'palTethered' && event.playerId !== primaryPlayer.id) setCoach('Cut the rope: hit the puck or knock into Hook before the sling fires.')
      if (event.type === 'starSpawned') setCoach('POWER STAR! Your Pals chase it and gain a role-specific super move.')
      if (event.type === 'palPowered' && event.playerId === primaryPlayer.id) {
        setCoach('Now command that Pal—its next signature move is supercharged.')
        window.clearTimeout(coachTimer.current)
        coachTimer.current = window.setTimeout(() => {
          setCoach(null)
          try { localStorage.setItem('pongapp.air-hockey-tutorial.v1', 'seen') } catch { /* private browsing */ }
        }, 4500)
      }
    }
  }), [audio, coach, primaryPlayer?.id, props.subscribe])

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
    const screen = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }
    let playerId = pointerPlayers.current.get(event.pointerId)
    if (!playerId) {
      const candidate = localPlayers.length > 1 && screen.y < 0.5
        ? localPlayers.find((player) => player.side === (viewSide === 'bottom' ? 'top' : 'bottom'))
        : primaryPlayer
      playerId = candidate?.id
      if (playerId) pointerPlayers.current.set(event.pointerId, playerId)
    }
    if (!playerId) return
    const world = screenPointToWorld(screen, viewSide)
    desired.current[playerId] = world
    props.onTarget(playerId, world.x, world.y)
  }, [localPlayers, primaryPlayer, props.onTarget, viewSide])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    void audio.unlock()
    event.currentTarget.setPointerCapture(event.pointerId)
    targetFromPointer(event)
  }
  const releasePointer = (event: React.PointerEvent<HTMLDivElement>) => pointerPlayers.current.delete(event.pointerId)

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
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
      >
        <div className="pg-court-ui" aria-hidden="true">
          {moment && <div className="pg-moment" key={moment}>{moment}</div>}
          {coach && <div className="pg-coach"><span>PAL COACH</span><strong>{coach}</strong></div>}
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
