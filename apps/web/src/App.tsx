import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ABILITY_COOLDOWNS,
  buildMatchConfig,
  POWER_UP_IDENTITIES,
  seatIdentity,
  SEAT_PALETTE,
  TICK_RATE,
  type AbilityId,
  type AiDifficulty,
  type GameMode,
  type GameState,
  type ItemIntensity,
  type MatchConfig,
  type MatchMutator,
  type PowerUpId,
} from '@pongapp/game-core'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { ABILITY_COPY } from './game/abilityCopy'
import { LocalMatch } from './game/LocalMatch'
import { OnlineRoom } from './online/OnlineRoom'
import { loadProfile, loadSettings, recordResult, saveProfile, saveSettings, type AppSettings, type GuestProfile } from './store'

type Screen = { type: 'home' } | { type: 'local'; config: MatchConfig; humanIds: string[] } | { type: 'online'; roomCode?: string; request?: CreateRoomRequest; quickStart?: boolean }

const ROOM_SERVER = import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD
  ? 'https://pongapp-room.pongapp-room-worker.workers.dev'
  : 'http://localhost:8787')

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
  const [mode, setMode] = useState<GameMode>('duel')
  const [ability, setAbility] = useState<AbilityId>(profile.favoriteAbility)
  const [difficulty, setDifficulty] = useState<AiDifficulty>('rally')
  const [items, setItems] = useState<ItemIntensity>('standard')
  const [mutator, setMutator] = useState<MatchMutator>('none')
  const [aiSlots, setAiSlots] = useState(1)
  const [joinCode, setJoinCode] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

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
      mutator,
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
      itemIntensity: items,
      mutator,
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
        itemIntensity: items,
        aiDifficulty: difficulty,
        aiSlots: 0,
        mutator,
        hostName: profile.name,
        hostAbility: ability,
      },
    })
  }

  const hostOnline = () => {
    const request: CreateRoomRequest = {
      mode,
      itemIntensity: items,
      aiDifficulty: difficulty,
      aiSlots: Math.min(mode === 'duel' ? 1 : 3, aiSlots),
      mutator,
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
    return <Shell profile={profile} settingsOpen={() => setSettingsOpen(true)}><OnlineRoom serverUrl={ROOM_SERVER} roomCode={screen.roomCode} createRequest={screen.request} quickStart={screen.quickStart} identity={{ guestId: profile.id, displayName: profile.name, ability }} effects={effects} muted={settings.muted} onExit={() => setScreen({ type: 'home' })} onResult={record} /></Shell>
  }

  return (
    <Shell profile={profile} settingsOpen={() => setSettingsOpen(true)}>
      <section className="pg-hero">
        <div className="pg-hero__copy">
          <p className="pg-kicker">A RackeTapp side game</p>
          <h1>PONG<span>!</span></h1>
          <p className="pg-hero__tagline">You are the paddle at the bottom. Drag to move, keep the ball out of your end, and hit the glowing orbs to steal a power-up.</p>
          <div className="pg-feature-chips" aria-label="Game features">
            <span>1–4 players</span><span>AI rivals</span><span>4 skills</span><span>Reactive arena</span>
          </div>
          {/*
            Skinny two-column rows, not cards.
            The old grid used 94px stacked cards with a hover lift, which meant
            four actions filled a phone screen, the two most useful ones were
            below the fold, and every pointer move made the page twitch. A row is
            the shortest shape that still fits a glyph, a name and one line of
            what it does — so six actions fit where four used to, and the only
            thing that moves on hover is the border.
          */}
          <div className="pg-launch-grid">
            <button className="pg-launch pg-launch--primary" onClick={startAi}>
              <SeatGlyph kind="solo" />
              <span className="pg-launch__text"><strong>Play now</strong><small>You against the computer</small></span>
            </button>
            <button className="pg-launch" onClick={startLocal}>
              <SeatGlyph kind="pass" />
              <span className="pg-launch__text"><strong>Pass &amp; play</strong><small>Two on this phone, one at each end</small></span>
            </button>
            <button className="pg-launch" onClick={startPhoneDuel}>
              <SeatGlyph kind="phones" />
              <span className="pg-launch__text"><strong>Two phones</strong><small>Send a link, play 1v1</small></span>
            </button>
            <button className="pg-launch" onClick={hostOnline}>
              <SeatGlyph kind="room" />
              <span className="pg-launch__text"><strong>Host a room</strong><small>Up to four players</small></span>
            </button>
            <form
              className="pg-launch pg-launch--join"
              onSubmit={(event) => {
                event.preventDefault()
                const code = joinCode.trim().toUpperCase()
                if (/^[A-Z0-9]{6}$/.test(code)) setScreen({ type: 'online', roomCode: code })
              }}
            >
              <SeatGlyph kind="code" />
              <label className="pg-visually-hidden" htmlFor="join-code">Six-character room code</label>
              <input
                id="join-code"
                className="pg-launch__input"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={6}
                placeholder="ROOM CODE"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6))}
              />
              <button className="pg-launch__go" type="submit" disabled={!/^[A-Z0-9]{6}$/i.test(joinCode)}>Join</button>
            </form>
            <button className="pg-launch" onClick={() => setHelpOpen(true)}>
              <SeatGlyph kind="help" />
              <span className="pg-launch__text"><strong>How to play</strong><small>Controls, skills, power-ups</small></span>
            </button>
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
        {/*
          The match lab is now closed by default.
          Six selects were the first thing a new player met, above the fold,
          before anything explained what a "signature skill" or an "item
          intensity" was. The defaults are good; someone arriving from a shared
          link should be in a rally without reading any of this.
        */}
        <details className="pg-lab">
          <summary className="pg-lab__summary">
            <span><strong>Match settings</strong><small>Mode, skill, AI level, power-ups</small></span>
            <span className="pg-lab__record">{profile.matches} played · {profile.wins} won{profile.bestRally > 0 ? ` · best rally ${profile.bestRally}` : ''}</span>
          </summary>
          <div className="pg-fields">
            <div className="pg-field"><label htmlFor="player-name">Player name</label><input id="player-name" maxLength={16} value={profile.name} onChange={(event) => updateProfile({ name: event.target.value.slice(0, 16) })} /></div>
            <div className="pg-field"><label htmlFor="mode">Mode</label><select id="mode" value={mode} onChange={(event) => { const next = event.target.value as GameMode; setMode(next); setAiSlots(next === 'duel' ? 1 : 0) }}><option value="duel">Duel · 1v1</option><option value="arena">Arena · 4 players, every wall</option><option value="crosscourt">Crosscourt · 2v2</option></select></div>
            <div className="pg-field">
              <label htmlFor="ability">Your skill</label>
              <select id="ability" value={ability} onChange={(event) => { const next = event.target.value as AbilityId; setAbility(next); updateProfile({ favoriteAbility: next }) }}>
                {(Object.keys(ABILITY_COPY) as AbilityId[]).map((id) => (
                  <option key={id} value={id}>{ABILITY_COPY[id].menu}</option>
                ))}
              </select>
            </div>
            <div className="pg-field"><label htmlFor="difficulty">AI level</label><select id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as AiDifficulty)}><option value="rookie">Rookie · misses a lot</option><option value="rally">Steady · a fair game</option><option value="pro">Pro · punishes mistakes</option><option value="ace">Ace · nearly perfect</option></select></div>
            <div className="pg-field"><label htmlFor="items">Power-ups</label><select id="items" value={items} onChange={(event) => setItems(event.target.value as ItemIntensity)}><option value="off">Off · pure Pong</option><option value="standard">Standard · an orb now and then</option><option value="wild">Wild · orbs constantly</option></select></div>
            <div className="pg-field">
              <label htmlFor="mutator">Rule twist</label>
              <select id="mutator" value={mutator} onChange={(event) => setMutator(event.target.value as MatchMutator)}>
                {(Object.keys(MUTATOR_COPY) as MatchMutator[]).map((id) => (
                  <option key={id} value={id}>{MUTATOR_COPY[id].label}</option>
                ))}
              </select>
              <p className="pg-field__note">{MUTATOR_COPY[mutator].detail}</p>
            </div>
            <div className="pg-field"><label htmlFor="ai-slots">Fill online seats with AI</label><select id="ai-slots" value={aiSlots} onChange={(event) => setAiSlots(Number(event.target.value))}><option value="0">None · wait for people</option><option value="1">1 AI</option>{mode !== 'duel' && <option value="2">2 AI</option>}{mode !== 'duel' && <option value="3">3 AI</option>}</select></div>
          </div>
          {/* The chosen skill explains itself here, including the visual tell to
              look for on court, rather than only being discoverable mid-match. */}
          <div className="pg-skill-explainer">
            <span>Your selected skill</span>
            <strong>{ABILITY_COPY[ability].label}</strong>
            <p>{ABILITY_COPY[ability].action}</p>
            <small>Visual cue: {ABILITY_COPY[ability].effect}</small>
          </div>
        </details>
      </section>
      {helpOpen && <HowToPlayModal close={() => setHelpOpen(false)} />}
      {settingsOpen && <SettingsModal settings={settings} update={updateSettings} close={() => setSettingsOpen(false)} />}
    </Shell>
  )
}

/**
 * Rule twists, in the player's words.
 *
 * The simulation calls these `MatchMutator` and applies them in four different
 * places; none of that is a name anyone would pick from a menu. Keyed off the
 * same union so a new twist cannot ship without copy.
 */
const MUTATOR_COPY: Record<MatchMutator, { label: string; detail: string }> = {
  none: { label: 'None · standard rules', detail: 'The normal game.' },
  bigBall: { label: 'Big ball', detail: 'A much larger ball. Easier to hit, far harder to place — angles get blunt and rallies run long.' },
  noWalls: { label: 'No walls', detail: 'The court wraps around. A ball that leaves one side reappears on the other, so nothing ever bounces back to you.' },
  doublePoints: { label: 'Double points', detail: 'Every point counts twice, on top of the rally bonus. Matches end fast and one long rally can win it.' },
  mirroredControls: { label: 'Mirrored controls', detail: 'Your paddle moves the opposite way to your hand. Applies to human players only — the AI is not confused by it.' },
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
function SeatGlyph({ kind }: { kind: 'solo' | 'pass' | 'phones' | 'room' | 'code' | 'help' }) {
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
      {kind === 'code' && <>
        <rect x="5" y="9" width="16" height="8" rx="2" strokeWidth="1.4" className="pg-launch__glyph-line" />
        <path d="M8.5 13h1.5M12.2 13h1.5M15.9 13h1.5" strokeWidth="1.6" strokeLinecap="round" className="pg-launch__glyph-line" />
      </>}
      {kind === 'help' && <>
        <circle cx="13" cy="13" r="8" strokeWidth="1.4" className="pg-launch__glyph-line" />
        <path d="M10.6 10.6a2.5 2.5 0 1 1 2.6 3v1.6" strokeWidth="1.6" strokeLinecap="round" className="pg-launch__glyph-line" />
        <circle cx="13.2" cy="18" r="1" fill="currentColor" />
      </>}
    </svg>
  )
}

/**
 * The manual, because there wasn't one.
 *
 * Everything here was previously either unexplained or buried in an `aria-label`
 * — including what a skill does, what the glowing orbs are, and the fact that
 * hitting the ball dead centre is rewarded. A player who cannot answer "what am
 * I looking at" is not going to discover any of it by losing.
 */
function HowToPlayModal({ close }: { close: () => void }) {
  return (
    <div className="pg-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close() }}>
      <section className="pg-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="pg-config__head">
          <div><p className="pg-kicker">The whole game</p><h2 id="help-title">How to play</h2></div>
          <button className="pg-icon-button" onClick={close} aria-label="Close">×</button>
        </div>

        <ol className="pg-help-list">
          <li><strong>You are the paddle at the bottom.</strong> Drag anywhere on the court to move it. Grab your paddle to slide it; press somewhere else and it jumps there. On a keyboard, hold <b>W</b>/<b>S</b> or the arrow keys.</li>
          <li><strong>Score by getting the ball past your opponent.</strong> If it goes past you, they score. First to the number shown above the court wins.</li>
          <li><strong>Long rallies are worth more.</strong> Past 8 hits the point counts double, past 16 it counts triple — the rally counter beside the score lights up when it happens. The court brightens as the ball speeds up, and a faster ball is harder for your opponent to meet cleanly.</li>
          <li><strong>Hit the ball dead centre for a perfect return.</strong> It fires back faster <em>and</em> takes half a second off your skill cooldown.</li>
          <li><strong>Whoever concedes serves next.</strong> The ball is held at the centre for a moment — slide your paddle during that pause to aim where it goes.</li>
          <li><strong>Glowing orbs are power-ups.</strong> Hit one <em>with the ball</em> to claim it — whoever touched the ball last gets the effect, so they are contested, not collected.</li>
        </ol>

        <div className="pg-help-section">
          <h3>The four skills</h3>
          <p className="pg-help-note">You pick one before the match. Tap the button under the court to use it, then wait for it to recharge.</p>
          <dl className="pg-help-grid">
            {(Object.keys(ABILITY_COPY) as AbilityId[]).map((id) => (
              <div key={id} className="pg-help-row">
                <dt>{ABILITY_COPY[id].label}<span>{Math.round(ABILITY_COOLDOWNS[id] / TICK_RATE)}s</span></dt>
                <dd>{ABILITY_COPY[id].action} <em>{ABILITY_COPY[id].effect}</em></dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="pg-help-section">
          <h3>The five power-ups</h3>
          <dl className="pg-help-grid">
            {(Object.keys(POWER_UP_IDENTITIES) as PowerUpId[]).map((id) => (
              <div key={id} className="pg-help-row">
                <dt style={{ color: POWER_UP_IDENTITIES[id].hex }}>{POWER_UP_IDENTITIES[id].label}</dt>
                <dd>{POWER_UP_IDENTITIES[id].effect}.</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="pg-help-section">
          <h3>Rule twists</h3>
          <p className="pg-help-note">Optional, set in Match settings before you start. They change the rules for everyone in the match, never just one player.</p>
          <dl className="pg-help-grid">
            {(Object.keys(MUTATOR_COPY) as MatchMutator[]).filter((id) => id !== 'none').map((id) => (
              <div key={id} className="pg-help-row">
                <dt>{MUTATOR_COPY[id].label}</dt>
                <dd>{MUTATOR_COPY[id].detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="pg-help-section">
          <h3>Telling players apart</h3>
          <p className="pg-help-note">Each seat has a colour <em>and</em> a mark cut into the paddle, so you can still tell whose is whose without relying on colour.</p>
          <ul className="pg-help-seats">
            {SEAT_PALETTE.map((seat) => (
              <li key={seat.key}>
                <span className={`pg-seat-mark pg-seat-mark--${seat.pattern}`} style={{ color: seat.hex }} aria-hidden="true" />
                {seat.label} — {seat.patternLabel}
              </li>
            ))}
          </ul>
        </div>

        <button className="pg-primary-button" onClick={close}>Got it</button>
      </section>
    </div>
  )
}

function Shell({ profile, settingsOpen, children }: { profile: GuestProfile; settingsOpen: () => void; children: React.ReactNode }) {
  return <div className="pg-shell"><header className="pg-header"><Logo/><div className="pg-header__actions"><span className="pg-pill pg-header__account-label">{profile.name} · {profile.wins}W</span><button className="pg-icon-button" aria-label="Game settings" onClick={settingsOpen}>⚙</button></div></header><main className="pg-main">{children}</main><footer className="pg-footer">PONG! · built in the RackeTapp visual family · guest-first, no tracking</footer></div>
}

function SettingsModal({ settings, update, close }: { settings: AppSettings; update: (patch: Partial<AppSettings>) => void; close: () => void }) {
  return <div className="pg-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close() }}><section className="pg-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="pg-config__head"><div><p className="pg-kicker">Comfort controls</p><h2 id="settings-title">Game settings</h2></div><button className="pg-icon-button" onClick={close} aria-label="Close settings">×</button></div><label className="pg-toggle"><span><strong>Mute audio</strong><br/><small>Silence match effects</small></span><input type="checkbox" checked={settings.muted} onChange={(event) => update({ muted: event.target.checked })}/></label><label className="pg-toggle"><span><strong>Reduced motion</strong><br/><small>Minimize trails and particles</small></span><input type="checkbox" checked={settings.reducedMotion} onChange={(event) => update({ reducedMotion: event.target.checked })}/></label><label className="pg-toggle"><span><strong>Screen shake</strong><br/><small>Impact response on scores</small></span><input type="checkbox" checked={settings.screenShake} onChange={(event) => update({ screenShake: event.target.checked })}/></label><div className="pg-field"><label htmlFor="effects">Effect density</label><select id="effects" value={settings.effectDensity} onChange={(event) => update({ effectDensity: event.target.value as AppSettings['effectDensity'] })}><option value="low">Low · no shaders</option><option value="standard">Standard · balanced</option><option value="high">High · cinematic</option></select></div><button className="pg-primary-button" onClick={close}>Done</button></section></div>
}
