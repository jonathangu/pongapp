import { rescueEvent, rescueRandom, type RescueState } from './types'

export const ODYSSEY_IDS = ['launch', 'flare', 'gate', 'dragon', 'unwritten'] as const
export type OdysseyId = typeof ODYSSEY_IDS[number]
/** Luma chooses a brief moment to help. She never occupies a player's station. */
export function advanceLittleWing(s: RescueState, dt: number) {
  const wing = s.littleWing
  if (!wing) return
  wing.remaining = Math.max(0, wing.remaining - dt); wing.cooldown = Math.max(0, wing.cooldown - dt)
  const danger = s.enemies.some(e => Math.hypot(e.x - s.ship.x, e.y - s.ship.y) < 18) || s.bullets.some(b => b.enemy && Math.hypot(b.x - s.ship.x, b.y - s.ship.y) < 14) || Boolean(s.weather.strike)
  const firstHelp = wing.arrivals === 0 && s.stats.rescues > 0
  if (wing.cooldown === 0 && wing.remaining === 0 && (firstHelp || danger && (s.tick % 90 === 0 || s.ship.hp <= s.ship.maxHp * .5))) {
    wing.remaining = 6; wing.cooldown = 50 + rescueRandom(s) * 25; wing.arrivals++
    rescueEvent(s, 'ability', s.ship.x, s.ship.y, 0, 6, wing.arrivals, 'Luma · silver wings')
  }
}
/** Distinct travel objectives replace the five-cage loop in the second act. */
export function advanceOdyssey(s: RescueState, dt: number) {
  const chapter = s.odyssey
  if (!chapter || chapter.pending || s.phase !== 'playing' || chapter.history.includes('unwritten')) return
  const distance = Math.hypot(s.ship.x - s.world.portal.x, s.ship.y - s.world.portal.y)
  if (chapter.stage === 'inner' && distance < 22 && !chapter.history.includes('dragon')) {
    chapter.pending = 'dragon'; s.ship.vx = 0; s.ship.vy = 0; return
  }
  s.extraction = distance < 7 ? s.extraction + dt : 0
  if (s.extraction >= 1.5) {
    chapter.pending = chapter.stage === 'sky' ? 'flare' : chapter.stage === 'gate' ? 'gate' : 'unwritten'
    s.ship.vx = 0; s.ship.vy = 0
  }
}
