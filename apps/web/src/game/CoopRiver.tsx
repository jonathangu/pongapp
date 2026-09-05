import { useEffect, useRef, useState } from 'react'
import { COOP_TICK_RATE, EXPEDITION_WORLDS, expeditionWorld, coopProgress, coopSecondsRemaining, type CoopGameState } from '@pongapp/game-core'
import type { ConnectionQuality } from '../online/RoomClient'
import { peerLabel, type PeerStatus } from '../online/PeerSession'
import { ExpeditionCanvas } from './ExpeditionCanvas'
import { useWakeLock } from './useWakeLock'

interface Props {
  getState: () => CoopGameState
  subscribe: (listener: (state: CoopGameState) => void) => () => void
  localPlayerId: string; title: string; roomCode: string
  network: { latencyMs: number | null; quality: ConnectionQuality; reconnecting: boolean; peer?: PeerStatus }
  onPaddle: (power: number) => void; onFlare?: () => void
  onExit: () => void; onRematch: () => void; modeLabel?: string
}
export function CoopRiver({ getState, subscribe, localPlayerId, title, roomCode, network, onPaddle, onFlare, onExit, onRematch, modeLabel }: Props) {
  const [state,setState]=useState(()=>({...getState()}))
  const [pressed,setPressed]=useState(false)
  const [notice,setNotice]=useState('')
  const noticeTimer=useRef(0)
  useWakeLock()
  useEffect(()=>{
    let last=0;let eventTick=-1
    return subscribe((next)=>{
      if(performance.now()-last>90||next.events.length||next.phase==='finished') {setState({...next});last=performance.now()}
      if(next.events.length&&next.tick!==eventTick) {
        eventTick=next.tick
        const e=next.events.at(-1)!
        const label=e.type==='crash'?'HIT! Keep moving':e.type==='rush'?'HARMONY RUSH':e.type==='rescued'?'FRIEND RESCUED +120':e.type==='relic'?'RELIC FOUND · FLARE RECHARGED':e.type==='gate'?'PERFECT GATE +100':e.type==='flare'?'FLARE! Predators scatter':e.type==='lantern'?'STAR MAGNET':e.type==='healed'?'HEART RESTORED':e.type==='smashed'?'PREDATOR CLEARED':e.type==='nearMiss'?'CLOSE CALL +15':''
        if(label) {setNotice(label);clearTimeout(noticeTimer.current);noticeTimer.current=window.setTimeout(()=>setNotice(''),1500);navigator.vibrate?.(e.type==='crash'?60:20)}
      }
    })
  },[subscribe])
  useEffect(()=>()=>clearTimeout(noticeTimer.current),[])
  useEffect(()=>{
    const release=()=>{setPressed(false);onPaddle(0)}
    const keydown=(e:KeyboardEvent)=>{if(e.repeat)return;if(e.code==='Space'){e.preventDefault();setPressed(true);onPaddle(1)}if(e.code==='KeyF')onFlare?.()}
    const keyup=(e:KeyboardEvent)=>{if(e.code==='Space')release()}
    window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);window.addEventListener('blur',release);window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup)
    return()=>{window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);window.removeEventListener('blur',release);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);onPaddle(0)}
  },[onPaddle,onFlare])
  const world=expeditionWorld(state), theme=EXPEDITION_WORLDS[world]!
  const side=state.players[localPlayerId]?.side??'left'
  const partner=Object.values(state.players).find(p=>p.id!==localPlayerId)
  const progress=coopProgress(state)
  const countdown=state.phase==='countdown'?Math.max(1,Math.ceil(state.countdownTicks/COOP_TICK_RATE)):null
  const paused=network.peer?.paused && !modeLabel
  return <main className={'river-game expedition-game world-'+world+(pressed?' is-paddling':'')}>
    <header className="river-topbar expedition-top"><button onClick={onExit} aria-label="Leave expedition">←</button><div><strong>TWO OARS <i> / EXPEDITIONS</i></strong><span>{title} · {roomCode}</span></div><div className="expedition-link" data-path={network.peer?.path??'solo'}>{modeLabel?'SOLO + SCOUT':peerLabel(network.peer)}</div></header>
    <section className="expedition-hud"><div><small>TEAM SCORE</small><strong>{state.score.toLocaleString()}</strong></div><div className="expedition-hearts" aria-label={state.hearts+' hearts'}>{[0,1,2].map(i=><span key={i} className={i<state.hearts?'full':''}>♥</span>)}</div><div><small>TO THE STARS</small><strong>{coopSecondsRemaining(state)}<em>s</em></strong></div></section>
    <section className="river-world expedition-world">
      <ExpeditionCanvas getState={getState}/>
      <div className="expedition-title" key={world}><span>CHAPTER {world+1} / 5 · {theme.vehicle.toUpperCase()}</span><h1>{theme.name}</h1><p>{theme.subtitle}</p></div>
      <div className="expedition-objectives"><span>◒ {state.rescued}/3 rescues</span><span>◇ {state.relics}/5 relics</span><span>◎ {state.gates}/3 gates</span></div>
      <div className="expedition-harmony river-harmony"><span>{state.rushTicks>0?'RUSH ACTIVE':'HARMONY'}</span><b><i style={{width:(state.rushTicks>0?100:state.harmony)+'%'}}/></b><strong>{state.rushTicks>0?'⚡':Math.round(state.harmony)+'%'}</strong></div>
      {notice&&<div className="expedition-notice" role="status">{notice}</div>}
      {paused&&<div className="expedition-pause" role="status"><strong>Waiting for your teammate</strong><span>Keep both game tabs open. Your expedition will resume.</span></div>}
      {!paused&&countdown&&<div className="expedition-countdown"><span>YOU CONTROL THE {side.toUpperCase()} SIDE</span><strong>{countdown}</strong><p>Hold together to accelerate.<br/>Take turns to steer. Flare scares predators.</p><small>{partner?.name??'Your teammate'} is with you.</small></div>}
      {state.phase==='finished'&&<div className="expedition-finish"><span>{state.hearts>0?'FIVE WORLDS. ONE TEAM.':'ANOTHER ADVENTURE?'}</span><h1>{state.hearts>0?'You reached the stars.':'What a ride.'}</h1><strong>{state.score.toLocaleString()} <small>TEAM POINTS</small></strong><div><p>◒ {state.rescued} friends rescued</p><p>◇ {state.relics} relics discovered</p><p>◎ {state.gates} gates crossed</p></div><button onClick={onRematch}>Another expedition ↗</button><button className="quiet" onClick={onExit}>Back to basecamp</button></div>}
      <div className="expedition-route">{EXPEDITION_WORLDS.map((v,i)=><span key={v.name} className={i===world?'active':i<world?'done':''}>{['✿','☀','▲','☁','✦'][i]}<i style={{width:Math.max(0,Math.min(1,progress*5-i))*100+'%'}}/></span>)}</div>
    </section>
    <footer className="expedition-controls"><div className="expedition-instruction"><span>{side.toUpperCase()} · YOU</span><span>{pressed?'Working together feels good.':'Hold together for speed · alternate to steer'}</span></div><div><button className={'river-paddle river-paddle--'+side} disabled={state.phase==='finished'||Boolean(paused)} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setPressed(true);onPaddle(1)}} onContextMenu={e=>e.preventDefault()}><span>{pressed?'LET’S GO!':theme.vehicle==='boat'?'HOLD TO ROW':theme.vehicle==='truck'?'HOLD TO DRIVE':'HOLD TO FLY'}</span><small>Your {side} side · Space</small></button><button className="expedition-flare" disabled={!onFlare||state.flareCooldown>0||state.phase!=='playing'||Boolean(paused)} onPointerDown={e=>{e.preventDefault();onFlare?.()}}><b>✺</b><span>{state.flareCooldown>0?Math.ceil(state.flareCooldown/60)+'s':'FLARE'}</span><small>Scare predators · F</small></button></div></footer>
  </main>
}
