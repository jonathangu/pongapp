import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildMatchConfig, type AbilityId, type AiDifficulty, type GameMode, type GameState, type ItemIntensity, type MatchConfig } from '@pongapp/game-core'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { LocalMatch } from './game/LocalMatch'
import { OnlineRoom } from './online/OnlineRoom'
import { loadProfile, loadSettings, recordResult, saveProfile, saveSettings, type AppSettings, type GuestProfile } from './store'

type Screen = { type: 'home' } | { type: 'local'; config: MatchConfig; humanIds: string[] } | { type: 'online'; roomCode?: string; request?: CreateRoomRequest }

const ROOM_SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD
  ? 'https://pongapp-room.pongapp-room-worker.workers.dev'
  : 'http://localhost:8787')

function roomFromHash(): string | undefined {
  const match = /^#\/room\/([A-Z0-9]{6})$/i.exec(window.location.hash)
  return match?.[1]?.toUpperCase()
}

function Logo() {
  return <span className="pg-brand"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#dfff68"/><rect x="6" y="8" width="3" height="16" rx="1.5" fill="#12231b"/><rect x="23" y="8" width="3" height="16" rx="1.5" fill="#12231b"/><circle cx="16" cy="16" r="3" fill="#12231b"/></svg><span>PONG<span className="pg-brand__bang">!</span></span></span>
}

export default function App() {
  const [profile, setProfile] = useState<GuestProfile>(() => loadProfile())
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [screen, setScreen] = useState<Screen>(() => roomFromHash() ? { type: 'online', roomCode: roomFromHash() } : { type: 'home' })
  const [mode, setMode] = useState<GameMode>('duel')
  const [ability, setAbility] = useState<AbilityId>(profile.favoriteAbility)
  const [difficulty, setDifficulty] = useState<AiDifficulty>('rally')
  const [items, setItems] = useState<ItemIntensity>('standard')
  const [aiSlots, setAiSlots] = useState(1)
  const [joinCode, setJoinCode] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 })
  }, [screen.type])

  const effects = useMemo(() => ({ reducedMotion: settings.reducedMotion, screenShake: settings.screenShake, effectDensity: settings.effectDensity }), [settings])

  const updateProfile = (patch: Partial<GuestProfile>) => {
    const next = { ...profile, ...patch }
    setProfile(next)
    saveProfile(next)
  }
  const updateSettings = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }

  const startAi = () => {
    const config = buildMatchConfig({
      mode,
      humanPlayers: [{ id: profile.id, name: profile.name, ability }],
      totalPlayers: mode === 'duel' ? 2 : 4,
      aiDifficulty: difficulty,
      itemIntensity: items,
    })
    setScreen({ type: 'local', config, humanIds: [profile.id] })
  }

  const startLocal = () => {
    const secondId = 'local-player-two'
    const config = buildMatchConfig({
      mode: 'duel',
      humanPlayers: [
        { id: profile.id, name: profile.name, ability },
        { id: secondId, name: 'Player Two', ability: ability === 'dash' ? 'pulse' : 'dash' },
      ],
      itemIntensity: items,
    })
    setScreen({ type: 'local', config, humanIds: [profile.id, secondId] })
  }

  const hostOnline = () => {
    const request: CreateRoomRequest = {
      mode,
      itemIntensity: items,
      aiDifficulty: difficulty,
      aiSlots: Math.min(mode === 'duel' ? 1 : 3, aiSlots),
      hostName: profile.name,
      hostAbility: ability,
    }
    setScreen({ type: 'online', request })
  }

  const record = useCallback((state: GameState, playerId = profile.id) => {
    setProfile((current) => recordResult(current, state, playerId))
  }, [profile.id])

  if (screen.type === 'local') {
    return <Shell profile={profile} settingsOpen={() => setSettingsOpen(true)}><LocalMatch config={screen.config} humanPlayerIds={screen.humanIds} effects={effects} muted={settings.muted} onExit={() => setScreen({ type: 'home' })} onResult={(state) => record(state)} /></Shell>
  }
  if (screen.type === 'online') {
    return <Shell profile={profile} settingsOpen={() => setSettingsOpen(true)}><OnlineRoom serverUrl={ROOM_SERVER} roomCode={screen.roomCode} createRequest={screen.request} identity={{ guestId: profile.id, displayName: profile.name, ability }} effects={effects} muted={settings.muted} onExit={() => setScreen({ type: 'home' })} onResult={record} /></Shell>
  }

  return (
    <Shell profile={profile} settingsOpen={() => setSettingsOpen(true)}>
      <section className="pg-hero">
        <div className="pg-hero__copy">
          <p className="pg-kicker">A RackeTapp side game</p>
          <h1>PONG<span>!</span></h1>
          <p className="pg-hero__tagline">Four walls. One winner. Bend shots, burn cooldowns, steal power-ups, and make the court glow.</p>
          <div className="pg-feature-chips" aria-label="Game features">
            <span>1–4 players</span><span>AI rivals</span><span>4 skills</span><span>Reactive arena</span>
          </div>
          <div className="pg-action-grid">
            <button className="pg-action pg-action--primary" onClick={startAi}><strong>Play AI</strong><span>Instant match · honest opponents</span></button>
            <button className="pg-action" onClick={hostOnline}><strong>Host online</strong><span>Private room · up to four</span></button>
            <button className="pg-action" onClick={startLocal}><strong>Two-player local</strong><span>Keyboard or gamepads</span></button>
            <button className="pg-action" onClick={() => {
              const code = joinCode.trim().toUpperCase()
              if (/^[A-Z0-9]{6}$/.test(code)) setScreen({ type: 'online', roomCode: code })
            }}><strong>Join {joinCode ? joinCode.toUpperCase() : 'a room'}</strong><span>Enter a six-character code below</span></button>
          </div>
        </div>
        <div className="pg-hero__visual">
          <figure className="pg-arena-poster">
            <img src={`${import.meta.env.BASE_URL}arena-keyart.jpg`} alt="A four-sided neon Pong arena with one ball streaking toward the ember paddle" />
            <figcaption className="pg-arena-poster__hud">
              <span><i /> LIVE ARENA</span>
              <strong>FOUR WALLS. FULL SEND.</strong>
            </figcaption>
          </figure>
        </div>
        <div className="pg-config">
          <div className="pg-config__head"><div><p className="pg-kicker">Match lab</p><h2>Build your rally</h2></div><span>{profile.matches} played · {profile.wins} won</span></div>
          <div className="pg-fields">
            <div className="pg-field"><label htmlFor="player-name">Player name</label><input id="player-name" maxLength={16} value={profile.name} onChange={(event) => updateProfile({ name: event.target.value.slice(0, 16) })} /></div>
            <div className="pg-field"><label htmlFor="mode">Mode</label><select id="mode" value={mode} onChange={(event) => { const next = event.target.value as GameMode; setMode(next); setAiSlots(next === 'duel' ? 1 : 0) }}><option value="duel">Classic Duel</option><option value="arena">Four-Side Arena</option><option value="crosscourt">Crosscourt 2v2</option></select></div>
            <div className="pg-field"><label htmlFor="ability">Signature skill</label><select id="ability" value={ability} onChange={(event) => { const next = event.target.value as AbilityId; setAbility(next); updateProfile({ favoriteAbility: next }) }}><option value="dash">Dash · reposition</option><option value="bend">Bend · curve next hit</option><option value="guard">Guard · one-hit shield</option><option value="pulse">Pulse · timed parry</option></select></div>
            <div className="pg-field"><label htmlFor="difficulty">AI level</label><select id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as AiDifficulty)}><option value="rookie">Rookie</option><option value="rally">Rally</option><option value="pro">Pro</option><option value="ace">Ace</option></select></div>
            <div className="pg-field"><label htmlFor="items">Power-ups</label><select id="items" value={items} onChange={(event) => setItems(event.target.value as ItemIntensity)}><option value="off">Off · pure</option><option value="standard">Standard · skillful chaos</option><option value="wild">Wild · party mode</option></select></div>
            <div className="pg-field"><label htmlFor="ai-slots">Online AI fill</label><select id="ai-slots" value={aiSlots} onChange={(event) => setAiSlots(Number(event.target.value))}><option value="0">None</option><option value="1">1 AI</option>{mode !== 'duel' && <option value="2">2 AI</option>}{mode !== 'duel' && <option value="3">3 AI</option>}</select></div>
            <div className="pg-field" style={{ gridColumn: '1 / -1' }}><label htmlFor="room-code">Room code</label><input id="room-code" inputMode="text" maxLength={6} placeholder="ABC123" value={joinCode} onChange={(event) => setJoinCode(event.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6))} /></div>
          </div>
          <div className="pg-status">Power-ups are contested by hitting their orb with the ball. Gameplay upgrades never come from progression.</div>
        </div>
      </section>
      {settingsOpen && <SettingsModal settings={settings} update={updateSettings} close={() => setSettingsOpen(false)} />}
    </Shell>
  )
}

function Shell({ profile, settingsOpen, children }: { profile: GuestProfile; settingsOpen: () => void; children: React.ReactNode }) {
  return <div className="pg-shell"><header className="pg-header"><Logo/><div className="pg-header__actions"><span className="pg-pill pg-header__account-label">{profile.name} · {profile.wins}W</span><button className="pg-icon-button" aria-label="Game settings" onClick={settingsOpen}>⚙</button></div></header><main className="pg-main">{children}</main><footer className="pg-footer">PONG! · built in the RackeTapp visual family · guest-first, no tracking</footer></div>
}

function SettingsModal({ settings, update, close }: { settings: AppSettings; update: (patch: Partial<AppSettings>) => void; close: () => void }) {
  return <div className="pg-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close() }}><section className="pg-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="pg-config__head"><div><p className="pg-kicker">Comfort controls</p><h2 id="settings-title">Game settings</h2></div><button className="pg-icon-button" onClick={close} aria-label="Close settings">×</button></div><label className="pg-toggle"><span><strong>Mute audio</strong><br/><small>Silence match effects</small></span><input type="checkbox" checked={settings.muted} onChange={(event) => update({ muted: event.target.checked })}/></label><label className="pg-toggle"><span><strong>Reduced motion</strong><br/><small>Minimize trails and particles</small></span><input type="checkbox" checked={settings.reducedMotion} onChange={(event) => update({ reducedMotion: event.target.checked })}/></label><label className="pg-toggle"><span><strong>Screen shake</strong><br/><small>Impact response on scores</small></span><input type="checkbox" checked={settings.screenShake} onChange={(event) => update({ screenShake: event.target.checked })}/></label><div className="pg-field"><label htmlFor="effects">Effect density</label><select id="effects" value={settings.effectDensity} onChange={(event) => update({ effectDensity: event.target.value as AppSettings['effectDensity'] })}><option value="low">Low</option><option value="standard">Standard</option><option value="high">High</option></select></div><button className="pg-primary-button" onClick={close}>Done</button></section></div>
}
