import { useMemo, useState } from 'react'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { OnlineRoom } from './online/OnlineRoom'
import { normalizeRoomCode, pongHomeUrlFor } from './online/invite'
import { loadProfile, saveProfile, type GuestProfile } from './store'

type Screen = { type: 'home' } | { type: 'online'; roomCode?: string; request?: CreateRoomRequest }
const ROOM_SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD ? 'https://pongapp-room.pongapp-room-worker.workers.dev' : 'http://localhost:8080')
function roomFromHash(): string | undefined { const match = /^#\/room\/([^/]+)$/i.exec(window.location.hash); return normalizeRoomCode(match?.[1] ?? '') ?? undefined }

function BoatArt() {
  return <div className="oars-hero-art" aria-label="Two friends rowing one boat"><div className="oars-moon">☾</div><i className="oars-star oars-star--1">✦</i><i className="oars-star oars-star--2">✦</i><i className="oars-star oars-star--3">✦</i><div className="oars-ripple oars-ripple--1"/><div className="oars-ripple oars-ripple--2"/><div className="oars-illustration"><span className="oars-illustration__left"/><span className="oars-illustration__right"/><div><b>●</b><b>●</b></div></div></div>
}

export default function App() {
  const [profile, setProfile] = useState<GuestProfile>(() => loadProfile())
  const [screen, setScreen] = useState<Screen>(() => roomFromHash() ? { type: 'online', roomCode: roomFromHash() } : { type: 'home' })
  const [joinCode, setJoinCode] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const identity = useMemo(() => ({ guestId: profile.id, displayName: profile.name }), [profile.id, profile.name])
  const home = () => { window.history.replaceState(null, '', pongHomeUrlFor(window.location.origin, import.meta.env.BASE_URL)); setScreen({ type: 'home' }) }
  const launch = () => setScreen({ type: 'online', request: { hostName: profile.name, roomName: `${profile.name}'s Boat` } })
  const join = () => { const code = normalizeRoomCode(joinCode); if (code) setScreen({ type: 'online', roomCode: code }) }
  const rename = (name: string) => { const next = { ...profile, name: name || 'Rower One' }; setProfile(next); saveProfile(next) }

  if (screen.type === 'online') return <OnlineRoom serverUrl={ROOM_SERVER} roomCode={screen.roomCode} createRequest={screen.request} identity={identity} onExit={home} />

  return <div className="oars-app">
    <header className="oars-header"><a className="oars-logo" href={import.meta.env.BASE_URL} onClick={(event) => event.preventDefault()}><span>◒</span>TWO OARS</a><button onClick={() => setHowOpen(true)}>How to play</button></header>
    <main className="oars-home">
      <section className="oars-hero">
        <div className="oars-hero-copy">
          <p className="oars-kicker">A tiny co-op game for two people</p>
          <h1>One boat.<br/><em>Two thumbs.</em></h1>
          <p className="oars-tagline">Text one link. Your person taps it and takes the other oar. Hold together to fly. Take turns to steer. Try not to bonk the rocks.</p>
          <button className="oars-launch" onClick={launch}><span>↗</span><strong>Row with someone</strong><small>Create the link instantly · no account needed</small></button>
          <div className="oars-home-actions"><button onClick={() => setJoinOpen((open) => !open)}>I have a room code</button><button onClick={() => setHowOpen(true)}>See the 10-second rules</button></div>
          {joinOpen && <div className="oars-join"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === 'Enter') join() }} placeholder="6-LETTER CODE" maxLength={6} aria-label="Room code"/><button onClick={join}>Hop in</button></div>}
          <label className="oars-name"><span>Your name on the boat</span><input value={profile.name} maxLength={16} onChange={(event) => rename(event.target.value)}/></label>
        </div>
        <BoatArt/>
      </section>
      <section className="oars-promise"><article><b>01</b><h2>Tap the link</h2><p>The URL is the lobby. It opens straight into the available oar—no signup, install, or room-code ritual.</p></article><article><b>02</b><h2>Find the rhythm</h2><p>You each get one big hold button. Paddle together for speed; paddle alone to bend the boat away from rocks.</p></article><article><b>03</b><h2>Win together</h2><p>Collect fireflies, protect three shared hearts, and chase one shared score before sunrise.</p></article></section>
    </main>
    <footer className="oars-footer"><span>Built for two phones and one couch.</span><span>60Hz edge simulation · reconnect-safe seats</span></footer>
    {howOpen && <div className="oars-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHowOpen(false) }}><section className="oars-modal" role="dialog" aria-modal="true"><button className="oars-modal__close" onClick={() => setHowOpen(false)}>Close</button><p className="oars-kicker">The whole manual</p><h2>Each person has one oar.</h2><div className="oars-how"><div><span>☝</span><p><strong>Both hold</strong><small>Row fast and straight.</small></p></div><div><span>↶</span><p><strong>Left holds</strong><small>The boat turns right.</small></p></div><div><span>↷</span><p><strong>Right holds</strong><small>The boat turns left.</small></p></div></div><p>Collect glowing fireflies for points. Rocks cost one shared heart and reset your streak. A heart on the river repairs the boat. You have 75 seconds—or three bonks—to make the best trip you can.</p><button className="oars-primary" onClick={() => { setHowOpen(false); launch() }}>Launch a boat</button></section></div>}
  </div>
}
