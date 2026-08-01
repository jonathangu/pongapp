import { describe, expect, it } from 'vitest'
import { aiInputs, buildMatchConfig, createAiMemory, createGame, stepGame, TICK_RATE } from '../src'

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

  it('scores when an active player misses a goal', () => {
    const state = duel()
    state.phase = 'playing'
    state.serveTicks = 0
    const ball = state.balls[0]!
    ball.x = -0.1
    ball.y = 0.05
    ball.vx = -0.5
    ball.lastToucherId = 'ai-2'
    stepGame(state)
    expect(state.scores['team-1']).toBe(1)
    expect(state.events.some((event) => event.type === 'score')).toBe(true)
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
    expect(config.players.map(({ side, team }) => [side, team])).toEqual([
      ['left', 'team-0'],
      ['right', 'team-0'],
      ['top', 'team-1'],
      ['bottom', 'team-1'],
    ])
  })
})
