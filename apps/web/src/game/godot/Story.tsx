import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { STORY_BANTER, storyChoiceUnavailable, storyCrewName, storyEncounter, storyReflections, type RescueAction, type RescueState, type StoryBanterId } from '@pongapp/game-core'
import { SongControls, type StorySong } from './StorySong'
import { MangaPanel, SEA_MANGA } from './Manga'
import { ODYSSEY_SCENES } from './odyssey-content'

export function Dialog({ children, title, className = '', onClose }: { children: ReactNode; title: string; className?: string; onClose?: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [title])
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape' && onClose) { event.preventDefault(); onClose() }
    if (event.key !== 'Tab') return
    const items = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(el => el.getClientRects().length)
    const first = items[0], last = items.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <div className="story-backdrop" onPointerDown={event => event.stopPropagation()}><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={className} onKeyDown={keys} onKeyUp={event => event.stopPropagation()}>{children}</div></div>
}

export function StoryEncounter({ state, captain, connected, action, exit, song, inviteCode, invite }: { state: RescueState; captain: boolean; connected: boolean; action: (action: RescueAction) => void; exit: () => void; song: StorySong; inviteCode?: string; invite?: () => void }) {
  const story = state.story
  const [panel, setPanel] = useState(0)
  useEffect(() => { setPanel(0) }, [story?.pending, story?.result])
  if (!story?.pending) return null
  const scene = storyEncounter(state, story.pending), result = scene.choices.find(c => c.id === story.result)
  const finale = scene.id === 'home', opening = scene.id === 'watch'
  const beats = SEA_MANGA[scene.id], current = beats[panel % beats.length]!
  return <Dialog title={scene.title} className={'story-dialog manga-dialog' + (finale ? ' finale' : '')}>
    <MangaPanel beat={current} next={() => setPanel((panel + 1) % beats.length)} count={beats.length} index={panel % beats.length}/>
    <div className="story-content">
      <header className="story-heading"><p>{scene.chapter}</p><h1>{scene.title}</h1><div><span>{result ? 'WHAT WE CARRY FORWARD' : scene.speaker}</span><span className="story-paused">◷ SEA PAUSED</span></div></header>
      <div className="story-reading" key={scene.id + String(Boolean(result))} tabIndex={0}>
        {opening && inviteCode && <div className="crossing-story-invite"><strong>YOUR SHARED BOAT · {inviteCode}</strong><p>Your partner opens their installed Starling app and enters this code. The sea waits while you invite them.</p><button onClick={invite}>Invite your partner ↗</button></div>}
        {result ? <><p className="story-response">{result.response}</p><p className="story-kept">✧ Added to your logbook</p></> : <><p>{current.caption}</p><details className="crossing-read-more"><summary>Read the full scene</summary>{scene.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</details></>}
      </div>
      <div className="story-decision">
        {!result && <div className="story-resources"><span>Hull <b>{Math.ceil(state.ship.hp)} / {state.ship.maxHp}</b></span><span>Salvage <b>{state.campaign.salvage}</b></span></div>}
        <div className="story-choices">
          {result ? <button className="story-continue" data-story-continue={scene.id} disabled={!captain || !connected} onClick={() => action({ kind: 'story-continue', encounter: scene.id })}>{finale ? 'Let the new sea begin' : opening ? 'Take the first watch' : 'Back to the sea'} <span>→</span></button> : scene.choices.map(choice => {
            const unavailable = storyChoiceUnavailable(state, choice)
            return <button data-story-choice={choice.id} key={choice.id} disabled={!captain || !connected || Boolean(unavailable)} onClick={() => action({ kind: 'story-choice', encounter: scene.id, choice: choice.id })}><strong>{choice.label}</strong><small>{unavailable ?? choice.consequence}</small></button>
          })}
        </div>
        {!captain || !connected ? <p className="story-wait">{connected ? 'The captain is choosing. Your whole crew shares this moment.' : 'Connecting your crew…'}</p> : <p className="story-wait">Take your time. The sea waits while you decide.</p>}
        {(opening || finale || scene.id === 'small-hands') && <SongControls song={song} compact/>}
        <button className="story-save" onClick={exit}>Save & return home</button>
      </div>
    </div>
  </Dialog>
}

export function StoryJournal({ state, song, online, close }: { state: RescueState; song: StorySong; online: boolean; close: () => void }) {
  const history = state.story?.history ?? [], picked = (id: string) => history.find(r => r.encounter === id)?.choice
  const reflections = storyReflections(state)
  return <Dialog title="The Starling logbook" className="story-journal" onClose={close}>
    <header><div><p className="g-eyebrow">THE THINGS WE KEEP</p><h1>The Starling logbook</h1><p>{online ? 'Your shared sea keeps sailing outside this book.' : 'Your solo voyage is paused while you read.'}</p></div><button aria-label="Close logbook" className="g-round" onClick={close}>×</button></header>
    <div className="story-journal-pages">
      <div className="story-cast"><div><b>MARA · {online ? 'PLAYER ONE' : 'YOUR CAPTAIN'}</b><p>A young mother learning that keeping Finn safe and letting him grow are not always the same thing.</p></div><div><b>FINN · 9 · {online ? 'PLAYER TWO' : 'YOUR COMPANION'}</b><p>Her son. Whale-drawer, question-asker, stubbornly awake. His own small place in the crew.</p></div><div><b>LUMA · 4 · LITTLE WINGS</b><p>The youngest. Usually busy with her own small world below deck. Sometimes she swings in with a six-second silver shield, then goes back to being four. She does not need a player or a station.</p></div></div>
      <section className="story-keepsakes" aria-label="Family keepsakes">
        <article><span>◷</span><strong>The brass watch</strong><p>{picked('home') === 'pass' ? 'In Finn’s keeping, for the water ahead.' : picked('home') === 'compass' ? 'Beside the compass. Room for another pencil.' : picked('watch') === 'wind' ? 'Ticking again. Wound by two pairs of hands.' : picked('watch') === 'carry' ? 'Still at 11:17, safe in a yellow pocket.' : 'Waiting in the drawer beneath the charts.'}</p></article>
        <article><span>≈</span><strong>A whale on the chart</strong><p>{picked('whale') === 'whale' ? 'A new route. A scratched keel. His line stayed.' : picked('whale') ? 'A longer tail around the reef. A lesson shared.' : 'There is still space in the margins.'}</p></article>
        <article><span>⌁</span><strong>Grandad’s coat</strong><p>{picked('coat') === 'patch' ? 'Part of the hull now. A scrap in Finn’s pocket.' : picked('coat') ? 'Kept whole. It smells a little like Finn now.' : 'Too heavy for the weather. Too much to throw away.'}</p></article>
      </section>
      <h2>Our crossing <small>{history.length} / 8 moments</small></h2>
      {!history.length && <p className="story-empty">The first page is waiting. Your choices will be kept here.</p>}
      {history.map(entry => { const scene = storyEncounter(state, entry.encounter), choice = scene.choices.find(c => c.id === entry.choice)!; return <details key={entry.encounter} className="story-entry"><summary><span>{scene.chapter.slice(0, 2)}</span><div><strong>{scene.title}</strong><small>{choice.label}</small></div><b>＋</b></summary><div>{scene.paragraphs.map(p => <p key={p}>{p}</p>)}<blockquote>{choice.response}</blockquote><small>{choice.consequence}</small></div></details> })}
      {Boolean(state.story?.heard.length) && <section className="story-overheard"><h2>Heard aboard</h2>{state.story!.heard.map(id => { const b = STORY_BANTER[id as StoryBanterId]; return <div key={id}><p><b>{b.speaker}:</b> {b.line}</p><p>{b.reply}</p></div> })}</section>}
      <section className="story-growth" aria-label="Who we are becoming"><p className="g-eyebrow">EACH WAY I TURN</p><h2>Who we are becoming</h2><p className="story-growth-lyric">“Each way I turn is turning me.”</p>{reflections.length ? reflections.map(reflection => <article key={reflection.id}><h3>{reflection.title}</h3><p>{reflection.body}</p></article>) : <p className="story-empty">No verdict yet. The small things you do will find their way onto this page.</p>}<small>Reflections on your choices—not a score or a fixed idea of who you are.</small></section>
      {state.odyssey && <section className="story-odyssey-log" aria-label="Beneath unwritten stars"><h2>Part II · Beneath unwritten stars</h2><p className="g-small">{state.odyssey.pulse ? 'The sun’s last heartbeat is safe in the ship’s recordings.' : 'The last blue sky is waiting.'}</p>{state.odyssey.history.map(id => <details className="story-entry" key={id}><summary><div><strong>{ODYSSEY_SCENES[id].title}</strong><small>Mara · Finn · Luma</small></div><b>＋</b></summary><div><p>{ODYSSEY_SCENES[id].journal}</p></div></details>)}</section>}
      <SongControls song={song}/>
      <p className="story-source">Seven original recordings by Jonathan Gu. Tides of the Old World · family and inheritance. Each Way I Turn · choices and becoming. Three Hearts Inside a Stolen Ship · family beyond the charts. Four instrumentals fill the crossing. All seven recordings are included in the offline pack. <a href="https://suno.com/s/CM7yXgXxHqT7iF97" target="_blank" rel="noreferrer">Tides on Suno ↗</a></p>
    </div>
  </Dialog>
}

export function StoryBanter({ state }: { state: RescueState }) {
  const story = state.story, banter = story?.banter ? STORY_BANTER[story.banter as StoryBanterId] : null
  if (!banter || !story || story.pending || state.time - story.banterAt > 8 || state.phase !== 'playing') return null
  return <aside className="story-banter" aria-live="polite"><strong>{banter.speaker}</strong><p>{banter.line}</p><small>{banter.reply}</small></aside>
}
export function StoryFamily({ state }: { state: RescueState }) {
  if (!state.story) return null
  return <div className="story-family" aria-label="Family aboard">{[state.story.motherId, state.story.sonId].map(id => { const person = state.crew.find(c => c.id === id); return person ? <span key={id}><i className={id === state.story!.sonId ? 'finn' : 'mara'}>{id === state.story!.sonId ? 'F' : 'M'}</i><b>{storyCrewName(state, person)}</b><small>{id === state.story!.sonId ? '9 · ' : ''}{person.pet ? 'crew' : 'at your side'}</small></span> : null })}</div>
}
