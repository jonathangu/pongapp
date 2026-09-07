import { useMemo, useState } from 'react'
import { decodeRescueSave, type RescueState } from '@pongapp/game-core'
import { loadProfile, saveProfile } from './store'
import { GodotGame } from './game/godot/GodotGame'
import { OfflinePack } from './game/rescue/OfflinePack'
import { SAVE_KEY, type RescueSessionOptions } from './game/rescue/RescueSession'
import shipArt from '../../godot/assets/starling.png'
import islandArt from '../../godot/assets/island.png'
import './styles/godot.css'

const SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD ? 'https://pongapp-room.pongapp-room-worker.workers.dev' : 'http://127.0.0.1:8787')
const savedVoyage = () => { try { return decodeRescueSave(localStorage.getItem(SAVE_KEY) ?? '') } catch { return null } }
export default function GodotApp() {
  const [profile, setProfile] = useState(loadProfile)
  const [saved, setSaved] = useState(savedVoyage)
  const [code, setCode] = useState(''), [joining, setJoining] = useState(false), [message, setMessage] = useState('')
  const [launch, setLaunch] = useState<{ online: boolean; code?: string; saved?: RescueState } | null>(() => {
    const invitation = /^#\/rescue\/([A-Z2-9]{6})$/i.exec(location.hash)?.[1]
    return invitation ? { online: true, code: invitation.toUpperCase() } : null
  })
  const options: RescueSessionOptions | null = useMemo(() => launch ? { ...launch, name: profile.name, guestId: profile.id, server: SERVER } : null, [launch, profile])
  const home = () => { setLaunch(null); setSaved(savedVoyage()); history.replaceState(null, '', import.meta.env.BASE_URL) }
  if (options) return <GodotGame options={options} onExit={home}/>
  return <div className="g-home">
    <header className="g-home-header"><a className="g-wordmark" href={import.meta.env.BASE_URL}><span>✧</span> STARLING</a><button className="g-text-button" onClick={() => setJoining(!joining)}>Join a crew ↗</button></header>
    <main className="g-landing">
      <div className="g-landing-copy"><p className="g-eyebrow">A LITTLE SHIP. A BIG ADVENTURE.</p><h1>All hands.<br/><em>One heart.</em></h1><p className="g-intro">Take the helm. Let your crew handle the cannons.<br className="g-desktop"/> Bring five lost friends home across a living sea.</p>
        <div className="g-start-actions"><button className="g-primary" onClick={() => setLaunch({ online: false })}>Play solo <span>→</span></button><button className="g-secondary" onClick={() => setLaunch({ online: true })}>Play together <span>♧</span></button></div>
        <p className="g-small">Solo includes a helpful crew. Together supports 2–8 friends.</p>
        {saved && <button className="g-continue" onClick={() => setLaunch({ online: false, saved })}>Continue your voyage <span>{saved.stats.rescues}/5 rescued →</span></button>}
        {joining && <form className="g-join" onSubmit={e => { e.preventDefault(); if (/^[A-Z2-9]{6}$/.test(code)) setLaunch({ online: true, code }); else setMessage('Use the six-letter code from your friend.') }}><label>Invitation code<input autoFocus autoComplete="off" value={code} maxLength={6} placeholder="ABCDEF" onChange={e => setCode(e.target.value.toUpperCase())}/></label><button className="g-primary" type="submit">Join ship</button></form>}
        <label className="g-player-name">YOUR NAME ABOARD<input maxLength={16} value={profile.name} onChange={e => { const next = { ...profile, name: [...e.target.value].filter(c => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>').join('') || 'Explorer' }; setProfile(next); saveProfile(next) }}/></label>
        {message && <p role="status">{message}</p>}
      </div>
      <div className="g-landing-art" aria-label="The Starling rescue ship and a lantern island"><div className="g-art-orbit"/><img className="g-hero-island" src={islandArt} alt="A lush island with a lantern lighthouse"/><img className="g-hero-ship" src={shipArt} alt="The Starling, a warm brass ship with four little decks"/><span className="g-art-caption">YOUR CREW IS WAITING.</span></div>
    </main>
    <section className="g-promise"><article><span>01</span><div><strong>Tap your station.</strong><p>Your crewmate walks there. No jumping puzzles.</p></div></article><article><span>02</span><div><strong>Guns do the aiming.</strong><p>Choose the adventure, not the crosshair.</p></div></article><article><span>03</span><div><strong>See the whole sea.</strong><p>Room to explore. Islands, storms and stars.</p></div></article></section>
    <details className="g-offline"><summary>Play offline & install on your phone <span>＋</span></summary><OfflinePack/></details>
    <footer className="g-home-footer"><span>STARLING · LANTERN SEA</span><span>Godot browser edition · No signup. No purchases.</span></footer>
  </div>
}
