import { useCallback, useEffect, useRef } from 'react'
import {
  TICK_RATE,
  aiInputs,
  createAiMemory,
  createGame,
  restartGame,
  stepGame,
  type GameState,
  type MatchConfig,
  type PalType,
} from '@pongapp/game-core'
import { GameCourt } from './GameCourt'
import { screenVectorToWorld, type CourtPoint } from './perspective'
import type { CourtEffectsSettings } from './PixiCourt'

interface Props {
  config: MatchConfig
  humanPlayerIds: string[]
  effects: CourtEffectsSettings
  muted: boolean
  onExit: () => void
  onResult: (state: GameState) => void
}

export function LocalMatch({ config, humanPlayerIds, effects, muted, onExit, onResult }: Props) {
  const stateRef = useRef(createGame(config))
  const aiMemory = useRef(createAiMemory())
  const targets = useRef<Record<string, CourtPoint>>(Object.fromEntries(humanPlayerIds.map((id) => {
    const player = stateRef.current.players[id]
    return [id, { x: player?.x ?? 0.5, y: player?.y ?? 0.82 }]
  })))
  const palActions = useRef<Record<string, PalType | null>>({})
  const gamepadButtons = useRef<Record<string, boolean>>({})
  const listeners = useRef(new Set<(state: GameState) => void>())
  const resultRecorded = useRef(false)

  useEffect(() => {
    let frame = 0
    let previous = performance.now()
    let accumulator = 0
    const frameDuration = 1000 / TICK_RATE
    const run = (now: number) => {
      accumulator += Math.min(100, now - previous)
      previous = now
      while (accumulator >= frameDuration) {
        const state = stateRef.current
        const inputs = aiInputs(state, aiMemory.current)
        const gamepads = navigator.getGamepads?.() ?? []
        const viewSide = state.players[humanPlayerIds[0]!]?.side ?? 'bottom'
        for (const [index, id] of humanPlayerIds.entries()) {
          const gamepad = gamepads[index]
          const player = state.players[id]
          if (gamepad && player) {
            const screen = { x: gamepad.axes[0] ?? 0, y: gamepad.axes[1] ?? 0 }
            const world = screenVectorToWorld(screen, viewSide)
            const current = targets.current[id] ?? { x: player.x, y: player.y }
            if (Math.hypot(world.x, world.y) > 0.16) targets.current[id] = {
              x: Math.max(0, Math.min(1, current.x + world.x * 0.024)),
              y: Math.max(0, Math.min(1, current.y + world.y * 0.024)),
            }
            const types: PalType[] = ['guard', 'striker', 'captain']
            for (let button = 0; button < types.length; button += 1) {
              const key = `${index}-${button}`
              const pressed = Boolean(gamepad.buttons[button]?.pressed)
              if (pressed && !gamepadButtons.current[key]) palActions.current[id] = types[button]!
              gamepadButtons.current[key] = pressed
            }
          }
          const target = targets.current[id] ?? { x: player?.x ?? 0.5, y: player?.y ?? 0.82 }
          inputs[id] = { targetX: target.x, targetY: target.y, palAction: palActions.current[id] ?? null }
          palActions.current[id] = null
        }
        stepGame(state, inputs)
        if (state.phase === 'finished' && !resultRecorded.current) {
          resultRecorded.current = true
          onResult(state)
        }
        if (state.tick % 2 === 0 || state.events.length > 0) {
          const view = structuredClone(state)
          for (const listener of listeners.current) listener(view)
        }
        accumulator -= frameDuration
      }
      frame = requestAnimationFrame(run)
    }
    frame = requestAnimationFrame(run)
    return () => cancelAnimationFrame(frame)
  }, [humanPlayerIds, onResult])

  const getState = useCallback(() => stateRef.current, [])
  const subscribe = useCallback((listener: (state: GameState) => void) => {
    listeners.current.add(listener)
    return () => listeners.current.delete(listener)
  }, [])
  const setTarget = useCallback((id: string, x: number, y: number) => {
    targets.current[id] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
  }, [])
  const palAction = useCallback((id: string, type: PalType) => {
    palActions.current[id] = type
  }, [])
  const rematch = useCallback(() => {
    stateRef.current = restartGame(stateRef.current)
    aiMemory.current = createAiMemory()
    resultRecorded.current = false
    const view = structuredClone(stateRef.current)
    for (const listener of listeners.current) listener(view)
  }, [])

  return (
    <GameCourt
      getState={getState}
      subscribe={subscribe}
      onTarget={setTarget}
      onPalAction={palAction}
      onExit={onExit}
      localPlayerIds={humanPlayerIds}
      settings={effects}
      muted={muted}
      title={humanPlayerIds.length > 1 ? 'Same-Phone Pal Duel' : 'You vs the computer'}
      subtitle={`First to ${config.scoreToWin} · drag anywhere · call Pals, then command them`}
      onRematch={rematch}
    />
  )
}
