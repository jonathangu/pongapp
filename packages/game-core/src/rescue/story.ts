import { clampRescue, type RescueCrew, type RescueState } from './types'
import { revealRescueFog } from './world'

export const STORY_IDS = ['watch', 'whale', 'first-light', 'coat', 'sometimes', 'small-hands', 'keeper', 'home'] as const
export type StoryId = typeof STORY_IDS[number]
export interface StoryRecord { encounter: StoryId; choice: string; at: number }
export interface RescueStory {
  version: 1; motherId: string; sonId: string; pending: StoryId | null; result: string | null
  history: StoryRecord[]; nextBeatAt: number; banter: string | null; banterAt: number; heard: string[]
}
interface StoryEffect { salvage?: number; hull?: number; meal?: number; grace?: number; reveal?: boolean; finn?: 'spark' | 'pilot' }
export interface StoryChoice { id: string; label: string; consequence: string; response: string; effect: StoryEffect }
export interface StoryEncounter { id: StoryId; chapter: string; title: string; speaker: string; paragraphs: string[]; choices: StoryChoice[] }
const chose = (s: RescueState, encounter: StoryId, choice: string) => s.story?.history.some(r => r.encounter === encounter && r.choice === choice) ?? false
export const storyHas = (s: RescueState, encounter: StoryId) => s.story?.history.some(r => r.encounter === encounter) ?? false
export const storyCrewName = (s: RescueState, c: RescueCrew) => c.id === s.story?.motherId ? 'Mara' : c.id === s.story?.sonId ? 'Finn' : c.name
export function createRescueStory(motherId: string, sonId: string): RescueStory {
  return { version: 1, motherId, sonId, pending: 'watch', result: null, history: [], nextBeatAt: 0, banter: null, banterAt: -20, heard: [] }
}

/** Authored and local. Save data contains IDs, never executable or generated text. */
export function storyEncounter(s: RescueState, id: StoryId): StoryEncounter {
  const scenes: Record<StoryId, StoryEncounter> = {
    watch: {
      id: 'watch', chapter: '01 / THE NIGHT WATCH', title: 'Eleven seventeen', speaker: 'MARA · MOTHER, CAPTAIN',
      paragraphs: [
        'Our harbor went dark before supper. Now five lifeboats are trapped behind the Keeper’s lantern cages. Their crews know the bearings through the breakwater. We need each other to get out.',
        'Finn is nine. He is supposed to be asleep. Instead, he finds a brass watch beneath the charts—my father’s, stopped at eleven seventeen.',
        '“Did he know the way?” Finn asks. I look out at a coastline my father never saw. “Not this way.”',
        'The harbor thins to a thread behind us. I used to think leaving would make me someone else. Finn needs a dry sleeve and supper. I start there.',
      ],
      choices: [
        { id: 'wind', label: 'Wind the watch together.', consequence: 'Keep the ticking watch. Finn will remember this.', response: 'I guide his fingers around the crown. One turn. A small, stubborn ticking. “It doesn’t tell us where to go,” I say. “We can still bring it.”', effect: {} },
        { id: 'carry', label: 'Let Finn carry it, just as it is.', consequence: 'Keep the silent watch. Finn will remember this.', response: 'He holds it to his ear anyway, then slips it into his yellow coat. “I’ll look after it.” My father used to say that about things he could not fix.', effect: {} },
      ],
    },
    whale: {
      id: 'whale', chapter: '02 / A DIFFERENT LINE', title: 'A whale across the chart', speaker: 'FINN · NINE, NOT QUITE SLEEPY',
      paragraphs: [
        'Finn has drawn a whale straight through my pencilled course. I open my mouth to object. Then I notice what he has noticed: the current bends around a stranded supply boat.',
        '“We could go through its tail,” he says. The shallows will scrape the hull, but the boat still has useful parts. My father’s old route stays in deeper water.',
      ],
      choices: [
        { id: 'whale', label: 'Follow the whale through the shallows.', consequence: 'Lose 2 hull · gain 10 salvage · reveal rescue bearings.', response: 'The keel grumbles over stone. Finn winces, then helps haul the dry parts aboard. I leave his whale on the chart. It has earned its place.', effect: { hull: -2, salvage: 10, reveal: true } },
        { id: 'channel', label: 'Keep the deeper channel. Let him mark it.', consequence: 'Repair 1 hull while drifting · keep your supplies.', response: 'I explain the depth marks instead of rubbing out his drawing. He gives the whale a longer tail, all the way around the reef. We patch a seam while the current carries us.', effect: { hull: 1 } },
      ],
    },
    'first-light': {
      id: 'first-light', chapter: '03 / OTHER PEOPLE’S LIGHTS', title: 'One more place at the table', speaker: 'MARA',
      paragraphs: [
        'Our first rescued crewmate brings a wet bearing slip and a radio that works only when held sideways. A nearby launch answers. They have children aboard and a cracked pump.',
        'Six of our spare parts would get it running. Finn looks at the parts, then at me. For once he does not tell me what he thinks we should do.',
        'The voice on the radio gives us a name: Iona. Finn writes it beside the launch. “So we’ll know it’s her next time.”',
      ],
      choices: [
        { id: 'share', label: 'Send the six parts across.', consequence: 'Spend 6 salvage · the launch sends a hot meal (75s crew boost).', response: 'The launch’s cook insists on passing over a pot before we leave. Finn makes room on the stove. “Is that enough for everyone?” he asks. I find another bowl. Iona asks us to keep her frequency. A stranger has become someone we can call.', effect: { salvage: -6, meal: 75 } },
        { id: 'signal', label: 'Keep the parts; relay their position.', consequence: 'No supply cost · repair 1 hull while the radio connects.', response: 'We stay until a harbor tender answers. Finn writes the launch’s name in the margin so we can ask about it later. There is more than one way to keep someone in sight.', effect: { hull: 1 } },
      ],
    },
    coat: {
      id: 'coat', chapter: '04 / WHAT WE KEEP', title: 'Too heavy for this weather', speaker: 'MARA',
      paragraphs: [
        'Two bearing slips drying over the galley. A fresh leak under the hatch. In the locker hangs my father’s coat, absurdly heavy for this sea.',
        'Its waxed lining would make a good patch. Finn has already put one arm through a sleeve. It reaches almost to his knee. I almost gave that coat away once.',
      ],
      choices: [
        { id: 'patch', label: 'Cut the lining. Let the coat keep us afloat.', consequence: 'Repair 3 hull · the coat becomes part of the Starling.', response: 'Finn holds the lantern while I cut. We keep a strip for his pocket. The rest settles over the leak. I think Dad would have laughed at how long it took me to find a use for it.', effect: { hull: 3 } },
        { id: 'spares', label: 'Use spare parts. Keep the coat whole.', consequence: 'Spend 6 salvage · repair 3 hull · keep the coat.', response: 'I use the good sealant. Finn falls asleep inside the coat while I work. It smells of damp wool now, and him. That seems a good enough reason to keep it.', effect: { salvage: -6, hull: 3 } },
        { id: 'warmth', label: 'Wrap Finn in it. Save the repair for harbor.', consequence: 'Keep supplies and coat · 45s warm-meal crew boost.', response: 'We put a bucket under the seam and heat the soup. He makes me wear the other sleeve until the kettle boils. For a little while, the boat feels less cold.', effect: { meal: 45 } },
      ],
    },
    sometimes: {
      id: 'sometimes', chapter: '05 / THE THINGS WE DON’T SAY', title: 'Too small an answer', speaker: 'FINN & MARA',
      paragraphs: [
        'Between the third signal and the next patch of weather, the sea goes quiet. Finn asks if I miss his grandfather. “Sometimes,” I say. The answer lands between us, much too small.',
        chose(s, 'coat', 'patch') ? 'He rolls the scrap of coat lining between his fingers. “Was he good at fixing things?”' : 'He looks at the locker. “Was he very brave?”',
        'I could tell him a grand story. The one I remember is about Dad dropping his only spoon overboard, and pretending he preferred to drink his beans.',
      ],
      choices: [
        { id: 'spoon', label: 'Tell him about the spoon. And the off-key songs.', consequence: 'Finn learns Quick spark: 20% faster station actions.', response: 'Finn laughs so hard he nearly drops our spoon. Then he asks me to show him the radio again. We practice until he can work it without looking at my hands.', effect: { finn: 'spark' } },
        { id: 'quiet', label: '“More than sometimes.” Sit with him a while.', consequence: 'Repair 2 hull together · an honest memory for the log.', response: 'He leans into my shoulder. After a while he brings the tool roll without being asked. We work beside each other. I do not have to find the rest of the answer tonight.', effect: { hull: 2 } },
      ],
    },
    'small-hands': {
      id: 'small-hands', chapter: '06 / THE WEIGHT OF A ROPE', title: 'Let me read it back', speaker: 'FINN',
      paragraphs: [
        'Four crews safe. The final bearing lies beyond a wall of broken white water. Finn reads the compass out loud, then checks it against the chart.',
        chose(s, 'whale', 'whale') ? 'His whale is still there, salt-blurred at the tail. “I know which line this is,” he says.' : 'He points to the depth marks we checked together. “This is the deep one. Isn’t it?”',
        'The helm pulls hard. He reaches toward it, then waits for me. There is room for both our hands.',
        chose(s, 'sometimes', 'spoon') ? 'He checks the radio before I ask. We have done it together often enough that he no longer waits for the reminder. I wonder which of my other habits he is learning.' : 'He brings the tool roll and checks the hatch. We did that together when the leak opened. Now he does it before I ask. Some lessons arrive without a speech.',
      ],
      choices: [
        { id: 'teach', label: 'Tune the helm. Let him learn beside you.', consequence: 'Spend 8 salvage · Finn learns Tailwind (+25% helm thrust).', response: 'I ease the stiff gearing. Finn takes the wheel with my hand over his, first one correction, then another. When he gets it wrong, we correct it together. Nobody lets go.', effect: { salvage: -8, finn: 'pilot' } },
        { id: 'read', label: 'Keep the wheel. Trust him with the bearings.', consequence: 'Keep supplies · 60s crew boost from working together.', response: '“Read it back,” I ask. His voice steadies on the second number. My arms still take the weight, but I am no longer doing all the steering.', effect: { meal: 60 } },
      ],
    },
    keeper: {
      id: 'keeper', chapter: '07 / THE LAST LANTERN', title: 'No one left outside', speaker: 'MARA',
      paragraphs: [
        'Five bearing slips make one narrow passage. Five rescued voices answer when Finn calls the roll. Beyond the breakwater, the Keeper’s red lantern turns toward us.',
        'Finn asks whether Grandad would have liked him. I tighten the loose strap on his life jacket. “He would have loved being here with you.”',
        chose(s, 'first-light', 'share') ? 'The radio crackles. Iona recognizes Finn’s call; her repaired launch is through the shallows. She stays on the channel with us. He does not need to look up her name.' : 'The harbor tender we called for Iona answers our check-in. Her launch is safe. Finn ticks the name in the chart’s margin. Keeping the radio open counted for something.',
        'We have one moment to prepare the Starling. Then we face the Keeper and make for the return beacon together.',
      ],
      choices: [
        { id: 'brace', label: 'Use the last good parts. Brace the hull.', consequence: 'Spend 8 salvage · repair 4 hull · 8s damage protection.', response: 'The crew wedges the plates into place. Finn checks every fastening twice. When the red light sweeps across the glass, he is standing beside me.', effect: { salvage: -8, hull: 4, grace: 8 } },
        { id: 'together', label: 'Call every station. Trust this crew.', consequence: 'No supply cost · 75s crew boost · 4s damage protection.', response: 'One by one the stations answer. Finn leaves his wet socks on the ladder, exactly where I told him not to. I step over them and take the helm.', effect: { meal: 75, grace: 4 } },
      ],
    },
    home: {
      id: 'home', chapter: '08 / OURS BEGINS', title: 'A different blue', speaker: 'MARA',
      paragraphs: [
        'The Keeper’s light falls behind us. All five crews are through. Finn marks his height beside the hatch; the ship rolls and the line comes out crooked.',
        chose(s, 'coat', 'patch') ? 'Below our feet, his grandfather’s coat keeps the sea out. Finn says we should write that in the log. We do.' : 'The old coat hangs beside Finn’s yellow one. The locker door will not quite close. I leave it.',
        chose(s, 'small-hands', 'teach') ? 'He takes the next quiet stretch at the wheel. I stay beside him, but my hand rests on his shoulder now.' : 'He reads me the next bearing, then yawns halfway through it. I tell him I can take this watch.',
        'My father is not waiting beyond this harbor. But I know where I learned to put my hand. For a moment, that is enough.',
        chose(s, 'whale', 'whale') ? 'Finn does not rub out the shallow water we scraped through. “So we remember what happened.” What we found did not undo the scrape. We can still choose the next bearing.' : 'Finn draws the deeper channel again, this time without asking me where it goes. We did not become different people all at once. We kept doing small things beside each other.',
      ],
      choices: [
        { id: 'pass', label: 'Put the watch in Finn’s keeping.', consequence: 'Your ending: a watch to carry forward.', response: chose(s, 'watch', 'wind') ? 'He winds it once, carefully. Later, when he sleeps below, I can still hear it beside his bunk. I take the wheel. The old sea vanishes. And ours begins.' : 'It is still stopped at eleven seventeen. He says he will learn to mend it. I believe him. I take the wheel. The old sea vanishes. And ours begins.', effect: {} },
        { id: 'compass', label: 'Set it beside the compass for the next watch.', consequence: 'Your ending: a place for whoever comes next.', response: 'Finn leaves room beside it for his pencil. One day someone else may open this drawer. Tonight he sleeps below, the sea stays wide, and I steer the boat we have.', effect: {} },
      ],
    },
  }
  return scenes[id]
}

export interface StoryReflection { id: string; title: string; body: string }
/** Reflections are rebuilt from existing choices: no personality scores or new save fields. */
export function storyReflections(s: RescueState): StoryReflection[] {
  const reflections: StoryReflection[] = []
  if (storyHas(s, 'whale')) reflections.push(chose(s, 'whale', 'whale')
    ? { id: 'course', title: 'Making room for another line', body: 'Mara followed Finn’s whale. The scratched keel had a real cost; the parts they found did not erase it. His mark stayed on the chart, beside the warning for next time.' }
    : { id: 'course', title: 'Caution can be shared', body: 'Mara kept the deeper channel and explained the depth marks. Finn’s whale stayed. Protecting him did not have to mean keeping the reasons to herself.' })
  if (storyHas(s, 'first-light')) reflections.push(chose(s, 'first-light', 'share')
    ? { id: 'neighbors', title: 'A name, not just a light', body: 'Six spare parts crossed the water; a pot of food came back. Finn kept Iona’s frequency.' + (storyHas(s, 'keeper') ? ' When her voice returned, they already knew who was there.' : ' A light on the water had become someone they knew by name.') }
    : { id: 'neighbors', title: 'Staying on the channel', body: 'They kept their spare parts, but stayed until help answered. Finn kept Iona’s name. Help was a thing they followed through, not only something they gave away.' })
  if (storyHas(s, 'small-hands')) reflections.push(chose(s, 'small-hands', 'teach')
    ? { id: 'practice', title: 'One correction, then another', body: 'Mara spent the parts to ease the helm and let Finn practice beside her. His hands still needed hers. Becoming capable was something they repeated together.' }
    : { id: 'practice', title: 'A voice growing steadier', body: 'Finn read the bearings while Mara held the wheel. On the second number his voice steadied. A place in the crew can begin with one task done carefully, then done again.' })
  if (storyHas(s, 'home')) reflections.push({ id: 'next', title: 'Not finished choosing', body: 'This crossing is part of them, not all of them. They cannot sail back and make every turn again. The next time a light calls, there is still a wheel to turn.' })
  return reflections
}

export const STORY_BANTER = {
  north: { speaker: 'Finn', line: '“Does north get lonely? Being up there all the time?”', reply: 'Mara: “You can ask it. I’ve never thought to.”' },
  steering: { speaker: 'Mara', line: '“Easy on the wheel. She hears you.”', reply: 'Finn: “Then why does she make that noise?”' },
  guns: { speaker: 'Finn', line: '“Pip says the cannons can do their own aiming.”', reply: 'Mara: “Good. You can both keep your eyes on the sea.”' },
  meal: { speaker: 'Finn', line: '“I didn’t spill all of it.”', reply: 'Mara: “I can see. Some of it’s still in the pot.”' },
  hurt: { speaker: 'Mara', line: '“Finn. Look at me. Still here?”', reply: 'Finn: “Still here. Can I hold the lantern?”' },
  stars: { speaker: 'Finn', line: '“Are these the stars Grandad knew?”', reply: 'Mara: “Some of them. We’ll have to learn the others.”' },
  helm: { speaker: 'Finn', line: '“I’ve got it. Stay there, though.”', reply: 'Mara: “I’m staying.”' },
} as const
export type StoryBanterId = keyof typeof STORY_BANTER

export function advanceRescueStory(s: RescueState) {
  const story = s.story
  if (!story || story.pending || s.phase === 'lost' || storyHas(s, 'home')) return
  const due: Array<[StoryId, boolean]> = [
    ['whale', s.stats.travel >= 18 && s.time >= 8], ['first-light', s.stats.rescues >= 1], ['coat', s.stats.rescues >= 2],
    ['sometimes', s.stats.rescues >= 3], ['small-hands', s.stats.rescues >= 4], ['keeper', s.guardianSpawned], ['home', s.phase === 'won'],
  ]
  const next = due.find(([id]) => !storyHas(s, id))
  if (next && (next[1] || s.phase === 'won') && (s.time >= story.nextBeatAt || s.phase === 'won')) { story.pending = next[0]; story.result = null; return }
  if (s.time - story.banterAt < 16) return
  const son = s.crew.find(c => c.id === story.sonId)
  const candidates: Array<[StoryBanterId, boolean]> = [
    ['hurt', s.ship.hp <= 7], ['helm', son?.seat === 'engine'], ['meal', s.meal.remaining > 0], ['stars', s.region === 'space'],
    ['steering', s.stats.travel > 8], ['guns', s.stats.shots > 4], ['north', s.time > 2],
  ]
  const exchange = candidates.find(([id, ready]) => ready && !story.heard.includes(id))
  if (exchange) { story.banter = exchange[0]; story.banterAt = s.time; story.heard.push(exchange[0]) }
}
export function storyChoiceUnavailable(s: RescueState, choice: StoryChoice): string | null {
  if (s.campaign.salvage + (choice.effect.salvage ?? 0) < 0) return 'Not enough salvage'
  if (choice.effect.hull && choice.effect.hull < 0 && s.ship.hp + choice.effect.hull < 1) return 'Hull too fragile for the shallows'
  return null
}
export function chooseRescueStory(s: RescueState, encounter: string, choiceId: string): boolean {
  const story = s.story
  if (!story || !story.pending || story.pending !== encounter || story.result !== null || storyHas(s, story.pending) || s.phase === 'lost') return false
  const choice = storyEncounter(s, story.pending).choices.find(c => c.id === choiceId)
  if (!choice || storyChoiceUnavailable(s, choice)) return false
  const effect = choice.effect
  s.campaign.salvage = Math.min(1e8, s.campaign.salvage + (effect.salvage ?? 0))
  s.ship.hp = clampRescue(s.ship.hp + (effect.hull ?? 0), 1, s.ship.maxHp)
  if (effect.meal) s.meal.remaining = Math.max(s.meal.remaining, effect.meal)
  if (effect.grace) s.ship.invulnerable = Math.max(s.ship.invulnerable, effect.grace)
  if (effect.reveal) for (const cage of s.world.cages) revealRescueFog(s.world, cage, 12)
  const finn = s.crew.find(c => c.id === story.sonId)
  if (finn && effect.finn) finn.ability = effect.finn
  story.history.push({ encounter: story.pending, choice: choice.id, at: s.time }); story.result = choice.id
  return true
}
export function continueRescueStory(s: RescueState, encounter: string): boolean {
  if (!s.story || s.story.pending !== encounter || !s.story.result) return false
  s.story.pending = null; s.story.result = null; s.story.nextBeatAt = s.time + 4
  return true
}

/** Strict bounded save/wire data: no authored prose or arbitrary rewards from clients. */
export function validRescueStory(value: unknown): value is RescueStory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as RescueStory
  const fields = ['version', 'motherId', 'sonId', 'pending', 'result', 'history', 'nextBeatAt', 'banter', 'banterAt', 'heard']
  const id = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= 80 && [...x].every(c => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>')
  const time = (x: unknown, min = 0) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= 1e8
  const validScene = (x: unknown): x is StoryId => STORY_IDS.includes(x as StoryId)
  if (Object.keys(v).some(k => !fields.includes(k)) || v.version !== 1 || !id(v.motherId) || !id(v.sonId) || v.motherId === v.sonId || !(v.pending === null || validScene(v.pending)) || !(v.result === null || id(v.result)) || !time(v.nextBeatAt) || !time(v.banterAt, -20)) return false
  if (!(v.banter === null || Object.hasOwn(STORY_BANTER, v.banter)) || !Array.isArray(v.heard) || v.heard.length > 7 || new Set(v.heard).size !== v.heard.length || v.heard.some(k => !Object.hasOwn(STORY_BANTER, k))) return false
  if (!Array.isArray(v.history) || v.history.length > STORY_IDS.length || new Set(v.history.map(r => r?.encounter)).size !== v.history.length) return false
  if (v.history.some(r => !r || typeof r !== 'object' || Array.isArray(r) || !validScene(r.encounter) || !time(r.at))) return false
  const view = { story: v } as RescueState
  if (v.history.some(r => !r || Object.keys(r).some(k => !['encounter', 'choice', 'at'].includes(k)) || !validScene(r.encounter) || !time(r.at) || !storyEncounter(view, r.encounter).choices.some(c => c.id === r.choice))) return false
  if (!v.pending && v.result !== null || v.result !== null && !v.history.some(r => r.encounter === v.pending && r.choice === v.result) || v.result === null && v.history.some(r => r.encounter === v.pending)) return false
  return true
}
