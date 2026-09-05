import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { COOP_TICK_RATE, CREW_UPGRADES, EXPEDITION_WORLDS, expeditionWorld, coopProgress, coopSecondsRemaining, type CoopGameState, type CrewStation } from '@pongapp/game-core'
import type { ConnectionQuality } from '../online/RoomClient'
import type { CrewControl } from '../online/LocalSimulation'
import { peerLabel, type PeerStatus } from '../online/PeerSession'
import { ExpeditionCanvas } from './ExpeditionCanvas'
import { useWakeLock } from './useWakeLock'

interface Props {
  getState: () => CoopGameState
  subscribe: (listener: (state: CoopGameState) => void) => () => void
  localPlayerId: string; title: string; roomCode: string
  network: { latencyMs: number | null; quality: ConnectionQuality; reconnecting: boolean; peer?: PeerStatus }
  onPaddle: (power: number) => void; onFlare?: () => void; onCrew: (patch: Partial<CrewControl>) => void
  onExit: () => void; onRematch: () => void; modeLabel?: string
}
const STATIONS: Array<{ id: CrewStation; icon: string; name: string; role: string; hint: string }> = [
  { id: 'pilot', icon: '↗', name: 'Drive', role: 'Pilot', hint: 'Hold left or right to steer. Boost gives a short burst of speed.' },
  { id: 'gunner', icon: '⌖', name: 'Shoot', role: 'Gunner', hint: 'Guns aim & fire automatically. Hold Rapid fire for stronger shots; release to cool.' },
  { id: 'engineer', icon: '⛨', name: 'Repair', role: 'Engineer', hint: 'Hold Repair to restore a heart for 3 scrap. Shield blocks hits for a moment.' },
]
export function CoopRiver({ getState, subscribe, localPlayerId, roomCode, network, onFlare, onCrew, onExit, onRematch, modeLabel }: Props) {
  const [state, setState] = useState(() => ({ ...getState() }))
  const [held, setHeld] = useState<string[]>([])
  const pressed = held.length > 0
  const [helpOpen, setHelpOpen] = useState(false)
  const helpDialog = useRef<HTMLDialogElement>(null)
  const [zoom, setZoom] = useState(1)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(0)
  const pointers = useRef(new Map<number, 'left' | 'right' | 'action'>())
  const station = state.players[localPlayerId]?.station ?? 'pilot'
  const c = state.crew
  const disabled = state.phase !== 'playing' || helpOpen || Boolean(network.peer?.paused && !modeLabel)
  const disabledRef = useRef(disabled); disabledRef.current = disabled
  useWakeLock()
  useEffect(() => {
    let last = 0, eventTick = -1, lastHealth = -1
    return subscribe(next => {
      if (performance.now() - last > 70 || next.events.length || next.hearts !== lastHealth || next.phase !== 'playing') { setState({ ...next, crew: { ...next.crew }, players: structuredClone(next.players) }); last = performance.now(); lastHealth = next.hearts }
      if (next.events.length && next.tick !== eventTick) {
        eventTick = next.tick
        const e = next.events.find(e => e.type === 'crash') ?? next.events.find(e => e.type === 'crew') ?? next.events.at(-1)!
        const text = e.type === 'crew' ? e.message : e.type === 'crash' ? 'HULL HIT · engineer can repair' : e.type === 'rescued' ? 'FRIEND ABOARD +120' : e.type === 'relic' ? '+2 REPAIR SCRAP' : e.type === 'healed' ? 'HULL REPAIRED' : ''
        if (text) { setNotice(text.replace(/\b(pilot|gunner|engineer)\b/gi,role=>STATIONS.find(j=>j.id===role.toLowerCase())?.name??role)); clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice(''), 1800); if (e.type === 'crash') navigator.vibrate?.(50) }
      }
    })
  }, [subscribe])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])
  useEffect(() => {
    const emit = () => { const keys = [...pointers.current.values()]; setHeld(keys); onCrew({ steer: (keys.includes('right') ? 1 : 0) - (keys.includes('left') ? 1 : 0), action: keys.includes('action') }) }
    const release = (e: PointerEvent) => { if (pointers.current.delete(e.pointerId)) emit() }
    const reset = () => { pointers.current.clear(); setHeld([]); onCrew({ steer: 0, action: false }) }
    const keys = (e: KeyboardEvent) => {
      const down = e.type === 'keydown'
      if (down && (e.repeat || disabledRef.current)) return
      const key = e.code === 'ArrowLeft' || e.code === 'KeyA' ? 'left' : e.code === 'ArrowRight' || e.code === 'KeyD' ? 'right' : e.code === 'Space' ? 'action' : null
      if (key) { e.preventDefault(); const id = key === 'left' ? -1 : key === 'right' ? -2 : -3; if (down) pointers.current.set(id, key); else pointers.current.delete(id); emit() }
      if (down && e.code === 'KeyF') onFlare?.()
      if (down && ['Digit1','Digit2','Digit3'].includes(e.code)) { reset(); onCrew({ station: STATIONS[Number(e.code.slice(-1)) - 1]!.id }) }
    }
    const visibility = () => { if (document.visibilityState === 'hidden') reset() }
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('lostpointercapture', release); window.addEventListener('blur', reset)
    window.addEventListener('keydown', keys); window.addEventListener('keyup', keys); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('lostpointercapture', release); window.removeEventListener('blur', reset); window.removeEventListener('keydown', keys); window.removeEventListener('keyup', keys); document.removeEventListener('visibilitychange', visibility); reset() }
  }, [onCrew, onFlare])
  useEffect(() => { pointers.current.clear(); setHeld([]); onCrew({ steer: 0, action: false }) }, [station, disabled, onCrew])
  const hold = (key: 'left' | 'right' | 'action') => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, key)
    const keys = [...pointers.current.values()]; setHeld(keys)
    onCrew({ steer: (keys.includes('right') ? 1 : 0) - (keys.includes('left') ? 1 : 0), action: keys.includes('action') })
  }
  const flash = (text: string) => { setNotice(text); clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice(''), 2000) }
  const choose = (job: CrewStation) => {
    if(job === station) return
    pointers.current.clear(); setHeld([])
    const owner = Object.values(state.players).find(p => p.station === job)
    flash(owner ? `Swap requested · ${owner.name} needs to accept` : `Switching to ${STATIONS.find(j => j.id === job)!.name}…`)
    onCrew({ steer: 0, action: false, station: job })
  }
  const ability = () => { if(disabled) return; onFlare?.(); flash(station === 'pilot' ? 'Boost pressed · speed burst' : 'Shield pressed · block incoming hits') }
  const world = expeditionWorld(state), theme = EXPEDITION_WORLDS[world]!, progress = coopProgress(state)
  const partner = Object.values(state.players).find(p => p.id !== localPlayerId)
  const hearts = Math.max(0, Math.min(3, Math.round(state.hearts)))
  const boss = state.objects.find(o => o.enemy === 'boss')
  const cooldown = station === 'pilot' ? c.boostCooldown : c.shieldCooldown
  const swapFrom = c.swap?.to === localPlayerId ? state.players[c.swap.from] : null
  const job = STATIONS.find(j => j.id === station)!
  const actionFeedback = station === 'pilot'
    ? held.includes('left') && held.includes('right') ? 'Both held · straight ahead' : held.includes('left') ? 'Steering left ←' : held.includes('right') ? 'Steering right →' : 'Moving forward automatically'
    : station === 'gunner' ? c.overheated ? 'Too hot · guns cooling' : held.includes('action') ? 'Rapid fire held · building heat' : 'Auto-fire on · hold for stronger shots'
    : hearts === 3 ? 'All 3 hearts healthy · shield is still available' : c.scrap < 3 ? `${3-c.scrap} more scrap needed · collect crystals or defeat predators` : held.includes('action') ? `Repairing · ${Math.round(c.repair/110*100)}%` : 'Hold Repair · spend 3 scrap for +1 heart'
  return <main className={'river-game expedition-game crew-game world-' + world + (pressed ? ' is-paddling' : '')}>
    <header className="river-topbar expedition-top"><button onClick={onExit} aria-label="Leave expedition">←</button><div><strong>TWO OARS <i> / WILD TOGETHER</i></strong><span>{roomCode} · {modeLabel ? 'You + Scout' : 'Two-person crew'}</span></div><div className="expedition-link" data-path={network.peer?.path ?? 'solo'}>{modeLabel ? 'SOLO + SCOUT' : peerLabel(network.peer)}</div><button className="crew-help-button" onClick={() => { setHelpOpen(true); helpDialog.current?.showModal() }}>Controls</button></header>
    <section className="expedition-hud">
      <div><small>TEAM SCORE</small><strong>{state.score.toLocaleString()}</strong></div>
      <div className="crew-hull" data-hearts={hearts} role="status" aria-label={'Team hull ' + hearts + ' of 3'}><small>TEAM HULL <b>{hearts}/3</b></small><div className="expedition-hearts">{[0,1,2].map(i => <svg key={i} className={i < hearts ? 'full' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3.5 12.6C-3 6.2 6-2 12 5.1 18-2 27 6.2 20.5 12.6Z"/></svg>)}</div></div>
      <div><small>EXTRACTION</small><strong>{coopSecondsRemaining(state)}<em>s</em></strong></div>
    </section>
    <section className="river-world expedition-world">
      <ExpeditionCanvas getState={getState} zoom={zoom} onZoom={setZoom} onTarget={station === 'gunner' && !disabled ? id => { onCrew({ targetId: id }); flash(id === null ? 'Auto aim · nearest predator' : 'Target selected · turrets locked on') } : undefined}/>
      <div className="crew-camera" role="group" aria-label="Camera zoom"><button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1,zoom-.1))}>−</button><button aria-label="Reset camera zoom" onClick={() => setZoom(1)}>{Math.round(zoom*100)}%</button><button aria-label="Zoom in" disabled={zoom >= 1.35} onClick={() => setZoom(Math.min(1.35,zoom+.1))}>＋</button></div>
      <div className="expedition-title" key={world}><span>0{world + 1} / FIVE WORLDS · {theme.vehicle}</span><h1>{theme.name}</h1><p>{theme.subtitle}</p></div>
      <div className="crew-mission"><span className={state.rescued >= 3 ? 'done' : ''}>◒ Rescue {Math.min(3, state.rescued)}/3</span><span className={c.bossDefeated ? 'done' : ''}>{c.bossDefeated ? '✓ Devourer defeated' : '⌖ Defeat the final guardian'}</span></div>
      {boss && <div className="crew-boss"><span>STAR DEVOURER</span><b><i style={{ width: Math.max(0, (boss.hp ?? 0) / (boss.maxHp ?? 1)) * 100 + '%' }}/></b></div>}
      {c.choiceTicks > 0 && c.upgrades.length < 2 && <div className="crew-upgrades"><div><strong>FIELD RESUPPLY</strong><span>Choose together · {Math.ceil(c.choiceTicks / 60)}s</span></div><section>{CREW_UPGRADES.filter(u => !c.upgrades.includes(u.id)).map(u => <button key={u.id} onClick={() => onCrew({ upgrade: u.id })} disabled={disabled}><b>{u.icon}</b><span>{u.name}<small>{u.description}</small></span></button>)}</section></div>}
      {notice && <div className="expedition-notice" role="status">{notice}</div>}
      {network.peer?.paused && !modeLabel && <div className="expedition-pause" role="status"><strong>Waiting for your teammate</strong><span>Keep both game tabs open. Your expedition will resume.</span></div>}
      {state.phase === 'countdown' && <div className="expedition-countdown"><span>YOUR JOB: {job.name.toUpperCase()}</span><strong>{Math.max(1, Math.ceil(state.countdownTicks / COOP_TICK_RATE))}</strong><p>{job.hint}</p><small>Rescue 3 friends. Defeat the final guardian.</small></div>}
      {state.phase === 'finished' && <div className="expedition-finish"><span>{c.victory ? 'YOU BROUGHT THEM HOME.' : 'YOUR CREW. YOUR NEXT ADVENTURE.'}</span><h1>{c.victory ? 'Wildly good together.' : hearts ? 'The rescue isn’t over.' : 'One more run?'}</h1><strong>{state.score.toLocaleString()} <small>TEAM POINTS</small></strong><div><p>◒ {state.rescued}/3 rescued</p><p>⌖ {c.kills} predators</p><p>{c.bossDefeated ? '✓ Guardian defeated' : 'Guardian still out there'}</p></div><button onClick={onRematch}>Another expedition ↗</button><button className="quiet" onClick={onExit}>Back to basecamp</button></div>}
      <div className="expedition-route">{EXPEDITION_WORLDS.map((v, i) => <span key={v.name} className={i === world ? 'active' : i < world ? 'done' : ''}>{['✿','☀','▲','☁','✦'][i]}<i style={{ width: Math.max(0, Math.min(1, progress * 5 - i)) * 100 + '%' }}/></span>)}</div>
    </section>
    <footer className="crew-controls">
      <div className="crew-status"><span>{partner?.name ?? 'Scout'}: <b>{STATIONS.find(j => j.id === partner?.station)?.name ?? 'Shoot'}</b></span><span>◆ {c.scrap} scrap {c.bubble > 0 ? ' · Shield bubble' : ''}{c.upgrades.map(u => <i key={u} title={u}>{CREW_UPGRADES.find(v => v.id === u)?.icon}</i>)}</span></div>
      <nav className="crew-stations" aria-label="Choose your job">{STATIONS.map(job => { const owner = Object.values(state.players).find(p => p.station === job.id); return <button key={job.id} data-job={job.id} className={job.id === station ? 'active' : ''} aria-label={`${job.name} · ${job.role}${owner?.id === localPlayerId ? ' · your job' : owner ? ' · request swap with '+owner.name : ' · switch job'}`} aria-pressed={job.id === station} disabled={state.phase === 'finished' || helpOpen} onClick={() => choose(job.id)}><b aria-hidden="true">{job.icon}</b><span>{job.name}<small>{owner?.id === localPlayerId ? 'YOUR JOB' : owner ? 'ASK TO SWAP' : 'SWITCH'}</small></span></button> })}</nav>
      <p className="crew-job-hint">{job.hint}</p>
      {swapFrom && <button className="crew-swap" onClick={() => choose(swapFrom.station)}>⇄ {swapFrom.name} wants your station. Tap to swap.</button>}
      <div className="crew-action-row" data-station={station}>
        {station === 'pilot' ? <><button className="crew-hold river-paddle" data-held={held.includes('left')} aria-label="Steer left" disabled={disabled} onPointerDown={hold('left')}><span>← Left</span><small>Hold to steer</small></button><button className="crew-hold river-paddle" data-held={held.includes('right')} aria-label="Steer right" disabled={disabled} onPointerDown={hold('right')}><span>Right →</span><small>Hold to steer</small></button></> : <button className="crew-hold river-paddle crew-primary" data-held={held.includes('action')} aria-label={station === 'gunner' ? 'Hold for rapid fire' : 'Hold to repair one heart'} disabled={disabled || (station === 'engineer' && (c.scrap < 3 || hearts === 3))} onPointerDown={hold('action')}><span>{station === 'gunner' ? c.overheated ? 'Cooling…' : held.includes('action') ? 'Rapid firing!' : 'Hold: Rapid fire' : hearts === 3 ? 'All hearts full' : c.scrap < 3 ? 'Need 3 scrap' : held.includes('action') ? 'Repairing…' : 'Hold: Repair +1 ♥'}</span><small>{station === 'gunner' ? 'Auto aim · release to cool' : 'Hold for 2 seconds · costs 3 scrap'}</small><i className={c.overheated ? 'hot' : ''} style={{ width: (station === 'gunner' ? c.heat : c.repair / 110 * 100) + '%' }}/></button>}
        {station === 'gunner' ? <div className="crew-auto"><b>{Math.round(c.heat)}%</b><span>HEAT</span><small>{c.overheated ? 'Cooling' : 'Auto-fire on'}</small></div> : <button className="crew-ability expedition-flare" disabled={disabled || cooldown > 0} onPointerDown={e => { e.preventDefault(); ability() }} onClick={e => { if(e.detail === 0) ability() }}><b aria-hidden="true">{station === 'pilot' ? 'ϟ' : '⛨'}</b><span>{cooldown > 0 ? Math.ceil(cooldown / 60) + 's' : station === 'pilot' ? 'Boost' : 'Shield'}</span><small>{station === 'pilot' ? 'Speed burst' : 'Block hits'}</small></button>}
      </div>
      <p className="crew-input-feedback" data-active={pressed} aria-live="off">{actionFeedback}</p>
    </footer>
    <dialog ref={helpDialog} className="crew-guide" aria-labelledby="crew-guide-title" onClose={() => setHelpOpen(false)}><button autoFocus onClick={() => helpDialog.current?.close()}>Back to game ×</button><h2 id="crew-guide-title">Two players. Three useful jobs.</h2><p>The vehicle moves forward on its own. Rescue 3 friends and beat the final guardian. Your crew shares the hearts at the top.</p>{STATIONS.map(j => <section key={j.id}><h3>{j.name} <small> / {j.role}</small></h3><p>{j.hint}</p></section>)}<p><strong>Switch jobs:</strong> tap an empty job to take over. If your partner has it, they get a swap request. In solo, Scout fills the missing job.</p><p><strong>Collect:</strong> crystals give 2 scrap; defeated predators give 1. Use scrap for repairs. Stars and golden gates add points.</p><p><strong>Keyboard:</strong> A/D or arrows steer, Space holds Rapid fire or Repair, F boosts or shields, 1/2/3 changes job.</p><p><strong>Camera:</strong> pinch or use +/− for a closer view. Tap the percentage to reset. The game keeps moving while these instructions are open.</p></dialog>
  </main>
}
