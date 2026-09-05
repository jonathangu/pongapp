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
const STATIONS: Array<{ id: CrewStation; icon: string; name: string }> = [
  { id: 'pilot', icon: '↗', name: 'Pilot' }, { id: 'gunner', icon: '⌖', name: 'Gunner' }, { id: 'engineer', icon: '⛨', name: 'Engineer' },
]
export function CoopRiver({ getState, subscribe, localPlayerId, roomCode, network, onFlare, onCrew, onExit, onRematch, modeLabel }: Props) {
  const [state, setState] = useState(() => ({ ...getState() }))
  const [pressed, setPressed] = useState(false)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(0)
  const pointers = useRef(new Map<number, 'left' | 'right' | 'action'>())
  const station = state.players[localPlayerId]?.station ?? 'pilot'
  const c = state.crew
  const disabled = state.phase !== 'playing' || Boolean(network.peer?.paused && !modeLabel)
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
        if (text) { setNotice(text); clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice(''), 1800); if (e.type === 'crash') navigator.vibrate?.(50) }
      }
    })
  }, [subscribe])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])
  useEffect(() => {
    const emit = () => { const keys = [...pointers.current.values()]; setPressed(keys.length > 0); onCrew({ steer: (keys.includes('right') ? 1 : 0) - (keys.includes('left') ? 1 : 0), action: keys.includes('action') }) }
    const release = (e: PointerEvent) => { if (pointers.current.delete(e.pointerId)) emit() }
    const reset = () => { pointers.current.clear(); setPressed(false); onCrew({ steer: 0, action: false }) }
    const keys = (e: KeyboardEvent) => {
      const down = e.type === 'keydown'
      if (down && (e.repeat || disabledRef.current)) return
      const key = e.code === 'ArrowLeft' || e.code === 'KeyA' ? 'left' : e.code === 'ArrowRight' || e.code === 'KeyD' ? 'right' : e.code === 'Space' ? 'action' : null
      if (key) { e.preventDefault(); const id = key === 'left' ? -1 : key === 'right' ? -2 : -3; if (down) pointers.current.set(id, key); else pointers.current.delete(id); emit() }
      if (down && e.code === 'KeyF') onFlare?.()
      if (down && ['Digit1','Digit2','Digit3'].includes(e.code)) { reset(); onCrew({ station: STATIONS[Number(e.code.slice(-1)) - 1]!.id }) }
    }
    const visibility = () => { if (document.visibilityState === 'hidden') reset() }
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('blur', reset)
    window.addEventListener('keydown', keys); window.addEventListener('keyup', keys); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', reset); window.removeEventListener('keydown', keys); window.removeEventListener('keyup', keys); document.removeEventListener('visibilitychange', visibility); reset() }
  }, [onCrew, onFlare])
  useEffect(() => { pointers.current.clear(); setPressed(false); onCrew({ steer: 0, action: false }) }, [station, disabled, onCrew])
  const hold = (key: 'left' | 'right' | 'action') => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, key)
    const keys = [...pointers.current.values()]; setPressed(true)
    onCrew({ steer: (keys.includes('right') ? 1 : 0) - (keys.includes('left') ? 1 : 0), action: keys.includes('action') })
  }
  const choose = (job: CrewStation) => { pointers.current.clear(); setPressed(false); onCrew({ steer: 0, action: false, station: job }) }
  const world = expeditionWorld(state), theme = EXPEDITION_WORLDS[world]!, progress = coopProgress(state)
  const partner = Object.values(state.players).find(p => p.id !== localPlayerId)
  const hearts = Math.max(0, Math.min(3, Math.round(state.hearts)))
  const boss = state.objects.find(o => o.enemy === 'boss')
  const cooldown = station === 'pilot' ? c.boostCooldown : c.shieldCooldown
  const swapFrom = c.swap?.to === localPlayerId ? state.players[c.swap.from] : null
  return <main className={'river-game expedition-game crew-game world-' + world + (pressed ? ' is-paddling' : '')}>
    <header className="river-topbar expedition-top"><button onClick={onExit} aria-label="Leave expedition">←</button><div><strong>TWO OARS <i> / WILD TOGETHER</i></strong><span>{roomCode} · {modeLabel ? 'You + Scout' : 'Two-person crew'}</span></div><div className="expedition-link" data-path={network.peer?.path ?? 'solo'}>{modeLabel ? 'SOLO + SCOUT' : peerLabel(network.peer)}</div></header>
    <section className="expedition-hud">
      <div><small>TEAM SCORE</small><strong>{state.score.toLocaleString()}</strong></div>
      <div className="crew-hull" data-hearts={hearts} role="status" aria-label={'Team hull ' + hearts + ' of 3'}><small>TEAM HULL <b>{hearts}/3</b></small><div className="expedition-hearts">{[0,1,2].map(i => <svg key={i} className={i < hearts ? 'full' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3.5 12.6C-3 6.2 6-2 12 5.1 18-2 27 6.2 20.5 12.6Z"/></svg>)}</div></div>
      <div><small>EXTRACTION</small><strong>{coopSecondsRemaining(state)}<em>s</em></strong></div>
    </section>
    <section className="river-world expedition-world">
      <ExpeditionCanvas getState={getState} onTarget={station === 'gunner' && !disabled ? id => onCrew({ targetId: id }) : undefined}/>
      <div className="expedition-title" key={world}><span>0{world + 1} / FIVE WORLDS · {theme.vehicle}</span><h1>{theme.name}</h1><p>{theme.subtitle}</p></div>
      <div className="crew-mission"><span className={state.rescued >= 3 ? 'done' : ''}>◒ Rescue {Math.min(3, state.rescued)}/3</span><span className={c.bossDefeated ? 'done' : ''}>{c.bossDefeated ? '✓ Devourer defeated' : '⌖ Defeat the final guardian'}</span></div>
      {boss && <div className="crew-boss"><span>STAR DEVOURER</span><b><i style={{ width: Math.max(0, (boss.hp ?? 0) / (boss.maxHp ?? 1)) * 100 + '%' }}/></b></div>}
      {c.choiceTicks > 0 && c.upgrades.length < 2 && <div className="crew-upgrades"><div><strong>FIELD RESUPPLY</strong><span>Choose together · {Math.ceil(c.choiceTicks / 60)}s</span></div><section>{CREW_UPGRADES.filter(u => !c.upgrades.includes(u.id)).map(u => <button key={u.id} onClick={() => onCrew({ upgrade: u.id })} disabled={disabled}><b>{u.icon}</b><span>{u.name}<small>{u.description}</small></span></button>)}</section></div>}
      {notice && <div className="expedition-notice" role="status">{notice}</div>}
      {network.peer?.paused && !modeLabel && <div className="expedition-pause" role="status"><strong>Waiting for your teammate</strong><span>Keep both game tabs open. Your expedition will resume.</span></div>}
      {state.phase === 'countdown' && <div className="expedition-countdown"><span>TWO PEOPLE. THREE JOBS. ONE ADVENTURE.</span><strong>{Math.max(1, Math.ceil(state.countdownTicks / COOP_TICK_RATE))}</strong><p>{station === 'pilot' ? 'You steer left and right.' : 'You operate the auto-turrets.'}<br/>Switch stations to shield or repair.</p><small>Rescue 3 friends. Defeat the final guardian.</small></div>}
      {state.phase === 'finished' && <div className="expedition-finish"><span>{c.victory ? 'YOU BROUGHT THEM HOME.' : 'YOUR CREW. YOUR NEXT ADVENTURE.'}</span><h1>{c.victory ? 'Wildly good together.' : hearts ? 'The rescue isn’t over.' : 'One more run?'}</h1><strong>{state.score.toLocaleString()} <small>TEAM POINTS</small></strong><div><p>◒ {state.rescued}/3 rescued</p><p>⌖ {c.kills} predators</p><p>{c.bossDefeated ? '✓ Guardian defeated' : 'Guardian still out there'}</p></div><button onClick={onRematch}>Another expedition ↗</button><button className="quiet" onClick={onExit}>Back to basecamp</button></div>}
      <div className="expedition-route">{EXPEDITION_WORLDS.map((v, i) => <span key={v.name} className={i === world ? 'active' : i < world ? 'done' : ''}>{['✿','☀','▲','☁','✦'][i]}<i style={{ width: Math.max(0, Math.min(1, progress * 5 - i)) * 100 + '%' }}/></span>)}</div>
    </section>
    <footer className="crew-controls">
      <div className="crew-status"><span>{partner?.name ?? 'Scout'} · <b>{partner?.station ?? 'gunner'}</b></span><span>⌘ {c.scrap} scrap {c.bubble > 0 ? ' · ◉ bubble' : ''}{c.upgrades.map(u => <i key={u} title={u}>{CREW_UPGRADES.find(v => v.id === u)?.icon}</i>)}</span></div>
      <nav className="crew-stations" aria-label="Crew stations">{STATIONS.map(job => { const owner = Object.values(state.players).find(p => p.station === job.id); return <button key={job.id} className={job.id === station ? 'active' : ''} aria-pressed={job.id === station} disabled={state.phase === 'finished'} onClick={() => choose(job.id)}><b>{job.icon}</b><span>{job.name}<small>{owner?.id === localPlayerId ? 'YOU' : owner ? 'SWAP · ' + owner.name : 'OPEN'}</small></span></button> })}</nav>
      {swapFrom && <button className="crew-swap" onClick={() => choose(swapFrom.station)}>⇄ {swapFrom.name} wants your station. Tap to swap.</button>}
      <div className="crew-action-row" data-station={station}>
        {station === 'pilot' ? <><button className="crew-hold river-paddle" aria-label="Steer left" disabled={disabled} onPointerDown={hold('left')}>← <small>LEFT · A</small></button><button className="crew-hold river-paddle" aria-label="Steer right" disabled={disabled} onPointerDown={hold('right')}>→ <small>RIGHT · D</small></button></> : <button className="crew-hold river-paddle crew-primary" disabled={disabled || (station === 'engineer' && (c.scrap < 3 || hearts === 3))} onPointerDown={hold('action')}><span>{station === 'gunner' ? c.overheated ? 'COOLING DOWN' : 'OVERCHARGE' : hearts === 3 ? 'HULL HEALTHY' : c.scrap < 3 ? 'NEED 3 SCRAP' : 'HOLD TO REPAIR'}</span><small>{station === 'gunner' ? 'Hold · tap enemies to target' : '3 scrap restores one heart'}</small><i className={c.overheated ? 'hot' : ''} style={{ width: (station === 'gunner' ? c.heat : c.repair / 110 * 100) + '%' }}/></button>}
        {station === 'gunner' ? <div className="crew-auto"><b>⌖</b><span>AUTO ON</span><small>{c.overheated ? 'Venting heat…' : 'Release to cool'}</small></div> : <button className="crew-ability expedition-flare" disabled={disabled || cooldown > 0} onPointerDown={e => { e.preventDefault(); onFlare?.() }}><b>{station === 'pilot' ? 'ϟ' : '⛨'}</b><span>{cooldown > 0 ? Math.ceil(cooldown / 60) + 's' : station === 'pilot' ? 'BOOST' : 'SHIELD'}</span><small>{station === 'pilot' ? 'F · no immunity' : 'F · time the block'}</small></button>}
      </div>
    </footer>
  </main>
}
