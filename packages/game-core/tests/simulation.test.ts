import { describe, expect, it } from 'vitest'
import {
  BALL_RADIUS,
  DEFAULT_TIME_LIMIT_TICKS,
  DUEL_COURT_LENGTH_SCALE,
  GOAL_WIDTH,
  PAL_ENERGY_MAX,
  PAL_ENERGY_REGEN_TICKS,
  PAL_PROFILE,
  POWER_STAR_LIFETIME_TICKS,
  buildMatchConfig,
  canUsePalCard,
  createGame,
  goalAttackAim,
  isGoalCamping,
  restartGame,
  stepGame,
  type BallState,
  type GameState,
} from '../src'

const idle = (x = 0.5, y = 0.8) => ({ targetX: x, targetY: y, palAction: null })
const puck = (partial: Partial<BallState> = {}): BallState => ({
  id: 'puck-1', x: 0.5, y: 0.5, vx: 0, vy: 0, radius: BALL_RADIUS,
  spin: 0, lastToucherId: null, carrierPalId: null, tetherPalId: null, ...partial,
})

function playing(): GameState {
  const state = createGame(buildMatchConfig({ humanPlayers: [{ id: 'human', name: 'Human' }], seed: 42 }))
  state.phase = 'playing'
  state.countdownTicks = 0
  state.serveTicks = 0
  return state
}

function summon(state: GameState, type: 'guard' | 'striker' | 'captain') {
  const player = state.players.human!
  stepGame(state, { human: { targetX: player.x, targetY: player.y, palAction: type } })
  const pal = state.pals.find((candidate) => candidate.ownerId === 'human' && candidate.type === type)!
  pal.mode = 'patrol'
  pal.stateTicks = 0
  pal.abilityCooldownTicks = 0
  return pal
}

describe('Pal Duel air-hockey simulation', () => {
  it('creates a vertical v3 duel with round two-dimensional mallets', () => {
    const state = createGame(buildMatchConfig({ humanPlayers: [{ id: 'human', name: 'Human' }], seed: 9 }))
    expect(state.rulesetVersion).toBe(3)
    expect(state.config.scoreToWin).toBe(5)
    expect(state.config.timeLimitTicks).toBe(DEFAULT_TIME_LIMIT_TICKS)
    expect(state.config.courtLengthScale).toBe(DUEL_COURT_LENGTH_SCALE)
    expect(state.players.human).toMatchObject({ x: 0.5, y: 0.82, vx: 0, vy: 0 })
    expect(state.players['ai-2']).toMatchObject({ x: 0.5, y: 0.18 })
  })

  it('moves a player freely in both axes while protecting only the opponent crease', () => {
    const state = playing()
    const player = state.players.human!
    for (let tick = 0; tick < 80; tick += 1) stepGame(state, { human: { targetX: 0.78, targetY: 0.36, palAction: null } })
    expect(player.x).toBeCloseTo(0.78, 2)
    expect(player.y).toBeCloseTo(0.36, 2)
    for (let tick = 0; tick < 80; tick += 1) stepGame(state, { human: { targetX: 0.5, targetY: 0, palAction: null } })
    expect(player.y).toBeGreaterThan(0.14)
  })

  it('turns mallet motion into a directional puck strike', () => {
    const state = playing()
    const player = state.players.human!
    player.x = 0.4
    player.y = 0.7
    state.balls[0] = puck({ x: 0.48, y: 0.7, vx: -0.15 })
    stepGame(state, { human: { targetX: 0.52, targetY: 0.68, palAction: null } })
    expect(state.balls[0]!.vx).toBeGreaterThan(0)
    expect(state.events.some((event) => event.type === 'hit')).toBe(true)
  })

  it('bounces on end rails outside the goal and scores through the opening', () => {
    expect(GOAL_WIDTH).toBe(0.4)
    const rail = playing()
    rail.balls[0] = puck({ x: 0.5 - GOAL_WIDTH, y: 0.025, vy: -0.8 })
    stepGame(rail)
    expect(rail.balls[0]!.vy).toBeGreaterThan(0)

    const goal = playing()
    goal.balls[0] = puck({ x: 0.5, y: -0.06, vy: -0.8, lastToucherId: 'human' })
    stepGame(goal)
    expect(goal.scores['team-0']).toBe(1)
  })

  it('reads a camping goalie and targets an open post or a real one-rail bank', () => {
    const state = playing()
    const defender = state.players.human!
    defender.x = 0.5
    defender.y = 0.82
    expect(isGoalCamping(state, defender)).toBe(true)

    const direct = goalAttackAim(state, 'top', 0.4, 0.42)
    expect(direct).toMatchObject({ shot: 'openPost' })
    expect(Math.abs(direct.targetX - defender.x)).toBeGreaterThan(0.14)

    const bank = goalAttackAim(state, 'top', 0.4, 0.42, true)
    expect(bank.shot).toBe('bank')
    expect(bank.x < 0 || bank.x > 1).toBe(true)
    expect(bank.targetX).toBe(direct.targetX)
  })

  it('runs a bank trajectory through the open post beside a camping goalie', () => {
    const state = playing()
    const defender = state.players.human!
    defender.x = 0.5
    defender.y = 0.82
    const start = { x: 0.4, y: 0.42 }
    const aim = goalAttackAim(state, 'top', start.x, start.y, true)
    const dx = aim.x - start.x
    const dy = (aim.y - start.y) * state.config.courtLengthScale
    const distance = Math.hypot(dx, dy)
    state.balls[0] = puck({
      ...start,
      vx: dx / distance * PAL_PROFILE.striker.shotSpeed,
      vy: dy / distance * PAL_PROFILE.striker.shotSpeed,
      lastToucherId: 'ai-2',
    })
    for (let tick = 0; tick < 240 && state.scores['team-1'] === 0; tick += 1) stepGame(state)
    expect(state.scores['team-1']).toBe(1)
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'score', defenderCamping: true }))
  })

  it('regenerates one of six energy pips every five active seconds', () => {
    const state = playing()
    const human = state.players.human!
    human.palEnergy = 0
    for (let tick = 0; tick < PAL_ENERGY_REGEN_TICKS - 1; tick += 1) stepGame(state, { human: idle() })
    expect(human.palEnergy).toBe(0)
    stepGame(state, { human: idle() })
    expect(human.palEnergy).toBe(1)
  })

  it('summons one persistent Guard, then turns the same card into a command', () => {
    const state = playing()
    const guard = summon(state, 'guard')
    expect(guard.health).toBe(4)
    expect(state.players.human!.palEnergy).toBe(0)
    expect(canUsePalCard(state, state.players.human!, 'guard')).toBe(true)
    stepGame(state, { human: { targetX: 0.5, targetY: 0.8, palAction: 'guard' } })
    expect(state.pals.filter((pal) => pal.type === 'guard')).toHaveLength(1)
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'palCommanded', palId: guard.id }))
  })

  it('lets a Guard take damage, grab the puck, and remain on the field', () => {
    const state = playing()
    const guard = summon(state, 'guard')
    state.balls[0] = puck({ x: guard.x, y: guard.y, vy: 0.9, lastToucherId: 'ai-2' })
    stepGame(state)
    expect(state.pals.some((pal) => pal.id === guard.id)).toBe(true)
    expect(guard.health).toBe(3)
    expect(state.balls[0]!.carrierPalId).toBe(guard.id)
    expect(state.events.some((event) => event.type === 'palGrabbed')).toBe(true)
  })

  it('telegraphs the Hook target before firing its visible tether', () => {
    const state = playing()
    state.players.human!.palEnergy = 3
    const hook = summon(state, 'striker')
    state.balls[0] = puck({ x: hook.x + 0.16, y: hook.y })
    stepGame(state, { human: { targetX: 0.5, targetY: 0.8, palAction: 'striker' } })
    expect(hook.mode).toBe('chase')
    expect(state.balls[0]!.tetherPalId).toBeNull()
    for (let tick = 0; tick < 18; tick += 1) stepGame(state, { human: idle() })
    expect(state.balls[0]!.tetherPalId).toBe(hook.id)
    expect(state.events.some((event) => event.type === 'palTethered')).toBe(true)
  })

  it('lets an attacking Hook bank around a goalie who camps in the mouth', () => {
    const state = playing()
    state.players.human!.palEnergy = 3
    const hook = summon(state, 'striker')
    const defender = state.players['ai-2']!
    defender.x = 0.5
    defender.y = 0.18
    hook.mode = 'carry'
    hook.carryTicks = 999
    state.balls[0] = puck({ x: hook.x, y: hook.y, carrierPalId: hook.id, lastToucherId: 'human' })
    stepGame(state, { human: idle() })
    expect(state.players.human!.bankShots).toBe(1)
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'palShot', shot: 'bank' }))
  })

  it('turns a knocked-out Captain into multiple Hatchlings', () => {
    const state = playing()
    state.players.human!.palEnergy = PAL_ENERGY_MAX
    const captain = summon(state, 'captain')
    captain.health = 1
    const enemy = state.players['ai-2']!
    enemy.x = captain.x
    enemy.y = captain.y
    stepGame(state)
    expect(state.pals.some((pal) => pal.id === captain.id)).toBe(false)
    expect(state.pals.filter((pal) => pal.type === 'hatchling').length).toBeGreaterThanOrEqual(2)
  })

  it('magnetizes a Power Star into a nearby Pal and applies its role upgrade', () => {
    const state = playing()
    const guard = summon(state, 'guard')
    state.powerStar = { id: 'star-test', x: guard.x, y: guard.y, spawnedAtTick: state.tick, expiresAtTick: state.tick + POWER_STAR_LIFETIME_TICKS }
    stepGame(state)
    expect(state.powerStar).toBeNull()
    expect(guard.hasStar).toBe(true)
    expect(state.events.some((event) => event.type === 'palPowered')).toBe(true)
  })

  it('clears field actors on a goal and grants comeback energy', () => {
    const state = playing()
    summon(state, 'guard')
    state.balls[0] = puck({ x: 0.5, y: 1.06, vy: 0.8, lastToucherId: 'ai-2' })
    stepGame(state)
    expect(state.scores['team-1']).toBe(1)
    expect(state.pals).toEqual([])
    expect(state.players.human!.palEnergy).toBe(1)
    expect(state.players.human!.campedGoalsConceded).toBe(1)
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'score', defenderCamping: true }))
  })

  it('fills both energy meters for a tied Final Volley and restarts cleanly', () => {
    const state = playing()
    state.remainingTicks = 1
    state.players.human!.palEnergy = 0
    state.players['ai-2']!.palEnergy = 1
    stepGame(state)
    expect(state.overtime).toBe(true)
    expect(Object.values(state.players).every((player) => player.palEnergy === PAL_ENERGY_MAX)).toBe(true)
    const fresh = restartGame(state, 100)
    expect(fresh.rulesetVersion).toBe(3)
    expect(fresh.pals).toEqual([])
    expect(fresh.powerStar).toBeNull()
  })
})
