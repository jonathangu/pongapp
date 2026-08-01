/**
 * The match screen: input, HUD and the mount point for the Pixi court.
 *
 * The rewrite fixed one input bug and two HUD omissions that a design pass kept
 * running into.
 *
 * **Keyboard was tap-only.** The old handler guarded with
 * `if (pressed.has(event.code)) return` to suppress OS key repeat, then nudged
 * the target by a fixed `0.16` on the *keydown edge only*. Holding W therefore
 * moved the paddle exactly 0.16 of the court and then stopped forever; you had
 * to machine-gun the key to cross the court. Input is now edge-triggered for
 * abilities and level-triggered for movement: held keys accumulate into a
 * desired position at `PADDLE_SPEED`, the same constant the simulation clamps
 * movement to, on a frame loop. Holding moves; tapping nudges.
 *
 * **The scoreboard said nothing but a number.** Four coloured digits in a pill
 * do not tell you which one is yours, who is winning, or how many points end
 * the match. Each seat now carries its name, its colour-independent mark and a
 * "you" flag, and the score is mirrored into an `aria-live` region so it is
 * announced rather than merely drawn — the canvas itself is unreadable to a
 * screen reader by construction.
 *
 * **Touch fought the player.** A pointer-down anywhere teleported the paddle to
 * the finger, which on a phone is under the finger and therefore invisible.
 * Pressing *on* the paddle now grabs it and drags relatively; pressing away from
 * it still jumps, which is what you want when you are late to a ball.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameState, PlayerState, Side } from '@pongapp/game-core'
import {
  ABILITY_COOLDOWNS,
  BASE_PADDLE_LENGTH,
  GROWN_PADDLE_LENGTH,
  PADDLE_SPEED,
  POWER_UP_IDENTITIES,
  TICK_RATE,
  secondsRemaining,
  seatIdentityForColor,
} from '@pongapp/game-core'
import { GameAudio } from './audio'
import { PixiCourt, type CourtEffectsSettings } from './PixiCourt'

interface Props {
  getState: () => GameState
  subscribe: (listener: (state: GameState) => void) => () => void
  onTarget: (playerId: string, target: number) => void
  onAbility: (playerId: string) => void
  onExit: () => void
  localPlayerIds: string[]
  settings: CourtEffectsSettings
  muted: boolean
  extrapolate?: boolean
  title: string
  subtitle: string
  onRematch?: () => void
}

/** The same clamp `updatePlayers` applies, so the HUD cannot promise more travel than the sim allows. */
const MIN_POSITION = 0.08
const MAX_POSITION = 0.92
const clampPosition = (value: number) => Math.min(MAX_POSITION, Math.max(MIN_POSITION, value))

const ABILITY_BLURB: Record<string, string> = {
  dash: 'Jump a third of the court toward your aim',
  bend: 'Curve your next return',
  guard: 'Block one shot that gets past you',
  pulse: 'Parry — time it as the ball arrives',
}

interface TeamSummary {
  team: string
  label: string
  score: number
  color: number
  hex: string
  pattern: string
  patternLabel: string
  isLocal: boolean
}

function teamSummaries(state: GameState, localIds: string[]): TeamSummary[] {
  const byTeam = new Map<string, PlayerState[]>()
  for (const player of Object.values(state.players)) {
    const bucket = byTeam.get(player.team) ?? []
    bucket.push(player)
    byTeam.set(player.team, bucket)
  }
  return Object.entries(state.scores).map(([team, score]) => {
    const members = byTeam.get(team) ?? []
    const seat = seatIdentityForColor(members[0]?.color ?? 0xdfff68)
    return {
      team,
      label: members.map((player) => player.name).join(' + ') || team,
      score,
      color: members[0]?.color ?? seat.color,
      hex: seat.hex,
      pattern: seat.pattern,
      patternLabel: seat.patternLabel,
      isLocal: members.some((player) => localIds.includes(player.id)),
    }
  })
}

/** Which way a pointer coordinate runs for a given wall. */
function axisFraction(event: React.PointerEvent<HTMLDivElement>, side: Side): number {
  const rect = event.currentTarget.getBoundingClientRect()
  // The court is drawn square and centred inside the wrapper, so the pointer has
  // to be mapped through the same letterbox the renderer uses or the paddle
  // lands a few percent off on a non-square wrapper.
  const size = Math.min(rect.width, rect.height)
  const originX = rect.left + (rect.width - size) / 2
  const originY = rect.top + (rect.height - size) / 2
  const value = side === 'left' || side === 'right'
    ? (event.clientY - originY) / size
    : (event.clientX - originX) / size
  return Math.max(0, Math.min(1, value))
}

function countdownValue(state: GameState): number | null {
  if (state.phase !== 'countdown') return null
  return Math.max(1, Math.ceil(state.countdownTicks / TICK_RATE))
}

export function GameCourt(props: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PixiCourt | null>(null)
  const [state, setState] = useState(() => props.getState())
  const [servePrompt, setServePrompt] = useState(false)
  const [moment, setMoment] = useState<{ label: string; kind: 'perfect' | 'score' | 'skill' | 'power'; tick: number } | null>(null)
  const momentTimer = useRef(0)
  const audio = useMemo(() => new GameAudio(), [])
  const localPlayerKey = props.localPlayerIds.join('\u001f')

  const localPlayers = useMemo(
    () => props.localPlayerIds.map((id) => state.players[id]).filter((player): player is PlayerState => Boolean(player)),
    [props.localPlayerIds, state.players],
  )
  const primaryPlayer = localPlayers[0]
  const teams = useMemo(() => teamSummaries(state, props.localPlayerIds), [state, props.localPlayerIds])

  // Desired paddle position per local player. Held keys integrate into this;
  // pointer input writes it directly. Keeping one authority stops the two input
  // methods from fighting when a player uses both.
  const desired = useRef<Record<string, number>>({})
  const grab = useRef<{ id: string; offset: number } | null>(null)
  const onTargetRef = useRef(props.onTarget)
  const onAbilityRef = useRef(props.onAbility)
  onTargetRef.current = props.onTarget
  onAbilityRef.current = props.onAbility

  const applyTarget = useCallback((id: string, value: number) => {
    const next = clampPosition(value)
    desired.current[id] = next
    onTargetRef.current(id, next)
  }, [])

  useEffect(() => props.subscribe(setState), [props.subscribe])

  useEffect(() => {
    audio.setMuted(props.muted)
  }, [audio, props.muted])

  useEffect(() => {
    void audio.unlock()
    return () => {
      window.clearTimeout(momentTimer.current)
      void audio.destroy()
    }
  }, [audio])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const renderer = new PixiCourt(props.settings)
    rendererRef.current = renderer
    let frame = 0
    let previous = performance.now()
    let disposed = false
    void renderer.mount(mount).then(() => {
      const draw = (now: number) => {
        if (disposed) return
        renderer.render(props.getState(), Math.min(0.05, (now - previous) / 1000), props.extrapolate !== false)
        previous = now
        frame = requestAnimationFrame(draw)
      }
      frame = requestAnimationFrame(draw)
    })
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      renderer.destroy()
      rendererRef.current = null
    }
  }, [props.extrapolate, props.getState])

  useEffect(() => {
    rendererRef.current?.updateSettings(props.settings)
  }, [props.settings])

  useEffect(() => {
    rendererRef.current?.onEvents(state.events, state)
    for (const event of state.events) audio.play(event)

    const headline = [...state.events].reverse().map((event) => {
      if (event.type === 'hit' && event.perfect) return { label: 'Perfect return', kind: 'perfect' as const }
      if (event.type === 'score') return { label: 'Goal line broken', kind: 'score' as const }
      if (event.type === 'ability') return { label: `${event.ability} activated`, kind: 'skill' as const }
      if (event.type === 'powerUp') return { label: POWER_UP_IDENTITIES[event.powerUp].label, kind: 'power' as const }
      return null
    }).find(Boolean)
    if (headline) {
      setMoment({ ...headline, tick: state.tick })
      window.clearTimeout(momentTimer.current)
      momentTimer.current = window.setTimeout(() => setMoment(null), 780)
    }
  }, [audio, state.tick])

  // "GO" on the frame the countdown ends. A countdown that reaches 1 and then
  // silently vanishes leaves the player unsure whether the ball is live.
  useEffect(() => {
    if (state.phase !== 'playing') return
    setServePrompt(true)
    const timer = window.setTimeout(() => setServePrompt(false), 700)
    return () => window.clearTimeout(timer)
  }, [state.phase])

  /**
   * Movement loop. Level-triggered: as long as a direction key is down the
   * desired position keeps travelling at `PADDLE_SPEED`, which is exactly the
   * per-tick cap `updatePlayers` enforces, so the keyboard can neither out-run
   * nor under-run the simulation.
   */
  useEffect(() => {
    const ids = localPlayerKey ? localPlayerKey.split('\u001f') : []
    if (ids.length === 0) return
    for (const id of ids) desired.current[id] ??= state.players[id]?.position ?? 0.5

    const held = new Set<string>()
    const seatKeys: Array<Record<string, number>> = [
      { KeyW: -1, KeyA: -1, KeyS: 1, KeyD: 1 },
      { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 },
    ]
    const abilityKeys = ['Space', 'Enter']

    const keydown = (event: KeyboardEvent) => {
      void audio.unlock()
      const abilityIndex = abilityKeys.indexOf(event.code)
      if (abilityIndex >= 0 && ids[abilityIndex]) {
        event.preventDefault()
        if (!event.repeat) onAbilityRef.current(ids[abilityIndex]!)
        return
      }
      if (seatKeys.some((map, index) => ids[index] && event.code in map)) {
        event.preventDefault()
        held.add(event.code)
      }
    }
    const keyup = (event: KeyboardEvent) => held.delete(event.code)
    // A window that loses focus mid-press never delivers the keyup, which used
    // to leave a paddle drifting into the wall until the player pressed again.
    const release = () => held.clear()

    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', release)

    let frame = 0
    let previous = performance.now()
    const step = (now: number) => {
      const delta = Math.min(0.05, (now - previous) / 1000)
      previous = now
      for (const [index, id] of ids.entries()) {
        const map = seatKeys[index]
        if (!map || !id) continue
        let direction = 0
        for (const code of held) direction += map[code] ?? 0
        if (direction !== 0) {
          const current = desired.current[id] ?? 0.5
          applyTarget(id, current + Math.sign(direction) * PADDLE_SPEED * delta)
        }
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)

    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', release)
      cancelAnimationFrame(frame)
    }
  }, [applyTarget, audio, localPlayerKey])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!primaryPlayer) return
    void audio.unlock()
    event.currentTarget.setPointerCapture(event.pointerId)
    const fraction = axisFraction(event, primaryPlayer.side)
    const length = primaryPlayer.growTicks > 0 ? GROWN_PADDLE_LENGTH : BASE_PADDLE_LENGTH
    // Grabbing the paddle drags it; pressing elsewhere jumps to the press. The
    // grab tolerance is a little wider than the paddle so a near-miss with a
    // thumb still feels like a grab rather than a teleport.
    if (Math.abs(fraction - primaryPlayer.position) <= length * 0.75) {
      grab.current = { id: primaryPlayer.id, offset: primaryPlayer.position - fraction }
    } else {
      grab.current = { id: primaryPlayer.id, offset: 0 }
      applyTarget(primaryPlayer.id, fraction)
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = grab.current
    if (!held || !primaryPlayer) return
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      grab.current = null
      return
    }
    applyTarget(held.id, axisFraction(event, primaryPlayer.side) + held.offset)
  }

  const endPointer = () => { grab.current = null }

  const countdown = countdownValue(state)
  const winner = state.winnerTeam ? teams.find((team) => team.team === state.winnerTeam) : undefined
  const abilityReady = primaryPlayer ? primaryPlayer.cooldownTicks <= 0 : false
  // Fills toward ready, against the ability's own cooldown from the shared
  // constants table — a bar that is not anchored to the real cooldown is a lie
  // the player learns to distrust.
  const abilityProgress = primaryPlayer
    ? Math.min(1, Math.max(0, 1 - primaryPlayer.cooldownTicks / ABILITY_COOLDOWNS[primaryPlayer.ability]))
    : 1
  const cooldownSeconds = primaryPlayer ? Math.ceil(primaryPlayer.cooldownTicks / TICK_RATE) : 0

  return (
    <section className="pg-game-layout" aria-label="Pong match">
      <div className="pg-game-topbar">
        <div className="pg-game-title">
          <strong>{props.title}</strong>
          <span>{props.subtitle}</span>
        </div>
        <button className="pg-pill" onClick={props.onExit}>Exit match</button>
      </div>

      {/*
        The scoreboard lives *above* the court, not on it.
        Floating it inside the canvas cost two things at once: in Arena and
        Crosscourt the pill sits exactly over the top wall, so it hid the top
        player's paddle — `PADDLE_OFFSET` is 0.045 of the court, which on an
        820px board is 37px, well inside a 12px-inset pill — and a translucent
        chip over a surface that ranges from near-black to full-bright lime
        loses contrast precisely when a rally is at its most intense.
      */}
      <div className="pg-hud-bar">
        <div className={`pg-scoreboard pg-scoreboard--${teams.length}`}>
          {teams.map((team) => (
            <div
              key={team.team}
              className={`pg-score${team.isLocal ? ' pg-score--you' : ''}`}
              style={{ ['--pg-score-color' as string]: team.hex }}
            >
              <span className={`pg-seat-mark pg-seat-mark--${team.pattern}`} aria-hidden="true" />
              <span className="pg-score__name">{team.label}</span>
              <b className="pg-score__value">{team.score}</b>
            </div>
          ))}
          <div className="pg-score pg-score--target" title={`First to ${state.config.scoreToWin}`}>
            <span className="pg-score__name">to win</span>
            <b className="pg-score__value">{state.config.scoreToWin}</b>
          </div>
        </div>

        <div className={`pg-timer${state.overtime ? ' pg-timer--overtime' : ''}`}>
          {state.overtime
            ? 'OVERTIME'
            : `${Math.floor(secondsRemaining(state) / 60)}:${String(secondsRemaining(state) % 60).padStart(2, '0')}`}
        </div>

        {/* The canvas is unreadable to assistive tech, so the score lives here too. */}
        <p className="pg-visually-hidden" aria-live="polite">
          {teams.map((team) => `${team.label} ${team.score}`).join(', ')}
          {state.overtime ? ', overtime' : ''}
        </p>
      </div>

      <div
        ref={mountRef}
        className="pg-canvas-wrap"
        data-phase={state.phase}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div className="pg-hud">
          {moment && <div className={`pg-moment pg-moment--${moment.kind}`} key={moment.tick} aria-hidden="true">{moment.label}</div>}
          {countdown !== null && (
            <div className="pg-countdown" key={countdown} aria-hidden="true">{countdown}</div>
          )}
          {countdown === null && servePrompt && state.phase === 'playing' && (
            <div className="pg-countdown pg-countdown--go" aria-hidden="true">GO</div>
          )}

          {state.phase === 'finished' && (
            <div className="pg-game-message">
              <div className="pg-game-message__card">
                <p className="pg-kicker">Match complete</p>
                <h2>{winner?.label ?? state.winnerTeam} wins</h2>
                <div className="pg-result-scores">
                  {teams.map((team) => (
                    <div key={team.team} className="pg-result-score" style={{ ['--pg-score-color' as string]: team.hex }}>
                      <b>{team.score}</b>
                      <span>{team.label}</span>
                    </div>
                  ))}
                </div>
                {primaryPlayer && (
                  <p className="pg-result-line">
                    {primaryPlayer.returns} returns · {primaryPlayer.perfectReturns} perfect · {primaryPlayer.abilityUses} skills used
                  </p>
                )}
                <div className="pg-button-row">
                  {props.onRematch && <button className="pg-primary-button" onClick={props.onRematch}>Rematch</button>}
                  <button className="pg-secondary-button" onClick={props.onExit}>Home</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pg-controls">
        <div className="pg-control-hint">
          <strong>Drag the court</strong> to move — grab your paddle to slide it, tap ahead to jump.
          <span> Keyboard: {localPlayers.length > 1 ? 'W/S and ↑/↓, hold to travel' : 'hold W/S or ↑/↓'}. Perfect returns shave half a second off your cooldown.</span>
        </div>
        {primaryPlayer && (
          <button
            className={`pg-ability-button${abilityReady ? ' is-ready' : ''}`}
            style={{ ['--pg-ability-progress' as string]: `${Math.round(abilityProgress * 100)}%` }}
            aria-label={`${primaryPlayer.ability}: ${ABILITY_BLURB[primaryPlayer.ability] ?? ''}. ${abilityReady ? 'Ready' : `${cooldownSeconds} seconds remaining`}`}
            onPointerDown={(event) => { event.stopPropagation(); void audio.unlock(); props.onAbility(primaryPlayer.id) }}
          >
            <span className="pg-ability-button__name">{primaryPlayer.ability}</span>
            <span className="pg-ability-button__state">
              {abilityReady ? 'READY' : `${cooldownSeconds}s`}
              {/* The key hint is CSS-hidden on coarse pointers rather than
                  branched in JS: a keyboard can be attached to a touch device at
                  any moment, and a media query re-evaluates while a state check
                  taken at mount does not. */}
              <small className="pg-key-hint"> · SPACE</small>
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
