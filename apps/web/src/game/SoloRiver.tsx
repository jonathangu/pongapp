import { useCallback, useEffect, useRef } from 'react'
import { advanceCoopGame, createCoopGame, restartCoopGame, type CoopGameState } from '@pongapp/game-core'
import { CoopRiver } from './CoopRiver'

const HUMAN_ID = 'solo-human'
const SCOUT_ID = 'solo-scout'

function scoutPaddle(state: CoopGameState, humanPaddle: number): number {
  if (state.phase !== 'playing') return 0
  const danger = state.objects
    .filter((object) => (object.type === 'rock' || object.type === 'log') && object.y > 0.43 && object.y < 0.78)
    .sort((a, b) => b.y - a.y)[0]
  if (danger && Math.abs(danger.x - state.boat.x) < 0.16) return danger.x >= state.boat.x ? 1 : 0
  const prize = state.objects
    .filter((object) => object.type !== 'rock' && object.type !== 'log' && object.y > 0.28 && object.y < 0.72)
    .sort((a, b) => b.y - a.y)[0]
  if (prize && Math.abs(prize.x - state.boat.x) > 0.055) return prize.x < state.boat.x ? 1 : 0
  return humanPaddle > 0.5 ? 1 : (Math.sin(state.tick / 55) > 0.82 ? 0.72 : 0)
}

export function SoloRiver({ playerName, onExit }: { playerName: string; onExit: () => void }) {
  const gameRef = useRef(createCoopGame([{ id: HUMAN_ID, name: playerName }, { id: SCOUT_ID, name: 'Scout' }]))
  const snapshotRef = useRef(structuredClone(gameRef.current))
  const paddleRef = useRef(0)
  const listeners = useRef(new Set<(state: CoopGameState) => void>())

  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = gameRef.current
      advanceCoopGame(state, { [HUMAN_ID]: { paddle: paddleRef.current }, [SCOUT_ID]: { paddle: scoutPaddle(state, paddleRef.current) } })
      if (state.tick % 2 === 0 || state.events.length > 0) {
        snapshotRef.current = structuredClone(state)
        for (const listener of listeners.current) listener(snapshotRef.current)
      }
    }, 1000 / 60)
    return () => window.clearInterval(timer)
  }, [])

  const getState = useCallback(() => snapshotRef.current, [])
  const subscribe = useCallback((listener: (state: CoopGameState) => void) => { listeners.current.add(listener); listener(snapshotRef.current); return () => listeners.current.delete(listener) }, [])
  const paddle = useCallback((power: number) => { paddleRef.current = power }, [])
  const rematch = useCallback(() => { gameRef.current = restartCoopGame(gameRef.current); snapshotRef.current = structuredClone(gameRef.current); for (const listener of listeners.current) listener(snapshotRef.current) }, [])

  return <CoopRiver getState={getState} subscribe={subscribe} localPlayerId={HUMAN_ID} title="Solo Adventure" roomCode="SCOUT AI" network={{ latencyMs: null, quality: 'good', reconnecting: false }} onPaddle={paddle} onExit={onExit} onRematch={rematch} modeLabel="Scout is reading the river" />
}
