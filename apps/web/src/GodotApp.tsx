import { useMemo, useState } from 'react'
import { decodeRescueSave, type RescueState } from '@pongapp/game-core'
import { loadProfile, saveProfile } from './store'
import { GodotGame } from './game/godot/GodotGame'
import { OfflinePack } from './game/rescue/OfflinePack'
import { SAVE_KEY, type RescueSessionOptions } from './game/rescue/RescueSession'
import familyArt from './assets/story/mara-finn-helm.png'
import { SongControls, useStorySong } from './game/godot/StorySong'
import './styles/godot.css'
import './styles/story.css'

const SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD ? 'https://pongapp-room.pongapp-room-worker.workers.dev' : 'http://127.0.0.1:8787')
const savedVoyage = () => { try { return decodeRescueSave(localStorage.getItem(SAVE_KEY) ?? '') } catch { return null } }
export default function GodotApp() {
  const song = useStorySong()
  const [profile, setProfile] = useState(loadProfile)
  const [saved, setSaved] = useState(savedVoyage)
  const [code, setCode] = useState(''), [joining, setJoining] = useState(false), [message, setMessage] = useState('')
  const [launch, setLaunch] = useState<{ online: boolean; code?: string; saved?: RescueState } | null>(() => {
    const invitation = /^#\/rescue\/([A-Z2-9]{6})$/i.exec(location.hash)?.[1]
    return invitation ? { online: true, code: invitation.toUpperCase() } : null
  })
  const options: RescueSessionOptions | null = useMemo(() => launch ? { ...launch, story: true, name: profile.name, guestId: profile.id, server: SERVER } : null, [launch, profile])
  const home = () => { setLaunch(null); setSaved(savedVoyage()); song.setCue('home'); history.replaceState(null, '', import.meta.env.BASE_URL) }
  const begin = (online: boolean) => { song.begin(); setLaunch({ online }) }
  return <>{song.audio}{options ? <GodotGame options={options} onExit={home} song={song}/> : <div className="g-home story-home">
    <header className="g-home-header"><a className="g-wordmark" href={import.meta.env.BASE_URL}><span>✧</span> STARLING</a><button className="g-text-button" onClick={() => setJoining(!joining)}>Join a crew ↗</button></header>
    <main className="g-landing">
      <div className="g-landing-copy"><p className="g-eyebrow">TIDES OF THE OLD WORLD</p><h1>The sea<br/><em>we carry.</em></h1><p className="g-intro">A young mother. Her nine-year-old son.<br/>An inherited ship, five calls for help, and a sea neither of them knows.</p>
        <p className="story-home-quote">Different boat. Different blue.<br/>Same old water passing through.</p>
        <div className="g-start-actions"><button className="g-primary" aria-label="Play solo — Begin their voyage" onClick={() => begin(false)}>Begin their voyage <span>→</span></button><button className="g-secondary" aria-label="Play together — Sail together" onClick={() => begin(true)}>Sail together <span>♧</span></button></div>
        <p className="g-small">Solo: sail as Mara with Finn and your crew. Together: 2–8 friends aboard.</p>
        {saved && <button className="g-continue" onClick={() => setLaunch({ online: false, saved })}>Continue your voyage <span>{saved.stats.rescues}/5 rescued →</span></button>}
        {joining && <form className="g-join" onSubmit={e => { e.preventDefault(); if (/^[A-Z2-9]{6}$/.test(code)) setLaunch({ online: true, code }); else setMessage('Use the six-letter code from your friend.') }}><label>Invitation code<input autoFocus autoComplete="off" value={code} maxLength={6} placeholder="ABCDEF" onChange={e => setCode(e.target.value.toUpperCase())}/></label><button className="g-primary" type="submit">Join ship</button></form>}
        <label className="g-player-name">YOUR NAME ABOARD<input maxLength={16} value={profile.name} onChange={e => { const next = { ...profile, name: [...e.target.value].filter(c => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>').join('') || 'Explorer' }; setProfile(next); saveProfile(next) }}/></label>
        {message && <p role="status">{message}</p>}
      </div>
      <div className="g-landing-art story-home-art"><img src={familyArt} alt="Mara and Finn hold the wheel together, the old brass watch beside their chart."/><span className="g-art-caption">HER HAND ON HIS. HIS EYES ON THE HORIZON.</span></div>
    </main>
    <section className="g-promise"><article><span>01</span><div><strong>Keep them afloat.</strong><p>Steer the Starling. Tap a station to walk there. Your crew handles the aiming.</p></div></article><article><span>02</span><div><strong>Choose what to carry.</strong><p>A coat can be a memory or a hull patch. Supplies matter. So does what Finn remembers.</p></div></article><article><span>03</span><div><strong>Make a new way home.</strong><p>Answer five rescue signals. Face the Keeper. Write an ending that belongs to the two of them.</p></div></article></section>
    <div className="story-home-song"><SongControls song={song}/></div>
    <details className="g-offline"><summary>Play offline & install on your phone <span>＋</span></summary><OfflinePack/></details>
    <footer className="g-home-footer"><span>STARLING · TIDES OF THE OLD WORLD</span><span>Song by Jonathan Gu · Godot browser edition</span></footer>
  </div>}</>
}
