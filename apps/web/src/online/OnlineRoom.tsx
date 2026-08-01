import { useCallback, useEffect, useRef, useState } from 'react'
import type { AbilityId, GameState } from '@pongapp/game-core'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { GameCourt } from '../game/GameCourt'
import type { CourtEffectsSettings } from '../game/PixiCourt'
import { RoomClient, type RoomClientView } from './RoomClient'

interface Props {
  serverUrl: string
  roomCode?: string
  createRequest?: CreateRoomRequest
  identity: { guestId: string; displayName: string; ability: AbilityId }
  effects: CourtEffectsSettings
  onExit: () => void
  onResult: (state: GameState, playerId: string) => void
}

const initialView: RoomClientView = { status: 'idle', roomCode: '', lobby: null, gameState: null, participant: null, error: null, latencyMs: null }

export function OnlineRoom({ serverUrl, roomCode, createRequest, identity, effects, onExit, onResult }: Props) {
  const [view, setView] = useState(initialView)
  const [copied, setCopied] = useState(false)
  const clientRef = useRef<RoomClient | null>(null)
  const renderFallbackRef = useRef<GameState | null>(null)
  const resultRecorded = useRef(false)

  useEffect(() => {
    let disposed = false
    let unsubscribe: () => void = () => undefined
    const start = async () => {
      try {
        const code = roomCode ?? (createRequest ? await RoomClient.createRoom(serverUrl, createRequest) : '')
        if (!code || disposed) return
        const client = new RoomClient(serverUrl, code, identity)
        clientRef.current = client
        unsubscribe = client.subscribe((next) => {
          if (next.gameState) renderFallbackRef.current = next.gameState
          setView(next)
          if (next.gameState?.phase === 'finished' && next.participant && !resultRecorded.current) {
            resultRecorded.current = true
            onResult(next.gameState, next.participant.id)
          }
        })
        client.connect()
        window.location.hash = `/room/${code}`
      } catch (error) {
        setView({ ...initialView, status: 'error', error: error instanceof Error ? error.message : 'Could not open the room.' })
      }
    }
    void start()
    return () => {
      disposed = true
      unsubscribe()
      clientRef.current?.close()
      clientRef.current = null
    }
  }, [createRequest, identity, onResult, roomCode, serverUrl])

  const exit = () => {
    window.location.hash = ''
    onExit()
  }

  const getState = useCallback(() => {
    const client = clientRef.current
    if (client) return client.getRenderState()
    if (renderFallbackRef.current) return renderFallbackRef.current
    throw new Error('No online game state is available.')
  }, [])
  const subscribeState = useCallback((listener: (state: GameState) => void) => clientRef.current?.subscribeState(listener) ?? (() => undefined), [])
  const participantId = view.participant?.id

  if (view.status === 'error') {
    return <div className="pg-lobby"><div className="pg-lobby-card"><p className="pg-kicker">Connection error</p><h2>Room unavailable</h2><div className="pg-status pg-status--error">{view.error}</div><button className="pg-primary-button" onClick={exit}>Back home</button></div></div>
  }

  if (!view.gameState || !participantId || view.lobby?.phase === 'lobby') {
    const me = view.participant
    return (
      <section className="pg-lobby">
        <div className="pg-game-topbar"><div className="pg-game-title"><strong>Online room</strong><span>{view.status === 'connecting' ? 'Connecting…' : 'Invite your rivals'}</span></div><button className="pg-pill" onClick={exit}>Leave</button></div>
        <div className="pg-lobby-card">
          <p className="pg-kicker">Private invite code</p>
          <div className="pg-room-code"><strong>{view.roomCode || '······'}</strong><button className="pg-pill" onClick={() => {
            void navigator.clipboard.writeText(`${window.location.origin}${import.meta.env.BASE_URL}#/room/${view.roomCode}`)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          }}>{copied ? 'Copied!' : 'Copy link'}</button></div>
          <div className="pg-player-list">
            {(view.lobby?.participants ?? []).map((participant, index) => (
              <div className="pg-player" key={participant.id}>
                <div className="pg-player__identity"><span className="pg-player__dot" style={{ background: ['#dfff68', '#f36f44', '#67d4ff', '#b59cff'][index % 4] }} /><div><strong>{participant.displayName}</strong><br /><small>{participant.isAi ? 'AI' : participant.ability}{participant.isHost ? ' · host' : ''}</small></div></div>
                <small>{participant.isReady || participant.isAi ? 'READY' : 'WAITING'}</small>
              </div>
            ))}
          </div>
          {view.error && <div className="pg-status pg-status--error">{view.error}</div>}
          <div className="pg-status">The match starts when every connected player is ready and at least {view.lobby?.mode === 'crosscourt' ? 'four' : view.lobby?.mode === 'arena' ? 'three' : 'two'} paddles are filled.</div>
          {me?.slot !== null && <button className="pg-primary-button" onClick={() => clientRef.current?.setReady(!me?.isReady)}>{me?.isReady ? 'Not ready' : 'Ready up'}</button>}
        </div>
      </section>
    )
  }

  const participant = view.participant
  if (!participant) return null
  const matchTitle = view.gameState.config.mode === 'duel'
    ? 'Online Duel'
    : view.gameState.config.mode === 'arena'
      ? 'Online Arena'
      : 'Online Crosscourt'

  return (
    <GameCourt
      getState={getState}
      subscribe={subscribeState}
      onTarget={(_, target) => clientRef.current?.setTarget(target)}
      onAbility={() => clientRef.current?.useAbility()}
      onExit={exit}
      localPlayerIds={participant.slot === null ? [] : [participantId]}
      settings={effects}
      title={matchTitle}
      subtitle={`${view.roomCode} · ${view.latencyMs ?? '—'}ms`}
      onRematch={participant.isHost ? () => { resultRecorded.current = false; clientRef.current?.rematch() } : undefined}
    />
  )
}
