import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COOP_TICK_RATE, versusSecondsRemaining, type RacerState, type VersusGameState } from '@pongapp/game-core'
import { peerLabel, type PeerStatus } from '../online/PeerSession'
import { useWakeLock } from './useWakeLock'

interface Props {
  peer?: PeerStatus
  initialState: VersusGameState
  subscribe: (listener: (state: VersusGameState) => void) => () => void
  localPlayerId: string
  title: string
  roomCode: string
  latencyMs: number | null
  reconnecting: boolean
  onTap: () => void
  onExit: () => void
  onRematch: () => void
}

function RacerTrack({ racer, state, local }: { racer: RacerState; state: VersusGameState; local: boolean }) {
  const visible = state.items.filter((item) => item.distance > racer.distance - 5 && item.distance < racer.distance + 125 && !item.resolvedBy.includes(racer.id))
  return <div className={`race-track ${local ? 'is-local' : ''}`}>
    <div className="race-track__name"><span>{local ? 'YOU' : racer.name}</span><b>{Math.round(racer.distance)}m</b></div>
    <div className="race-lane-line race-lane-line--one"/><div className="race-lane-line race-lane-line--two"/>
    {visible.map((item) => {
      const bottom = Math.max(8, Math.min(94, (1 - (item.distance - racer.distance) / 125) * 86 + 8))
      return <i key={item.id} className={`race-item race-item--${item.type}`} style={{ left: item.lane === 0 ? '31%' : '69%', bottom: `${bottom}%` }}>{item.type === 'orb' ? '✦' : item.type === 'ramp' ? '▲' : ''}</i>
    })}
    <div className={`race-boat race-boat--${racer.slot} ${racer.boostTicks > 0 ? 'is-boosting' : ''} ${racer.jumpTicks > 0 ? 'is-jumping' : ''}`} style={{ left: racer.lane === 0 ? '31%' : '69%' }}><span>●</span><i/></div>
    <div className="race-hearts" aria-label={`${local ? 'Your' : racer.name+'’s'} hearts: ${racer.hearts} of 3`}>{[0,1,2].map((heart) => <span key={heart} className={heart < racer.hearts ? 'is-full' : ''}>♥</span>)} <b>{racer.hearts}/3</b></div>
  </div>
}

export function VersusRiver({ initialState, subscribe, localPlayerId, title, roomCode, latencyMs, reconnecting, peer, onTap, onExit, onRematch }: Props) {
  useWakeLock()
  const [state, setState] = useState(initialState)
  const [tapFlash, setTapFlash] = useState(false)
  const flashTimer = useRef(0)
  const canTap = state.phase === 'playing' && !peer?.paused
  const switchLane = useCallback(() => {
    if(!canTap)return
    setTapFlash(true);clearTimeout(flashTimer.current);flashTimer.current=window.setTimeout(()=>setTapFlash(false),180);onTap()
  },[canTap,onTap])
  useEffect(()=>()=>clearTimeout(flashTimer.current),[])
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if((e.code==='Space'||e.code==='Enter')&&!e.repeat&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();switchLane()}}
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[switchLane])
  useEffect(() => subscribe(setState), [subscribe])
  const racers = useMemo(() => Object.values(state.racers).sort((a,b) => a.slot - b.slot), [state.racers])
  const local = state.racers[localPlayerId]
  const rival = racers.find((racer) => racer.id !== localPlayerId)
  const countdown = state.phase === 'countdown' ? Math.max(1, Math.ceil(state.countdownTicks / COOP_TICK_RATE)) : null
  const winner = state.winnerId ? state.racers[state.winnerId] : null

  useEffect(() => {
    const event = state.events.at(-1)
    if (!event || !('playerId' in event) || event.playerId !== localPlayerId) return
    if (event.type === 'raceCrash') navigator.vibrate?.([45, 30, 45])
    if (event.type === 'orb' || event.type === 'ramp') navigator.vibrate?.(25)
  }, [localPlayerId, state.events, state.tick])

  if (!local || !rival) return null
  return <main className="race-game">
    <header className="race-topbar"><button onClick={onExit} aria-label="Leave race">←</button><div><strong>RAPID RIVALS</strong><span>{title} · {roomCode}</span></div><b data-path={peer?.path}>{peer ? peerLabel(peer) : reconnecting ? 'REJOINING' : latencyMs === null ? 'CONNECTING' : `${latencyMs}ms`}</b></header>
    <section className="race-scorebar"><div><span>{local.name}</span><strong>{Math.round(local.distance)}m</strong></div><p><small>TIME</small><b>{versusSecondsRemaining(state)}</b></p><div><span>{rival.name}</span><strong>{Math.round(rival.distance)}m</strong></div></section>
    <section className="race-world"><RacerTrack racer={local} state={state} local/><div className="race-divider"><span>VS</span></div><RacerTrack racer={rival} state={state} local={false}/>
      {peer?.paused && <div className="expedition-pause"><strong>Waiting for your rival</strong><span>Keep both game tabs open to resume.</span></div>}
      {countdown && <div className="race-countdown"><small>FIRST TO {state.finishDistance}M</small><strong>{countdown}</strong><span>Tap to switch lanes. Grab stars. Hit ramps.</span></div>}
      {state.phase === 'finished' && <div className="race-finish"><small>{winner?.id === localPlayerId ? 'YOU TOOK THE RIVER!' : `${winner?.name ?? 'RIVAL'} WINS!`}</small><h1>{winner?.id === localPlayerId ? 'VICTORY' : 'REMATCH?'}</h1><p>{Math.round(local.distance)}m vs {Math.round(rival.distance)}m<br/>{local.score} bonus points</p><button onClick={onRematch}>Race again</button><button className="race-finish__quiet" onClick={onExit}>Back home</button></div>}
    </section>
    <footer className="race-controls"><p className="race-rules">Dodge rocks · Stars boost speed · Ramps jump over rocks</p><div aria-label="Your current lane"><span className={local.lane === 0 ? 'is-active' : ''}>LEFT</span><span className={local.lane === 1 ? 'is-active' : ''}>RIGHT</span></div><button data-active={tapFlash} aria-label="Switch lane and boost" onPointerDown={(event) => { event.preventDefault(); switchLane() }} onClick={event=>{if(event.detail===0)switchLane()}} disabled={!canTap}><strong>{tapFlash ? 'Switching! ⚡' : `Switch to ${local.lane===0?'right →':'← left'}`}</strong><small>Tap once · switch lanes + speed burst</small></button></footer>
  </main>
}
