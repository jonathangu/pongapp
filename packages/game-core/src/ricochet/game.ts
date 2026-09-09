import { direction, radians } from './geometry'
import { LAUNCHER, RICOCHET_SCENES } from './scenes'
import { simulateRicochet } from './simulation'
import type { Lens, Payload, Reflector, RicochetGame, ShotSetup } from './types'

export const ricochetWon = (game: RicochetGame) => game.rescued.length === RICOCHET_SCENES[game.scene]!.targets.length
export const availablePayloads = (game: RicochetGame): Payload[] => game.learned >= 4 ? ['plain', 'burst', 'pierce'] : game.learned >= 1 ? ['plain', 'burst'] : ['plain']
export const availableLenses = (game: RicochetGame): Lens[] => game.learned >= 3 ? ['mirror', 'split', 'focus'] : game.learned >= 2 ? ['mirror', 'split'] : ['mirror']
export function createRicochetGame(scene = 0, learned = 0): RicochetGame {
  scene = Number.isInteger(scene) ? Math.max(0, Math.min(2, scene)) : 0
  learned = Math.max(scene === 2 ? 3 : scene === 1 ? 1 : 0, Math.min(4, Math.max(0, Number.isFinite(learned) ? Math.floor(learned) : 0)))
  const level = RICOCHET_SCENES[scene]!
  return { version: 1, scene, shots: 0, learned, rescued: [], setup: { aim: level.aim,
    payload: scene ? 'burst' : 'plain', reflector: { ...level.reflector, mode: scene === 2 ? 'focus' : 'mirror' } } }
}
const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
export function validReflector(game: RicochetGame, value: Reflector): boolean {
  const area = RICOCHET_SCENES[game.scene]!.area
  return Boolean(value && finite(value.x, area.left, area.right) && finite(value.y, area.top, area.bottom) &&
    finite(value.angle, -180, 180) && availableLenses(game).includes(value.mode))
}
export function validSetup(game: RicochetGame, setup: ShotSetup): boolean {
  return Boolean(setup && finite(setup.aim, -160, -20) && availablePayloads(game).includes(setup.payload) && validReflector(game, setup.reflector))
}
export function finishRicochetShot(game: RicochetGame, shot = simulateRicochet(game)): RicochetGame {
  const rescued = [...new Set([...game.rescued, ...shot.rescued])].sort((a, b) => a - b)
  const learned = game.scene === 1 && shot.rescued.length && game.setup.payload === 'burst' ? Math.max(2, game.learned) : game.scene === 2 ? 4 : game.learned
  return { ...game, rescued, shots: game.shots + 1, learned }
}
export function restoreRicochetGame(raw: string | null): RicochetGame | null {
  if (!raw || raw.length > 16000) return null
  try {
    const value = JSON.parse(raw) as RicochetGame
    if (!value || value.version !== 1 || !Number.isInteger(value.scene) || !finite(value.scene, 0, 2) ||
      !Number.isInteger(value.shots) || !finite(value.shots, 0, 100000) || !Number.isInteger(value.learned) || !finite(value.learned, 0, 4) ||
      value.learned < (value.scene === 2 ? 3 : value.scene === 1 ? 1 : 0) || !Array.isArray(value.rescued) ||
      value.rescued.some(id => !Number.isInteger(id) || !finite(id, 0, RICOCHET_SCENES[value.scene]!.targets.length - 1)) ||
      new Set(value.rescued).size !== value.rescued.length || !validSetup(value, value.setup)) return null
    const reflector = value.setup.reflector
    return { version: 1, scene: value.scene, shots: value.shots, learned: value.learned, rescued: [...value.rescued].sort((a, b) => a - b),
      setup: { aim: value.setup.aim, payload: value.setup.payload, reflector: { x: reflector.x, y: reflector.y, angle: reflector.angle, mode: reflector.mode } } }
  } catch { return null }
}

/** Optional coaching, not automatic play. Each online player applies only their job. */
export function suggestedRicochetSetup(game: RicochetGame): ShotSetup {
  const level = RICOCHET_SCENES[game.scene]!, target = level.targets.find(target => !game.rescued.includes(target.id)) ?? level.targets[0]!
  if (target.y > 300) return { ...game.setup, aim: Math.atan2(target.y - LAUNCHER.y, target.x - LAUNCHER.x) * 180 / Math.PI }
  const reflector = { ...game.setup.reflector, x: game.scene === 2 && target.id < 5 ? 310 : game.scene === 2 ? 281 : 280,
    y: game.scene === 2 && target.id < 5 ? 245 : game.scene === 2 ? 275 : 274 }
  const incoming = Math.atan2(reflector.y - LAUNCHER.y, reflector.x - LAUNCHER.x) * 180 / Math.PI
  const outgoing = Math.atan2(target.y - reflector.y, target.x - reflector.x) * 180 / Math.PI
  reflector.angle = (incoming + outgoing) / 2
  // Ray contact is a few units before the reflector centre; the target's generous
  // hit circle absorbs that physical face offset without silently changing the shot.
  return { ...game.setup, aim: incoming, reflector }
}
export function reflectorHandle(reflector: Reflector) {
  const d = direction(reflector.angle)
  return { x: reflector.x + d.x * 48, y: reflector.y + d.y * 48 }
}
export function normalizedAngle(angle: number): number { return ((angle + 180) % 360 + 360) % 360 - 180 }
export function aimHandle(aim: number) { return { x: LAUNCHER.x + Math.cos(radians(aim)) * 65, y: LAUNCHER.y + Math.sin(radians(aim)) * 65 } }
