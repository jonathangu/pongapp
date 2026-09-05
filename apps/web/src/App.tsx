import { useMemo, useState } from 'react'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { SoloRiver } from './game/SoloRiver'
import { OnlineRoom } from './online/OnlineRoom'
import { OnlineVersusRoom } from './online/OnlineVersusRoom'
import { normalizeRoomCode, pongHomeUrlFor } from './online/invite'
import { loadProfile, saveProfile, type GuestProfile } from './store'
import { ExpeditionPreview } from './game/ExpeditionPreview'

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
          <p className="oars-kicker">Two people. A whole little universe.</p>
          <h1>Go somewhere<br/><em>extraordinary.</em></h1>
          <p className="oars-tagline">Tap, dodge, shoot, recover. Race monster trucks into sunsets, sail through rainbows, and take on the stars—together.</p>
          <div className="oars-mode-grid">
            <button className="oars-launch" onClick={launchCoop}><span>♥</span><strong>Co-op Adventure</strong><small>Four tap buttons · big explosions · five worlds</small><em>BEST FOR COUPLES</em></button>
            <button className="oars-launch oars-launch--versus" onClick={launchVersus}><span>⚡</span><strong>Rapid Rivals</strong><small>Two boats · tap lanes · race a friend</small><em>NEW</em></button>
            <button className="oars-launch oars-launch--solo" onClick={() => setScreen({ type: 'solo' })}><span>✦</span><strong>Solo Adventure</strong><small>Scout AI joins your crew</small><em>PLAY NOW</em></button>
          </div>
          <div className="oars-home-actions"><button onClick={() => setJoinOpen((open) => !open)}>I have a room code</button><button onClick={() => setHowOpen(true)}>See the 10-second rules</button></div>
          {joinOpen && <div className="oars-join oars-join--choice"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="6-LETTER CODE" maxLength={6} aria-label="Room code"/><button onClick={() => join('coop')}>Join co-op</button><button onClick={() => join('versus')}>Join race</button></div>}
          <label className="oars-name"><span>Your name on the boat</span><input value={profile.name} maxLength={16} onChange={(event) => rename(event.target.value)}/></label>
        </div>
        <ExpeditionPreview/>
      </section>
      <section className="oars-feature-band"><div><span>⚡</span><p><strong>Two people. Four buttons.</strong><small>Tap left, right, shoot or recover. More taps, more action.</small></p></div><div><span>◆</span><p><strong>Rescue & explore</strong><small>Save little friends, discover relics, thread golden gates.</small></p></div><div><span>▲</span><p><strong>Outsmart predators</strong><small>More enemies. Wider rivers. Big slow shells with a bigger splash.</small></p></div></section>
      <section className="oars-promise"><article><b>01 · INVITE</b><h2>The link is the lobby</h2><p>Your friend taps once and lands in the open boat or oar. No signup, install, ready button, or code ritual.</p></article><article><b>02 · CO-OP</b><h2>Be a little dangerous</h2><p>Both players can steer, fire and repair. New cannon powers equip automatically. Rescue three friends and beat the guardian.</p></article><article><b>03 · VERSUS</b><h2>Race, don’t wait</h2><p>Every tap switches lanes and gives a speed kick. Dodge rocks, hit ramps, and grab the finish first.</p></article></section>
    </main>
    <footer className="oars-footer"><span>Two phones. Same Wi-Fi or hotspot. One adventure.</span><span>Local play · direct peer connection when available</span></footer>
    {howOpen && <div className="oars-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHowOpen(false) }}><section className="oars-modal" role="dialog" aria-modal="true"><button className="oars-modal__close" onClick={() => setHowOpen(false)}>Close</button><p className="oars-kicker">Pick your river</p><h2>Four buttons. Keep tapping.</h2><div className="oars-how"><div><span>♥</span><p><strong>Co-op Adventure</strong><small>Tap Left or Right to move. Tap Shoot for a big, slow splash shell. Six Recover taps and 3 scrap repair one shared heart. Both players have all four buttons. Upgrades equip automatically. Rescue 3 friends and defeat the guardian.</small></p></div><div><span>⚡</span><p><strong>Rapid Rivals</strong><small>Each person has a boat. Tap to switch lanes and boost. Dodge rocks, hit ramps, and race to 620m.</small></p></div><div><span>✦</span><p><strong>Solo Adventure</strong><small>You control the boat. Scout helps with occasional cannon shots and emergency repairs, but never takes over your steering.</small></p></div></div><p>Every multiplayer mode starts from one complete link and automatically begins when the second person arrives.</p><button className="oars-primary" onClick={() => { setHowOpen(false); launchCoop() }}>Start co-op</button></section></div>}
  </div>
}
