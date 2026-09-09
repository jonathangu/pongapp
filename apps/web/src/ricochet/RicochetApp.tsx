import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { aimHandle, availableLenses, availablePayloads, createRicochetGame, finishRicochetShot, LENS_LABELS, normalizedAngle, PAYLOAD_LABELS,
  reflectorHandle, restoreRicochetGame, ricochetPreview, ricochetWon, RICOCHET_SCENES, simulateRicochet, suggestedRicochetSetup,
  type RicochetAction, type RicochetGame, type RicochetParty, type ShotPlayback, type ShotSetup } from '@pongapp/game-core/ricochet'
import type { RicochetServerMessage } from '@pongapp/protocol/ricochet'
import { createRicochetRoom, RicochetConnection, ricochetInvitation } from './connection'
import { RescueSound } from './sound'
import RescueBoard from './Board'
import { currentOfflineWorker } from '../offline-worker'
import musicTrack from '../assets/story/tide-rope.m4a'
import './ricochet.css'

export const RICOCHET_SAVE = 'starling.ricochet.v1'
function readGame() { try { return restoreRicochetGame(localStorage.getItem(RICOCHET_SAVE)) ?? createRicochetGame() } catch { return createRicochetGame() } }
function saveGame(game: RicochetGame) { try { localStorage.setItem(RICOCHET_SAVE, JSON.stringify(game)) } catch { /* Session remains playable. */ } }
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close(); previous?.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className="rr-dialog" aria-label={title} onCancel={event => { event.preventDefault(); close() }}>
    <header><h2>{title}</h2><button className="rr-icon-button" aria-label="Close dialog" onClick={close}>×</button></header>{children}
  </dialog>
}
function recipe(setup: ShotSetup) {
  if (setup.reflector.mode === 'mirror') return 'A good angle can change everything.'
  if (setup.payload === 'burst') return setup.reflector.mode === 'split' ? 'Burst + Split → three little explosions' : 'Burst + Focus → one enormous explosion'
  if (setup.payload === 'pierce') return setup.reflector.mode === 'split' ? 'Pierce + Split → three piercing rays' : 'Pierce + Focus → one wide starbeam'
  return setup.reflector.mode === 'split' ? 'Bounce + Split → three little comets' : 'Bounce + Focus → one mighty comet'
}
function lesson(game: RicochetGame) {
  if (game.scene === 0 && !game.rescued.length) return 'Drag the glowing aim handle. Pop a bubble to bring a friend aboard.'
  if (game.scene === 0) return 'The reef blocks a straight shot. Aim at the reflector, then turn its purple handle.'
  if (game.learned === 1) return 'New: Burst! Aim at the nearby group. One hit pops the bubbles around it.'
  if (game.scene === 1) return 'New: Split! Choose it on the reflector. Send a Burst orb through for three fireworks.'
  if (game.learned === 3) return 'New: Focus! Move the reflector to reach the cluster, then make one enormous Burst.'
  return 'Pierce travels through a line. Split makes three rays; Focus makes one wide beam. Try a different route.'
}

export default function RicochetApp() {
  const [solo, setSolo] = useState(readGame), [party, setParty] = useState<RicochetParty | null>(null)
  const [draft, setDraft] = useState<ShotSetup | null>(null), draftRef = useRef<ShotSetup | null>(null)
  const [room, setRoom] = useState(ricochetInvitation), [connectionStatus, setConnectionStatus] = useState('')
  const [soloPlayback, setSoloPlayback] = useState<ShotPlayback | null>(null), [now, setNow] = useState(Date.now)
  const [job, setJob] = useState<'aim' | 'reflector'>('aim'), [dialog, setDialog] = useState<'invite' | 'help' | 'restart' | null>(null)
  const [creating, setCreating] = useState(false), [notice, setNotice] = useState(''), [, setTransportTick] = useState(0)
  const [soundOn, setSoundOn] = useState(true), [musicOn, setMusicOn] = useState(false), [offline, setOffline] = useState('')
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const connection = useRef<RicochetConnection | null>(null), receive = useRef<(message: RicochetServerMessage) => void>(() => {})
  const sound = useRef<RescueSound | null>(null), song = useRef<HTMLAudioElement>(null), alive = useRef(true)
  const soundCursor = useRef({ id: -1, index: 0 }), drag = useRef<{ pointer: number; kind: 'aim' | 'move' | 'rotate'; dx: number; dy: number } | null>(null)
  const packPort = useRef<MessagePort | null>(null), packTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const client = connection.current, game = room && party ? party.game : solo
  const setup = draft ?? game.setup, viewGame = useMemo(() => ({ ...game, setup }), [game, setup])
  const playback = room ? party?.playback ?? null : soloPlayback
  const serverNow = now + (client?.clockOffset ?? 0), elapsed = playback ? Math.max(0, serverNow - playback.startedAt) : 0
  const busy = Boolean(playback && elapsed < playback.shot.duration), won = ricochetWon(game) && !busy
  const paused = Boolean(room && (!client?.connected || !party || connectionStatus))
  const activeJob = room && party ? client?.seat === party.launcher ? 'aim' : 'reflector' : job
  const canAim = !room || Boolean(party && client?.seat === party.launcher), canReflect = !room || Boolean(party && client?.seat !== party.launcher)
  const pending = Boolean(client?.pending), bothHere = Boolean(client?.presence.every(Boolean))
  const preview = useMemo(() => busy || won ? [] : ricochetPreview(viewGame), [viewGame, busy, won])
  const scene = RICOCHET_SCENES[game.scene]!
  const visibleRescued = busy && playback ? playback.before.length + playback.shot.events.filter(event => event.kind === 'rescue' && event.at <= elapsed).length : game.rescued.length
  const editable = !busy && !won && !paused && !creating && !dialog
  const unlock = () => { sound.current ??= new RescueSound(); sound.current.enabled = soundOn; sound.current.unlock() }
  const clearDraft = () => { draftRef.current = null; setDraft(null) }

  receive.current = message => {
    const current = connection.current
    if (message.type === 'welcome' || message.type === 'state') {
      if (party?.ready && !message.party.ready && message.party.game.shots === party.game.shots && message.party.game.scene === party.game.scene && message.party.launcher === party.launcher && message.presence.every(Boolean)) {
        setNotice(current?.seat === message.party.launcher ? 'The setup changed. Your partner will confirm the new path.' : 'The setup changed. Check the new path, then tap Ready again.')
      }
      setParty(message.party); setNow(Date.now())
      if (!current?.pending && !drag.current || message.type === 'welcome') clearDraft()
      else if (draftRef.current) {
        const ownedAim = current?.seat === message.party.launcher
        const next = ownedAim ? { ...message.party.game.setup, aim: draftRef.current.aim, payload: draftRef.current.payload } : { ...message.party.game.setup, reflector: draftRef.current.reflector }
        draftRef.current = next; setDraft(next)
      }
    } else if (message.type === 'error' && !message.fatal) {
      if (message.code !== 'stale') {
        clearDraft()
        setNotice(message.code === 'not-ready' ? 'Let your partner finish the reflector and tap Ready.' : message.code === 'partner-away' ? 'Your partner is away. The shared setup is saved.' : message.code === 'wrong-job' ? 'Jobs changed. Check your Aim / Reflect label.' : message.code === 'busy' ? 'Let this shot finish first.' : 'That setup could not be applied. Try again.')
      }
    }
    setTransportTick(tick => tick + 1)
  }
  useEffect(() => {
    if (!room) return
    const next = new RicochetConnection(room, message => receive.current(message), message => { setConnectionStatus(message); setTransportTick(tick => tick + 1) })
    connection.current = next
    return () => { next.dispose(); connection.current = null }
  }, [room])
  useEffect(() => {
    alive.current = true
    const media = matchMedia('(prefers-reduced-motion: reduce)'), changed = () => setReduced(media.matches)
    media.addEventListener('change', changed)
    return () => { alive.current = false; sound.current?.dispose(); media.removeEventListener('change', changed); packPort.current?.close(); clearTimeout(packTimeout.current) }
  }, [])
  useEffect(() => {
    if (!playback) return
    let frame = 0
    const tick = () => { const time = Date.now(); setNow(time); if (time + (connection.current?.clockOffset ?? 0) < playback.startedAt + playback.shot.duration + 100) frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playback])
  useEffect(() => {
    if (!playback) return
    if (soundCursor.current.id !== playback.id) soundCursor.current = { id: playback.id, index: 0 }
    while (soundCursor.current.index < playback.shot.events.length) {
      const event = playback.shot.events[soundCursor.current.index]!
      if (event.at > elapsed) break
      if (elapsed - event.at < 180) sound.current?.play(event, soundCursor.current.index)
      soundCursor.current.index++
    }
  }, [playback, elapsed])
  useEffect(() => { if (sound.current) sound.current.enabled = soundOn }, [soundOn])
  useEffect(() => {
    const media = song.current
    if (!media) return
    media.volume = .3
    const update = () => { if (musicOn && !document.hidden) void media.play().catch(() => { setMusicOn(false); setNotice('Tap Music again to start the soundtrack.') }); else media.pause() }
    update(); document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [musicOn])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer)
  }, [notice])

  function edit(action: Extract<RicochetAction, { kind: 'aim' | 'reflector' }>) {
    if (!editable) return
    const before = draftRef.current ?? game.setup, next = action.kind === 'aim' ? { ...before, aim: action.aim, payload: action.payload } : { ...before, reflector: { ...action.reflector } }
    if (room) { draftRef.current = next; setDraft(next); client?.edit(action) }
    else { const changed = { ...game, setup: next }; setSolo(changed); saveGame(changed); clearDraft() }
  }
  function act(action: RicochetAction) {
    unlock()
    if (busy || paused || creating || pending) return
    if (room) { client?.send(action); setTransportTick(tick => tick + 1); return }
    if (action.kind === 'launch' && !won) {
      const shot = simulateRicochet(game), time = Date.now(), next = finishRicochetShot(game, shot)
      saveGame(next); setSolo(next); setSoloPlayback({ id: time, startedAt: time, before: game.rescued, shot }); setNow(time); clearDraft()
    } else if (action.kind === 'retry' || action.kind === 'next') {
      const next = createRicochetGame(action.kind === 'next' ? game.scene + 1 : game.scene, game.learned)
      saveGame(next); setSolo(next); setSoloPlayback(null); clearDraft(); setJob('aim')
    }
  }
  function boardPoint(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * 360, y: (event.clientY - rect.top) / rect.height * 440 }
  }
  function down(event: PointerEvent<SVGSVGElement>) {
    if (!editable || drag.current || event.button !== 0) return
    unlock()
    const point = boardPoint(event), current = draftRef.current ?? setup, turn = reflectorHandle(current.reflector)
    const touchScale = Math.max(1, 320 / event.currentTarget.getBoundingClientRect().width)
    const near = (p: { x: number; y: number }, r: number) => Math.hypot(p.x - point.x, p.y - point.y) < r * touchScale
    let kind: 'aim' | 'move' | 'rotate'
    if (canReflect && near(turn, 25)) kind = 'rotate'
    else if (canReflect && near(current.reflector, 28)) kind = 'move'
    else if (canAim && (activeJob === 'aim' || near(aimHandle(current.aim), 28))) kind = 'aim'
    else { setNotice(canReflect ? 'Drag the cream center to move. Drag the purple handle to turn.' : 'Your partner shapes the reflector. Drag the glowing aim handle.'); return }
    if (!room) setJob(kind === 'aim' ? 'aim' : 'reflector')
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointer: event.pointerId, kind, dx: current.reflector.x - point.x, dy: current.reflector.y - point.y }
    if (kind === 'aim') move(event)
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const moving = drag.current
    if (!moving || moving.pointer !== event.pointerId || !editable) return
    const point = boardPoint(event), current = draftRef.current ?? setup
    if (moving.kind === 'aim') {
      if (Math.hypot(point.x - 180, point.y - 402) < 12) return
      edit({ kind: 'aim', aim: clamp(Math.atan2(point.y - 402, point.x - 180) * 180 / Math.PI, -160, -20), payload: current.payload })
    } else if (moving.kind === 'move') edit({ kind: 'reflector', reflector: { ...current.reflector,
      x: clamp(point.x + moving.dx, scene.area.left, scene.area.right), y: clamp(point.y + moving.dy, scene.area.top, scene.area.bottom) } })
    else if (Math.hypot(point.x - current.reflector.x, point.y - current.reflector.y) > 14) edit({ kind: 'reflector', reflector: { ...current.reflector,
      angle: normalizedAngle(Math.atan2(point.y - current.reflector.y, point.x - current.reflector.x) * 180 / Math.PI) } })
  }
  function up(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.pointer !== event.pointerId) return
    if (event.type !== 'pointercancel') move(event)
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (room && !client?.pending) clearDraft()
  }
  function key(kind: 'aim' | 'move' | 'rotate', event: KeyboardEvent<SVGGElement>) {
    if (!editable || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    if (kind === 'aim' ? !canAim : !canReflect) return
    event.preventDefault(); unlock()
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    if (kind === 'aim') edit({ kind: 'aim', aim: clamp(setup.aim + direction * 2, -160, -20), payload: setup.payload })
    else if (kind === 'rotate') edit({ kind: 'reflector', reflector: { ...setup.reflector, angle: normalizedAngle(setup.reflector.angle + direction * 3) } })
    else edit({ kind: 'reflector', reflector: { ...setup.reflector,
      x: clamp(setup.reflector.x + (event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? direction * 4 : 0), scene.area.left, scene.area.right),
      y: clamp(setup.reflector.y + (event.key === 'ArrowUp' || event.key === 'ArrowDown' ? direction * 4 : 0), scene.area.top, scene.area.bottom) } })
  }
  function idea() {
    if (busy || paused || creating || won) return
    unlock(); const next = suggestedRicochetSetup(viewGame)
    if (room) {
      const changed = canAim ? { ...setup, aim: next.aim, payload: next.payload } : { ...setup, reflector: next.reflector }
      draftRef.current = changed; setDraft(changed)
      if (canAim) client?.edit({ kind: 'aim', aim: next.aim, payload: next.payload }); else client?.edit({ kind: 'reflector', reflector: next.reflector })
    }
    else { const changed = { ...game, setup: next }; setSolo(changed); saveGame(changed) }
    setNotice(room ? 'Here is an idea for your part. Your partner still chooses their part.' : 'A starting idea. Turn the reflector or try a different power to experiment.')
  }
  async function invite() {
    unlock()
    if (room) { setDialog('invite'); return }
    if (busy || creating) return
    setCreating(true)
    try {
      const code = await createRicochetRoom(game)
      if (!alive.current) return
      history.replaceState(null, '', `#/ricochet/together/${code}`); setRoom(code); setDialog('invite'); setParty(null); clearDraft()
    } catch { if (alive.current) setNotice('Could not make an invitation. Check your connection and try again.') }
    finally { if (alive.current) setCreating(false) }
  }
  function leave() {
    client?.dispose(); setRoom(''); setParty(null); setConnectionStatus(''); setSolo(readGame()); setSoloPlayback(null); clearDraft(); setDialog(null)
    history.replaceState(null, '', '#/ricochet')
  }
  async function share() {
    const url = location.origin + import.meta.env.BASE_URL + `#/ricochet/together/${room}`
    try {
      if (navigator.share) await navigator.share({ title: 'Ricochet Rescue · Starling', text: 'I aim, you shape the rebound. Let’s make a little magic.', url })
      else { await navigator.clipboard.writeText(url); setNotice('Invitation copied. Send it to your partner.'); setDialog(null) }
    } catch { /* The full invitation remains selectable. */ }
  }
  async function download() {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) { setOffline('Offline saving is available on the published prototype.'); return }
    setOffline('Checking the offline pack…')
    try {
      await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
      const worker = await currentOfflineWorker(navigator.serviceWorker, import.meta.env.BASE_URL)
      if (!worker) throw new Error('no_worker')
      packPort.current?.close(); clearTimeout(packTimeout.current)
      const channel = new MessageChannel(); packPort.current = channel.port1
      packTimeout.current = setTimeout(() => { setOffline('That took too long. Tap Save offline to retry.'); channel.port1.close() }, 25000)
      channel.port1.onmessage = event => {
        if (!alive.current) return
        if (event.data.type === 'complete') { setOffline('Ready offline. Solo rescue works without a connection.'); clearTimeout(packTimeout.current) }
        else if (event.data.type === 'error') { setOffline('Could not save offline. Please retry.'); clearTimeout(packTimeout.current) }
        else if (event.data.type === 'progress') setOffline(`Saving · ${Math.round(event.data.bytes / event.data.totalBytes * 100)}%`)
      }
      worker.postMessage({ type: 'starling-download' }, [channel.port2])
    } catch { setOffline('Offline setup unavailable. Online play still works.') }
  }

  const primaryText = busy ? 'Watch it unfold…' : pending ? 'Syncing your setup…' : won ? game.scene < 2 ? 'Next little adventure →' : 'Play this cove again ↻' :
    room && !bothHere ? 'Waiting for your partner…' : room && activeJob === 'reflector' ? party?.ready ? 'Ready · your partner launches' : 'Reflector ready ✓' : room && !party?.ready ? 'Your partner is arranging…' : 'Launch a little magic ↗'
  const primaryDisabled = busy || paused || pending || creating || Boolean(room && !won && (!bothHere || activeJob === 'aim' && !party?.ready || activeJob === 'reflector' && party?.ready))
  return <main className={'rr-app' + (reduced ? ' rr-reduced' : '')} data-rr-scene={game.scene} data-rr-revision={party?.revision ?? game.shots} data-rr-job={activeJob} data-rr-learned={game.learned} data-rr-aim-angle={setup.aim} data-rr-shot={playback?.id ?? 0}>
    <audio ref={song} src={musicTrack} preload="none" loop/>
    <div className="rr-shell">
      <header className="rr-header"><a href={import.meta.env.BASE_URL} className="rr-brand" aria-label="Back to Starling"><span>✦</span> STARLING <small>PLAY LAB</small></a><div>
        <button className={'rr-icon-button' + (soundOn ? ' rr-on' : '')} aria-label={soundOn ? 'Mute sound effects' : 'Enable sound effects'} onClick={() => { setSoundOn(!soundOn); if (!soundOn) { sound.current ??= new RescueSound(); sound.current.enabled = true; sound.current.unlock() } }}>{soundOn ? '♪' : '♪̸'}</button>
        <button className="rr-icon-button" aria-label="Help and settings" onClick={() => setDialog('help')}>☰</button>
      </div></header>
      <section className="rr-heading"><div className="rr-eyebrow"><span>RICOCHET RESCUE</span><span>{String(game.scene + 1).padStart(2, '0')} / 03</span></div>
        <h1>{scene.title}</h1><p>{scene.subtitle}</p>
      </section>
      <div className="rr-progress"><span><b>{visibleRescued}</b> / {scene.targets.length} friends aboard</span><span>{room ? bothHere ? '● Together' : '○ Partner away' : '♡ Solo · both jobs'}</span></div>
      <div className="rr-meter" role="progressbar" aria-label="Friends rescued" aria-valuenow={visibleRescued} aria-valuemin={0} aria-valuemax={scene.targets.length}><i style={{ width: `${visibleRescued / scene.targets.length * 100}%` }}/></div>
      {paused && <div className="rr-connection" role="status">{connectionStatus || 'Joining your shared boat…'} <button onClick={leave}>Play solo</button></div>}
      <div className="rr-board-wrap">
        <RescueBoard game={viewGame} preview={preview} playback={playback} elapsed={elapsed} busy={busy} reduced={reduced} canAim={canAim && editable} canReflect={canReflect && editable}
          activeJob={activeJob} onPointerDown={down} onPointerMove={move} onPointerUp={up} onKey={key}/>
        {won && <div className="rr-result" role="status"><span>✦ ✦ ✦</span><h2>{game.scene === 2 ? 'Look what we did.' : 'Everyone aboard!'}</h2>
          <p>{game.scene === 2 ? 'Three little coves. A boat full of friends.' : 'Luma saved them a place on the boat.'}</p><small>{game.shots} {game.shots === 1 ? 'shot' : 'shots'} · no rush, no lives lost</small></div>}
      </div>
      <section className="rr-controls" aria-label="Shot controls">
        <div className="rr-jobs" aria-label={room ? 'Your shared jobs' : 'Choose a job to arrange'}>
          <button className={activeJob === 'aim' ? 'rr-selected' : ''} aria-pressed={activeJob === 'aim'} disabled={Boolean(room) || busy} onClick={() => setJob('aim')}><span>↗</span> Aim <small>{room ? canAim ? 'YOU · MARA' : 'PARTNER' : 'MARA'}</small></button>
          <button className={activeJob === 'reflector' ? 'rr-selected' : ''} aria-pressed={activeJob === 'reflector'} disabled={Boolean(room) || busy} onClick={() => setJob('reflector')}><span>⤴</span> Reflect <small>{room ? canReflect ? 'YOU · FINN' : 'PARTNER' : 'FINN'}</small></button>
        </div>
        <div className="rr-tools" role="group" aria-label={activeJob === 'aim' ? 'Orb power' : 'Reflector mode'}>
          {activeJob === 'aim' ? availablePayloads(game).map(payload => <button key={payload} disabled={!editable} aria-pressed={setup.payload === payload} className={'rr-tool ' + (setup.payload === payload ? 'rr-chosen' : '')}
            onClick={() => { unlock(); edit({ kind: 'aim', aim: setup.aim, payload }) }}><span>{payload === 'plain' ? '●' : payload === 'burst' ? '✹' : '➜'}</span>{PAYLOAD_LABELS[payload]}</button>) :
            availableLenses(game).map(mode => <button key={mode} disabled={!editable} aria-pressed={setup.reflector.mode === mode} className={'rr-tool ' + (setup.reflector.mode === mode ? 'rr-chosen' : '')}
              onClick={() => { unlock(); edit({ kind: 'reflector', reflector: { ...setup.reflector, mode } }) }}><span>{mode === 'mirror' ? '⤴' : mode === 'split' ? '⋔' : '◎'}</span>{LENS_LABELS[mode]}</button>)}
          {(activeJob === 'aim' ? availablePayloads(game).length : availableLenses(game).length) === 1 && <small className="rr-tool-note">{activeJob === 'aim' ? 'Drag the glow to aim' : 'Move center · turn purple handle'}</small>}
        </div>
        <p className="rr-recipe">{recipe(setup)}</p>
        <button className="rr-launch" disabled={primaryDisabled} onClick={() => act({ kind: won ? game.scene < 2 ? 'next' : 'retry' : room && activeJob === 'reflector' ? 'ready' : 'launch' })}>{primaryText}</button>
      </section>
      <p className="rr-instruction" role="status">{notice || (busy ? playback?.shot.rescued.length ? 'Here they come! There’s room for everyone.' : 'Watch the rebound. Every shot teaches you something.' : won ? 'Try another cove, or make a different combination.' : lesson(game))}</p>
      <footer className="rr-footer"><button onClick={() => void invite()} disabled={busy || creating}>{creating ? 'Making invitation…' : room ? 'Invitation ♡' : 'Play together ♡'}</button>
        {room ? <button disabled={busy || pending || paused} onClick={() => act({ kind: 'swap-jobs' })}>Swap jobs ⇄</button> : <button disabled={!editable} onClick={idea}>Try a setup ✧</button>}
      </footer>
    </div>
    {dialog === 'invite' && <Modal title="Make a little magic together" close={() => setDialog(null)}><p>One phone each. Mara aims the orb; Finn moves and turns the reflector. Finn taps Ready, then Mara launches. Swap jobs anytime between shots.</p>
      <input aria-label="Ricochet invitation link" className="rr-invite-link" readOnly value={location.origin + import.meta.env.BASE_URL + `#/ricochet/together/${room}`} onFocus={event => event.target.select()}/>
      <button className="rr-launch" onClick={() => void share()}>Share invitation ♡</button><p className="rr-muted">Your solo game stays separate. Reopen this link on the same browser to return to your seat.</p>
      <button className="rr-text-button" onClick={leave}>Back to my solo rescue</button></Modal>}
    {dialog === 'help' && <Modal title="A little help" close={() => setDialog(null)}>
      <p><b>Pop the rescue bubbles.</b> Drag the glowing handle above the boat to aim. Move the reflector’s cream center; drag its purple handle to turn it. The dotted line shows the beginning of your shot.</p>
      <p><b>Combine what the tools do.</b> Burst explodes; Pierce travels through targets. Split makes three; Focus makes one bigger effect. Reefs bounce shots and block blasts.</p>
      <p>{room ? 'Your partner owns the other job. Either edit clears Ready so you both agree on the new shot.' : 'Playing solo? You arrange both jobs. Tap Aim or Reflect below the cove.'} There is no timer and no shot limit.</p>
      <label className="rr-setting">Sound effects <input type="checkbox" checked={soundOn} onChange={event => setSoundOn(event.target.checked)}/></label>
      <label className="rr-setting">Music · Tide Rope <input type="checkbox" checked={musicOn} onChange={event => setMusicOn(event.target.checked)}/></label><small className="rr-muted">Original music by Jonathan Gu · streams only when switched on.</small>
      <label className="rr-setting">Reduced motion <input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)}/></label>
      <details className="rr-fine"><summary>Fine-tune with sliders</summary>
        {canAim && <label>Aim<input aria-label="Aim angle" type="range" min="-160" max="-20" step="1" value={setup.aim} disabled={busy || paused || won} onChange={event => {
          const action = { kind: 'aim' as const, aim: Number(event.target.value), payload: setup.payload }
          if (room) { const next = { ...setup, aim: action.aim }; draftRef.current = next; setDraft(next); client?.edit(action) } else { const next = { ...game, setup: { ...setup, aim: action.aim } }; setSolo(next); saveGame(next) }
        }}/></label>}
        {canReflect && <label>Reflector angle<input aria-label="Reflector angle" type="range" min="-180" max="180" step="1" value={setup.reflector.angle} disabled={busy || paused || won} onChange={event => {
          const reflector = { ...setup.reflector, angle: Number(event.target.value) }
          if (room) { const next = { ...setup, reflector }; draftRef.current = next; setDraft(next); client?.edit({ kind: 'reflector', reflector }) } else { const next = { ...game, setup: { ...setup, reflector } }; setSolo(next); saveGame(next) }
        }}/></label>}
      </details>
      <div className="rr-help-actions"><button onClick={() => { setDialog(null); idea() }} disabled={busy || paused || won}>Show an idea for my setup</button><button onClick={() => void download()}>Save offline</button></div>
      {offline && <p role="status">{offline}</p>}
      <div className="rr-help-actions"><button disabled={busy || pending || paused} onClick={() => setDialog('restart')}>{room ? 'Restart shared scene' : 'Restart this scene'}</button><a href={import.meta.env.BASE_URL}>Original Starling →</a></div>
      <a className="rr-license" href={import.meta.env.BASE_URL + 'third-party-ricochet.txt'} target="_blank" rel="noreferrer">Prototype open-source notices</a>
    </Modal>}
    {dialog === 'restart' && <Modal title="Try this scene again?" close={() => setDialog(null)}><p>{room ? 'This resets the current scene for both players.' : 'This resets this scene’s rescues.'} The tools you have learned stay unlocked. Other games and saves are untouched.</p>
      <button className="rr-launch" onClick={() => { setDialog(null); act({ kind: 'retry' }) }}>Restart scene</button><button className="rr-text-button" onClick={() => setDialog(null)}>Keep this setup</button></Modal>}
  </main>
}
