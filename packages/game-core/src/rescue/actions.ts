import type { RescueState, ShipUpgrade } from './types'
import { buyRescueUpgrade, dockRescueShip, recruitRescueCrew } from './campaign'
import { travelRescueDock, continueOdyssey } from './factory'
import { ODYSSEY_IDS, type OdysseyId } from './odyssey'
import { STORY_IDS, chooseRescueStory, continueRescueStory } from './story'

export type RescueAction = { kind: 'dock' | 'undock' | 'travel' } | { kind: 'odyssey-continue'; encounter: OdysseyId } | { kind: 'difficulty'; difficulty: 'gentle' | 'adventure' | 'tempest' } | { kind: 'tutorial'; mode: 'replay' | 'skip' } | { kind: 'upgrade'; upgrade: ShipUpgrade } | { kind: 'recruit'; crew: string } | { kind: 'story-choice'; encounter: string; choice: string } | { kind: 'story-continue'; encounter: string }
export function validRescueAction(value: unknown): value is RescueAction {
  if (!value || typeof value !== 'object') return false
  const a = value as RescueAction
  if (a.kind === 'odyssey-continue') return ODYSSEY_IDS.includes(a.encounter) && Object.keys(a).every(k => ['kind', 'encounter'].includes(k))
  if (a.kind === 'difficulty') return ['gentle', 'adventure', 'tempest'].includes(a.difficulty) && Object.keys(a).every(k => ['kind', 'difficulty'].includes(k))
  if (a.kind === 'tutorial') return ['replay', 'skip'].includes(a.mode) && Object.keys(a).every(k => ['kind', 'mode'].includes(k))
  if (a.kind === 'story-choice' || a.kind === 'story-continue') return STORY_IDS.some(id => id === a.encounter) && (a.kind === 'story-continue' || typeof a.choice === 'string' && /^[a-z-]{1,24}$/.test(a.choice)) && Object.keys(a).every(key => ['kind', 'encounter', ...(a.kind === 'story-choice' ? ['choice'] : [])].includes(key))
  return ['dock', 'undock', 'travel'].includes(a.kind) || a.kind === 'upgrade' && ['hull', 'drive', 'reactor', 'tractor'].includes(a.upgrade) || a.kind === 'recruit' && typeof a.crew === 'string' && a.crew.length <= 80
}
export function applyRescueAction(s: RescueState, action: RescueAction): RescueState | null {
  if (!validRescueAction(action)) return null
  if (action.kind === 'odyssey-continue') return continueOdyssey(s, action.encounter)
  if (s.odyssey?.pending) return null
  if (action.kind === 'story-choice') return chooseRescueStory(s, action.encounter, action.choice) ? s : null
  if (action.kind === 'story-continue') return continueRescueStory(s, action.encounter) ? s : null
  if (s.story?.pending) return null
  if (action.kind === 'difficulty') { if (!s.seamanship) s.seamanship = { step: 5, difficulty: action.difficulty, travelStart: s.stats.travel }; else s.seamanship.difficulty = action.difficulty; return s }
  if (action.kind === 'tutorial') {
    if (s.odyssey || s.phase !== 'playing') return null
    s.seamanship = { step: action.mode === 'skip' ? 5 : 0, difficulty: s.seamanship?.difficulty ?? 'gentle', travelStart: s.stats.travel }
    s.nextWave = s.time + 30
    if (action.mode === 'replay') { s.enemies = []; s.bullets = []; s.ship.hp = s.ship.maxHp; s.guardianSpawned = s.guardianDefeated }
    return s
  }
  if (action.kind === 'travel') return travelRescueDock(s)
  if (action.kind === 'dock') return dockRescueShip(s) ? s : null
  if (action.kind === 'undock' && s.docked) { s.docked = null; s.ship.invulnerable = 4; return s }
  if (action.kind === 'upgrade') return buyRescueUpgrade(s, action.upgrade) ? s : null
  if (action.kind === 'recruit') return recruitRescueCrew(s, action.crew) ? s : null
  return null
}
