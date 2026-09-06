import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { availableRescueCrew, FOG_COLUMNS, FOG_ROWS, nearRescueStation, nearestRescueDock, RESCUE_ABILITIES, RESCUE_BIOMES, RESCUE_BUTTON, RESCUE_STATIONS, rescueUpgradeCost, stationSpec, type RescueState, type ShipUpgrade, type StationId } from '@pongapp/game-core'
import { RescueScene } from './RescueScene'
import { RescueControls } from './RescueControls'
import { RescueSession, type RescueSessionOptions } from './RescueSession'
import { RescueAudio, type RescueAudioSettings } from './RescueAudio'

type Settings = RescueAudioSettings & { lowEffects: boolean; reducedMotion: boolean }
const loadSettings = (): Settings => {
  const defaults = { music: .5, effects: .65, lowEffects: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('starling.settings.v1') ?? '{}') } } catch { return defaults }
}
export function downloadRescueSave(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'starling-voyage.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function StarMap({ state }: { state: RescueState }) {
  return <svg className="sr-map" viewBox="-60 -56 120 112" role="img" aria-label="Voyage map: your ship, rescues, docks and portal">
    <rect x="-56" y="-52" width="112" height="104" fill="#1e4b52" rx="3"/>
    {state.world.obstacles.map(o => <circle key={o.id} cx={o.x} cy={-o.y} r={o.radius} fill="#537b75"/>)}
    {state.world.fog.map((v, i) => !v && <rect key={i} x={i % FOG_COLUMNS / FOG_COLUMNS * 112 - 56} y={52 - (Math.floor(i / FOG_COLUMNS) + 1) / FOG_ROWS * 104} width={112 / FOG_COLUMNS + .1} height={104 / FOG_ROWS + .1} fill="#0b1930" opacity=".9"/>)}
    {state.world.cages.filter(c => !c.rescued).map(c => <g key={c.id} transform={`translate(${c.x} ${-c.y})`}><circle r="2.2" fill={c.open ? '#9afbd7' : '#ffd29e'}/><text y="1" textAnchor="middle" fontSize="3" fill="#122c36">♥</text></g>)}
    {state.docks.map(d => <g key={d.id} transform={`translate(${d.x} ${-d.y})`}><rect x="-2" y="-2" width="4" height="4" rx=".6" fill={d.kind === 'launch' ? '#c3a5ff' : '#91e9e1'}/><text y="-3.5" textAnchor="middle" fontSize="2.4" fill="#fff3d9">{d.name}</text></g>)}
    <circle cx={state.world.portal.x} cy={-state.world.portal.y} r="3" fill="none" stroke={state.guardianDefeated ? '#9bffe0' : '#a69ec8'} strokeWidth=".6"/>
    {state.enemies.map(e => <circle key={e.id} cx={e.x} cy={-e.y} r={e.kind === 'guardian' ? 2.5 : 1} fill="#ff9098"/>)}
    <circle cx={state.ship.x} cy={-state.ship.y} r="2" fill="#fff1bc"/><circle cx={state.ship.x} cy={-state.ship.y} r="3.5" fill="none" stroke="#fff1bc" strokeWidth=".45"/>
  </svg>
}
export function RescueGame({ options, onExit }: { options: RescueSessionOptions; onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), shell = useRef<HTMLDivElement>(null)
  const runtime = useRef<{ session: RescueSession; scene: RescueScene; controls: RescueControls; audio: RescueAudio } | null>(null)
  const [state, setState] = useState<RescueState | null>(null), [status, setStatus] = useState('Preparing the ship…'), [error, setError] = useState('')
  const [modal, setModal] = useState<'pause' | 'help' | 'map' | null>(null), [commands, setCommands] = useState(false), [selected, setSelected] = useState('')
  const [settings, setSettings] = useState<Settings>(loadSettings), [toast, setToast] = useState(''), [code, setCode] = useState<string | null>(null)
  const modalRef = useRef(modal), settingsRef = useRef(settings), commandsRef = useRef(commands)
  modalRef.current = modal; settingsRef.current = settings; commandsRef.current = commands
  useEffect(() => {
    const surface = canvas.current!, container = shell.current!
    let scene: RescueScene
    try { scene = new RescueScene(surface) } catch { setError('Your browser cannot start WebGL 2. Try an updated Safari, Chrome or Firefox. Your save is safe.'); return }
    const session = new RescueSession(options), controls = new RescueControls(), audio = new RescueAudio()
    runtime.current = { session, scene, controls, audio }
    const resize = new ResizeObserver(() => scene.resize(container.clientWidth, container.clientHeight)); resize.observe(container); scene.resize(container.clientWidth, container.clientHeight)
    const unlock = () => { void audio.unlock().catch(() => setToast('Tap Sound in settings to enable audio.')) }
    container.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock)
    const visibility = () => { controls.clear(); if (document.hidden) session.save() }
    document.addEventListener('visibilitychange', visibility)
    let raf = 0, last = performance.now(), accumulator = 0, lastUi = 0, eventId = 0, eventEpoch = 0
    const frame = (now: number) => {
      const elapsed = Math.min(.08, (now - last) / 1000); last = now; accumulator += elapsed
      controls.commandHeld = commandsRef.current
      if (!options.online) session.state.paused = Boolean(modalRef.current && modalRef.current !== 'map') || document.hidden
      const events: RescueState['events'] = []
      while (accumulator >= 1 / 60) { const player = session.state.crew.find(c => c.id === session.playerId); session.tick(controls.input(player, Boolean(modalRef.current))); events.push(...session.state.events); accumulator -= 1 / 60 }
      if (events.length) session.state.events = events.slice(-120)
      scene.setSettings(settingsRef.current); audio.setSettings(settingsRef.current)
      scene.render(session.state, session.playerId, now); audio.update(session.state)
      if (eventEpoch !== session.state.epoch) { eventEpoch = session.state.epoch; eventId = 0 }
      for (const e of session.state.events) if (e.id > eventId) {
        eventId = e.id
        if (e.kind === 'recruit') setToast(`${e.actor} joined! ${RESCUE_ABILITIES[session.state.crew.find(c => c.name === e.actor)?.ability ?? 'none'].name}`)
        if (e.kind === 'reunion') setToast(`${e.actor} is back! Welcome aboard, old friend.`)
        if (e.kind === 'depart') setToast(`${e.actor} says goodbye—for now. You’ll meet again.`)
        if (e.kind === 'meal') setToast(`Dinner is ready! Everyone moves and acts 20% faster.`)
      }
      if (now - lastUi > 100) { lastUi = now; setState({ ...session.state }); setStatus(session.status); setCode(session.code); setError(session.error) }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const diagnostics = { snapshot: () => structuredClone(session.authoritative), renderState: () => structuredClone(session.state), stats: () => ({ ...scene.stats(), audio: audio.stats(), status: session.status, latency: session.latency }), ...(import.meta.env.DEV ? { dev: { session, controls } } : {}) }
    Object.assign(window, { __STARLING__: diagnostics })
    return () => { cancelAnimationFrame(raf); resize.disconnect(); container.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); document.removeEventListener('visibilitychange', visibility); session.dispose(); controls.dispose(); audio.dispose(); scene.dispose(); runtime.current = null; Reflect.deleteProperty(window, '__STARLING__') }
  }, [options])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6500); return () => clearTimeout(timer) }, [toast])
  useEffect(() => { try { localStorage.setItem('starling.settings.v1', JSON.stringify(settings)) } catch { /* optional */ } }, [settings])
  const session = runtime.current?.session, player = state?.crew.find(c => c.id === session?.playerId), currentStation = player?.seat ? stationSpec(player.seat) : null
  const nearby = player ? nearRescueStation(player) : null, nearbyDock = state ? nearestRescueDock(state) : null
  const dock = state?.docks.find(d => d.id === state.docked), isHost = session?.isHost ?? true
  const pets = state?.crew.filter(c => c.pet) ?? []
  const hold = (bit: number) => ({ onPointerDown: (e: PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); if (runtime.current) runtime.current.controls.buttons |= bit }, onPointerUp: () => { if (runtime.current) runtime.current.controls.buttons &= ~bit }, onPointerCancel: () => { if (runtime.current) runtime.current.controls.buttons &= ~bit }, onLostPointerCapture: () => { if (runtime.current) runtime.current.controls.buttons &= ~bit } })
  const joystick = (e: PointerEvent<HTMLDivElement>) => { if (!e.currentTarget.hasPointerCapture(e.pointerId) || !runtime.current) return; const rect = e.currentTarget.getBoundingClientRect(), dx = (e.clientX - rect.left - rect.width / 2) / 40, dy = -(e.clientY - rect.top - rect.height / 2) / 40, size = Math.max(1, Math.hypot(dx, dy)); runtime.current.controls.x = Math.abs(dx) < .13 ? 0 : dx / size; runtime.current.controls.y = Math.abs(dy) < .13 ? 0 : dy / size; e.currentTarget.style.setProperty('--stick-x', `${dx / size * 29}px`); e.currentTarget.style.setProperty('--stick-y', `${-dy / size * 29}px`) }
  const stopStick = (e: PointerEvent<HTMLDivElement>) => { if (runtime.current) { runtime.current.controls.x = 0; runtime.current.controls.y = 0 }; e.currentTarget.style.setProperty('--stick-x', '0px'); e.currentTarget.style.setProperty('--stick-y', '0px') }
  const order = (id: StationId) => { const target = selected || pets[0]?.id; if (target) session?.command(id, target); setCommands(false) }
  const save = (download = false) => { try { const raw = download ? session?.exportSave() : session?.save(); if (raw) { if (download) downloadRescueSave(raw); setToast(download ? 'Voyage exported. Keep this file to move devices.' : 'Voyage saved on this device.') } } catch { setToast('Save unavailable. Keep this game open and try again.') } }
  const invite = async () => { if (!code) return; const url = `${location.origin}${import.meta.env.BASE_URL}#/rescue/${code}`; try { await navigator.clipboard.writeText(url); setToast('Invitation copied. Friends join your current ship.') } catch { setToast(`Room code: ${code}`) } }
  return <div className={`sr-game ${settings.reducedMotion ? 'sr-reduced' : ''}`} ref={shell}>
    <canvas ref={canvas} className="sr-canvas" aria-label="Starling Rescue game world"/>
    <div className="sr-topbar"><button onClick={() => { runtime.current?.controls.clear(); setModal('pause') }} aria-label="Pause and settings">☰</button><div className="sr-voyage"><strong>{state ? RESCUE_BIOMES[state.biome].name : 'Starling Rescue'}</strong><small>{state?.region === 'sea' ? 'LANTERN SEA' : state?.region === 'space' ? 'THE HIGH STARS' : 'FERNHEART JUNGLE'} · {status}</small></div><button onClick={() => setModal('map')} aria-label="Open star map">⌖</button></div>
    {state && <>
      <div className="sr-hud"><div className="sr-hearts" aria-label={`${state.ship.hp} of ${state.ship.maxHp} hearts`}>{Array.from({ length: state.ship.maxHp }, (_, i) => <i key={i} className={i < state.ship.hp ? 'filled' : ''}>♥</i>)}</div><span>♥ {state.stats.rescues}/5</span><span>✧ {state.campaign.salvage}</span>{state.meal.remaining > 0 && <span className="sr-fed">♨ {Math.ceil(state.meal.remaining)}s</span>}</div>
      <div className="sr-objective">{state.stats.rescues < 5 ? 'Open five cages. Bring everyone home.' : !state.guardianDefeated ? 'The guardian has awakened. Protect your crew!' : 'The portal is open. Sail into its light.'}</div>
      {state.weather.phase === 'building' && <div className="sr-weather-note">Storm approaching · prepare your shield</div>}
      {state.weather.strike && <div className="sr-weather-note sr-danger">⚡ Lightning in {Math.max(0, state.weather.strike.at - state.time).toFixed(1)}s · keep moving</div>}
      {toast && <div role="status" className="sr-toast">{toast}</div>}
      {error && <div role="alert" className="sr-error">{error}<button onClick={() => { if (session) session.error = ''; setError('') }}>Dismiss</button></div>}
      {code && <button className="sr-invite-chip" onClick={() => void invite()}>Invite · {code}</button>}
      {nearbyDock && !dock && <button className="sr-dock-prompt" disabled={!isHost} onClick={() => session?.action({ kind: 'dock' })}>⚓ Dock at {nearbyDock.name}<small>Slow to docking speed · upgrades & crew</small></button>}
      <div className="sr-station-info"><b>{currentStation ? currentStation.name : player?.gem !== null && player?.gem !== undefined ? 'Carrying a gem' : 'Explore your ship'}</b><span>{currentStation?.id === 'engine' ? 'Point the stick where you want to go. Hold thrust.' : currentStation?.id === 'galley' ? state.meal.cooldown > 0 ? `Meal ready · you can leave! Cook again in ${Math.ceil(state.meal.cooldown)}s` : `Hold cook · ${Math.round(state.meal.progress / 3 * 100)}% · then leave` : currentStation?.description ?? (nearby ? `Press Enter seat at the ${nearby.name.toLowerCase()}.` : 'Move · climb the ladders · jump between decks')}</span></div>
      <div className="sr-controls">
        <div className="sr-stick" role="application" aria-label={currentStation ? 'Aim or steer joystick' : 'Move and climb joystick'} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); joystick(e) }} onPointerMove={joystick} onPointerUp={stopStick} onPointerCancel={stopStick} onLostPointerCapture={stopStick}><span className="sr-stick-lines">✣</span><i/><small>{currentStation ? 'AIM / STEER' : 'MOVE / CLIMB'}</small></div>
        <div className="sr-command-controls"><button className={commands ? 'active' : ''} onClick={() => setCommands(!commands)}>♧<small>Crew orders</small></button><button {...hold(RESCUE_BUTTON.drop)} disabled={player?.gem === null}>◆<small>Throw gem</small></button></div>
        <div className="sr-action-controls"><button {...hold(RESCUE_BUTTON.jump)} className="sr-jump">↟<small>{currentStation ? 'Exit seat' : 'Jump'}</small></button><button {...hold(RESCUE_BUTTON.interact)} className="sr-interact">◎<small>{player?.gem !== null ? 'Socket gem' : 'Enter seat'}</small></button><button {...hold(RESCUE_BUTTON.fire)} className="sr-fire" disabled={!currentStation || ['map', 'shield'].includes(currentStation.id)}>✦<small>{currentStation?.id === 'engine' ? 'Thrust' : currentStation?.id === 'galley' ? 'Cook' : currentStation?.id === 'starburst' ? 'Charge' : 'Fire'}</small></button></div>
      </div>
      <div className="sr-keyboard-hint">WASD / arrows · Space jump / exit · E enter · F action · Q throw</div>
      {commands && <div className="sr-command-panel"><div className="sr-panel-heading"><b>Send a little helping hand</b><button onClick={() => setCommands(false)}>×</button></div><p>{state.solo ? 'Time slows while you choose.' : 'Your friends keep playing while you choose.'} Crew walk to their stations.</p><div className="sr-crew-pills">{pets.map(p => <button key={p.id} className={(selected || pets[0]?.id) === p.id ? 'selected' : ''} onClick={() => setSelected(p.id)}>{p.name}<small>{RESCUE_ABILITIES[p.ability].name}</small></button>)}</div>{!pets.length ? <p>Rescue a friend or recruit at a port first.</p> : <div className="sr-order-grid">{RESCUE_STATIONS.map(st => <button key={st.id} onClick={() => order(st.id)} disabled={state.crew.some(c => !c.pet && c.seat === st.id)}>{st.short}<small>{st.name}</small></button>)}</div>}</div>}
      {dock && <div className="sr-overlay"><section className="sr-panel sr-port-panel"><p className="sr-kicker">SAFE HARBOR · {state.region.toUpperCase()}</p><h1>{dock.name}</h1><p>Hull repaired. Welcome ashore.<br/>Your whole crew shares this port.</p><div className="sr-port-columns"><div><h3>Make the ship your own <span>✧ {state.campaign.salvage}</span></h3>{(['hull', 'drive', 'reactor', 'tractor'] as ShipUpgrade[]).map(kind => <button key={kind} className="sr-upgrade" disabled={!isHost || state.campaign.upgrades[kind] >= 3 || state.campaign.salvage < rescueUpgradeCost(state, kind)} onClick={() => session?.action({ kind: 'upgrade', upgrade: kind })}><span><b>{kind}</b><small>{kind === 'hull' ? '+3 hearts per tier' : kind === 'drive' ? 'Stronger, faster engines' : kind === 'reactor' ? 'Faster cooldown & cooling' : 'Longer rescue tractor reach'}</small></span><span>{state.campaign.upgrades[kind]}/3 · ✧ {rescueUpgradeCost(state, kind)}</span></button>)}</div><div><h3>Friends for the journey</h3>{availableRescueCrew(state).map(p => <button className="sr-recruit" key={p.id} disabled={!isHost || state.crew.length >= 16} onClick={() => session?.action({ kind: 'recruit', crew: p.id })}><span><b>{p.reunion ? '♥ Welcome back, ' : '+ '}{p.name}</b><small>{RESCUE_ABILITIES[p.ability].description}</small></span><small>2-voyage tour</small></button>)}<p className="sr-small">AI friends leave at a safe dock after their tour. Look for them again at later ports.</p></div></div><div className="sr-panel-actions">{dock.destination && <button className="sr-primary" disabled={!isHost} onClick={() => session?.action({ kind: 'travel' })}>{dock.destination === 'space' ? 'Launch into space ↗' : dock.destination === 'jungle' ? 'Enter the jungle →' : 'Return to the sea →'}</button>}<button disabled={!isHost} onClick={() => session?.action({ kind: 'undock' })}>Cast off</button><button onClick={() => save()}>Save voyage</button></div>{!isHost && <p>The connected captain chooses the next destination.</p>}</section></div>}
      {state.phase !== 'playing' && !dock && <div className="sr-overlay"><section className="sr-panel sr-result"><p className="sr-kicker">{state.phase === 'won' ? 'FIVE LITTLE LIVES. ONE GREAT ADVENTURE.' : 'EVERY GREAT VOYAGE HAS A ROUGH SEA.'}</p><h1>{state.phase === 'won' ? 'Everybody, home.' : 'A little courage. Again.'}</h1><p>{state.stats.rescues} rescued · {state.stats.blocks} blocks · {state.stats.kills} creatures defeated</p><p>Your campaign, upgrades and crew history are saved.</p><div className="sr-panel-actions"><button className="sr-primary" disabled={!isHost} onClick={() => session?.rematch(state.phase === 'won')}>{state.phase === 'won' ? 'Next voyage →' : 'Try this voyage again'}</button><button onClick={() => save(true)}>Export save</button><button onClick={onExit}>Home</button></div></section></div>}
    </>}
    {modal && <div className="sr-overlay"><section className="sr-panel"><button className="sr-panel-close" aria-label="Close menu" onClick={() => setModal(null)}>×</button>{modal === 'map' && state ? <><p className="sr-kicker">A LITTLE FURTHER, TOGETHER</p><h1>Your voyage</h1><StarMap state={state}/><p>Gold: rescue signals · Teal: ports · Violet: launch stations<br/>Dark areas are unexplored. Your map station and scouts reveal more.</p></> : modal === 'help' ? <><p className="sr-kicker">NINE STATIONS. ONE SHIP.</p><h1>A small guide to a big adventure.</h1><ol className="sr-help"><li>Move your character with the stick. Up and down climb ladders. Jump leaves a station.</li><li>Enter a seat nearby. In the engine, point where you want to go and hold Thrust. Other seats aim their equipment.</li><li>Send AI crew to guns, shields, the map or galley. They walk there just like you.</li><li>Open cages with your guns, then approach to rescue friends. Carry gems from gifts to upgrade a station.</li><li>Cook for three seconds, then leave! Everyone gets a timed speed boost.</li><li>Approach ports slowly to dock. Upgrade, recruit and travel between sea, jungle and space.</li><li>Save or export any voyage. Online play needs a connection; solo works with a downloaded pack.</li></ol></> : <><p className="sr-kicker">TAKE A BREATH</p><h1>{options.online ? 'Ship menu' : 'Voyage paused'}</h1>{options.online && <p>Your friends keep playing while this menu is open.</p>}<div className="sr-settings"><label>Music <input type="range" min="0" max="1" step=".05" value={settings.music} onChange={e => setSettings({ ...settings, music: Number(e.target.value) })}/></label><label>Sound effects <input type="range" min="0" max="1" step=".05" value={settings.effects} onChange={e => setSettings({ ...settings, effects: Number(e.target.value) })}/></label><label><input type="checkbox" checked={settings.reducedMotion} onChange={e => setSettings({ ...settings, reducedMotion: e.target.checked })}/> Reduced motion & flashes</label><label><input type="checkbox" checked={settings.lowEffects} onChange={e => setSettings({ ...settings, lowEffects: e.target.checked })}/> Low effects / battery saver</label></div><div className="sr-panel-actions"><button className="sr-primary" onClick={() => setModal(null)}>Back to the ship</button><button onClick={() => save()}>Save</button><button onClick={() => save(true)}>Export save</button><button onClick={() => setModal('help')}>How to play</button>{code && <button onClick={() => void invite()}>Copy invitation</button>}<button onClick={onExit}>Save & exit</button></div><p className="sr-small">Original score: Lantern Wake · synthesized on your device.</p></>}</section></div>}
    {!state && error && <div className="sr-overlay"><section className="sr-panel"><h1>The ship needs a newer browser</h1><p>{error}</p><button onClick={onExit}>Back home</button></section></div>}
  </div>
}
