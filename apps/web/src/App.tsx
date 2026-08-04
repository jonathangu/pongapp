import { useCallback, useMemo, useState } from 'react'
import { buildMatchConfig, type AiDifficulty, type GameState, type MatchConfig } from '@pongapp/game-core'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { LocalMatch } from './game/LocalMatch'
import { OnlineRoom } from './online/OnlineRoom'
import { normalizeRoomCode, pongHomeUrlFor } from './online/invite'
import { loadProfile, loadSettings, recordResult, saveProfile, saveSettings, type AppSettings, type GuestProfile } from './store'

type Screen =
  | { type: 'home' }
  | { type: 'local'; config: MatchConfig; humanIds: string[] }
  | { type: 'online'; roomCode?: string; request?: CreateRoomRequest }

const ROOM_SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD
  ? 'https://pongapp-room.fly.dev'
  : 'http://localhost:8080')

function roomFromHash(): string | undefined {
  const match = /^#\/room\/([^/]+)$/i.exec(window.location.hash)
  return normalizeRoomCode(match?.[1] ?? '') ?? undefined
}

function Logo() {
  return <span className="pg-brand"><svg viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="11" fill="#dfff68"/><circle cx="10" cy="25" r="5" fill="#12231b"/><circle cx="26" cy="11" r="5" fill="#12231b"/><circle cx="18" cy="18" r="3.2" fill="#f36f44"/><path d="m16 7 2-3 2 3 3-2-1 5h-8l-1-5z" fill="#12231b"/></svg><span>PAL DUEL<span className="pg-brand__bang">!</span></span></span>
}

function PalPreview({ kind }: { kind: 'guard' | 'striker' | 'captain' }) {
  return <span className={`pg-pal-preview pg-pal-preview--${kind}`} aria-hidden="true"><i /><b>{kind === 'captain' ? '♛' : kind === 'striker' ? '〰➤' : '◖●◗'}</b><i /></span>
}

export default function App() {
  const [profile, setProfile] = useState<GuestProfile>(() => loadProfile())
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [screen, setScreen] = useState<Screen>(() => roomFromHash() ? { type: 'online', roomCode: roomFromHash() } : { type: 'home' })
  const [difficulty, setDifficulty] = useState<AiDifficulty>('rally')
  const [joinCode, setJoinCode] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const effects = useMemo(() => ({ reducedMotion: settings.reducedMotion, screenShake: settings.screenShake, effectDensity: settings.effectDensity }), [settings])
  const onlineIdentity = useMemo(() => ({ guestId: profile.id, displayName: profile.name }), [profile.id, profile.name])

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
  const home = () => {
    window.history.replaceState(null, '', pongHomeUrlFor(window.location.origin, import.meta.env.BASE_URL))
    setScreen({ type: 'home' })
  }
  const startAi = () => setScreen({
    type: 'local',
    config: buildMatchConfig({ humanPlayers: [{ id: profile.id, name: profile.name }], aiDifficulty: difficulty }),
    humanIds: [profile.id],
  })
  const startLocal = () => {
    const secondId = 'local-player-two'
    setScreen({
      type: 'local',
      config: buildMatchConfig({ humanPlayers: [{ id: profile.id, name: profile.name }, { id: secondId, name: 'Player Two' }] }),
      humanIds: [profile.id, secondId],
    })
  }
  const startFriend = () => setScreen({ type: 'online', request: { hostName: profile.name } })
  const join = () => {
    const code = normalizeRoomCode(joinCode)
    if (code) setScreen({ type: 'online', roomCode: code })
  }
  const record = useCallback((state: GameState, playerId = profile.id) => {
    setProfile((current) => recordResult(current, state, playerId))
  }, [profile.id])

  if (screen.type === 'local') {
    return <LocalMatch config={screen.config} humanPlayerIds={screen.humanIds} effects={effects} muted={settings.muted} onExit={home} onResult={record} />
  }
  if (screen.type === 'online') {
    return <OnlineRoom serverUrl={ROOM_SERVER} roomCode={screen.roomCode} createRequest={screen.request} identity={onlineIdentity} effects={effects} muted={settings.muted} onExit={home} onResult={record} />
  }

  return (
    <div className="pg-app">
      <header className="pg-site-header"><Logo /><nav><button onClick={() => setHowOpen(true)}>How it works</button><button onClick={() => setSettingsOpen(true)}>Tune</button></nav></header>
      <main className="pg-home">
        <section className="pg-hero pg-hero--pal">
          <div className="pg-hero__copy">
            <p className="pg-kicker">A RackeTapp side game</p>
            <h1>SUMMON.<br/><span>RETURN.</span> WIN.</h1>
            <p className="pg-hero__tagline">Air hockey became a tiny-hero duel. Drag your round mallet anywhere, call persistent Pals, and command their wild signature moves.</p>
            <div className="pg-launch-grid pg-launch-grid--duel">
              <button className="pg-launch pg-launch--primary" onClick={startAi}><span className="pg-launch__icon">▶</span><span><strong>Quick Duel</strong><small>Play the AI now</small></span></button>
              <button className="pg-launch pg-launch--friend" onClick={startFriend}><span className="pg-launch__icon">↗</span><span><strong>Invite Friend</strong><small>One link · instant 1v1</small></span></button>
              <button className="pg-launch" onClick={startLocal}><span className="pg-launch__icon">↕</span><span><strong>Same Phone</strong><small>Bottom versus top</small></span></button>
              <button className="pg-launch" onClick={() => setJoinOpen((open) => !open)}><span className="pg-launch__icon">#</span><span><strong>Join Room</strong><small>Use a backup code</small></span></button>
            </div>
            {joinOpen && <div className="pg-join-row"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === 'Enter') join() }} placeholder="ROOM CODE" maxLength={6} aria-label="Room code"/><button onClick={join}>Join</button></div>}
            <div className="pg-quick-tune"><span>AI</span>{(['rookie', 'rally', 'pro', 'ace'] as const).map((level) => <button key={level} className={difficulty === level ? 'is-selected' : ''} onClick={() => setDifficulty(level)}>{level === 'rally' ? 'Steady' : level}</button>)}</div>
          </div>

          <div className="pg-hero__arena" aria-label="The three Paddle Pals">
            <div className="pg-hero__glow" />
            <div className="pg-pal-showcase pg-pal-showcase--guard"><PalPreview kind="guard"/><div><strong>BUMPER</strong><span>2 ✦ · steals & clears</span></div></div>
            <div className="pg-pal-showcase pg-pal-showcase--striker"><PalPreview kind="striker"/><div><strong>HOOK</strong><span>3 ✦ · lassos & bank-shots</span></div></div>
            <div className="pg-pal-showcase pg-pal-showcase--captain"><PalPreview kind="captain"/><div><strong>CAPTAIN</strong><span>6 ✦ · raids open posts</span></div></div>
            <div className="pg-hero-ball" />
          </div>
        </section>

        <section className="pg-home-strip">
          <div><strong>{profile.matches}</strong><span>duels</span></div><div><strong>{profile.wins}</strong><span>wins</span></div><div><strong>{profile.bestRally}</strong><span>best rally</span></div>
          <label><span>Player name</span><input value={profile.name} maxLength={16} onChange={(event) => updateProfile({ name: event.target.value || 'Player One' })}/></label>
        </section>

        <section className="pg-three-rules">
          <article><b>01</b><h2>Own the arena</h2><p>Drag your round mallet in every direction. Only the rival's protected goal pocket is off-limits.</p></article>
          <article><b>02</b><h2>Build your squad</h2><p>Pal Power grows every five seconds and from clean strikes. Pals stay, fight, carry, and take several hits.</p></article>
          <article><b>03</b><h2>Call—and command</h2><p>Tap a card to call a Pal. Tap its lit card again for a steal, lasso, raid, or Power Star super.</p></article>
        </section>
      </main>

      {howOpen && <HowToPlay close={() => setHowOpen(false)} />}
      {settingsOpen && <SettingsModal settings={settings} update={updateSettings} close={() => setSettingsOpen(false)} />}
    </div>
  )
}

function HowToPlay({ close }: { close: () => void }) {
  return <div className="pg-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section className="pg-modal" role="dialog" aria-modal="true" aria-labelledby="how-title"><button className="pg-modal__close" onClick={close}>Close</button><p className="pg-kicker">Pal Duel manual</p><h2 id="how-title">Air hockey, with tiny heroes</h2><div className="pg-how-grid"><article><PalPreview kind="guard"/><h3>Bumper · 2 energy · 4 hearts</h3><p>Guards your end, steals from enemy carriers, and clears danger. Command Bumper to attack the immediate threat.</p></article><article><PalPreview kind="striker"/><h3>Hook · 3 energy · 3 hearts</h3><p>Throws a rope from range, reels the puck in, then attacks a camper with an open-post or bank shot. Hit the puck or Hook to cut an enemy tether.</p></article><article><PalPreview kind="captain"/><h3>Captain · 6 energy · 5 hearts</h3><p>Crosses midfield to raid enemy ice, grabs the puck, and shoots around the goalie. A powered Captain leaves three Hatchlings after a knockout.</p></article></div><ul><li>Drag your circular mallet freely across the arena; the opponent's goal pocket is protected.</li><li>A goalie sitting still cannot cover the widened goal: the AI and attacking Pals read the open post.</li><li>You gain one energy every five active seconds, plus one after every three clean strikes.</li><li>Tap an active Pal's card again to issue its signature command.</li><li>A big Power Star appears about every 15 seconds. Your Pals chase it and gain a role-specific super.</li><li>First to five wins. A tied 2:30 clock becomes one-goal Final Volley.</li></ul></section></div>
}

function SettingsModal({ settings, update, close }: { settings: AppSettings; update: (patch: Partial<AppSettings>) => void; close: () => void }) {
  return <div className="pg-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section className="pg-modal pg-modal--settings" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="pg-modal__close" onClick={close}>Close</button><p className="pg-kicker">Tune the arena</p><h2 id="settings-title">Effects & comfort</h2><label className="pg-toggle"><span><strong>Sound</strong><small>Procedural Pal chirps and impact cues</small></span><input type="checkbox" checked={!settings.muted} onChange={(event) => update({ muted: !event.target.checked })}/></label><label className="pg-toggle"><span><strong>Screen punch</strong><small>Small camera hits on saves and goals</small></span><input type="checkbox" checked={settings.screenShake} onChange={(event) => update({ screenShake: event.target.checked })}/></label><label className="pg-toggle"><span><strong>Reduced motion</strong><small>Remove shake and dense particle motion</small></span><input type="checkbox" checked={settings.reducedMotion} onChange={(event) => update({ reducedMotion: event.target.checked })}/></label><div className="pg-field"><label htmlFor="density">Effect density</label><select id="density" value={settings.effectDensity} onChange={(event) => update({ effectDensity: event.target.value as AppSettings['effectDensity'] })}><option value="low">Low · fastest</option><option value="standard">Standard</option><option value="high">High · maximum glow</option></select></div></section></div>
}
