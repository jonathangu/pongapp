import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { RESCUE_BUTTON, RESCUE_STATIONS, availableRescueCrew, isSoloCrossing, nearestRescueDock, neutralRescueInput, rescueUpgradeCost, stationSpec, storyCrewName, type RescueState, type ShipUpgrade, type StationId } from '@pongapp/game-core'
import { RescueSession, type RescueSessionOptions } from '../rescue/RescueSession'
import { RescueAudio } from '../rescue/RescueAudio'
import shipArt from '../../../../godot/assets/starling-deck-v2.png'
import { StoryBanter, StoryEncounter, StoryFamily, StoryJournal } from './Story'
import { SongControls, type StorySong } from './StorySong'
import { storySongCue } from './story-song-cues'
import { CrossingGuide, crossingObjective } from './CrossingGuide'
import { OdysseyEncounter } from './Odyssey'

type Bridge = { snapshot: () => string; ready: (engine: string) => void; metrics: (frames: number, fps: number, view: number) => void; steer: (x: number, y: number) => void; together: () => void }
type Settings = { music: number; effects: number; reducedMotion: boolean }
const settingsDefault = (): Settings => {
  const defaults = { music: .5, effects: .6, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('starling.godot.settings') ?? '{}') } } catch { return defaults }
}
const stationLabels: Record<StationId, string> = { engine: 'Helm', shield: 'Shield', north: 'Top cannon', east: 'Right cannon', south: 'Bottom cannon', west: 'Left cannon', starburst: 'Starburst', map: 'Lookout', galley: 'Galley' }
const stationIcons: Record<StationId, string> = { engine: '◈', shield: '◒', north: '↑', east: '→', south: '↓', west: '←', starburst: '✦', map: '⌖', galley: '♨' }
const crewColors: Record<string, string> = { mint: '#9bf4ce', coral: '#ffaaa0', gold: '#ffe293', violet: '#c0b3ff', sky: '#a4e9ff', rose: '#ffbfdf', lime: '#d0fca5', pearl: '#fff1d3' }

function Deck({ state, playerId, order }: { state: RescueState; playerId: string; order: (id: StationId) => void }) {
  return <div className="g-deck" aria-label="Live crew deck">
    <img src={shipArt} alt="Cutaway of your ship"/>
    <svg viewBox="-5 -5 10 10" aria-hidden="true" className="g-deck-routes">
      {[-3.4, -1.3, .8, 2.8].map(y => <line key={y} x1={y > 2 ? -1.9 : y < -3 ? -2.65 : -3.5} x2={y > 2 ? 1.9 : y < -3 ? 2.65 : 3.5} y1={-y} y2={-y} stroke="#f8d294" strokeWidth=".06" opacity=".55"/>)}
    </svg>
    {RESCUE_STATIONS.map(station => {
      const occupant = state.crew.find(c => c.seat === station.id), player = state.crew.find(c => c.id === playerId), taken = occupant && !occupant.pet && occupant.id !== playerId
      return <button key={station.id} className={player?.order === station.id ? 'g-deck-station chosen' : 'g-deck-station'} style={{ left: `${50 + station.x * 8}%`, top: `${50 - (station.y + .35) * 8}%` }} disabled={Boolean(taken)} onClick={() => order(station.id)} aria-label={`${stationLabels[station.id]}${taken ? ' occupied by ' + occupant.name : ''}`} title={stationLabels[station.id]}>{stationIcons[station.id]}</button>
    })}
    {state.crew.map(person => <span key={person.id} title={storyCrewName(state, person)} className={'g-deck-person' + (person.id === playerId ? ' you' : '') + (person.id === state.story?.sonId ? ' finn' : '')} style={{ left: `${50 + person.x * 8}%`, top: `${50 - (person.y + .45) * 8}%`, background: crewColors[person.color] }}>{person.id === state.story?.sonId ? 'F' : person.id === state.story?.motherId ? 'M' : person.pet ? '•' : person.name.slice(0, 1)}</span>)}
  </div>
}

export function GodotGame({ options, onExit, song }: { options: RescueSessionOptions; onExit: () => void; song: StorySong }) {
  const runtime = useRef<{ session: RescueSession; audio: RescueAudio } | null>(null)
  const controls = useRef({ x: 0, y: 0, together: false, command: null as StationId | null, crew: '', ready: false })
  const [state, setState] = useState<RescueState | null>(null), [engine, setEngine] = useState(''), [status, setStatus] = useState('Preparing your ship…')
  const [error, setError] = useState(''), [toast, setToast] = useState(''), [deck, setDeck] = useState(false), [menu, setMenu] = useState(false), [mapView, setMapView] = useState(false)
  const [settings, setSettings] = useState<Settings>(settingsDefault), [crewSelection, setCrewSelection] = useState('')
  const [journal, setJournal] = useState(false)
  const [musicPanel, setMusicPanel] = useState(false)
  const menuRef = useRef(menu), mapRef = useRef(mapView), settingsRef = useRef(settings), songRef = useRef(song)
  menuRef.current = menu || journal; mapRef.current = mapView; settingsRef.current = settings; songRef.current = song
  const cue = state ? storySongCue(state) : null
  useEffect(() => { if (cue) song.setCue(cue) }, [cue, song.setCue])
  useEffect(() => {
    const session = new RescueSession(options), audio = new RescueAudio()
    runtime.current = { session, audio }
    let rendered = '', frames = 0, fps = 0, visibleWorldWidth = 0, engineName = '', raf = 0, last = performance.now(), accumulator = 0, lastUI = 0, lastSnapshot = 0, lastEvent = -1, epoch = -1, disposed = false
    const clear = () => { controls.current.x = 0; controls.current.y = 0; controls.current.together = false }
    const bridge: Bridge = {
      snapshot: () => rendered,
      ready: name => { controls.current.ready = true; engineName = name; setEngine(name) },
      metrics: (count, rate, width) => { frames = count; fps = rate; visibleWorldWidth = width },
      steer: (x, y) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; controls.current.x = Math.max(-1, Math.min(1, x)); controls.current.y = Math.max(-1, Math.min(1, y)); void audio.unlock().catch(() => {}) },
      together: () => { if (isSoloCrossing(session.state) && session.state.phase === 'playing' && !menuRef.current && !session.state.story?.pending && !session.state.odyssey?.pending && !session.state.docked) controls.current.together = true },
    }
    Object.assign(window, { __STARLING_BRIDGE__: bridge, __STARLING__: {
      snapshot: () => structuredClone(session.authoritative), renderState: () => structuredClone(session.state),
      stats: () => ({ engine: engineName, frames, fps, visibleWorldWidth, status: session.status, connected: session.connected, latency: session.latency, audio: audio.stats(), song: songRef.current.stats() }),
      ...(import.meta.env.DEV ? { dev: { session, controls: controls.current } } : {}),
    } })
    const keys = new Set<string>()
    const keyboard = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.code)) {
        event.preventDefault()
        if (event.type === 'keydown') keys.add(event.code); else keys.delete(event.code)
        controls.current.x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
        controls.current.y = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))
      }
      if (event.type === 'keydown' && !event.repeat) {
        if (event.code === 'Space' && isSoloCrossing(session.state) && session.state.phase === 'playing' && !menuRef.current && !session.state.story?.pending && !session.state.odyssey?.pending && !session.state.docked) { event.preventDefault(); bridge.together() }
        if (event.code === 'Escape') { setMenu(value => !value); clear() }
        if (event.code === 'KeyM') setMapView(value => !value)
      }
    }
    const visibility = () => { clear(); keys.clear(); if (document.hidden) session.save() }
    const unlock = () => { void audio.unlock().catch(() => {}) }
    window.addEventListener('keydown', keyboard); window.addEventListener('keyup', keyboard); window.addEventListener('blur', visibility); window.addEventListener('pointerdown', unlock); document.addEventListener('visibilitychange', visibility)
    const frame = (now: number) => {
      if (disposed) return
      const elapsed = Math.min(.08, (now - last) / 1000); last = now
      if (controls.current.ready) accumulator += elapsed
      if (!options.online) session.state.paused = !controls.current.ready || menuRef.current || document.hidden
      if (session.state.story?.pending || session.state.odyssey?.pending) { clear(); keys.clear() }
      const events: RescueState['events'] = []
      while (accumulator >= 1 / 60) {
        const input = neutralRescueInput(); input.assist = true
        if (controls.current.together && !menuRef.current && !document.hidden) input.buttons = RESCUE_BUTTON.fire
        controls.current.together = false
        input.x = menuRef.current || document.hidden ? 0 : controls.current.x; input.y = menuRef.current || document.hidden ? 0 : controls.current.y
        const player = session.state.crew.find(c => c.id === session.playerId)
        if (session.connected && player && player.commandSeq < 0 && !controls.current.command) {
          const humanClaims = (station: StationId) => session.state.crew.some(c => !c.pet && c.id !== player.id && (c.seat === station || c.commandSeq >= 0 && c.order === station))
          const helmTaken = !session.isHost || humanClaims('engine')
          controls.current.command = helmTaken ? (['east', 'north', 'west', 'south', 'shield', 'galley', 'map'] as StationId[]).find(station => !humanClaims(station)) ?? 'east' : 'engine'; controls.current.crew = player.id
        }
        if (session.connected) {
          input.command = controls.current.command; input.commandCrew = controls.current.crew || session.playerId
          controls.current.command = null
        }
        session.tick(input); events.push(...session.state.events); accumulator -= 1 / 60
      }
      if (events.length) session.state.events = events.slice(-100)
      audio.setSettings({ ...settingsRef.current, music: 0 }); audio.update(session.state)
      if (session.state.epoch !== epoch) { epoch = session.state.epoch; lastEvent = -1 }
      for (const event of session.state.events) if (event.id > lastEvent) {
        lastEvent = event.id
        if (event.kind === 'rescue') setToast('A friend is safe! +1 heart · new crewmate aboard')
        if (event.kind === 'socket') setToast(`${event.color ?? 'New'} gem fitted automatically`)
        if (event.kind === 'meal') setToast('Dinner is ready. Everyone works 20% faster!')
        if (event.kind === 'together') setToast('“Together!” · danger cleared · keep steering')
        if (event.kind === 'reunion') setToast(`${event.actor} is back aboard!`)
        if (event.kind === 'ability' && event.actor === 'Luma · silver wings') setToast('Luma · 4: “My turn!” Silver wings shield your family for six seconds.')
      }
      if (now - lastSnapshot >= 1000 / 30) {
        lastSnapshot = now
        const current = session.state
        rendered = JSON.stringify({ ...current, world: { ...current.world, fog: [] }, playerId: session.playerId, mapView: mapRef.current, reducedMotion: settingsRef.current.reducedMotion })
      }
      if (now - lastUI > 100) { lastUI = now; setState({ ...session.state, story: session.authoritative.story }); setStatus(session.status); setError(session.error) }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const timeout = setTimeout(() => { if (!controls.current.ready) setError('The game is taking longer to load. Keep this tab open, or reload on a stable connection. A WebGL 2 browser is required.') }, 35000)
    return () => {
      disposed = true; cancelAnimationFrame(raf); clearTimeout(timeout); session.dispose(); audio.dispose(); clear(); controls.current.ready = false
      window.removeEventListener('keydown', keyboard); window.removeEventListener('keyup', keyboard); window.removeEventListener('blur', visibility); window.removeEventListener('pointerdown', unlock); document.removeEventListener('visibilitychange', visibility)
      Reflect.deleteProperty(window, '__STARLING_BRIDGE__'); Reflect.deleteProperty(window, '__STARLING__'); runtime.current = null
    }
  }, [options])
  useEffect(() => { try { localStorage.setItem('starling.godot.settings', JSON.stringify(settings)) } catch { /* optional device storage */ } }, [settings])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer) }, [toast])
  const session = runtime.current?.session, player = state?.crew.find(c => c.id === session?.playerId)
  const solo = Boolean(state && isSoloCrossing(state)), togetherCooldown = state?.stations.find(st => st.id === 'starburst')?.cooldown ?? 0
  const order = (station: StationId, targetCrew = crewSelection || session?.playerId) => {
    if (!session || !state) return
    if (!session.connected) { setToast('Joining your crew…'); return }
    const crewId = targetCrew || session.playerId
    const occupant = state.crew.find(c => c.id !== crewId && !c.pet && (c.seat === station || c.commandSeq >= 0 && c.order === station))
    if (occupant) { setToast(`${occupant.name} is using ${stationLabels[station].toLowerCase()}.`); return }
    controls.current.command = station; controls.current.crew = crewId
    controls.current.x = 0; controls.current.y = 0
    if (station === 'map' && crewId === session.playerId) setMapView(true)
  }
  const cannon = () => {
    if (!state) return
    const target = [...state.enemies, ...state.world.cages.filter(c => !c.open)].sort((a, b) => Math.hypot(a.x - state.ship.x, a.y - state.ship.y) - Math.hypot(b.x - state.ship.x, b.y - state.ship.y))[0]
    const angle = target ? Math.atan2(target.y - state.ship.y, target.x - state.ship.x) : 0
    const candidates = ['east', 'north', 'west', 'south'] as StationId[]
    candidates.sort((a, b) => Math.abs(Math.atan2(Math.sin(stationSpec(a).angle - angle), Math.cos(stationSpec(a).angle - angle))) - Math.abs(Math.atan2(Math.sin(stationSpec(b).angle - angle), Math.cos(stationSpec(b).angle - angle))))
    order(candidates.find(id => !state.crew.some(c => !c.pet && c.id !== session?.playerId && (c.seat === id || c.commandSeq >= 0 && c.order === id))) ?? 'starburst', session?.playerId)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const box = event.currentTarget.getBoundingClientRect(), x = (event.clientX - box.left - box.width / 2) / 38, y = -(event.clientY - box.top - box.height / 2) / 38, length = Math.max(1, Math.hypot(x, y))
    controls.current.x = Math.abs(x) < .12 ? 0 : x / length; controls.current.y = Math.abs(y) < .12 ? 0 : y / length
    event.currentTarget.style.setProperty('--stick-x', `${x / length * 28}px`); event.currentTarget.style.setProperty('--stick-y', `${-y / length * 28}px`)
  }
  const stop = (event: PointerEvent<HTMLDivElement>) => { controls.current.x = 0; controls.current.y = 0; event.currentTarget.style.setProperty('--stick-x', '0px'); event.currentTarget.style.setProperty('--stick-y', '0px') }
  const invite = async () => {
    if (!session?.code) return
    const url = `${location.origin}${import.meta.env.BASE_URL}#/rescue/${session.code}`
    try { if (navigator.share) await navigator.share({ title: 'Come aboard Starling', text: `One phone each. Install Starling, then join my crew with code ${session.code}.`, url }); else { await navigator.clipboard.writeText(url); setToast('Invitation copied. Send it to your crew!') } } catch { setToast(`Invite code: ${session.code}`) }
  }
  const dock = state?.docks.find(d => d.id === state.docked), nearbyDock = state ? nearestRescueDock(state) : null
  const helm = player?.seat === 'engine', travelling = player && player.seat !== player.order
  const station = player?.seat ? stationLabels[player.seat] : 'Finding your station'
  const exportSave = () => {
    if (!session) return
    const url = URL.createObjectURL(new Blob([session.exportSave()], { type: 'application/json' })), anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'starling-voyage.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const exit = () => { runtime.current?.session.save(); onExit() }
  const suggestedJob = state ? crossingObjective(state, Boolean(session?.isHost)).job : ''
  return <div className={'g-game crossing-game' + (solo ? ' solo-crossing' : '') + (settings.reducedMotion ? ' g-reduced' : '') + (state?.story ? ' story-game' : '')} data-next-job={suggestedJob}>
    <iframe className="g-engine" title="Starling Godot game world" src={import.meta.env.BASE_URL + 'godot/index.html'} allow="autoplay; fullscreen; gamepad" onError={() => setError('The Godot game could not load. Please reload.')}/>
    <header className="g-game-top"><button className="g-round" onClick={() => { setMenu(true); controls.current.x = 0; controls.current.y = 0 }} aria-label="Pause and settings">☰</button><div><strong>{state?.odyssey?.stage === 'inner' ? 'THE LIVING SPHERE' : state?.region === 'space' ? 'THE FORBIDDEN GATE' : state?.region === 'sky' ? 'THE LAST BLUE SKY' : state?.region === 'jungle' ? 'FERNHEART' : 'LANTERN SEA'}</strong><small>{options.online ? status : state?.story ? 'MARA & FINN’S CROSSING' : 'A STARLING ADVENTURE'}</small></div>{state?.story && <button className="g-round" aria-label="Open logbook" onClick={() => { setJournal(true); controls.current.x = 0; controls.current.y = 0 }}>▤</button>}<button className={'g-round' + (mapView ? ' active' : '')} onClick={() => setMapView(!mapView)} aria-label={mapView ? 'Close world map' : 'Open world map'}>⌖</button></header>
    {state && <><div className="g-hud"><div className="g-health" role="meter" aria-label="Ship health" aria-valuemin={0} aria-valuemax={state.ship.maxHp} aria-valuenow={state.ship.hp}><span>♥</span><div><i style={{ width: `${state.ship.hp / state.ship.maxHp * 100}%` }}/></div></div><span className="g-rescue-count">♡ <b>{state.odyssey ? '3' : state.stats.rescues}</b><small>{state.odyssey ? 'hearts' : '/ 5'}</small></span><span className="g-salvage">✧ {state.campaign.salvage}</span></div>
      {!menu && !journal && !deck && <CrossingGuide state={state} captain={Boolean(session?.isHost)} playerId={session?.playerId ?? ''} onMap={() => setMapView(!mapView)}/>}
      <div className="crossing-music-bar"><button aria-label={song.enabled ? 'Turn music off' : 'Turn music on'} onClick={() => song.enabled ? song.pause() : song.play()}>♫ {song.enabled ? 'On' : 'Off'}</button><button aria-label="Open soundtrack controls" onClick={() => setMusicPanel(!musicPanel)}>Soundtrack ▾</button></div>
      {musicPanel && <aside className="crossing-music-panel"><button className="g-round" aria-label="Close soundtrack controls" onClick={() => setMusicPanel(false)}>×</button><SongControls song={song} compact/></aside>}
      <StoryFamily state={state}/>
      {!menu && !journal && !deck && !state.odyssey && (state.seamanship?.step ?? 5) >= 5 && <StoryBanter state={state}/>}
      {session?.code && <button className="g-invite" onClick={() => void invite()}>Invite · {session.code} ↗</button>}
      {deck && <aside className="g-deck-panel"><div className="g-panel-heading"><div><strong>ALL HANDS ON DECK</strong><small>Tap a station. Your crewmate walks there.</small></div><button className="g-round" aria-label="Close deck" onClick={() => setDeck(false)}>×</button></div><select aria-label="Choose crewmate to command" value={crewSelection} onChange={e => setCrewSelection(e.target.value)}><option value="">You · {player ? storyCrewName(state, player) : ''}</option>{state.crew.filter(c => c.pet).map(c => <option key={c.id} value={c.id}>{storyCrewName(state, c)} · {c.id === state.story?.sonId ? '9 · lookout' : 'crew'}</option>)}</select><Deck state={state} playerId={crewSelection || session?.playerId || ''} order={order}/><div className="g-all-stations">{RESCUE_STATIONS.map(s => <button key={s.id} className={player?.order === s.id ? 'selected' : ''} onClick={() => order(s.id)}>{stationIcons[s.id]} {stationLabels[s.id]}</button>)}</div></aside>}
      {toast && <div className="g-toast" role="status">{toast}</div>}
      {!menu && !journal && !state.story?.pending && !state.odyssey?.pending && !state.docked && state.phase === 'playing' && <div className="g-bottom">
        <div className="g-helm-row">{helm ? <div className="g-stick" role="application" aria-label="Steering joystick" onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); move(e) }} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}><span>↑</span><i/></div> : <button className="g-back-helm" onClick={() => { setCrewSelection(''); order('engine', session?.playerId) }}>◈<small>Take helm</small></button>}<div className="g-station-status"><strong>{travelling ? `Walking to ${stationLabels[player.order].toLowerCase()}…` : station}</strong><span>{travelling ? 'Your crewmate handles the ladders.' : helm ? 'Drag to steer · release to brake' : player?.seat === 'shield' ? 'Automatically blocks incoming fire' : player?.seat === 'galley' ? state.meal.remaining > 0 ? 'Meal ready! Switch to another job.' : `Cooking… ${Math.round(state.meal.progress / 3 * 100)}%` : player?.seat === 'map' ? 'Lookout reveals more of the world' : 'Auto aim · auto fire'}</span>{helm && <small>WASD / arrows on keyboard</small>}</div>{nearbyDock && <button className="g-dock-button" onClick={() => session?.action({ kind: 'dock' })}>⚓<small>Dock</small></button>}</div>
        {solo ? <div className="solo-action-row"><p><strong>Finn has your back.</strong><span>Cannons & meals handled by your crew.</span></p><button className="solo-together" aria-label="Together pulse" disabled={togetherCooldown > 0 || !helm} onClick={() => { controls.current.together = true }}><b>✧ {togetherCooldown > 0 ? `${Math.ceil(togetherCooldown)}s` : 'Together!'}</b><small>{togetherCooldown > 0 ? 'Recharging' : 'Clear danger · crack cages'}</small></button></div> : <nav className="g-stations" aria-label="Crew stations"><button aria-label="Helm" className={player?.order === 'engine' ? 'selected' : ''} onClick={() => order('engine', session?.playerId)}><span aria-hidden="true">◈</span>Helm</button><button aria-label="Cannons" className={player && ['east', 'west', 'north', 'south', 'starburst'].includes(player.order) ? 'selected' : ''} onClick={cannon}><span aria-hidden="true">✦</span>Cannons</button><button aria-label="Shield" className={player?.order === 'shield' ? 'selected' : ''} onClick={() => order('shield', session?.playerId)}><span aria-hidden="true">◒</span>Shield</button><button aria-label="Cook" className={player?.order === 'galley' ? 'selected' : ''} onClick={() => order('galley', session?.playerId)}><span aria-hidden="true">♨</span>Cook</button><button aria-label="Deck" className={deck ? 'selected' : ''} onClick={() => setDeck(!deck)}><span aria-hidden="true">▦</span>Deck</button></nav>}
      </div>}
      {!state.story?.pending && !state.odyssey?.pending && !journal && (menu || state.phase !== 'playing' || dock) && <div className="g-modal-backdrop"><section className="g-modal" role="dialog" aria-modal="true" aria-label={dock ? dock.name : state.phase !== 'playing' ? 'Voyage complete' : 'Pause and settings'}>
        <p className="g-eyebrow">{dock ? 'A SAFE HARBOUR' : state.phase === 'won' ? 'EVERYONE MADE IT HOME' : state.phase === 'lost' ? 'THE SEA GETS ANOTHER CHANCE' : 'TAKE A BREATHER'}</p>
        <h2>{dock ? dock.name : state.phase === 'won' ? state.story ? 'And ours begins.' : 'A little braver. Together.' : state.phase === 'lost' ? state.story ? 'Not this crossing.' : 'Your crew will try again.' : 'Your voyage.'}</h2>
        {state.story && state.phase === 'lost' && <p>The lantern goes out. Mara finds Finn’s hand in the dark. Take the crossing again; the things you learned stay in the logbook.</p>}
        {state.story && <button onClick={() => { setMenu(false); setJournal(true) }}>Read the family logbook</button>}
        {dock ? <><p>Ship repaired. Spend your {state.campaign.salvage} salvage, meet returning crew, or keep exploring.</p><div className="g-upgrades">{(['hull', 'drive', 'reactor', 'tractor'] as ShipUpgrade[]).map(upgrade => <button key={upgrade} disabled={!session?.isHost || state.campaign.salvage < rescueUpgradeCost(state, upgrade)} onClick={() => session?.action({ kind: 'upgrade', upgrade })}>{upgrade}<small>Lv {state.campaign.upgrades[upgrade]} · {rescueUpgradeCost(state, upgrade)} ✧</small></button>)}</div>{availableRescueCrew(state).map(c => <button key={c.id} onClick={() => session?.action({ kind: 'recruit', crew: c.id })}>Welcome {c.name} aboard</button>)}{dock.destination && !state.story && !state.odyssey && <button className="g-primary" disabled={!session?.isHost} onClick={() => session?.action({ kind: 'travel' })}>Travel to {dock.destination} →</button>}<button className="g-secondary" disabled={!session?.isHost} onClick={() => session?.action({ kind: 'undock' })}>Back to the sea</button></> : state.phase !== 'playing' ? <><p>{state.odyssey ? 'Three hearts together beneath unwritten stars.' : `${state.stats.rescues}/5 crews rescued · ${state.stats.kills} dangers defeated`}</p><button className="g-primary" disabled={!session?.isHost} onClick={() => session?.rematch(state.phase === 'won')}>{state.phase === 'won' ? state.odyssey ? 'Explore the living sea' : 'Part II · Lift into the sky' : 'Try the voyage again'} →</button></> : <><p>{options.online ? 'Your shared world keeps sailing while this menu is open.' : 'Your solo voyage is paused and saved automatically.'}</p><button className="g-primary" onClick={() => setMenu(false)}>Back aboard →</button><label className="g-range">Effects<input type="range" min={0} max={1} step={.05} value={settings.effects} onChange={e => setSettings({ ...settings, effects: Number(e.target.value) })}/></label><label className="g-check"><input type="checkbox" checked={settings.reducedMotion} onChange={e => setSettings({ ...settings, reducedMotion: e.target.checked })}/> Reduce motion</label><button onClick={exportSave}>Export voyage save</button></>}
        <label className="crossing-difficulty">Sea conditions<select aria-label="Sea difficulty" disabled={!session?.isHost} value={state.seamanship?.difficulty ?? 'adventure'} onChange={e => session?.action({ kind: 'difficulty', difficulty: e.target.value as 'gentle' | 'adventure' | 'tempest' })}><option value="gentle">Gentle · half damage, fewer dangers</option><option value="adventure">Adventure · the original crossing</option><option value="tempest">Tempest · harder hits, more dangers</option></select></label>
        {state.phase === 'playing' && !state.odyssey && <div className="crossing-tutorial-actions"><button disabled={!session?.isHost} onClick={() => { session?.action({ kind: 'tutorial', mode: 'replay' }); setMenu(false) }}>Replay guided practice</button>{(state.seamanship?.step ?? 5) < 5 && <button disabled={!session?.isHost} onClick={() => { session?.action({ kind: 'tutorial', mode: 'skip' }); setMenu(false) }}>I know the ship · skip practice</button>}</div>}
        {state.story && <SongControls song={song} compact/>}
        <button className="g-text-button" onClick={exit}>Save & return home</button><small className="g-engine-credit">{engine || 'Godot browser edition'}</small>
      </section></div>}
      {state.story?.pending && <StoryEncounter state={state} captain={Boolean(session?.isHost)} connected={Boolean(session?.connected)} action={action => session?.action(action)} exit={exit} song={song} inviteCode={session?.code ?? undefined} invite={() => void invite()}/>}
      {state.odyssey?.pending && <OdysseyEncounter state={state} captain={Boolean(session?.isHost)} connected={Boolean(session?.connected)} action={action => session?.action(action)} exit={exit} song={song}/>}
      {journal && !state.story?.pending && !state.odyssey?.pending && <StoryJournal state={state} song={song} online={Boolean(options.online)} close={() => setJournal(false)}/>}
    </>}
    {!engine && <div className="g-loading"><img src={shipArt} alt=""/><p className="g-eyebrow">PREPARING THE STARLING</p><h2>A world worth getting lost in.</h2><p>Loading the Godot browser engine…</p><span>First launch downloads the game. Your crew waits for you.</span><button className="g-text-button" onClick={exit}>Return home</button></div>}
    {error && <div className="g-error" role="alert">{error}<button aria-label="Dismiss message" onClick={() => setError('')}>×</button></div>}
  </div>
}
