import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { COOP_TICK_RATE, CREW_UPGRADES, EXPEDITION_WORLDS, RECOVERY_SCRAP, RECOVERY_TAPS, expeditionWorld, coopProgress, coopSecondsRemaining, type CoopGameState, type CrewTap } from '@pongapp/game-core'
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
const ACTIONS: CrewTap[] = ['left','right','shoot','recover']
const LABELS = { left: 'Left', right: 'Right', shoot: 'Shoot', recover: 'Recover' }
const FEEDBACK = { left: 'Left nudge ←', right: 'Right nudge →', shoot: 'Cannon tap · shell queued', recover: 'Repair tap +1 · keep tapping' }
export function CoopRiver({ getState, subscribe, localPlayerId, roomCode, network, onCrew, onExit, onRematch, modeLabel }: Props) {
  const [state, setState] = useState(() => ({ ...getState() }))
  const [active, setActive] = useState<CrewTap[]>([])
  const [helpOpen, setHelpOpen] = useState(false)
  const helpDialog = useRef<HTMLDialogElement>(null)
  const [zoom, setZoom] = useState(.9)
  const [notice, setNotice] = useState('Tap repeatedly. Every tap adds action.')
  const noticeTimer = useRef(0), pulseTimers = useRef<Partial<Record<CrewTap, number>>>({})
  const fireRef = useRef<(action: CrewTap) => void>(() => {})
  const c = state.crew
  const disabled = state.phase !== 'playing' || helpOpen || Boolean(network.peer?.paused && !modeLabel)
  const disabledRef = useRef(disabled); disabledRef.current = disabled
  useWakeLock()
  const flash = (text: string) => { setNotice(text); clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice('Tap repeatedly. Every tap adds action.'), 2200) }
  useEffect(() => {
    let last = 0, eventTick = -1, lastHealth = -1
    return subscribe(next => {
      if (performance.now() - last > 50 || next.events.length || next.hearts !== lastHealth || next.phase !== 'playing') {
        setState({ ...next, crew: { ...next.crew, upgrades: [...next.crew.upgrades], pendingShots: [...next.crew.pendingShots] }, players: structuredClone(next.players) }); last = performance.now(); lastHealth = next.hearts
      }
      if (next.events.length && next.tick !== eventTick) {
        eventTick = next.tick
        const e = next.events.find(e => e.type === 'crash') ?? next.events.find(e => e.type === 'crew') ?? next.events.at(-1)!
        const text = e.type === 'crew' ? e.message : e.type === 'crash' ? 'HULL HIT · tap Recover to repair' : e.type === 'rescued' ? 'FRIEND ABOARD +120' : e.type === 'relic' ? '+2 REPAIR SCRAP' : e.type === 'healed' ? 'HULL RECOVERED +1 HEART' : ''
        if (text) { flash(text); if (e.type === 'crash') navigator.vibrate?.(40) }
      }
    })
  }, [subscribe])
  useEffect(() => () => { clearTimeout(noticeTimer.current); Object.values(pulseTimers.current).forEach(clearTimeout) }, [])
  fireRef.current = (action: CrewTap) => {
    if (disabledRef.current) return
    const live = getState()
    if (action === 'recover' && (live.hearts >= 3 || live.crew.scrap < RECOVERY_SCRAP)) return
    if (action === 'shoot' && live.crew.pendingShots.length >= 6) return
    onCrew({ tap: action })
    setActive(previous => [...previous.filter(v => v !== action), action])
    clearTimeout(pulseTimers.current[action]); pulseTimers.current[action] = window.setTimeout(() => setActive(previous => previous.filter(v => v !== action)), 145)
    flash(FEEDBACK[action])
  }
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (disabledRef.current || e.altKey || e.ctrlKey || e.metaKey) return
      const buttonAction = e.target instanceof HTMLElement ? e.target.closest<HTMLButtonElement>('.crew-tap')?.dataset.action as CrewTap | undefined : undefined
      const action: CrewTap | null = ['ArrowLeft','KeyA'].includes(e.code) ? 'left' : ['ArrowRight','KeyD'].includes(e.code) ? 'right' : ['Space','KeyJ'].includes(e.code) ? 'shoot' : ['KeyR','KeyK'].includes(e.code) ? 'recover' : e.code === 'Enter' ? buttonAction ?? null : null
      // Cancel repeated key defaults too: WebKit otherwise generates a second click on Space release.
      if (action) { e.preventDefault(); if (!e.repeat) fireRef.current(action) }
    }
    const keyup = (e: KeyboardEvent) => { if (['Space','Enter'].includes(e.code) && e.target instanceof HTMLElement && e.target.closest('.crew-tap')) e.preventDefault() }
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup) }
  }, [])
  const press = (action: CrewTap) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault(); fireRef.current(action)
  }
  const world = expeditionWorld(state), theme = EXPEDITION_WORLDS[world]!, progress = coopProgress(state)
  const partner = Object.values(state.players).find(p => p.id !== localPlayerId)
  const hearts = Math.max(0, Math.min(3, Math.round(state.hearts)))
  const boss = state.objects.find(o => o.enemy === 'boss')
  const subtitle = (action: CrewTap) => action === 'left' || action === 'right' ? 'Tap to nudge'
    : action === 'shoot' ? c.pendingShots.length ? `${c.pendingShots.length} ${c.pendingShots.length === 1 ? 'shell' : 'shells'} queued` : 'Big splash shell'
    : hearts === 3 ? 'Hull full' : c.scrap < RECOVERY_SCRAP ? `Need ${RECOVERY_SCRAP} scrap` : `${c.repair}/${RECOVERY_TAPS} taps · +1 ♥`
  return <main className={'river-game expedition-game crew-game tap-crew world-' + world + (active.includes('left') || active.includes('right') ? ' is-paddling' : '')}>
    <header className="river-topbar expedition-top"><button onClick={onExit} aria-label="Leave expedition">←</button><div><strong>TWO OARS</strong><span>{roomCode} · {modeLabel ? 'You + Scout' : 'Both players can do everything'}</span></div><div className="expedition-link" data-path={network.peer?.path ?? 'solo'}>{modeLabel ? 'SOLO + SCOUT' : peerLabel(network.peer)}</div><button className="crew-help-button" onClick={() => { setHelpOpen(true); helpDialog.current?.showModal() }}>Controls</button></header>
    <section className="expedition-hud">
      <div><small>TEAM SCORE</small><strong>{state.score.toLocaleString()}</strong></div>
      <div className="crew-hull" data-hearts={hearts} role="status" aria-label={'Team hull ' + hearts + ' of 3'}><small>TEAM HULL <b>{hearts}/3</b></small><div className="expedition-hearts">{[0,1,2].map(i => <svg key={i} className={i < hearts ? 'full' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3.5 12.6C-3 6.2 6-2 12 5.1 18-2 27 6.2 20.5 12.6Z"/></svg>)}</div></div>
      <div><small>EXTRACTION</small><strong>{coopSecondsRemaining(state)}<em>s</em></strong></div>
    </section>
    <section className="river-world expedition-world">
      <ExpeditionCanvas getState={getState} zoom={zoom} onZoom={setZoom} onTarget={!disabled ? id => { onCrew({ targetId: id }); flash(id === null ? 'Auto aim · nearest predator' : 'Target selected · tap Shoot') } : undefined}/>
      <div className="crew-camera" role="group" aria-label="Camera zoom"><button aria-label="Zoom out" disabled={zoom <= .65} onClick={() => setZoom(Math.max(.65,zoom-.1))}>−</button><button aria-label="Reset camera zoom" onClick={() => setZoom(.9)}>{Math.round(zoom*100)}%</button><button aria-label="Zoom in" disabled={zoom >= 1.2} onClick={() => setZoom(Math.min(1.2,zoom+.1))}>＋</button></div>
      <div className="expedition-title" key={world}><span>0{world + 1} / FIVE WORLDS · {theme.vehicle}</span><h1>{theme.name}</h1></div>
      <div className="crew-mission"><span className={state.rescued >= 3 ? 'done' : ''}>◒ Rescue {Math.min(3, state.rescued)}/3</span><span className={c.bossDefeated ? 'done' : ''}>{c.bossDefeated ? '✓ Guardian defeated' : '⌖ Defeat the guardian'}</span></div>
      {boss && <div className="crew-boss"><span>STAR DEVOURER</span><b><i style={{ width: Math.max(0, (boss.hp ?? 0) / (boss.maxHp ?? 1)) * 100 + '%' }}/></b></div>}
      {network.peer?.paused && !modeLabel && <div className="expedition-pause" role="status"><strong>Waiting for your teammate</strong><span>Keep both game tabs open. Your expedition will resume.</span></div>}
      {state.phase === 'countdown' && <div className="expedition-countdown"><span>FOUR BUTTONS. ONE TEAM.</span><strong>{Math.max(1, Math.ceil(state.countdownTicks / COOP_TICK_RATE))}</strong><p>Tap Left / Right to dodge.<br/>Tap Shoot for splash shells.<br/>Tap Recover to repair.</p><small>Rescue 3 friends. Defeat the guardian.</small></div>}
      {state.phase === 'finished' && <div className="expedition-finish"><span>{c.victory ? 'YOU BROUGHT THEM HOME.' : 'YOUR CREW. YOUR NEXT ADVENTURE.'}</span><h1>{c.victory ? 'Wildly good together.' : hearts ? 'The rescue isn’t over.' : 'One more run?'}</h1><strong>{state.score.toLocaleString()} <small>TEAM POINTS</small></strong><div><p>◒ {state.rescued}/3 rescued</p><p>⌖ {c.kills} predators</p><p>{c.bossDefeated ? '✓ Guardian defeated' : 'Guardian still out there'}</p></div><button onClick={onRematch}>Another expedition ↗</button><button className="quiet" onClick={onExit}>Back to basecamp</button></div>}
      <div className="expedition-route">{EXPEDITION_WORLDS.map((v, i) => <span key={v.name} className={i === world ? 'active' : i < world ? 'done' : ''}>{['✿','☀','▲','☁','✦'][i]}<i style={{ width: Math.max(0, Math.min(1, progress * 5 - i)) * 100 + '%' }}/></span>)}</div>
    </section>
    <footer className="crew-controls">
      <div className="crew-status"><span>You + <b>{partner?.name ?? 'Scout'}</b></span><span className="crew-upgrade-strip" aria-label="Automatically equipped upgrades">{c.upgrades.map(u => <i key={u} title={CREW_UPGRADES.find(v => v.id === u)?.name}>{CREW_UPGRADES.find(v => v.id === u)?.icon}</i>)}</span><span>◆ <b>{c.scrap}</b> scrap</span></div>
      <div className="crew-tap-grid" role="group" aria-label="Tap controls">
        {ACTIONS.map(action => <button key={action} type="button" className={'crew-tap crew-tap--' + action} data-action={action} data-active={active.includes(action)} aria-label={LABELS[action]} disabled={disabled || action === 'recover' && (hearts === 3 || c.scrap < RECOVERY_SCRAP) || action === 'shoot' && c.pendingShots.length >= 6} onPointerDown={press(action)} onClick={e => { if (e.detail === 0) fireRef.current(action) }}>
          <b aria-hidden="true">{action === 'left' ? '←' : action === 'right' ? '→' : action === 'shoot' ? '◉' : '♥+'}</b><span>{LABELS[action]}<small>{subtitle(action)}</small></span>
          {action === 'recover' && hearts < 3 && <i className="crew-repair-fill" style={{width: c.repair / RECOVERY_TAPS * 100 + '%'}}/>}
        </button>)}
      </div>
      <p className="crew-tap-feedback" role="status">{notice}</p>
    </footer>
    <dialog ref={helpDialog} className="crew-guide" aria-labelledby="crew-guide-title" onClose={() => setHelpOpen(false)}><button autoFocus onClick={() => helpDialog.current?.close()}>Back to game ×</button><h2 id="crew-guide-title">Tap. Dodge. Make a splash.</h2><p>Both players have the same four buttons. Split the work however you like. One press means one action; repeated taps do more.</p><section><h3>← Left / Right →</h3><p>Each tap nudges the boat. Tap faster to move farther; stop tapping to settle. Opposite taps from teammates cancel.</p></section><section><h3>◉ Shoot</h3><p>Each tap queues a big, slow cannonball. It aims at a nearby predator and explodes on impact, hitting the group around it. Tap a predator to focus your cannons. There is no automatic human fire.</p></section><section><h3>♥+ Recover</h3><p>{RECOVERY_TAPS} repair taps and {RECOVERY_SCRAP} scrap restore one shared heart. Both players can contribute taps. Progress stays when you switch to shooting. Crystals give 2 scrap; defeated predators give 1.</p></section><p><strong>Upgrades:</strong> new cannon powers equip automatically as you advance. No choices or menus interrupt the run.</p><p><strong>Keyboard:</strong> tap A/D or arrows to steer, Space/J to shoot, R/K to recover. Key repeat is ignored.</p><p><strong>Camera:</strong> pinch or use − to see more river. Tap the percentage to reset the wide view. This guide does not pause your teammate.</p></dialog>
  </main>
}
