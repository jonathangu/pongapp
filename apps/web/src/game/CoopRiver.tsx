import { useEffect, useMemo, useState } from 'react'
import { COOP_TICK_RATE, coopSecondsRemaining, type CoopGameState } from '@pongapp/game-core'
import type { ConnectionQuality } from '../online/RoomClient'

interface Props {
  getState: () => CoopGameState
  subscribe: (listener: (state: CoopGameState) => void) => () => void
  localPlayerId: string
  title: string
  roomCode: string
  network: { latencyMs: number | null; quality: ConnectionQuality; reconnecting: boolean }
  onPaddle: (power: number) => void
  onExit: () => void
  onRematch: () => void
}

export function CoopRiver({ getState, subscribe, localPlayerId, title, roomCode, network, onPaddle, onExit, onRematch }: Props) {
  const [state, setState] = useState<CoopGameState>(() => getState())
  const [pressed, setPressed] = useState(false)
  const [celebration, setCelebration] = useState<string | null>(null)
  const player = state.players[localPlayerId]
  const side = player?.side ?? 'left'
  const partner = useMemo(() => Object.values(state.players).find((candidate) => candidate.id !== localPlayerId), [localPlayerId, state.players])

  useEffect(() => subscribe(setState), [subscribe])
  useEffect(() => {
    let frame = 0
    let active = true
    const draw = () => { if (!active) return; try { setState(getState()) } catch { /* waiting for next snapshot */ } frame = requestAnimationFrame(draw) }
    frame = requestAnimationFrame(draw)
    return () => { active = false; cancelAnimationFrame(frame) }
  }, [getState])
  useEffect(() => {
    const release = () => { setPressed(false); onPaddle(0) }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', release)
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', release); onPaddle(0) }
  }, [onPaddle])
  useEffect(() => {
    const event = state.events.at(-1)
    if (!event) return
    if (event.type === 'collected') setCelebration(`+${event.value}`)
    if (event.type === 'crash') setCelebration('BONK!')
    if (event.type === 'healed') setCelebration('+♥')
    const timer = window.setTimeout(() => setCelebration(null), 520)
    return () => window.clearTimeout(timer)
  }, [state.tick, state.events])

  const startPaddling = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setPressed(true)
    onPaddle(1)
  }
  const countdown = state.phase === 'countdown' ? Math.max(1, Math.ceil(state.countdownTicks / COOP_TICK_RATE)) : null
  const boatRotation = state.boat.heading * 1150

  return (
    <main className={`river-game ${pressed ? 'is-paddling' : ''}`}>
      <header className="river-topbar">
        <button onClick={onExit} aria-label="Leave trip">←</button>
        <div><strong>{title}</strong><span>Room {roomCode}</span></div>
        <div className={`river-signal river-signal--${network.quality}`}><i />{network.reconnecting ? 'Rejoining' : network.latencyMs === null ? 'Edge' : `${network.latencyMs}ms`}</div>
      </header>

      <section className="river-hud" aria-label="Shared trip score">
        <div><small>FIREFLIES</small><strong>{state.score}</strong></div>
        <div className="river-hearts" aria-label={`${state.hearts} hearts`}>{[0, 1, 2].map((heart) => <span key={heart} className={heart < state.hearts ? 'is-full' : ''}>♥</span>)}</div>
        <div><small>TIME</small><strong>{coopSecondsRemaining(state)}</strong></div>
      </section>

      <section className="river-world" aria-label="Moonlit river">
        <div className="river-bank river-bank--left" /><div className="river-bank river-bank--right" />
        <div className="river-moon">☾</div>
        {[0, 1, 2, 3, 4, 5].map((line) => <i key={line} className="river-current" style={{ left: `${20 + line * 13}%`, animationDelay: `${-line * 0.55}s`, animationDuration: `${2.4 + line * 0.17}s` }} />)}
        {state.objects.map((object) => (
          <span key={object.id} className={`river-object river-object--${object.type}`} style={{ left: `${object.x * 100}%`, top: `${object.y * 100}%`, transform: `translate(-50%, -50%) scale(${object.type === 'firefly' ? 0.9 + Math.sin(object.phase) * 0.15 : 1})` }}>
            {object.type === 'firefly' ? '✦' : object.type === 'heart' ? '♥' : ''}
          </span>
        ))}
        <div className="river-boat-wrap" style={{ left: `${state.boat.x * 100}%`, transform: `translate(-50%, -50%) rotate(${boatRotation}deg)` }}>
          <span className={`river-oar river-oar--left ${state.paddles.left > 0.5 ? 'is-active' : ''}`} />
          <span className={`river-oar river-oar--right ${state.paddles.right > 0.5 ? 'is-active' : ''}`} />
          <div className="river-boat"><span>●</span><span>●</span></div>
          <i className="river-wake" style={{ opacity: 0.22 + state.boat.wake * 0.75 }} />
        </div>
        {celebration && <div className={`river-pop ${celebration === 'BONK!' ? 'is-bonk' : ''}`}>{celebration}</div>}
        {countdown && <div className="river-countdown"><small>YOU HAVE THE {side.toUpperCase()} OAR</small><strong>{countdown}</strong><span>{partner?.name ?? 'Your partner'} is aboard</span></div>}
        {state.phase === 'finished' && <div className="river-finish"><small>{state.hearts > 0 ? 'SUNRISE!' : 'SHIPWRECK!'}</small><h1>{state.score}</h1><p>firefly points · {Math.round(state.distance)}m together<br/>best streak ×{state.bestStreak}</p><button onClick={onRematch}>Row again</button><button className="river-finish__quiet" onClick={onExit}>Leave the river</button></div>}
      </section>

      <footer className="river-controls">
        <div><span className={`oar-status ${state.paddles.left > 0.5 ? 'is-on' : ''}`} />{side === 'left' ? 'YOU' : partner?.name ?? 'LEFT'}</div>
        <button className={`river-paddle river-paddle--${side}`} onPointerDown={startPaddling} onContextMenu={(event) => event.preventDefault()} disabled={state.phase === 'finished'}>
          <span>{pressed ? 'PULL!' : 'HOLD TO PADDLE'}</span><small>Your {side} oar</small>
        </button>
        <div>{side === 'right' ? 'YOU' : partner?.name ?? 'RIGHT'}<span className={`oar-status ${state.paddles.right > 0.5 ? 'is-on' : ''}`} /></div>
      </footer>
    </main>
  )
}
