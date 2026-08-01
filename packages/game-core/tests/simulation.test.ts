import { describe, expect, it } from 'vitest'
import { aiInputs, BALL_START_SPEED, buildMatchConfig, createAiMemory, createGame, serveVelocityForPlayer, stepGame, TICK_RATE } from '../src'

function duel() {
  return createGame(buildMatchConfig({
    mode: 'duel',
    humanPlayers: [{ id: 'human', name: 'Human', ability: 'dash' }],
    aiDifficulty: 'pro',
    itemIntensity: 'off',
    seed: 42,
  }))
}

describe('simulation', () => {
  it('starts deterministically and enters play after three seconds', () => {
    const first = duel()
    const second = duel()
    expect(first.balls).toEqual(second.balls)
    for (let tick = 0; tick < 3 * TICK_RATE; tick += 1) {
      stepGame(first)
    }
    expect(first.phase).toBe('playing')
  })

  it('seats the first player on the bottom wall', () => {
    // The local player is always seat 0, so this is what puts you at the near
    // end of the court instead of watching your own paddle side-on.
    const config = buildMatchConfig({ mode: 'duel', humanPlayers: [{ id: 'human', name: 'Human' }] })
    expect(config.players.map((player) => player.side)).toEqual(['bottom', 'top'])
  })

  it('scores when an active player misses a goal', () => {
    const state = duel()
    state.phase = 'playing'
    state.serveTicks = 0
    // Driven off the bottom wall, which is where seat 0 now sits.
    const ball = state.balls[0]!
    ball.x = 0.05
    ball.y = 1.1
    ball.vy = 0.5
    ball.lastToucherId = 'ai-2'
    stepGame(state)
    expect(state.scores['team-1']).toBe(1)
    expect(state.events.some((event) => event.type === 'score')).toBe(true)
  })

  it('ends multiball with the point and gives the conceding paddle an aimed serve', () => {
    const state = duel()
    state.phase = 'playing'
    state.serveTicks = 0
    const primary = state.balls[0]!
    primary.x = 0.5
    primary.y = 0.5
    primary.vx = 0.2
    primary.vy = 0
    state.balls.push({
      ...primary,
      id: 'ball-extra',
      x: 0.05,
      y: 1.1,
      vx: 0,
      vy: 0.5,
      lastToucherId: 'ai-2',
      transientTicks: 120,
    })

    stepGame(state)

    expect(state.balls).toHaveLength(1)
    expect(state.balls[0]).toMatchObject({ id: 'ball-1', x: 0.5, y: 0.5, vx: 0, vy: 0 })
    expect(state.servingPlayerId).toBe('human')

    const server = state.players.human!
    server.position = 0.2
    const velocity = serveVelocityForPlayer(server)
    expect(Math.hypot(velocity.vx, velocity.vy)).toBeCloseTo(BALL_START_SPEED)
    expect(velocity.vx).toBeLessThan(0)
    expect(velocity.vy).toBeLessThan(0)
  })

  it('keeps long simulations finite and bounded', () => {
    const state = duel()
    const memory = createAiMemory()
    for (let tick = 0; tick < 30 * TICK_RATE; tick += 1) {
      const inputs = aiInputs(state, memory)
      inputs.human = { target: 0.5 + Math.sin(tick / 90) * 0.35, abilityPressed: tick % 700 === 0 }
      stepGame(state, inputs)
      for (const ball of state.balls) {
        expect(Number.isFinite(ball.x)).toBe(true)
        expect(Number.isFinite(ball.y)).toBe(true)
        expect(Number.isFinite(ball.vx)).toBe(true)
        expect(Number.isFinite(ball.vy)).toBe(true)
      }
      if (state.phase === 'finished') break
    }
  })

  it('does not let AI exceed the shared paddle movement limit', () => {
    const state = duel()
    state.phase = 'playing'
    const memory = createAiMemory()
    const player = state.players['ai-2']!
    const before = player.position
    stepGame(state, aiInputs(state, memory))
    expect(Math.abs(player.position - before)).toBeLessThanOrEqual(1.35 / TICK_RATE + 1e-8)
  })

  it('reports the real start and finish of a dash', () => {
    const state = duel()
    const player = state.players.human!
    player.position = 0.5
    stepGame(state, { human: { target: 0.9, abilityPressed: true } })
    const event = state.events.find((candidate) => candidate.type === 'ability')
    expect(event).toMatchObject({
      type: 'ability',
      playerId: 'human',
      ability: 'dash',
      fromPosition: 0.5,
      toPosition: 0.85,
    })
  })

  it('pairs opposite sides as teammates in crosscourt doubles', () => {
    const config = buildMatchConfig({ mode: 'crosscourt', humanPlayers: [], totalPlayers: 4 })
    // Asserted as a property rather than a literal list: what crosscourt needs
    // is that partners defend opposite walls, and pinning the exact seat order
    // here is what made a deliberate reseating look like a regression.
    const opposite = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' } as const
    const bySide = Object.fromEntries(config.players.map((player) => [player.side, player.team]))
    expect(config.players.map((player) => player.side)).toEqual(['bottom', 'top', 'left', 'right'])
    for (const player of config.players) {
      expect(`${player.side} partners ${opposite[player.side]}: ${bySide[opposite[player.side]]} === ${player.team}`)
        .toBe(`${player.side} partners ${opposite[player.side]}: ${player.team} === ${player.team}`)
    }
  })
})
