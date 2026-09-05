import { useMemo, useState } from 'react'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { SoloRiver } from './game/SoloRiver'
import { OnlineRoom } from './online/OnlineRoom'
import { OnlineVersusRoom } from './online/OnlineVersusRoom'
import { normalizeRoomCode, pongHomeUrlFor } from './online/invite'
import { loadProfile, saveProfile, type GuestProfile } from './store'

type Screen =
  | { type: 'home' }
  | { type: 'solo' }
  | { type: 'coop'; roomCode?: string; request?: CreateRoomRequest }
  | { type: 'versus'; roomCode?: string; request?: CreateRoomRequest }
const ROOM_SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD ? 'https://pongapp-room.pongapp-room-worker.workers.dev' : 'http://localhost:8080')
function screenFromHash(): Screen {
  const match = /^#\/(room|race)\/([^/]+)$/i.exec(window.location.hash)
  const code = normalizeRoomCode(match?.[2] ?? '')
  if (!code) return { type: 'home' }
  return { type: match?.[1]?.toLowerCase() === 'race' ? 'versus' : 'coop', roomCode: code }
}

function BoatArt() {
  return <div className="oars-hero-art" aria-label="Two friends rowing one boat"><div className="oars-moon">☾</div><i className="oars-star oars-star--1">✦</i><i className="oars-star oars-star--2">✦</i><i className="oars-star oars-star--3">✦</i><div className="oars-ripple oars-ripple--1"/><div className="oars-ripple oars-ripple--2"/><div className="oars-illustration"><span className="oars-illustration__left"/><span className="oars-illustration__right"/><div><b>●</b><b>●</b></div></div></div>
}

export default function App() {
  const [profile, setProfile] = useState<GuestProfile>(() => loadProfile())
  const [screen, setScreen] = useState<Screen>(() => screenFromHash())
  const [joinCode, setJoinCode] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const identity = useMemo(() => ({ guestId: profile.id, displayName: profile.name }), [profile.id, profile.name])
  const home = () => { window.history.replaceState(null, '', pongHomeUrlFor(window.location.origin, import.meta.env.BASE_URL)); setScreen({ type: 'home' }) }
  const launchCoop = () => setScreen({ type: 'coop', request: { hostName: profile.name, roomName: `${profile.name}'s Boat`, mode: 'coop' } })
  const launchVersus = () => setScreen({ type: 'versus', request: { hostName: profile.name, roomName: `${profile.name}'s River Race`, mode: 'versus' } })
  const join = (mode: 'coop' | 'versus') => { const code = normalizeRoomCode(joinCode); if (code) setScreen({ type: mode, roomCode: code }) }
  const rename = (name: string) => { const next = { ...profile, name: name || 'Rower One' }; setProfile(next); saveProfile(next) }

  if (screen.type === 'solo') return <SoloRiver playerName={profile.name} onExit={home}/>
  if (screen.type === 'coop') return <OnlineRoom serverUrl={ROOM_SERVER} roomCode={screen.roomCode} createRequest={screen.request} identity={identity} onExit={home} />
  if (screen.type === 'versus') return <OnlineVersusRoom serverUrl={ROOM_SERVER} roomCode={screen.roomCode} createRequest={screen.request} identity={identity} onExit={home} />

  return <div className="oars-app">
    <header className="oars-header"><a className="oars-logo" href={import.meta.env.BASE_URL} onClick={(event) => event.preventDefault()}><span>◒</span>TWO OARS</a><button onClick={() => setHowOpen(true)}>How to play</button></header>
    <main className="oars-home">
      <section className="oars-hero">
        <div className="oars-hero-copy">
          <p className="oars-kicker">Instant games for two people</p>
          <h1>Share a link.<br/><em>Make a memory.</em></h1>
          <p className="oars-tagline">Same team or friendly rivals. One thumb each, zero setup, and a living river full of fireflies, boosts, near misses, and glorious bonks.</p>
          <div className="oars-mode-grid">
            <button className="oars-launch" onClick={launchCoop}><span>♥</span><strong>Co-op Adventure</strong><small>One boat · two oars · win together</small><em>BEST FOR COUPLES</em></button>
            <button className="oars-launch oars-launch--versus" onClick={launchVersus}><span>⚡</span><strong>Rapid Rivals</strong><small>Two boats · tap lanes · race a friend</small><em>NEW</em></button>
            <button className="oars-launch oars-launch--solo" onClick={() => setScreen({ type: 'solo' })}><span>✦</span><strong>Solo Adventure</strong><small>Scout AI takes the other oar</small><em>PLAY NOW</em></button>
          </div>
          <div className="oars-home-actions"><button onClick={() => setJoinOpen((open) => !open)}>I have a room code</button><button onClick={() => setHowOpen(true)}>See the 10-second rules</button></div>
          {joinOpen && <div className="oars-join oars-join--choice"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="6-LETTER CODE" maxLength={6} aria-label="Room code"/><button onClick={() => join('coop')}>Join co-op</button><button onClick={() => join('versus')}>Join race</button></div>}
          <label className="oars-name"><span>Your name on the boat</span><input value={profile.name} maxLength={16} onChange={(event) => rename(event.target.value)}/></label>
        </div>
        <BoatArt/>
      </section>
      <section className="oars-feature-band"><div><span>⚡</span><p><strong>Harmony Rush</strong><small>Row in sync to charge a shared rock-smashing super.</small></p></div><div><span>◆</span><p><strong>Lantern power</strong><small>Rare lanterns magnetize whole firefly swarms.</small></p></div><div><span>▲</span><p><strong>Rival ramps</strong><small>Hit jumps, steal stars, and switch lanes at speed.</small></p></div></section>
      <section className="oars-promise"><article><b>01 · INVITE</b><h2>The link is the lobby</h2><p>Your friend taps once and lands in the open boat or oar. No signup, install, ready button, or code ritual.</p></article><article><b>02 · CO-OP</b><h2>Find your rhythm</h2><p>Hold together to fly, alternate to steer, chain fireflies, and turn perfect teamwork into a Harmony Rush.</p></article><article><b>03 · VERSUS</b><h2>Race, don’t wait</h2><p>Every tap switches lanes and gives a speed kick. Dodge rocks, hit ramps, and grab the finish first.</p></article></section>
    </main>
    <footer className="oars-footer"><span>Built for two phones and one couch.</span><span>60Hz edge simulation · reconnect-safe seats</span></footer>
    {howOpen && <div className="oars-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHowOpen(false) }}><section className="oars-modal" role="dialog" aria-modal="true"><button className="oars-modal__close" onClick={() => setHowOpen(false)}>Close</button><p className="oars-kicker">Pick your river</p><h2>One thumb. Instant fun.</h2><div className="oars-how"><div><span>♥</span><p><strong>Co-op Adventure</strong><small>Each person owns one oar. Hold together for speed; alternate to steer. Fill Harmony for a super rush.</small></p></div><div><span>⚡</span><p><strong>Rapid Rivals</strong><small>Each person has a boat. Tap to switch lanes and boost. Dodge rocks, hit ramps, and race to 620m.</small></p></div><div><span>✦</span><p><strong>Solo Adventure</strong><small>Scout AI reads hazards and prizes from the right oar while you steer from the left.</small></p></div></div><p>Every multiplayer mode starts from one complete link and automatically begins when the second person arrives.</p><button className="oars-primary" onClick={() => { setHowOpen(false); launchCoop() }}>Start co-op</button></section></div>}
  </div>
}
