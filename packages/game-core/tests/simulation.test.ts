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
