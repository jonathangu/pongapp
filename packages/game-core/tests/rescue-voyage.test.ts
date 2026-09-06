import { describe, expect, it } from 'vitest'
import { advanceRescueGame, createRescueGame, encodeRescueSave, neutralRescueInput, rescueAngle, routeRescueCrew, RESCUE_BUTTON, type RescueState } from '../src/rescue'

function captainInput(s: RescueState, target: { x: number; y: number }) {
  const p = s.crew[0]!
  if (p.seat !== 'engine') return routeRescueCrew(p, 'engine', s.tick, 1 / 60)
  const input = neutralRescueInput(s.tick), dx = target.x - s.ship.x, dy = target.y - s.ship.y, d = Math.max(.001, Math.hypot(dx, dy))
  const desiredSpeed = Math.min(7.5, d * 1.3), ax = dx / d * desiredSpeed - s.ship.vx, ay = dy / d * desiredSpeed - s.ship.vy
  const a = Math.max(.001, Math.hypot(ax, ay)); input.aimX = -ax / a; input.aimY = -ay / a
  const angle = Math.atan2(-ay, -ax), engine = s.stations.find(st => st.id === 'engine')!
  if (a > .8 && Math.abs(rescueAngle(angle - engine.angle)) < .22) input.buttons = RESCUE_BUTTON.fire
  return input
}
export function playVoyage(seed: number, biome: 0 | 1 | 2) {
  const s = createRescueGame({ seed, biome }), p = s.crew[0]!, origin = { x: 0, y: -24 }
  let stage = 'cage', previous = -1, lastProgress = 0, minHp = 12
  const trace: unknown[] = []
  for (let i = 0; i < 60 * 60 * 6 && s.phase === 'playing'; i++) {
    let target = origin
    const cage = s.world.cages.find(c => !c.rescued)
    if (cage) {
      if (previous !== -1 && previous !== cage.id && stage === 'cage') stage = 'return'
      if (stage === 'return' && Math.hypot(s.ship.x, s.ship.y + 24) < 3) stage = 'cage'
      if (stage === 'cage') {
        const dx = cage.x - origin.x, dy = cage.y - origin.y, distance = Math.hypot(dx, dy)
        target = cage.open ? cage : { x: cage.x - dx / distance * 20, y: cage.y - dy / distance * 20 }
      }
      previous = cage.id
    } else target = s.world.portal
    const input = captainInput(s, target)
    advanceRescueGame(s, { [p.id]: input })
    minHp = Math.min(minHp, s.ship.hp)
    if (s.stats.rescues > lastProgress) { lastProgress = s.stats.rescues; trace.push({ time: s.time, rescued: lastProgress, hp: s.ship.hp, crew: s.crew.length, enemies: s.enemies.length }) }
    if (i % 600 === 0) encodeRescueSave(s)
  }
  return { seed, biome, phase: s.phase, time: s.time, hp: s.ship.hp, minHp, rescued: s.stats.rescues, guardian: s.guardianDefeated, kills: s.stats.kills, position: { x: s.ship.x, y: s.ship.y }, crew: s.crew.map(c => ({ name: c.name, seat: c.seat, order: c.order, x: c.x, y: c.y })), trace }
}
describe('Starling full natural-input voyage balance', () => {
  it('can rescue five friends and defeat the guardian without state cheats', () => {
    const results = [playVoyage(73599, 0), playVoyage(137, 1), playVoyage(944, 2)]
    console.info('STARLING_VOYAGE_RESULTS', JSON.stringify(results))
    for (const result of results) expect(result.phase, JSON.stringify(result)).toBe('won')
  })
})
