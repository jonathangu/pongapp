import type { RescueState } from './types'

export const learningToSail = (s: RescueState) => Boolean(s.seamanship && s.seamanship.step < 5)
export function rescueTarget(s: RescueState) {
  return [...s.world.cages].filter(c => !c.rescued).sort((a, b) => Math.hypot(a.x - s.ship.x, a.y - s.ship.y) - Math.hypot(b.x - s.ship.x, b.y - s.ship.y))[0] ?? null
}
/** Advance only from observed actions, never from elapsed time or a local UI flag. */
export function advanceSeamanship(s: RescueState) {
  const lesson = s.seamanship
  if (!lesson || lesson.step >= 5) return
  const target = rescueTarget(s)
  if (lesson.step === 0 && s.stats.travel - lesson.travelStart >= 5 && s.crew.some(p => !p.pet && p.seat === 'engine')) lesson.step = 1
  else if (lesson.step === 1 && (s.stats.rescues > 0 || target && Math.hypot(target.x - s.ship.x, target.y - s.ship.y) <= 22)) lesson.step = 2
  else if (lesson.step === 2 && s.crew.some(p => !p.pet && ['east', 'west', 'north', 'south', 'starburst'].includes(p.seat ?? ''))) lesson.step = 3
  else if (lesson.step === 3 && s.stats.rescues > 0) lesson.step = 4
  else if (lesson.step === 4 && s.meal.remaining > 0 && s.crew.some(p => !p.pet && p.seat === 'galley')) {
    lesson.step = 5; s.nextWave = s.time + 30; s.weather.nextStrike = s.time + 60
  }
}
