import { describe, it, expect } from 'vitest'
import { advanceRescueGame, availableRescueCrew, buyRescueUpgrade, createRescueGame, decodeRescueSave, dockRescueShip, encodeRescueSave, neutralRescueInput, recruitRescueCrew, RESCUE_BUTTON, restartRescueGame, resumeRescueSolo, stationSpec, travelRescueDock } from '../src/rescue'

const port = () => { const s = createRescueGame(); s.ship.x = -15; s.ship.y = -22; expect(dockRescueShip(s)).toBe(true); return s }
describe('Starling shared campaign', () => {
  it('cooks once and retains a timed shared buff after leaving the galley', () => {
    const s = createRescueGame(), p = s.crew[0]!, seat = stationSpec('galley')
    p.x = seat.x; p.y = seat.y; p.seat = 'galley'
    for (let i = 0; i < 182; i++) { const input = neutralRescueInput(i); input.buttons = RESCUE_BUTTON.fire; advanceRescueGame(s, { [p.id]: input }) }
    expect(s.meal.remaining).toBeGreaterThan(74)
    const leave = neutralRescueInput(200); leave.buttons = RESCUE_BUTTON.jump; advanceRescueGame(s, { [p.id]: leave })
    expect(p.seat).toBeNull()
    for (let i = 0; i < 300; i++) advanceRescueGame(s, {})
    expect(s.meal.remaining).toBeGreaterThan(69); expect(s.meal.progress).toBe(0)
  })
  it('requires a slow physical dock approach, repairs and buys bounded upgrades', () => {
    const s = createRescueGame(); expect(dockRescueShip(s)).toBe(false)
    s.ship.x = -15; s.ship.y = -22; s.ship.vx = 10; expect(dockRescueShip(s)).toBe(false)
    s.ship.vx = 0; s.ship.hp = 2; expect(dockRescueShip(s)).toBe(true); expect(s.ship.hp).toBe(12)
    expect(buyRescueUpgrade(s, 'hull')).toBe(true); expect(s.ship.maxHp).toBe(15); expect(s.campaign.salvage).toBe(0)
    expect(buyRescueUpgrade(s, 'hull')).toBe(false)
    s.campaign.salvage = 500; expect(buyRescueUpgrade(s, 'hull')).toBe(true); expect(buyRescueUpgrade(s, 'hull')).toBe(true); expect(buyRescueUpgrade(s, 'hull')).toBe(false)
  })
  it('temporary AI depart at safe ports and later reunite with their identity intact', () => {
    const s = port(); const offer = availableRescueCrew(s)[0]!
    expect(recruitRescueCrew(s, offer.id)).toBe(true)
    const p = s.crew.find(c => c.id === offer.id)!; const identity = { id: p.id, name: p.name, ability: p.ability }
    s.campaign.voyages = 2; s.docked = null; expect(dockRescueShip(s)).toBe(true)
    expect(s.crew.some(c => c.id === p.id)).toBe(false)
    expect(availableRescueCrew(s).some(c => c.id === p.id)).toBe(false)
    for (let i = 0; i < 2; i++) { s.docked = null; dockRescueShip(s) }
    expect(availableRescueCrew(s).find(c => c.id === p.id)?.reunion).toBe(true)
    expect(recruitRescueCrew(s, p.id)).toBe(true)
    expect(s.crew.find(c => c.id === p.id)).toMatchObject(identity)
    expect(s.events.some(e => e.kind === 'reunion')).toBe(true)
    expect(s.crew.find(c => c.id === 'captain')?.pet).toBe(false)
  })
  it('recruits join co-op as well as solo and have useful ability effects', () => {
    const s = createRescueGame({ solo: false, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] })
    expect(recruitRescueCrew(s, '1', 1)).toBe(true); expect(s.crew).toHaveLength(3)
    s.ship.hp = 5; advanceRescueGame(s, {}); expect(s.ship.hp).toBe(6)
    for (let i = 0; i < 60; i++) advanceRescueGame(s, {}); expect(s.ship.hp).toBe(6)
  })
  it('docks physically transition sea/jungle/space, retaining the campaign and roster', () => {
    const s = createRescueGame(); s.ship.x = 24; s.ship.y = -22; dockRescueShip(s)
    const jungle = travelRescueDock(s)!; expect(jungle.region).toBe('jungle'); expect(jungle.epoch).toBe(s.epoch + 1)
    expect(jungle.campaign.voyages).toBe(1); expect(jungle.crew.map(c => c.id)).toEqual(s.crew.map(c => c.id))
    jungle.ship.x = 24; jungle.ship.y = -22; dockRescueShip(jungle)
    const sea = travelRescueDock(jungle)!; expect(sea.region).toBe('sea')
    sea.ship.x = 37; sea.ship.y = 33; dockRescueShip(sea); expect(travelRescueDock(sea)?.region).toBe('space')
    expect(travelRescueDock(createRescueGame())).toBeNull()
  })
  it('telegraphs lightning and preserves upright ship-local physics in waves', () => {
    const s = createRescueGame(); s.time = 75; s.weather.intensity = 1; s.nextWave = 1e6
    advanceRescueGame(s, {}); expect(s.weather.strike!.at - s.time).toBeGreaterThan(2)
    const before = s.ship.hp
    for (let i = 0; i < 60; i++) advanceRescueGame(s, {})
    expect(s.ship.hp).toBe(before); expect(s.ship.angle).toBe(0); expect(s.ship.angularVelocity).toBe(0)
    expect(Math.hypot(s.ship.vx, s.ship.vy)).toBeGreaterThan(.1)
    expect(s.crew[0]!.y).toBe(-1.3)
  })
  it('roundtrips real running campaign saves, upgrades and recruitment history', () => {
    const s = port(); recruitRescueCrew(s, availableRescueCrew(s)[0]!.id); buyRescueUpgrade(s, 'hull'); s.docked = null
    for (let i = 0; i < 3000; i++) { advanceRescueGame(s, {}); s.ship.hp = s.ship.maxHp }
    const raw = encodeRescueSave(s), loaded = decodeRescueSave(raw)!
    expect(loaded).not.toBeNull(); expect(loaded.campaign).toEqual(s.campaign); expect(loaded.crew.map(c => c.id)).toEqual(s.crew.map(c => c.id))
    expect(resumeRescueSolo(loaded).crew.filter(c => !c.pet)).toHaveLength(1)
    expect(restartRescueGame(loaded, true).campaign.upgrades.hull).toBe(1)
  })
  it('rejects malformed, oversized, duplicate, invalid ownership and incompatible saves', () => {
    const raw = encodeRescueSave(createRescueGame())
    const alter = (f: (v: ReturnType<typeof JSON.parse>) => void) => { const v = JSON.parse(raw); f(v); return decodeRescueSave(JSON.stringify(v)) }
    expect(decodeRescueSave('a'.repeat(600000))).toBeNull(); expect(decodeRescueSave('{}')).toBeNull()
    expect(alter(v => { v.version = 999 })).toBeNull()
    expect(alter(v => { v.state.crew[0].gem = 1003 })).toBeNull()
    expect(alter(v => { v.state.crew[1].id = v.state.crew[0].id })).toBeNull()
    expect(alter(v => { v.state.ship.angle = 1 })).toBeNull()
    expect(alter(v => { v.state.campaign.upgrades.hull = 99 })).toBeNull()
    expect(alter(v => { v.state.world.fog = [] })).toBeNull()
  })
  it('NPC pilots physically reach their engine before thrust; their crews survive save/resume', () => {
    const s = createRescueGame(), v = s.vessels[0]!
    expect(v.crew[0]!.seat).toBeNull(); advanceRescueGame(s, {}); expect(v.ship.vx).toBe(0); expect(v.ship.vy).toBe(0)
    let operated = false
    for (let i = 0; i < 1800; i++) {
      const old = v.crew.map(c => ({ x: c.x, y: c.y })); advanceRescueGame(s, {}); s.ship.hp = s.ship.maxHp
      for (const [j, p] of v.crew.entries()) expect(Math.hypot(p.x - old[j]!.x, p.y - old[j]!.y)).toBeLessThan(.8)
      if (v.stations.find(st => st.id === 'engine')!.operated) { expect(v.crew[0]!.seat).toBe('engine'); operated = true }
    }
    expect(operated).toBe(true); expect(Math.hypot(v.ship.vx, v.ship.vy)).toBeGreaterThan(0)
    expect(decodeRescueSave(encodeRescueSave(s))?.vessels).toHaveLength(3)
  })
})
