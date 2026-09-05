import { useCallback, useEffect, useRef } from 'react'
import { advanceCoopGame, createCoopGame, restartCoopGame, type CoopGameState, type CoopInput } from '@pongapp/game-core'
import type { CrewControl } from '../online/LocalSimulation'
import { CoopRiver } from './CoopRiver'

const HUMAN_ID = 'solo-human', SCOUT_ID = 'solo-scout'
/** Scout fills the missing job, but leaves steering decisions to a human pilot. */
export function scoutInput(state: CoopGameState): CoopInput {
  const human = state.players[HUMAN_ID]!, scout = state.players[SCOUT_ID]!, c = state.crew
  const job = human.station !== 'pilot' ? 'pilot' : state.hearts < 3 && c.scrap >= 3 ? 'engineer' : 'gunner'
  const input: CoopInput = { paddle: 0, station: scout.station === job ? undefined : job }
  if (c.swap?.to === SCOUT_ID) input.station = state.players[c.swap.from]?.station
  if (job === 'pilot') {
    const danger = state.objects.find(o => ['rock','log','predator'].includes(o.type) && Math.abs(o.y - .76) < .25 && Math.abs(o.x - state.boat.x) < .17)
    const prize = state.objects.filter(o => o.type === 'rescue' || o.type === 'relic').filter(o => o.y > .1 && o.y < .76).sort((a,b) => b.y - a.y)[0]
    const target = danger ? state.boat.x + (danger.x > state.boat.x ? -.2 : .2) : prize?.x ?? .5
    input.steer = Math.abs(target - state.boat.x) < .025 ? 0 : target > state.boat.x ? 1 : -1
  } else if (job === 'engineer') { input.action = true; input.flare = state.objects.some(o => o.type === 'predator' && Math.abs(o.y - .76) < .18) }
  else input.action = c.heat < 82 && !c.overheated
  return input
}

export function SoloRiver({ playerName, onExit }: { playerName: string; onExit: () => void }) {
  const gameRef = useRef(createCoopGame([{ id: HUMAN_ID, name: playerName }, { id: SCOUT_ID, name: 'Scout' }]))
  const input = useRef<CoopInput>({ paddle: 0 })
  const listeners = useRef(new Set<(state: CoopGameState) => void>())
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const state = gameRef.current
      advanceCoopGame(state, { [HUMAN_ID]: input.current, [SCOUT_ID]: scoutInput(state) })
      input.current = { ...input.current, flare: false, station: undefined, upgrade: undefined }
      if (state.tick % 2 === 0 || state.events.length || state.phase === 'finished') for (const listener of listeners.current) listener(state)
    }, 1000 / 60)
    return () => window.clearInterval(timer)
  }, [])
  const getState = useCallback(() => gameRef.current, [])
  const flare = useCallback(() => { input.current.flare = true }, [])
  const crew = useCallback((patch: Partial<CrewControl>) => { input.current = { ...input.current, ...patch, station: patch.station ?? input.current.station, upgrade: patch.upgrade ?? input.current.upgrade } }, [])
  const subscribe = useCallback((listener: (state: CoopGameState) => void) => { listeners.current.add(listener); listener(gameRef.current); return () => listeners.current.delete(listener) }, [])
  const paddle = useCallback(() => {}, [])
  const rematch = useCallback(() => { input.current = { paddle: 0 }; gameRef.current = restartCoopGame(gameRef.current); for (const listener of listeners.current) listener(gameRef.current) }, [])
  return <CoopRiver getState={getState} subscribe={subscribe} localPlayerId={HUMAN_ID} title="Solo Adventure" roomCode="SCOUT AI" network={{ latencyMs: null, quality: 'good', reconnecting: false }} onPaddle={paddle} onCrew={crew} onFlare={flare} onExit={onExit} onRematch={rematch} modeLabel="Scout is your crewmate" />
}
