import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { COOP_TICK_RATE, CREW_ROOMS, CREW_UPGRADES, EXPEDITION_WORLDS, RECOVERY_WORK, bossWarning, expeditionWorld, coopProgress, coopSecondsRemaining, type CoopGameState, type CrewTap } from '@pongapp/game-core'
import type { ConnectionQuality } from '../online/RoomClient'
import type { CrewControl } from '../online/LocalSimulation'
import { peerLabel, type PeerStatus } from '../online/PeerSession'
import { ExpeditionCanvas } from './ExpeditionCanvas'
import { useWakeLock } from './useWakeLock'
import { DEFAULT_CAMERA_ZOOM, MAX_CAMERA_ZOOM } from './RollingWorld'
import { ExpeditionAudio } from './ExpeditionAudio'

interface Props {
  getState: () => CoopGameState
  subscribe: (listener: (state: CoopGameState) => void) => () => void
  localPlayerId: string; title: string; roomCode: string
  network: { latencyMs: number | null; quality: ConnectionQuality; reconnecting: boolean; peer?: PeerStatus }
  onPaddle: (power: number) => void; onFlare?: () => void; onCrew: (patch: Partial<CrewControl>) => void
  onExit: () => void; onRematch: () => void; modeLabel?: string
}
const ACTIONS: CrewTap[] = ['left','right','shoot','recover']
const LABELS = { left: 'Left', right: 'Right', shoot: 'Shoot', recover: 'Recover' }
const FEEDBACK = { left: 'Running to port helm', right: 'Running to starboard helm', shoot: 'Running to cannon room', recover: 'Running to repair room' }
export function CoopRiver({ getState, subscribe, localPlayerId, roomCode, network, onCrew, onExit, onRematch, modeLabel }: Props) {
  const [state, setState] = useState(() => ({ ...getState() }))
  const [active, setActive] = useState<CrewTap[]>([])
  const [helpOpen, setHelpOpen] = useState(false)
  const helpDialog = useRef<HTMLDialogElement>(null)
  const [zoom, setZoom] = useState(DEFAULT_CAMERA_ZOOM)
  const scoreAudio=useRef<ExpeditionAudio|null>(null)
  const [muted,setMuted]=useState(()=>localStorage.getItem('ark-muted')==='1')
  const [volume,setVolume]=useState(()=>{const v=Number(localStorage.getItem('ark-volume')??'.5');return Number.isFinite(v)?Math.max(0,Math.min(1,v)):.5})
  useEffect(()=>{
    const audio=scoreAudio.current=new ExpeditionAudio();audio.setMuted(muted);audio.setVolume(volume)
    const start=()=>{void audio.start()},visibility=()=>{if(document.hidden)void audio.suspend();else if(!audio.isMuted)void audio.start()}
    window.addEventListener('pointerdown',start);window.addEventListener('keydown',start);document.addEventListener('visibilitychange',visibility)
    return()=>{audio.dispose();window.removeEventListener('pointerdown',start);window.removeEventListener('keydown',start);document.removeEventListener('visibilitychange',visibility)}
  },[])
  const [notice, setNotice] = useState('Choose a room. Run there. Take your station.')
  const noticeTimer = useRef(0), pulseTimers = useRef<Partial<Record<CrewTap, number>>>({})
  const fireRef = useRef<(action: CrewTap) => void>(() => {})
  const sources = useRef(new Map<string,CrewTap>())
  const beginRef = useRef<(action:CrewTap,source:string)=>void>(()=>{})
  const endRef = useRef<(source:string)=>void>(()=>{})
  const releaseRef = useRef<()=>void>(()=>{})
  const onCrewRef=useRef(onCrew);onCrewRef.current=onCrew
  const c = state.crew
  const disabled = state.phase !== 'playing' || helpOpen || Boolean(network.peer?.paused && !modeLabel)
  const disabledRef = useRef(disabled); disabledRef.current = disabled
  useWakeLock()
  const flash = (text: string) => { setNotice(text); clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice('One crewmate. One room. Choose your next move.'), 2200) }
  useEffect(() => {
    let last = 0, eventTick = -1, lastHealth = -1
    return subscribe(next => {
      scoreAudio.current?.update(next)
      if (performance.now() - last > 50 || next.events.length || next.hearts !== lastHealth || next.phase !== 'playing') {
        setState({ ...next, crew: { ...next.crew, upgrades: [...next.crew.upgrades], pendingShots: [...next.crew.pendingShots] }, players: structuredClone(next.players) }); last = performance.now(); lastHealth = next.hearts
      }
      if (next.events.length && next.tick !== eventTick) {
        eventTick = next.tick
        const e = next.events.find(e => e.type === 'crash') ?? next.events.find(e => e.type === 'crew') ?? next.events.at(-1)!
        const text = e.type === 'crew' ? e.message : e.type === 'crash' ? 'HULL HIT · send someone to Recover' : e.type === 'rescued' ? 'FRIEND ABOARD +120' : e.type === 'relic' ? '+2 SALVAGE · FASTER RECOVERY' : e.type === 'healed' ? 'HULL RECOVERED +1 HEART' : ''
        if (text) { flash(text); if (e.type === 'crash') navigator.vibrate?.(40) }
      }
    })
  }, [subscribe])
  const pulse=(action:CrewTap)=>{
    setActive(previous => [...previous.filter(v => v !== action), action])
    clearTimeout(pulseTimers.current[action]); pulseTimers.current[action] = window.setTimeout(() => setActive(previous => [...new Set([...previous.filter(v=>v!==action),...sources.current.values()])]), 145)
    flash(FEEDBACK[action])
  }
  fireRef.current = (action: CrewTap) => {
    if (disabledRef.current) return
    onCrew({ station: action });pulse(action)
  }
  beginRef.current=(action,source)=>{
    if(disabledRef.current||sources.current.has(source))return
    sources.current.set(source,action);onCrew({station:action});pulse(action)
  }
  endRef.current=source=>{
    if(!sources.current.delete(source))return
    setActive([...new Set(sources.current.values())])
  }
  releaseRef.current=()=>{sources.current.clear();setActive([])}
  useEffect(()=>{if(disabled)releaseRef.current()},[disabled])
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (disabledRef.current || e.altKey || e.ctrlKey || e.metaKey) return
      const buttonAction = e.target instanceof HTMLElement ? e.target.closest<HTMLButtonElement>('.crew-tap')?.dataset.action as CrewTap | undefined : undefined
      if(e.target instanceof HTMLElement&&e.target.closest('button,input,textarea,select')&&!buttonAction)return
      const action: CrewTap | null = ['ArrowLeft','KeyA'].includes(e.code) ? 'left' : ['ArrowRight','KeyD'].includes(e.code) ? 'right' : ['Space','KeyJ'].includes(e.code) ? 'shoot' : ['KeyR','KeyK'].includes(e.code) ? 'recover' : e.code === 'Enter' ? buttonAction ?? null : null
      // One key press selects one persistent destination. Key repeat never restarts a route.
      if (action) { e.preventDefault(); if (!e.repeat) beginRef.current(action,'key:'+e.code) }
    }
    const keyup = (e: KeyboardEvent) => {if(sources.current.has('key:'+e.code)||['Space','Enter'].includes(e.code)&&e.target instanceof HTMLElement&&e.target.closest('.crew-tap'))e.preventDefault();endRef.current('key:'+e.code)}
    const clear=()=>releaseRef.current(),visibility=()=>{if(document.visibilityState==='hidden')clear()}
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur',clear);document.addEventListener('visibilitychange',visibility)
    return () => {window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);sources.current.clear();onCrewRef.current({steer:0,action:false,recoverHeld:false});clearTimeout(noticeTimer.current);Object.values(pulseTimers.current).forEach(clearTimeout)}
  }, [])
  const press = (action: CrewTap) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);beginRef.current(action,'pointer:'+e.pointerId)
  }
  const world = expeditionWorld(state), theme = EXPEDITION_WORLDS[world]!, progress = coopProgress(state)
  const partner = Object.values(state.players).find(p => p.id !== localPlayerId)
  const me=state.players[localPlayerId]
  const hearts = Math.max(0, Math.min(3, Math.round(state.hearts)))
  useEffect(()=>{if(hearts===3)for(const [source,action] of sources.current)if(action==='recover')endRef.current(source)},[hearts])
  const boss = state.objects.find(o => o.enemy === 'boss'&&o.bossKind==='guardian')??state.objects.find(o=>o.enemy==='boss')
  const incoming=bossWarning(state),flight=state.boat.flight
  const flightProgress=flight?flight.tick/flight.duration:0
  const flightLabel=flightProgress>.66?'RETURNING TO SEA':flightProgress<.24?'RISING':'AIRBORNE'
  const repairPercent=Math.min(100,Math.round(c.repair/RECOVERY_WORK*100))
  const subtitle = (action: CrewTap) => me?.station===action?(me.deck.moving?'Running…':'At station'):partner?.station===action?(partner.deck.moving?'Crew arriving':'Crew at station'):action==='shoot'?'Auto-aim cannon':action==='recover'?'Repair hull':'Steer the ship'
  return <main className={'river-game expedition-game crew-game tap-crew world-' + world + (active.includes('left') || active.includes('right') ? ' is-paddling' : '')}>
    <header className="river-topbar expedition-top"><button onClick={onExit} aria-label="Leave expedition">←</button><div><strong>THE WANDERING ARK</strong><span>{roomCode} · {modeLabel ? 'You + Scout' : 'Two crew · four rooms'}</span></div><div className="expedition-link" data-path={network.peer?.path ?? 'solo'}>{modeLabel ? 'SOLO + SCOUT' : peerLabel(network.peer)}</div><button className="crew-help-button" onClick={() => { setHelpOpen(true); helpDialog.current?.showModal() }}>Controls</button></header>
    <section className="expedition-hud">
      <div><small>TEAM SCORE</small><strong>{state.score.toLocaleString()}</strong></div>
      <div className="crew-hull" data-hearts={hearts} role="status" aria-label={'Team hull ' + hearts + ' of 3'}><small>TEAM HULL <b>{hearts}/3</b></small><div className="expedition-hearts">{[0,1,2].map(i => <svg key={i} className={i < hearts ? 'full' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3.5 12.6C-3 6.2 6-2 12 5.1 18-2 27 6.2 20.5 12.6Z"/></svg>)}</div></div>
      <div><small>EXTRACTION</small><strong>{coopSecondsRemaining(state)}<em>s</em></strong></div>
    </section>
    <section className="river-world expedition-world">
      <ExpeditionCanvas getState={getState} zoom={zoom} onZoom={setZoom} onTarget={!disabled ? id => { onCrew({ targetId: id }); flash(id === null ? 'Auto aim · nearest predator' : 'Target selected · staff the cannon room') } : undefined}/>
      <div className="crew-camera" role="group" aria-label="Camera zoom"><button aria-label="Zoom out" disabled={zoom <= .65} onClick={() => setZoom(Math.max(.65,zoom-.1))}>−</button><button aria-label="Reset camera zoom" onClick={() => setZoom(DEFAULT_CAMERA_ZOOM)}>{Math.round(zoom*100)}%</button><button aria-label="Zoom in" disabled={zoom >= MAX_CAMERA_ZOOM} onClick={() => setZoom(Math.min(MAX_CAMERA_ZOOM,zoom+.1))}>＋</button></div>
      <div className="expedition-title" key={world}><span>0{world + 1} / FIVE WORLDS · EXPEDITION ARK</span><h1>{theme.name}</h1></div>
      <div className="crew-mission"><span className={state.rescued >= 3 ? 'done' : ''}>◒ Rescue {Math.min(3, state.rescued)}/3</span><span className={c.bossDefeated ? 'done' : ''}>{c.bossDefeated ? '✓ Guardian defeated' : '⌖ Defeat the guardian'}</span></div>
      {incoming&&<div className="crew-boss-warning" role="status"><span>↑ {incoming.name} APPROACHING</span><strong>{Math.ceil(incoming.ticks/COOP_TICK_RATE)}</strong><small>Look up · cannons auto-aim</small></div>}
      {!incoming&&boss && <div className="crew-boss"><span>{boss.bossKind==='sentinel'?'CROWN OF THE DEEP':'STORMWYRM SOVEREIGN'}{(boss.altitude??0)>1?' · AIRBORNE':''}</span><b><i style={{ width: Math.max(0, (boss.hp ?? 0) / (boss.maxHp ?? 1)) * 100 + '%' }}/></b></div>}
      {flight&&<div className="crew-altitude" role="status" data-phase={flightLabel} data-altitude={state.boat.altitude.toFixed(2)}><span>↑ {flightLabel}<small>Temporary lift · auto return</small></span><b><i style={{width:(1-flightProgress)*100+'%'}}/></b></div>}
      {network.peer?.paused && !modeLabel && <div className="expedition-pause" role="status"><strong>Waiting for your teammate</strong><span>Keep both game tabs open. Your expedition will resume.</span></div>}
      {state.phase === 'countdown' && <div className="expedition-countdown"><span>TWO CREW. FOUR ROOMS. ONE SHIP.</span><strong>{Math.max(1, Math.ceil(state.countdownTicks / COOP_TICK_RATE))}</strong><p>Choose a room to run there.<br/>Your crewmate works when they arrive.<br/>Watch the monsters’ attack markers.</p><small>Rescue 3 friends. Defeat the guardian.</small></div>}
      {state.phase === 'finished' && <div className="expedition-finish"><span>{c.victory ? 'YOU BROUGHT THEM HOME.' : 'YOUR CREW. YOUR NEXT ADVENTURE.'}</span><h1>{c.victory ? 'Wildly good together.' : hearts ? 'The rescue isn’t over.' : 'One more run?'}</h1><strong>{state.score.toLocaleString()} <small>TEAM POINTS</small></strong><div><p>◒ {state.rescued}/3 rescued</p><p>⌖ {c.kills} predators</p><p>{c.bossDefeated ? '✓ Guardian defeated' : 'Guardian still out there'}</p></div><button onClick={onRematch}>Another expedition ↗</button><button className="quiet" onClick={onExit}>Back to basecamp</button></div>}
      <div className="expedition-route">{EXPEDITION_WORLDS.map((v, i) => <span key={v.name} className={i === world ? 'active' : i < world ? 'done' : ''}>{['✿','☀','▲','☁','✦'][i]}<i style={{ width: Math.max(0, Math.min(1, progress * 5 - i)) * 100 + '%' }}/></span>)}</div>
    </section>
    <footer className="crew-controls">
      <div className="crew-status"><span>You: <b>{me?.station?(me.deck.moving?'Running → ':'')+CREW_ROOMS.find(r=>r.id===me.station)?.name:'Choose a room'}</b></span><span>{partner?.name??'Scout'}: <b>{partner?.station??'Ready'}</b></span><span className="crew-upgrade-strip" aria-label="Automatically equipped upgrades">{c.upgrades.map(u => <i key={u} title={CREW_UPGRADES.find(v => v.id === u)?.name}>{CREW_UPGRADES.find(v => v.id === u)?.icon}</i>)}</span><span>◆ <b>{c.scrap}</b></span></div>
      <div className="crew-recovery-meter" role="progressbar" aria-label="Shared recovery progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hearts===3?100:repairPercent}><span>{hearts===3?'HULL READY':`RECOVER ${repairPercent}%`}<small>{hearts===3?'Ready for anything':c.scrap>=3?'Salvage boost · progress saved':'Free recovery · progress saved'}</small></span><b><i style={{width:(hearts===3?100:repairPercent)+'%'}}/></b></div>
      <div className="crew-tap-grid" role="group" aria-label="Choose your crew room">
        {ACTIONS.map(action => <button key={action} type="button" className={'crew-tap crew-tap--' + action} data-action={action} data-active={me?.station===action} data-traveling={me?.station===action&&me.deck.moving} aria-pressed={me?.station===action} aria-label={LABELS[action]} disabled={disabled} onPointerDown={press(action)} onPointerUp={e=>{endRef.current('pointer:'+e.pointerId);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={e=>endRef.current('pointer:'+e.pointerId)} onLostPointerCapture={e=>endRef.current('pointer:'+e.pointerId)} onClick={e => { if (e.detail === 0) fireRef.current(action) }}>
          <b aria-hidden="true">{action === 'left' ? '←' : action === 'right' ? '→' : action === 'shoot' ? '◉' : '♥+'}</b><span>{LABELS[action]}<small>{subtitle(action)}</small></span>
          {action === 'recover' && hearts < 3 && <i className="crew-repair-fill" style={{width:repairPercent+'%'}}/>}
        </button>)}
      </div>
      <div className="ark-audio-row"><p className="crew-tap-feedback" role="status">{notice}</p><button className="ark-music" aria-label={muted?'Enable music':'Mute music'} aria-pressed={!muted} onClick={()=>{const next=!muted;setMuted(next);localStorage.setItem('ark-muted',next?'1':'0');scoreAudio.current?.setMuted(next);void scoreAudio.current?.start()}}>{muted?'♫ Off':'♫ On'}</button></div>
    </footer>
    <dialog ref={helpDialog} className="crew-guide" aria-labelledby="crew-guide-title" onClose={() => setHelpOpen(false)}><button autoFocus onClick={() => helpDialog.current?.close()}>Back to game ×</button><h2 id="crew-guide-title">Your ship is your controller.</h2><label className="ark-volume">Music volume <input aria-label="Music volume" type="range" min="0" max="1" step=".05" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);scoreAudio.current?.setVolume(v);localStorage.setItem('ark-volume',String(v))}}/></label><p>Choose one of four rooms. Watch your crewmate run across the deck, then operate that station until you choose another. There is no work while running. Two crew can do two jobs—not all four at once.</p><section><h3>← Port / Starboard →</h3><p>Staff a helm to turn around the cylinder. Leave it to stop turning. Opposite helms cancel. Red monster markers lock their attack destination; move early enough to reach a helm and evade.</p></section><section><h3>◉ Cannon room</h3><p>Staff this room to fire deliberate heavy homing shells. Tap a monster to focus fire. Cannons track height automatically. Sending your gunner elsewhere stops firing immediately.</p></section><section><h3>♥+ Repair room</h3><p>Four seconds of work with salvage, or six without, restores one shared heart. Partial progress is saved. Two repairers work together; three salvage are used per repair.</p></section><section><h3>↑ A little airtime</h3><p>Rare updrafts lift the entire ship and crew, then return them to sea level. Watch falling hazards and boss warnings.</p></section><p><strong>Keyboard:</strong> A/D or arrows choose helms, Space/J chooses cannon, R/K chooses repair. Release your finger—the room stays selected.</p><p><strong>Camera:</strong> pinch or use − to see more world. This guide does not pause online play.</p></dialog>
  </main>
}
