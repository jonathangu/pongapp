import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState, PlayerState, Side } from '@pongapp/game-core'
import { secondsRemaining, TICK_RATE } from '@pongapp/game-core'
import { PixiCourt, type CourtEffectsSettings } from './PixiCourt'

interface Props {
  getState: () => GameState
  subscribe: (listener: (state: GameState) => void) => () => void
  onTarget: (playerId: string, target: number) => void
  onAbility: (playerId: string) => void
  onExit: () => void
  localPlayerIds: string[]
  settings: CourtEffectsSettings
  title: string
  subtitle: string
  onRematch?: () => void
}

function pointerTarget(event: React.PointerEvent<HTMLDivElement>, side: Side): number {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height
  return Math.max(0, Math.min(1, side === 'left' || side === 'right' ? y : x))
}

function countdownValue(state: GameState): number | null {
  if (state.phase !== 'countdown') return null
  return Math.max(1, Math.ceil(state.countdownTicks / TICK_RATE))
}

export function GameCourt(props: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PixiCourt | null>(null)
  const [state, setState] = useState(() => props.getState())
  const localPlayers = useMemo(
    () => props.localPlayerIds.map((id) => state.players[id]).filter((player): player is PlayerState => Boolean(player)),
    [props.localPlayerIds, state.players],
  )
  const primaryPlayer = localPlayers[0]

  useEffect(() => props.subscribe(setState), [props.subscribe])

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
        renderer.render(props.getState(), Math.min(0.05, (now - previous) / 1000))
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
  }, [props.getState])

  useEffect(() => {
    rendererRef.current?.updateSettings(props.settings)
  }, [props.settings])

  useEffect(() => {
    rendererRef.current?.onEvents(state.events, state)
  }, [state.tick])

  useEffect(() => {
    const pressed = new Set<string>()
    const keydown = (event: KeyboardEvent) => {
      if (pressed.has(event.code)) return
      pressed.add(event.code)
      const first = localPlayers[0]
      const second = localPlayers[1]
      if (event.code === 'Space' && first) { event.preventDefault(); props.onAbility(first.id) }
      if (event.code === 'Enter' && second) { event.preventDefault(); props.onAbility(second.id) }
      if ((event.code === 'KeyW' || event.code === 'KeyS') && first) props.onTarget(first.id, first.position + (event.code === 'KeyW' ? -0.16 : 0.16))
      if ((event.code === 'ArrowUp' || event.code === 'ArrowDown') && second) props.onTarget(second.id, second.position + (event.code === 'ArrowUp' ? -0.16 : 0.16))
      if ((event.code === 'KeyA' || event.code === 'KeyD') && first) props.onTarget(first.id, first.position + (event.code === 'KeyA' ? -0.16 : 0.16))
      if ((event.code === 'ArrowLeft' || event.code === 'ArrowRight') && second) props.onTarget(second.id, second.position + (event.code === 'ArrowLeft' ? -0.16 : 0.16))
    }
    const keyup = (event: KeyboardEvent) => pressed.delete(event.code)
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup) }
  }, [localPlayers, props])

  const onPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!primaryPlayer) return
    event.currentTarget.setPointerCapture(event.pointerId)
    props.onTarget(primaryPlayer.id, pointerTarget(event, primaryPlayer.side))
  }

  const orderedScores = Object.entries(state.scores)
  const winnerName = state.winnerTeam
    ? Object.values(state.players).find((player) => player.team === state.winnerTeam)?.name ?? state.winnerTeam
    : null

  return (
    <section className="pg-game-layout" aria-label="Pong match">
      <div className="pg-game-topbar">
        <div className="pg-game-title"><strong>{props.title}</strong><span>{props.subtitle}</span></div>
        <button className="pg-pill" onClick={props.onExit}>Exit match</button>
      </div>
      <div ref={mountRef} className="pg-canvas-wrap" onPointerDown={onPointer} onPointerMove={(event) => {
        if (event.buttons > 0 || event.pointerType === 'touch') onPointer(event)
      }}>
        <div className="pg-hud">
          <div className="pg-scoreboard" aria-label="Score">
            {orderedScores.map(([team, score], index) => (
              <span key={team} className="pg-score" style={{ color: `#${(Object.values(state.players).find((player) => player.team === team)?.color ?? 0xffffff).toString(16).padStart(6, '0')}` }}>
                {score}<span className="pg-visually-hidden"> points for team {index + 1}</span>
              </span>
            ))}
          </div>
          <div className="pg-timer">{state.overtime ? 'OVERTIME' : `${Math.floor(secondsRemaining(state) / 60)}:${String(secondsRemaining(state) % 60).padStart(2, '0')}`}</div>
          {countdownValue(state) && <div className="pg-countdown">{countdownValue(state)}</div>}
          {state.phase === 'finished' && (
            <div className="pg-game-message">
              <div className="pg-game-message__card">
                <p className="pg-kicker">Match complete</p>
                <h2>{winnerName} wins!</h2>
                <p className="pg-hero__tagline">What a rally. Run it back?</p>
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
          Drag on the court or use {localPlayers.length > 1 ? 'W/S + ↑/↓' : 'W/S or arrow keys'}. Perfect returns shave time off your cooldown.
        </div>
        {primaryPlayer && (
          <button className="pg-ability-button" onPointerDown={(event) => { event.stopPropagation(); props.onAbility(primaryPlayer.id) }}>
            {primaryPlayer.ability.toUpperCase()} · {primaryPlayer.cooldownTicks > 0 ? `${Math.ceil(primaryPlayer.cooldownTicks / TICK_RATE)}s` : 'READY'}
          </button>
        )}
      </div>
    </section>
  )
}
