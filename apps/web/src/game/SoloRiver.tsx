import { useCallback, useEffect, useRef } from 'react'
import { createCoopGame, restartCoopGame, type CoopGameState, type CoopInput, type VoyagePack } from '@pongapp/game-core'
import { applyCrewControl, neutralControl, stepLocal, type Controls, type CrewControl } from '../online/LocalSimulation'
import { CoopRiver } from './CoopRiver'

const HUMAN_ID = 'solo-human', SCOUT_ID = 'solo-scout'
/** Scout occupies one physical room and respects the same travel time as a human. */
export function scoutInput(state: CoopGameState): CoopInput {
  const scout=state.players[SCOUT_ID],human=state.players[HUMAN_ID]
  if(scout?.deck.moving)return {paddle:0}
  const station=state.hearts<3&&human?.station==='shoot'||state.hearts<=1&&human?.station!=='recover'?'recover':'shoot'
  return {paddle:0,station:scout?.station===station?undefined:station}
}
const freshControls = (): Controls => ({ [HUMAN_ID]: neutralControl(), [SCOUT_ID]: neutralControl() })
export function SoloRiver({ playerName, onExit,voyage }: { playerName: string; onExit: () => void;voyage?:VoyagePack }) {
  const gameRef = useRef(createCoopGame([{ id: HUMAN_ID, name: playerName }, { id: SCOUT_ID, name: 'Scout' }],undefined,voyage))
  const controls = useRef(freshControls()), consumed = useRef<Controls>({})
  const listeners = useRef(new Set<(state: CoopGameState) => void>())
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const state = gameRef.current, scout = scoutInput(state)
      if (state.phase === 'playing') {
        if (scout.station) applyCrewControl(controls.current[SCOUT_ID]!, { station:scout.station })
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
