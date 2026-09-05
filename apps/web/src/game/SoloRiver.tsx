import { useCallback, useEffect, useRef } from 'react'
import { createCoopGame, restartCoopGame, type CoopGameState, type CoopInput } from '@pongapp/game-core'
import { applyCrewControl, neutralControl, stepLocal, type Controls, type CrewControl } from '../online/LocalSimulation'
import { CoopRiver } from './CoopRiver'

const HUMAN_ID = 'solo-human', SCOUT_ID = 'solo-scout'
/** Scout uses deliberate, slower combat taps and never steals the player's steering. */
export function scoutInput(state: CoopGameState): CoopInput {
  return { paddle: 0,
    shootTap: state.tick % 75 === 0 && state.objects.some(o => o.type === 'predator'),
    recoverTap: state.tick % 70 === 0 && state.hearts <= 1 && state.crew.scrap >= 3 }
}
const freshControls = (): Controls => ({ [HUMAN_ID]: neutralControl(), [SCOUT_ID]: neutralControl() })
export function SoloRiver({ playerName, onExit }: { playerName: string; onExit: () => void }) {
  const gameRef = useRef(createCoopGame([{ id: HUMAN_ID, name: playerName }, { id: SCOUT_ID, name: 'Scout' }]))
  const controls = useRef(freshControls()), consumed = useRef<Controls>({})
  const listeners = useRef(new Set<(state: CoopGameState) => void>())
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const state = gameRef.current, scout = scoutInput(state)
      if (state.phase === 'playing') {
        if (scout.shootTap) applyCrewControl(controls.current[SCOUT_ID]!, { tap: 'shoot' })
        if (scout.recoverTap) applyCrewControl(controls.current[SCOUT_ID]!, { tap: 'recover' })
      }
      stepLocal(state, controls.current, consumed.current)
      if (state.tick % 2 === 0 || state.events.length || state.phase === 'finished') for (const listener of listeners.current) listener(state)
    }, 1000 / 60)
    return () => window.clearInterval(timer)
  }, [])
  const getState = useCallback(() => gameRef.current, [])
  const crew = useCallback((patch: Partial<CrewControl>) => applyCrewControl(controls.current[HUMAN_ID]!, patch), [])
  const subscribe = useCallback((listener: (state: CoopGameState) => void) => { listeners.current.add(listener); listener(gameRef.current); return () => listeners.current.delete(listener) }, [])
  const paddle = useCallback(() => {}, [])
  const rematch = useCallback(() => { controls.current = freshControls(); consumed.current = {}; gameRef.current = restartCoopGame(gameRef.current); for (const listener of listeners.current) listener(gameRef.current) }, [])
  return <CoopRiver getState={getState} subscribe={subscribe} localPlayerId={HUMAN_ID} title="Solo Adventure" roomCode="SCOUT AI" network={{ latencyMs: null, quality: 'good', reconnecting: false }} onPaddle={paddle} onCrew={crew} onExit={onExit} onRematch={rematch} modeLabel="Scout is your crewmate" />
}
