import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildMatchConfig,
  seatIdentity,
  type AbilityId,
  type AiDifficulty,
  type GameMode,
  type GameState,
  type ItemIntensity,
  type MatchConfig,
} from '@pongapp/game-core'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { ABILITY_COPY, PLAYABLE_ABILITIES } from './game/abilityCopy'
import { LocalMatch } from './game/LocalMatch'
import { OnlineRoom } from './online/OnlineRoom'
import { loadProfile, loadSettings, recordResult, saveProfile, saveSettings, type AppSettings, type GuestProfile } from './store'

type Screen = { type: 'home' } | { type: 'local'; config: MatchConfig; humanIds: string[] } | { type: 'online'; roomCode?: string; request?: CreateRoomRequest; quickStart?: boolean }

const ROOM_SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD
  ? 'https://pongapp-room.fly.dev'
  : 'http://localhost:8080')

function roomFromHash(): string | undefined {
  const match = /^#\/room\/([A-Z0-9]{6})$/i.exec(window.location.hash)
  return match?.[1]?.toUpperCase()
}

function quickStartFromUrl(): boolean {
  return new URLSearchParams(window.location.search).get('quick') === '1'
}

function Logo() {
  return <span className="pg-brand"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#dfff68"/><rect x="6" y="8" width="3" height="16" rx="1.5" fill="#12231b"/><rect x="23" y="8" width="3" height="16" rx="1.5" fill="#12231b"/><circle cx="16" cy="16" r="3" fill="#12231b"/></svg><span>PONG<span className="pg-brand__bang">!</span></span></span>
}

export default function App() {
  const [profile, setProfile] = useState<GuestProfile>(() => loadProfile())
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [screen, setScreen] = useState<Screen>(() => roomFromHash() ? { type: 'online', roomCode: roomFromHash(), quickStart: quickStartFromUrl() } : { type: 'home' })
  const [mode, setMode] = useState<GameMode>('arena')
  const [ability, setAbility] = useState<AbilityId>(profile.favoriteAbility)
  const [difficulty, setDifficulty] = useState<AiDifficulty>('rally')
  const [items, setItems] = useState<ItemIntensity>('standard')
  const [aiSlots, setAiSlots] = useState(1)
  const [joinCode, setJoinCode] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
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
      mode: 'duel',
      humanPlayers: [{ id: profile.id, name: profile.name, ability }],
      totalPlayers: 2,
      aiDifficulty: difficulty,
      itemIntensity: 'off',
      mutator: 'none',
    })
    setScreen({ type: 'local', config, humanIds: [profile.id] })
  }

  /**
   * Pass and play: two people, one device, one at each end of it.
   *
   * The seating is `vertical` rather than the arcade default, which is not a
   * style choice — on a portrait phone a left/right duel puts both players
   * reaching across the screen with each hand covering the other's half of the
   * court. Bottom and top gives each player their own end of the device, and
   * `GameCourt` routes each touch to whichever seat's wall it is nearest.
   */
  const startLocal = () => {
    const secondId = 'local-player-two'
    const config = buildMatchConfig({
      mode: 'duel',
      axis: 'vertical',
      humanPlayers: [
        { id: profile.id, name: profile.name, ability },
        { id: secondId, name: 'Player Two', ability: ability === 'dash' ? 'pulse' : 'dash' },
      ],
      itemIntensity: 'off',
      mutator: 'none',
    })
    setScreen({ type: 'local', config, humanIds: [profile.id, secondId] })
  }

  /**
   * One tap to a shareable 1v1. Hosting a room normally inherits whatever the
   * match lab is set to; this deliberately ignores all of it and opens a plain
   * duel with no AI filling the other paddle, because the whole point is that
   * the other paddle is the person you are about to send the link to.
   */
  const startPhoneDuel = () => {
    setScreen({
      type: 'online',
      quickStart: true,
      request: {
        mode: 'duel',
        itemIntensity: 'off',
        aiDifficulty: difficulty,
        aiSlots: 0,
        mutator: 'none',
        hostName: profile.name,
        hostAbility: ability,
      },
    })
  }

  const hostOnline = () => {
    const partyMode = mode === 'duel' ? 'arena' : mode
    const request: CreateRoomRequest = {
      mode: partyMode,
      itemIntensity: items,
      aiDifficulty: difficulty,
      aiSlots: Math.min(3, aiSlots),
      mutator: 'none',
      hostName: profile.name,
      hostAbility: ability,
    }
    setScreen({ type: 'online', request })
  }

  const startPractice = () => {
    const config = buildMatchConfig({
      mode: 'duel',
      humanPlayers: [{ id: profile.id, name: profile.name, ability }],
      totalPlayers: 2,
      aiDifficulty: 'rookie',
      itemIntensity: 'off',
      mutator: 'none',
    })
    config.scoreToWin = 3
    setScreen({ type: 'local', config, humanIds: [profile.id] })
  }

  const record = useCallback((state: GameState, playerId = profile.id) => {
    setProfile((current) => recordResult(current, state, playerId))
  }, [profile.id])

  if (screen.type === 'local') {
    return <><Shell settingsOpen={() => setSettingsOpen(true)}><LocalMatch config={screen.config} humanPlayerIds={screen.humanIds} effects={effects} muted={settings.muted} onExit={() => setScreen({ type: 'home' })} onResult={(state) => record(state)} /></Shell>{settingsOpen && <SettingsModal settings={settings} update={updateSettings} close={() => setSettingsOpen(false)} />}</>
  }
  if (screen.type === 'online') {
    return <><Shell settingsOpen={() => setSettingsOpen(true)}><OnlineRoom serverUrl={ROOM_SERVER} roomCode={screen.roomCode} createRequest={screen.request} quickStart={screen.quickStart} identity={{ guestId: profile.id, displayName: profile.name, ability }} effects={effects} muted={settings.muted} onExit={() => setScreen({ type: 'home' })} onResult={record} /></Shell>{settingsOpen && <SettingsModal settings={settings} update={updateSettings} close={() => setSettingsOpen(false)} />}</>
  }

  return (
    <Shell settingsOpen={() => setSettingsOpen(true)}>
      <section className="pg-hero">
        <div className="pg-hero__copy">
          <p className="pg-kicker">A RackeTapp side game</p>
          <h1>PONG<span>!</span></h1>
          <p className="pg-hero__tagline">Return the ball. Break their wall.</p>
          <div className="pg-launch-grid">
            <button className="pg-launch pg-launch--primary" onClick={startAi}>
              <SeatGlyph kind="solo" />
              <span className="pg-launch__text"><strong>Quick Duel</strong><small>Clean 1v1 against AI</small></span>
            </button>
            <button className="pg-launch" onClick={startPhoneDuel}>
              <SeatGlyph kind="phones" />
              <span className="pg-launch__text"><strong>Play a Friend</strong><small>Share a 1v1 link</small></span>
            </button>
            <button className="pg-launch" onClick={startLocal}>
              <SeatGlyph kind="pass" />
              <span className="pg-launch__text"><strong>Same Phone</strong><small>Bottom versus top</small></span>
            </button>
            <button className="pg-launch" onClick={hostOnline}>
              <SeatGlyph kind="room" />
              <span className="pg-launch__text"><strong>Party</strong><small>Three or four players</small></span>
            </button>
          </div>

          <div className="pg-home-links">
            <button type="button" onClick={() => setJoinOpen((open) => !open)}>Join code</button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={startPractice}>Practice</button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => document.getElementById('party-lab')?.toggleAttribute('open')}>Tune game</button>
          </div>

          {joinOpen && (
            <form
              className="pg-join-inline"
              onSubmit={(event) => {
                event.preventDefault()
                const code = joinCode.trim().toUpperCase()
                if (/^[A-Z0-9]{6}$/.test(code)) setScreen({ type: 'online', roomCode: code })
              }}
            >
              <label className="pg-visually-hidden" htmlFor="join-code">Six-character room code</label>
              <input
                id="join-code"
                className="pg-join-inline__input"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={6}
                placeholder="ROOM CODE"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6))}
              />
              <button className="pg-launch__go" type="submit" disabled={!/^[A-Z0-9]{6}$/i.test(joinCode)}>Join room</button>
            </form>
          )}
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
        <details className="pg-lab" id="party-lab">
          <summary className="pg-lab__summary">
            <span><strong>Racket &amp; party lab</strong><small>Skill, AI level and party rules</small></span>
            <span className="pg-lab__record">{profile.matches} played · {profile.wins} won{profile.bestRally > 0 ? ` · best rally ${profile.bestRally}` : ''}</span>
          </summary>
          <div className="pg-fields">
            <div className="pg-field"><label htmlFor="player-name">Player name</label><input id="player-name" maxLength={16} value={profile.name} onChange={(event) => updateProfile({ name: event.target.value.slice(0, 16) })} /></div>
            <div className="pg-field"><label htmlFor="mode">Party format</label><select id="mode" value={mode} onChange={(event) => setMode(event.target.value as GameMode)}><option value="arena">Arena · every wall for itself</option><option value="crosscourt">Crosscourt · 2v2 teams</option></select></div>
            <div className="pg-field">
              <label htmlFor="ability">Your skill</label>
              <select id="ability" value={ability} onChange={(event) => { const next = event.target.value as AbilityId; setAbility(next); updateProfile({ favoriteAbility: next }) }}>
                {PLAYABLE_ABILITIES.map((id) => (
                  <option key={id} value={id}>{ABILITY_COPY[id].menu}</option>
                ))}
              </select>
            </div>
            <div className="pg-field"><label htmlFor="difficulty">AI level</label><select id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as AiDifficulty)}><option value="rookie">Rookie · misses a lot</option><option value="rally">Steady · a fair game</option><option value="pro">Pro · punishes mistakes</option><option value="ace">Ace · nearly perfect</option></select></div>
            <div className="pg-field"><label htmlFor="items">Party power-ups</label><select id="items" value={items} onChange={(event) => setItems(event.target.value as ItemIntensity)}><option value="off">Off · pure Pong</option><option value="standard">Standard · readable</option><option value="wild">Wild · constant chaos</option></select></div>
            <div className="pg-field"><label htmlFor="ai-slots">Fill empty party seats</label><select id="ai-slots" value={aiSlots} onChange={(event) => setAiSlots(Number(event.target.value))}><option value="0">Wait for people</option><option value="1">1 AI</option><option value="2">2 AI</option><option value="3">3 AI</option></select></div>
          </div>
          <div className="pg-skill-explainer">
            <span>Selected skill</span>
            <strong>{ABILITY_COPY[ability].label}</strong>
            <p>{ABILITY_COPY[ability].action}</p>
          </div>
        </details>
      </section>
      {settingsOpen && <SettingsModal settings={settings} update={updateSettings} close={() => setSettingsOpen(false)} />}
    </Shell>
  )
}

/**
 * A 26px diagram of who is on the court, drawn rather than described.
 *
 * "Two-player local" and "Host online" are four words each and look identical in
 * a list; a picture of two paddles facing each other versus four paddles on
 * every wall is read before the label is. Paddles are drawn in the real seat
 * colours from the shared palette, so the glyph on the button and the paddle in
 * the match are the same colour by construction.
 */
function SeatGlyph({ kind }: { kind: 'solo' | 'pass' | 'phones' | 'room' }) {
  const lime = seatIdentity(0).hex
  const ember = seatIdentity(1).hex
  const cyan = seatIdentity(2).hex
  const violet = seatIdentity(3).hex
  return (
    <svg className="pg-launch__glyph" viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="24" height="24" rx="6" className="pg-launch__glyph-court" />
      {kind === 'solo' && <>
        <rect x="8" y="21" width="10" height="2.4" rx="1.2" fill={lime} />
        <rect x="8" y="2.6" width="10" height="2.4" rx="1.2" fill={ember} opacity=".5" />
        <circle cx="13" cy="13" r="2" fill="currentColor" />
      </>}
      {kind === 'pass' && <>
        <rect x="8" y="21" width="10" height="2.4" rx="1.2" fill={lime} />
        <rect x="8" y="2.6" width="10" height="2.4" rx="1.2" fill={ember} />
        <path d="M13 9.5v7" strokeWidth="1.2" strokeDasharray="2 2" className="pg-launch__glyph-line" />
      </>}
      {kind === 'phones' && <>
        <rect x="2.5" y="5" width="9" height="16" rx="2.2" strokeWidth="1.4" className="pg-launch__glyph-line" />
        <rect x="14.5" y="5" width="9" height="16" rx="2.2" strokeWidth="1.4" className="pg-launch__glyph-line" />
        <rect x="4.5" y="17.5" width="5" height="1.8" rx=".9" fill={lime} />
        <rect x="16.5" y="6.7" width="5" height="1.8" rx=".9" fill={ember} />
      </>}
      {kind === 'room' && <>
        <rect x="8" y="21" width="10" height="2.4" rx="1.2" fill={lime} />
        <rect x="8" y="2.6" width="10" height="2.4" rx="1.2" fill={ember} />
        <rect x="2.6" y="8" width="2.4" height="10" rx="1.2" fill={cyan} />
        <rect x="21" y="8" width="2.4" height="10" rx="1.2" fill={violet} />
      </>}
    </svg>
  )
}

function Shell({ settingsOpen, children }: { settingsOpen: () => void; children: React.ReactNode }) {
  return <div className="pg-shell"><header className="pg-header"><Logo/><button className="pg-icon-button" aria-label="Game settings" onClick={settingsOpen}>⚙</button></header><main className="pg-main">{children}</main></div>
}

function SettingsModal({ settings, update, close }: { settings: AppSettings; update: (patch: Partial<AppSettings>) => void; close: () => void }) {
  return <div className="pg-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close() }}><section className="pg-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="pg-config__head"><div><p className="pg-kicker">Comfort controls</p><h2 id="settings-title">Game settings</h2></div><button className="pg-icon-button" onClick={close} aria-label="Close settings">×</button></div><label className="pg-toggle"><span><strong>Mute audio</strong><br/><small>Silence match effects</small></span><input type="checkbox" checked={settings.muted} onChange={(event) => update({ muted: event.target.checked })}/></label><label className="pg-toggle"><span><strong>Reduced motion</strong><br/><small>Minimize trails and particles</small></span><input type="checkbox" checked={settings.reducedMotion} onChange={(event) => update({ reducedMotion: event.target.checked })}/></label><label className="pg-toggle"><span><strong>Screen shake</strong><br/><small>Impact response on scores</small></span><input type="checkbox" checked={settings.screenShake} onChange={(event) => update({ screenShake: event.target.checked })}/></label><div className="pg-field"><label htmlFor="effects">Effect density</label><select id="effects" value={settings.effectDensity} onChange={(event) => update({ effectDensity: event.target.value as AppSettings['effectDensity'] })}><option value="low">Low · no shaders</option><option value="standard">Standard · balanced</option><option value="high">High · cinematic</option></select></div><button className="pg-primary-button" onClick={close}>Done</button></section></div>
}
