import { expect, it } from 'vitest'
import { RESCUE_STATIONS, advanceRescueGame, createRescueCrew, createRescueGame, neutralRescueInput, stationSpec, validRescueInput } from '../src/rescue/index'

it('tap-to-route reaches every station through physical crew movement', () => {
  for (const station of RESCUE_STATIONS) {
    const s = createRescueGame({ solo: false }); s.nextWave = 999
    const p = s.crew[0]!
    for (let i = 0; i < 900 && p.seat !== station.id; i++) {
      const old = { x: p.x, y: p.y }
      advanceRescueGame(s, { captain: { ...neutralRescueInput(i + 1), assist: true, command: i === 0 ? station.id : null, commandCrew: p.id } })
      expect(Math.hypot(p.x - old.x, p.y - old.y)).toBeLessThan(.8)
    }
    expect(p.seat, station.id).toBe(station.id)
  }
})
it('helm steers directly and brakes after release without a fire button', () => {
  const s = createRescueGame({ solo: false }); s.nextWave = 999; s.world.obstacles = []; s.world.cages = []
  const p = s.crew[0]!, spec = stationSpec('engine'); Object.assign(p, { seat: 'engine', order: 'engine', x: spec.x, y: spec.y })
  const start = s.ship.x
  for (let i = 0; i < 120; i++) advanceRescueGame(s, { captain: { ...neutralRescueInput(i), assist: true, x: 1 } })
  expect(s.ship.x).toBeGreaterThan(start + 10)
  for (let i = 120; i < 180; i++) advanceRescueGame(s, { captain: { ...neutralRescueInput(i), assist: true } })
  expect(Math.hypot(s.ship.vx, s.ship.vy)).toBeLessThan(.02)
})
it('an occupied cannon aims and opens a rescue cage without manual firing', () => {
  const s = createRescueGame({ solo: false }); s.nextWave = 999; s.world.obstacles = []
  s.world.cages = [{ id: 900, x: s.ship.x + 14, y: s.ship.y, hp: 35, open: false, rescued: false, pet: 0 }]
  const p = s.crew[0]!, spec = stationSpec('east'); Object.assign(p, { seat: 'east', order: 'east', commandSeq: 0, x: spec.x, y: spec.y })
  for (let i = 0; i < 240; i++) advanceRescueGame(s, { captain: { ...neutralRescueInput(i + 1), assist: true } })
  expect(s.stats.shots).toBeGreaterThan(0); expect(s.world.cages[0]!.open).toBe(true)
})
it('rejects non-boolean assist packets', () => {
  expect(validRescueInput({ ...neutralRescueInput(), assist: 'yes' })).toBe(false)
})
it('automatic cannons cover targets behind their original quadrant', () => {
  const s = createRescueGame({ solo: false }); s.nextWave = 999; s.world.obstacles = []
  s.world.cages = [{ id: 900, x: s.ship.x - 15, y: s.ship.y, hp: 35, open: false, rescued: false, pet: 0 }]
  const p = s.crew[0]!, spec = stationSpec('east'); Object.assign(p, { seat: 'east', order: 'east', commandSeq: 0, x: spec.x, y: spec.y })
  for (let i = 0; i < 300; i++) advanceRescueGame(s, { captain: { ...neutralRescueInput(i + 1), assist: true } })
  expect(s.world.cages[0]!.open).toBe(true)
  expect(p.seat).toBe('east')
})
it('never takes an occupied human station or commands another human', () => {
  const s = createRescueGame({ solo: false, players: [{ id: 'captain', name: 'A' }, { id: 'friend', name: 'B' }] })
  const friend = s.crew[1]!; Object.assign(friend, { seat: 'engine', order: 'engine', commandSeq: 1 })
  advanceRescueGame(s, { captain: { ...neutralRescueInput(10), assist: true, command: 'engine', commandCrew: 'captain' } })
  expect(s.crew[0]!.order).not.toBe('engine'); expect(friend.seat).toBe('engine')
  advanceRescueGame(s, { captain: { ...neutralRescueInput(11), assist: true, command: 'galley', commandCrew: friend.id } })
  expect(friend.order).toBe('engine')
})
it('AI yields a station even when every seat is occupied', () => {
  const s = createRescueGame({ solo: false }); s.nextWave = 999
  const captain = s.crew[0]!, engine = stationSpec('engine')
  Object.assign(captain, { seat: 'engine', order: 'engine', commandSeq: 0, x: engine.x, y: engine.y })
  s.crew = [captain]
  for (const station of RESCUE_STATIONS.filter(st => st.id !== 'engine')) {
    const p = createRescueCrew('ai-' + station.id, station.id, true, true)
    Object.assign(p, { seat: station.id, order: station.id, commandSeq: 0, x: station.x, y: station.y })
    s.crew.push(p)
  }
  for (let i = 0; i < 900 && captain.seat !== 'north'; i++) advanceRescueGame(s, { captain: { ...neutralRescueInput(i + 1), assist: true, command: i === 0 ? 'north' : null, commandCrew: captain.id } })
  expect(captain.seat).toBe('north')
  expect(s.crew.find(c => c.id === 'ai-north')!.order).toBe('engine')
})
