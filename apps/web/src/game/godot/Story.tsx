import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { STORY_BANTER, storyChoiceUnavailable, storyCrewName, storyEncounter, type RescueAction, type RescueState, type StoryBanterId } from '@pongapp/game-core'
import familyArt from '../../assets/story/mara-finn-helm.png'
import { SongControls, type StorySong } from './StorySong'

function Dialog({ children, title, className = '', onClose }: { children: ReactNode; title: string; className?: string; onClose?: () => void }) {
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
    const items = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), summary, [tabindex="0"]')].filter(el => el.getClientRects().length)
    const first = items[0], last = items.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <div className="story-backdrop" onPointerDown={event => event.stopPropagation()}><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={className} onKeyDown={keys} onKeyUp={event => event.stopPropagation()}>{children}</div></div>
}

export function StoryEncounter({ state, captain, connected, action, exit, song }: { state: RescueState; captain: boolean; connected: boolean; action: (action: RescueAction) => void; exit: () => void; song: StorySong }) {
  const story = state.story
  if (!story?.pending) return null
  const scene = storyEncounter(state, story.pending), result = scene.choices.find(c => c.id === story.result)
  const finale = scene.id === 'home', opening = scene.id === 'watch'
  return <Dialog title={scene.title} className={'story-dialog' + (finale ? ' finale' : '')}>
    <div className="story-art"><img src={familyArt} alt="Mara helps nine-year-old Finn steer the Starling, her hand over his on the wheel."/><div><span>STARLING</span><p>{finale ? 'Different boat. Different blue.' : 'A mother. A son. The sea between.'}</p></div></div>
    <div className="story-content">
      <header className="story-heading"><p>{scene.chapter}</p><h1>{scene.title}</h1><div><span>{result ? 'WHAT WE CARRY FORWARD' : scene.speaker}</span><span className="story-paused">◷ SEA PAUSED</span></div></header>
      <div className="story-reading" key={scene.id + String(Boolean(result))} tabIndex={0}>
        {result ? <><p className="story-response">{result.response}</p><p className="story-kept">✧ Added to your logbook</p></> : scene.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
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
        {(opening || finale) && <SongControls song={song} compact/>}
        <button className="story-save" onClick={exit}>Save & return home</button>
      </div>
    </div>
  </Dialog>
}

export function StoryJournal({ state, song, online, close }: { state: RescueState; song: StorySong; online: boolean; close: () => void }) {
  const history = state.story?.history ?? [], picked = (id: string) => history.find(r => r.encounter === id)?.choice
  return <Dialog title="The Starling logbook" className="story-journal" onClose={close}>
    <header><div><p className="g-eyebrow">THE THINGS WE KEEP</p><h1>The Starling logbook</h1><p>{online ? 'Your shared sea keeps sailing outside this book.' : 'Your solo voyage is paused while you read.'}</p></div><button aria-label="Close logbook" className="g-round" onClick={close}>×</button></header>
    <div className="story-journal-pages">
      <div className="story-cast"><div><b>MARA</b><p>A young mother learning that keeping Finn safe and letting him grow are not always the same thing.</p></div><div><b>FINN · 9</b><p>Her son. Whale-drawer, question-asker, stubbornly awake. His own small place in the crew.</p></div></div>
      <section className="story-keepsakes" aria-label="Family keepsakes">
        <article><span>◷</span><strong>The brass watch</strong><p>{picked('home') === 'pass' ? 'In Finn’s keeping, for the water ahead.' : picked('home') === 'compass' ? 'Beside the compass. Room for another pencil.' : picked('watch') === 'wind' ? 'Ticking again. Wound by two pairs of hands.' : picked('watch') === 'carry' ? 'Still at 11:17, safe in a yellow pocket.' : 'Waiting in the drawer beneath the charts.'}</p></article>
        <article><span>≈</span><strong>A whale on the chart</strong><p>{picked('whale') === 'whale' ? 'A new route. A scratched keel. His line stayed.' : picked('whale') ? 'A longer tail around the reef. A lesson shared.' : 'There is still space in the margins.'}</p></article>
        <article><span>⌁</span><strong>Grandad’s coat</strong><p>{picked('coat') === 'patch' ? 'Part of the hull now. A scrap in Finn’s pocket.' : picked('coat') ? 'Kept whole. It smells a little like Finn now.' : 'Too heavy for the weather. Too much to throw away.'}</p></article>
      </section>
      <h2>Our crossing <small>{history.length} / 8 moments</small></h2>
      {!history.length && <p className="story-empty">The first page is waiting. Your choices will be kept here.</p>}
      {history.map(entry => { const scene = storyEncounter(state, entry.encounter), choice = scene.choices.find(c => c.id === entry.choice)!; return <details key={entry.encounter} className="story-entry"><summary><span>{scene.chapter.slice(0, 2)}</span><div><strong>{scene.title}</strong><small>{choice.label}</small></div><b>＋</b></summary><div>{scene.paragraphs.map(p => <p key={p}>{p}</p>)}<blockquote>{choice.response}</blockquote><small>{choice.consequence}</small></div></details> })}
      {Boolean(state.story?.heard.length) && <section className="story-overheard"><h2>Heard aboard</h2>{state.story!.heard.map(id => { const b = STORY_BANTER[id as StoryBanterId]; return <div key={id}><p><b>{b.speaker}:</b> {b.line}</p><p>{b.reply}</p></div> })}</section>}
      <SongControls song={song}/>
      <p className="story-source">Original song and story inspiration by Jonathan Gu. <a href="https://suno.com/s/CM7yXgXxHqT7iF97" target="_blank" rel="noreferrer">Listen on Suno ↗</a></p>
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
