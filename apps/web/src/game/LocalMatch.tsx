import { useCallback, useEffect, useRef } from 'react'
import { aiInputs, createAiMemory, createGame, restartGame, stepGame, TICK_RATE, type GameState, type MatchConfig } from '@pongapp/game-core'
import { GameCourt } from './GameCourt'
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
  const targets = useRef<Record<string, number>>(Object.fromEntries(humanPlayerIds.map((id) => [id, 0.5])))
  const abilities = useRef(new Set<string>())
  const gamepadButtons = useRef<Record<number, boolean>>({})
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
        for (const [index, id] of humanPlayerIds.entries()) {
          const gamepad = gamepads[index]
          const player = state.players[id]
          if (gamepad && player) {
            const axis = player.side === 'left' || player.side === 'right' ? (gamepad.axes[1] ?? 0) : (gamepad.axes[0] ?? 0)
            if (Math.abs(axis) > 0.16) targets.current[id] = Math.max(0, Math.min(1, (targets.current[id] ?? 0.5) + axis * 0.024))
            const pressed = Boolean(gamepad.buttons[0]?.pressed)
            if (pressed && !gamepadButtons.current[index]) abilities.current.add(id)
            gamepadButtons.current[index] = pressed
          }
          inputs[id] = { target: targets.current[id] ?? 0.5, abilityPressed: abilities.current.delete(id) }
        }
        stepGame(state, inputs)
        if (state.phase === 'finished' && !resultRecorded.current) {
          resultRecorded.current = true
          onResult(state)
        }
        if (state.tick % 3 === 0 || state.events.length > 0) {
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
  const setTarget = useCallback((id: string, target: number) => {
    targets.current[id] = Math.max(0, Math.min(1, target))
  }, [])
  const useAbility = useCallback((id: string) => {
    abilities.current.add(id)
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
      onAbility={useAbility}
      onExit={onExit}
      localPlayerIds={humanPlayerIds}
      settings={effects}
      muted={muted}
      title={config.mode === 'duel' ? 'Classic Duel' : config.mode === 'arena' ? 'Four-Side Arena' : 'Crosscourt Doubles'}
      subtitle={`${config.itemIntensity} items · ${Object.values(config.players).filter((player) => player.isAi).length} AI`}
      onRematch={rematch}
    />
  )
}
