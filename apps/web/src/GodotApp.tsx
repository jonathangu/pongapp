import { useEffect, useMemo, useState } from 'react'
import { decodeRescueSave, type RescueState } from '@pongapp/game-core'
import { loadProfile, saveProfile } from './store'
import { GodotGame } from './game/godot/GodotGame'
import { OfflinePack } from './game/rescue/OfflinePack'
import { SAVE_KEY, type RescueSessionOptions } from './game/rescue/RescueSession'
import departureArt from './assets/story/starling-departure.png'
import { SongControls, useStorySong } from './game/godot/StorySong'
import './styles/godot.css'
import './styles/story.css'
import './styles/crossing.css'

const SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD ? 'https://pongapp-room.pongapp-room-worker.workers.dev' : 'http://127.0.0.1:8787')
const savedVoyage = () => { try { return decodeRescueSave(localStorage.getItem(SAVE_KEY) ?? '') } catch { return null } }
const invitation = () => /^#\/rescue\/([A-Z2-9]{6})$/i.exec(location.hash)?.[1]?.toUpperCase() ?? ''
export default function GodotApp() {
  const song = useStorySong()
  const [profile, setProfile] = useState(loadProfile), [saved, setSaved] = useState(savedVoyage)
  const [ready, setReady] = useState(false)
  const [code, setCode] = useState(invitation), [joining, setJoining] = useState(() => Boolean(invitation())), [message, setMessage] = useState('')
  const [launch, setLaunch] = useState<{ online: boolean; code?: string; saved?: RescueState } | null>(null)
  useEffect(() => {
    const acceptInvitation = () => { const next = invitation(); if (next) { setCode(next); setJoining(true) } }
    window.addEventListener('hashchange', acceptInvitation)
    return () => window.removeEventListener('hashchange', acceptInvitation)
  }, [])
  const options: RescueSessionOptions | null = useMemo(() => launch ? { ...launch, story: true, guided: true, name: profile.name, guestId: profile.id, server: SERVER } : null, [launch, profile])
  const home = () => { setLaunch(null); setReady(false); setSaved(savedVoyage()); song.setCue('home'); history.replaceState(null, '', import.meta.env.BASE_URL) }
  const setup = () => document.querySelector('.crossing-setup')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  const start = (next: NonNullable<typeof launch>) => {
    if (!ready) { setup(); return }
    if (next.online && !navigator.onLine) { setMessage('Co-op needs internet. Your offline solo voyage is ready.'); return }
    song.begin(); setLaunch(next)
  }
  return <>{song.audio}{options ? <GodotGame options={options} onExit={home} song={song}/> : <div className="crossing-home">
    <div className="crossing-ocean" aria-hidden="true"><img src={departureArt} alt=""/><div className="crossing-shimmer"/></div>
    <header className="crossing-header"><a className="g-wordmark" href={import.meta.env.BASE_URL}><span>✧</span> STARLING</a><button className="crossing-sound" aria-label={song.enabled && song.playing ? 'Turn music off' : 'Turn music on'} onClick={() => song.enabled && song.playing ? song.pause() : song.play()}>{song.enabled && song.playing ? '♫ On' : '♫ Off'}</button></header>
    <main className="crossing-main"><section className="crossing-intro"><p className="g-eyebrow">A LITTLE BOAT. A CROSSING FOR TWO.</p><h1>Bring each<br/>other <em>home.</em></h1><p>Play as Mara and Finn.<br/>Little Luma lends her silver wings.<br/>From the sea to unwritten stars.</p></section>
      <section className="crossing-board" aria-label="Start your voyage"><p className="crossing-tag">ONE PHONE EACH · PORTRAIT · NO ACCOUNT</p>
        <h2>{ready ? 'All aboard?' : 'Your boat is waiting.'}</h2><p className="crossing-explain">Steer. Rescue. Cook. Look after each other.<br/>We’ll teach you one small job at a time.</p>
        {ready ? <div className="g-start-actions"><button className="g-primary" aria-label="Play together — Sail together" onClick={() => start({ online: true })}>Play together <span>→</span></button><button className="g-secondary" aria-label="Play solo — Begin their voyage" onClick={() => start({ online: false })}>Play solo <span>→</span></button></div> : <button className="g-primary crossing-install" onClick={setup}>Install & prepare to sail <span>→</span></button>}
        <p className="g-small">{ready ? 'Gentle first voyage · harder seas whenever you’re ready.' : 'Required once. Offline solo · online together.'}</p>
        {ready && saved && <button className="g-continue" onClick={() => start({ online: false, saved })}>Continue your voyage <span>{saved.stats.rescues}/5 rescued →</span></button>}
        <button className="g-text-button" onClick={() => setJoining(!joining)}>Have a crew code? Join your partner ↗</button>
        {joining && <form className="g-join" onSubmit={e => { e.preventDefault(); if (/^[A-Z2-9]{6}$/.test(code)) start({ online: true, code }); else setMessage('Use the six-letter code from your partner.') }}><label>Invitation code<input autoFocus autoComplete="off" value={code} maxLength={6} placeholder="ABCDEF" onChange={e => setCode(e.target.value.toUpperCase())}/></label><button className="g-primary" type="submit">{ready ? 'Join ship' : 'Set up first'}</button></form>}
        {code && !ready && <p className="g-small">Keep this code: <strong>{code}</strong>. After installing, enter it in “Join your partner.”</p>}
        {message && <p role="status">{message}</p>}
        <details className="crossing-name"><summary>Your name aboard</summary><label className="g-player-name">NAME<input aria-label="Your name aboard" maxLength={16} value={profile.name} onChange={e => { const next = { ...profile, name: [...e.target.value].filter(c => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>').join('') || 'Explorer' }; setProfile(next); saveProfile(next) }}/></label></details>
      </section></main>
    <section className="crossing-story"><p className="g-eyebrow">WHY WE SAIL</p><h2>First the sea.<br/>Then the sky. Then the stars.</h2><p>Answer their signals, bring them aboard, and find a safe passage through the breakwater. Then rise into the sky with Mara, Finn, and little Luma. A dying sun. A stolen ship. A forbidden gate. Keep your family together beneath unwritten stars.</p><div><span>◈<b>One steers.</b><small>Drag the helm. Release to brake.</small></span><span>♨<b>One lends a hand.</b><small>Switch jobs. The crew handles aiming.</small></span><span>♡<b>Both belong.</b><small>Share a boat, a story, and the odd burnt dinner.</small></span></div></section>
    <section className="crossing-songs"><p className="g-eyebrow">YOUR CROSSING HAS A SOUNDTRACK</p><SongControls song={song}/><p className="g-small">Seven original recordings by Jonathan Gu. Included offline. Music controls stay aboard.</p></section>
    <section className="crossing-setup" aria-label="Play offline & install on your phone"><header><div><p className="g-eyebrow">PLAY OFFLINE & INSTALL ON YOUR PHONE</p><h2>{ready ? 'Your ship is packed.' : 'Before your first crossing'}</h2></div>{ready && <span>✓ READY</span>}</header><OfflinePack required onReady={setReady}/>{ready && <button className="g-primary" onClick={() => document.querySelector('.crossing-board')?.scrollIntoView({ block: 'center' })}>Choose your voyage →</button>}</section>
    <footer className="crossing-footer">STARLING · THE SEA WE CARRY <span>Made for a little time together.</span></footer>
  </div>}</>
}
