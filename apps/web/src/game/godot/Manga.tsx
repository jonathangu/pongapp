import sea from '../../assets/story/manga-sea.png'
import stars from '../../assets/story/manga-stars.png'
import type { StoryId } from '@pongapp/game-core'

export type MangaBeat = { sheet: 'sea' | 'stars'; cell: number; speaker: string; line: string; caption: string }
const beat = (cell: number, speaker: string, line: string, caption: string): MangaBeat => ({ sheet: 'sea', cell, speaker, line, caption })
export const SEA_MANGA: Record<StoryId, MangaBeat[]> = {
  watch: [beat(0, 'MARA', 'A boat. A family. One way forward.', 'Mara, twenty-nine, sails with Finn, nine, and Luma, four. Five crews need rescue. Before they leave, Finn finds Grandad’s stopped watch: wind it, or keep it as it is?'), beat(3, 'FINN', 'Can we bring Grandad’s watch?', 'The brass watch stopped at 11:17. Finn finds it beneath the charts.')],
  whale: [beat(0, 'FINN', 'I drew another way.', 'His whale crosses the chart—and points toward a stranded supply boat.'), beat(0, 'MARA', 'Then let’s check the depth.', 'The shallow route costs hull but brings supplies. The deeper channel gives them time to repair.')],
  'first-light': [beat(1, 'FINN', 'There’s someone in there!', 'The cage opens. One crew is safe. Their radio operator says her name is Iona.'), beat(2, 'MARA', 'Make room at the table.', 'They can share spare parts and a meal, or stay on the radio until more help arrives.')],
  coat: [beat(2, 'FINN', 'It still smells like him.', 'Grandad’s coat is heavy, warm, and strong enough to patch the ship.'), beat(3, 'MARA', 'We choose what stays.', 'Use its cloth for the hull, or spend supplies to keep the coat whole.')],
  sometimes: [beat(2, 'LUMA · 4', 'I helped. With the spoon.', 'A little laughter in the galley. Some days, this is how a family keeps going.'), beat(2, 'MARA', 'Sometimes that’s enough.', 'Finn needs a place beside her, not a promise that nothing will ever hurt.')],
  'small-hands': [beat(0, 'FINN', 'Let me try. Stay close.', 'What they practice together can become what steadies them later.'), beat(0, 'MARA', 'One small turn. Then another.', 'Help Finn practice at the helm, or let him read the bearings while Mara steers.')],
  keeper: [beat(1, 'FINN', 'All five crews are aboard.', 'The Breakwater Keeper stands between them and the passage.'), beat(0, 'MARA', 'Then we get them through.', 'Their choices, supplies, and the people they helped have brought them this far.')],
  home: [beat(3, 'MARA', 'Your water will be different.', 'The crossing is behind them. Her father’s watch is still here.'), beat(3, 'FINN', 'Stay for the next bit?', 'She will. There are more skies ahead—and three hearts aboard.')],
}
export function MangaPanel({ beat: current, next, count, index }: { beat: MangaBeat; next?: () => void; count?: number; index?: number }) {
  const x = current.cell % 2 * 100, y = Math.floor(current.cell / 2) * 75
  return <div className="manga-panel" key={`${current.sheet}-${current.cell}-${current.line}`}>
    <svg className="manga-spread" viewBox={`${x} ${y} 100 75`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={current.caption}><image href={current.sheet === 'sea' ? sea : stars} x="0" y="0" width="200" height="150" preserveAspectRatio="none"/></svg>
    <div className="manga-speech"><strong>{current.speaker}</strong><p>{current.line}</p></div>
    {next && <button className="manga-next" aria-label="Next manga panel" onClick={next}>{(index ?? 0) + 1} / {count} <span>→</span></button>}
  </div>
}
