import { MAX_RESCUE_HUMANS, RESCUE_CREW_COLORS, RESCUE_RULESET, type BiomeId, type RescueRegion, type RescueState } from './types'
import { clearRescueDockApproaches, makeRescueDocks } from './campaign'
import { validateVoyage, type VoyagePack } from '../bestiary'
import { RESCUE_STATIONS, createRescueCrew } from './interior'
import { createRescueWorld, revealRescueFog } from './world'

export function createRescueGame(options: { seed?: number; biome?: BiomeId; solo?: boolean; players?: Array<{ id: string; name: string }>; epoch?: number; inspiration?: string; region?: RescueRegion; voyage?: VoyagePack | null } = {}): RescueState {
  const seed = (options.seed ?? 20260906) >>> 0, biome = options.biome ?? 0, solo = options.solo ?? true
  const crew = (options.players ?? [{ id: 'captain', name: 'You' }, { id: 'pip', name: 'Pip' }]).slice(0, MAX_RESCUE_HUMANS).map((p, i) => {
    const c = createRescueCrew(p.id, p.name, i > 0, !options.players && solo && i === 1)
    c.color = RESCUE_CREW_COLORS[i % RESCUE_CREW_COLORS.length]!; c.x = (i % 6 - 2.5) * .5
    return c
  })
  if (crew.length < 2) crew.push(createRescueCrew('pip', 'Pip', true, true))
  const state: RescueState = {
    rulesetVersion: RESCUE_RULESET, tick: 0, time: 0, seed, initialSeed: seed, epoch: options.epoch ?? 1, biome, phase: 'playing', solo, paused: false,
    ship: { x: 0, y: -24, vx: 0, vy: 0, angle: 0, angularVelocity: 0, hp: 12, maxHp: 12, invulnerable: 0, thrust: 0, hitAngle: 0, shieldHits: 0 },
    crew, stations: RESCUE_STATIONS.map(s => ({ id: s.id, angle: s.angle, cooldown: 0, charge: 0, heat: 0, upgrade: null, operated: false, firing: false, lingering: 0, flailAngle: s.angle, flailSpeed: 0 })),
    world: createRescueWorld(seed, biome), enemies: [], bullets: [], gems: [], events: [], nextId: 1000, nextWave: 24,
    guardianSpawned: false, guardianDefeated: false, extraction: 0,
    stats: { shots: 0, blocks: 0, damage: 0, rescues: 0, sockets: 0, travel: 0, kills: 0 }, inspiration: (options.inspiration ?? '').slice(0, 80),
    campaign: { salvage: 15, upgrades: { hull: 0, drive: 0, reactor: 0, tractor: 0 }, completed: [], voyages: 0, portVisits: 0, alumni: [] }, vessels: [],
    voyage: validateVoyage(options.voyage),
    region: options.region ?? 'sea', docks: makeRescueDocks(options.region ?? 'sea'), docked: null,
    meal: { remaining: 0, progress: 0, cooldown: 0 }, weather: { phase: 'clear', intensity: 0, nextStrike: 62, strike: null, wave: 0, flash: 0 },
  }
  clearRescueDockApproaches(state)
  for (const [i, role] of (['ally', 'merchant', 'raider'] as const).entries()) {
    const id = state.nextId++, npcCrew = [createRescueCrew(`vessel-${id}-pilot`, ['Nori', 'Bram', 'Rook'][i]!, false, true), createRescueCrew(`vessel-${id}-gunner`, ['Poppy', 'Wren', 'Flint'][i]!, true, true)]
    npcCrew[0]!.order = 'engine'; npcCrew[1]!.order = role === 'merchant' ? 'shield' : 'west'
    for (const p of npcCrew) p.commandSeq = 0
    state.vessels.push({ id, name: ['The Blue Wren', 'Moss & Moon Trading', 'The Red Rook'][i]!, role,
      ship: { ...state.ship, x: [-24, 22, 36][i]!, y: [-8, -4, 20][i]!, hp: 12, maxHp: 12 }, crew: npcCrew,
      stations: state.stations.map(st => ({ ...st })), targetX: [-24, 22, 36][i]!, targetY: [-8, -4, 20][i]!, visited: false, cooldown: 0, disabled: false })
  }
  revealRescueFog(state.world, state.ship, 19)
  return state
}

export function restartRescueGame(s: RescueState, nextBiome = false): RescueState {
  const next = createRescueGame({ seed: nextBiome ? (s.initialSeed + 1777) >>> 0 : s.initialSeed, biome: nextBiome ? ((s.biome + 1) % 3) as BiomeId : s.biome,
    solo: s.solo, players: s.crew.filter(c => c.origin === 'human').map(c => ({ id: c.id, name: c.name })), epoch: s.epoch + 1, inspiration: s.inspiration, region: s.region, voyage: s.voyage })
  next.campaign = structuredClone(s.campaign)
  if (nextBiome) next.campaign.voyages++
  next.crew = s.crew.map(c => ({ ...createRescueCrew(c.id, c.name, c.pet, c.pet), color: c.color, origin: c.origin, ability: c.ability, tourEnds: c.tourEnds, order: c.order }))
  next.ship.maxHp = 12 + next.campaign.upgrades.hull * 3; next.ship.hp = next.ship.maxHp
  return next
}

export function travelRescueDock(s: RescueState): RescueState | null {
  const dock = s.docks.find(d => d.id === s.docked)
  if (!dock?.destination) return null
  const next = restartRescueGame(s, true)
  next.region = dock.destination; next.docks = makeRescueDocks(next.region); clearRescueDockApproaches(next)
  return next
}
