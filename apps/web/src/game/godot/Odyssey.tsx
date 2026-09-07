import { useEffect, useState } from 'react'
import type { RescueAction, RescueState } from '@pongapp/game-core'
import { Dialog } from './Story'
import { MangaPanel } from './Manga'
import { ODYSSEY_SCENES } from './odyssey-content'
import { SongControls, type StorySong } from './StorySong'

export function OdysseyEncounter({ state, captain, connected, action, exit, song }: { state: RescueState; captain: boolean; connected: boolean; action: (action: RescueAction) => void; exit: () => void; song: StorySong }) {
  const id = state.odyssey?.pending
  const [panel, setPanel] = useState(0)
  useEffect(() => { setPanel(0) }, [id])
  if (!id) return null
  const scene = ODYSSEY_SCENES[id], current = scene.beats[panel % scene.beats.length]!
  return <Dialog title={scene.title} className="story-dialog manga-dialog odyssey-dialog"><MangaPanel beat={current} index={panel % scene.beats.length} count={scene.beats.length} next={() => setPanel((panel + 1) % scene.beats.length)}/><div className="story-content"><header className="story-heading"><p>PART II · BENEATH UNWRITTEN STARS</p><h1>{scene.title}</h1><div><span>MARA · FINN · LUMA</span><span className="story-paused">WORLD PAUSED</span></div></header><div className="story-reading" tabIndex={0}><p>{current.caption}</p><details className="crossing-read-more"><summary>Read the full scene</summary><p>{scene.journal}</p></details></div><div className="story-decision"><div className="story-choices"><button className="story-continue" data-odyssey-continue={id} disabled={!captain || !connected} onClick={() => action({ kind: 'odyssey-continue', encounter: id })}>{scene.action}<span>→</span></button></div><p className="story-wait">{captain ? 'Read the panels at your pace. Your family waits.' : 'Explore the panels. The captain chooses when your shared journey continues.'}</p><SongControls song={song} compact/><button className="story-save" onClick={exit}>Save & return home</button></div></div></Dialog>
}
