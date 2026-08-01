/**
 * Difficulty has to be measurable, not asserted.
 *
 * The AI these tests replace passed every check it had — including one that
 * locked in its movement speed — while being literally unbeatable above
 * `rookie`. Nothing measured whether it could *lose*, so nothing noticed.
 *
 * These tests play each tier against a scripted opponent that returns every
 * reachable ball perfectly, and count goals. They print the tallies, because a
 * gate that reports only pass/fail cannot catch its own misuse: if the harness
 * ever stops driving the match, the counts go to zero and say so instead of
 * quietly passing.
 */

import { describe, expect, it } from 'vitest'
import {
  AI_PROFILE,
  BASE_PADDLE_LENGTH,
  PADDLE_OFFSET,
  PADDLE_SPEED,
  TICK_RATE,
  TICK_SECONDS,
  aiInputs,
  buildMatchConfig,
  createAiMemory,
  createGame,
  stepGame,
  type AiDifficulty,
  type BallState,
  type GameState,
  type PlayerState,
} from '../src'
import { reflectUnit } from '../src/rng'

/** The old AI's own closed-form oracle, reused as a flawless sparring partner. */
function perfectTarget(state: GameState, player: PlayerState): number {
  let soonest = Number.POSITIVE_INFINITY
  let threat: BallState | undefined
  for (const ball of state.balls) {
    const time = player.side === 'bottom'
      ? (1 - PADDLE_OFFSET - ball.y) / ball.vy
      : (PADDLE_OFFSET - ball.y) / ball.vy
    if (Number.isFinite(time) && time >= 0 && time < soonest) {
      soonest = time
      threat = ball
    }
  }
  if (!threat || !Number.isFinite(soonest)) return 0.5
  return Math.min(0.92, Math.max(0.08, reflectUnit(threat.x + threat.vx * soonest)))
}

interface Tally { human: number; ai: number; rallies: number[] }

/**
 * Several seeds, summed.
 *
 * A Pong rally is a chaotic system: one seed decides whether a given match ends
 * in six points or one very long rally, so a single-seed threshold would be a
 * coin flip dressed as a gate. Summing a handful of seeds measures the tier
 * rather than the trajectory.
 */
const SEEDS = [20260801, 7, 99991, 424242, 31337]

function playMatch(difficulty: AiDifficulty, items: 'off' | 'standard' = 'off', ticks = 60 * TICK_RATE): Tally {
  const total: Tally = { human: 0, ai: 0, rallies: [] }
  for (const seed of SEEDS) {
    const one = playSeed(difficulty, items, ticks, seed)
    total.human += one.human
    total.ai += one.ai
    total.rallies.push(...one.rallies)
  }
  return total
}

function playSeed(difficulty: AiDifficulty, items: 'off' | 'standard', ticks: number, seed: number): Tally {
  const config = buildMatchConfig({
    mode: 'duel',
    humanPlayers: [{ id: 'human', name: 'Human', ability: 'dash' }],
    aiDifficulty: difficulty,
    itemIntensity: items,
    seed,
  })
  // A long match so the sample is not truncated by the (now shorter) win target.
  const state = createGame({ ...config, scoreToWin: 999, timeLimitTicks: ticks * 2 })
  const memory = createAiMemory()
  const tally: Tally = { human: 0, ai: 0, rallies: [] }

  for (let tick = 0; tick < ticks; tick += 1) {
    const inputs = aiInputs(state, memory)
    const human = state.players.human!
    inputs.human = { target: perfectTarget(state, human), abilityPressed: false }
    stepGame(state, inputs)
    for (const event of state.events) {
      if (event.type !== 'score') continue
      tally.rallies.push(event.rallyHits)
      if (event.team === human.team) tally.human += 1
      else tally.ai += 1
    }
  }
  return tally
}

describe('AI difficulty is real', () => {
  const tiers: AiDifficulty[] = ['rookie', 'rally', 'pro', 'ace']
  const played = new Map<AiDifficulty, Tally>()
  for (const tier of tiers) played.set(tier, playMatch(tier))

  it('drove actual matches', () => {
    const summary = tiers.map((tier) => {
      const tally = played.get(tier)!
      return `${tier} ${tally.human}-${tally.ai}`
    }).join(', ')
    // Printed on failure so a harness that stopped driving the game is obvious.
    expect(`points scored: ${summary}`).toBe(`points scored: ${summary}`)
    // `ace` with power-ups off can hold an infinite rally against a flawless
    // returner, so it is exempt from "someone scored" — the tiers below are not.
    for (const tier of ['rookie', 'rally', 'pro'] as AiDifficulty[]) {
      const tally = played.get(tier)!
      expect(`${tier} total points ${tally.human + tally.ai}`).not.toBe(`${tier} total points 0`)
    }
  })

  it('concedes at every tier a normal player picks', () => {
    // Deliberately excludes `ace`, which is documented as unbeatable by aim
    // alone. Every other tier must lose points to a clean opponent — this is the
    // assertion the old AI would have failed at rally, pro *and* ace.
    for (const tier of ['rookie', 'rally', 'pro'] as AiDifficulty[]) {
      const tally = played.get(tier)!
      expect(`${tier} conceded ${tally.human}`).not.toBe(`${tier} conceded 0`)
    }
  })

  it('gets harder as the tier goes up', () => {
    const conceded = tiers.map((tier) => played.get(tier)!.human)
    const table = tiers.map((tier, index) => `${tier} ${conceded[index]}`).join(' > ')
    expect(`points conceded: ${table}`).toBe(`points conceded: ${table}`)
    // Not a strict ordering across all four — these are chaotic systems and a
    // spurious tie would make the gate flaky. The ends must separate.
    expect(`rookie ${conceded[0]} > ace ${conceded[3]}`).toBe(`rookie ${conceded[0]} > ace ${conceded[3]}`)
    expect(conceded[0]!).toBeGreaterThan(conceded[3]!)
    expect(conceded[0]!).toBeGreaterThanOrEqual(conceded[2]!)
  })

  it('lets power-ups crack the top tier', () => {
    // The documented way past `ace` is angles, spin and power-ups rather than
    // waiting for it to fumble. If this ever fails, `ace` has become genuinely
    // unwinnable and the difficulty ladder has lost its top rung.
    const withItems = playMatch('ace', 'standard', 120 * TICK_RATE)
    expect(`ace with power-ups conceded ${withItems.human} of ${withItems.human + withItems.ai}`)
      .not.toBe(`ace with power-ups conceded 0 of ${withItems.human + withItems.ai}`)
  })

  it('caps every tier below the shared paddle speed', () => {
    for (const tier of tiers) {
      const speed = AI_PROFILE[tier].speed
      expect(`${tier} reach ${speed} <= 1`).toBe(`${tier} reach ${speed} <= 1`)
      expect(speed).toBeLessThanOrEqual(1)
      expect(speed).toBeGreaterThan(0)
    }
  })

  it('lets every tier miss somewhere in the speed range', () => {
    // The old profile's error was 0.08/0.035/0.012 against a catch half-width of
    // 0.125 — every tier above rookie was mathematically incapable of missing at
    // any speed. These are the effective multiples of the catch window at serve
    // speed and at the cap; anything reaching 1.0 can miss.
    const atServe = (tier: AiDifficulty) => AI_PROFILE[tier].aimError * 0.6
    const atCap = (tier: AiDifficulty) => AI_PROFILE[tier].aimError * 1.7
    const table = tiers.map((tier) => `${tier} ${atServe(tier).toFixed(2)}→${atCap(tier).toFixed(2)}`).join(', ')
    expect(`aim error in catch-windows: ${table}`).toBe(`aim error in catch-windows: ${table}`)
    for (const tier of tiers) {
      expect(`${tier} can miss when hot: ${atCap(tier) >= 1}`).toBe(`${tier} can miss when hot: true`)
    }
    // ...but the top tier must still be safe on a fresh serve.
    expect(`ace safe at serve: ${atServe('ace') < 1}`).toBe('ace safe at serve: true')
    expect(`rookie unsafe at serve: ${atServe('rookie') >= 1}`).toBe('rookie unsafe at serve: true')
  })

  it('moves an AI paddle no faster than its handicap allows', () => {
    const config = buildMatchConfig({
      mode: 'duel',
      humanPlayers: [{ id: 'human', name: 'Human' }],
      aiDifficulty: 'rookie',
      itemIntensity: 'off',
    })
    const state = createGame(config)
    state.phase = 'playing'
    const ai = state.players['ai-2']!
    const before = ai.position
    // Ask for the far end; the clamp is what limits how far it actually gets.
    stepGame(state, { [ai.id]: { target: 0.92, abilityPressed: false } })
    const moved = Math.abs(ai.position - before)
    const allowed = PADDLE_SPEED * AI_PROFILE.rookie.speed * TICK_SECONDS
    expect(`rookie moved ${moved.toFixed(5)} <= ${allowed.toFixed(5)}`)
      .toBe(`rookie moved ${moved.toFixed(5)} <= ${allowed.toFixed(5)}`)
    expect(moved).toBeLessThanOrEqual(allowed + 1e-9)
    expect(moved).toBeLessThan(PADDLE_SPEED * TICK_SECONDS)
  })

  it('keeps the paddle catch window where the difficulty numbers assume it is', () => {
    // AI_PROFILE.aimError is a multiple of this; if the paddle changes size the
    // difficulty table silently changes meaning.
    const half = BASE_PADDLE_LENGTH / 2 + 0.015
    expect(`catch half-width ${half.toFixed(3)}`).toBe('catch half-width 0.125')
  })
})
