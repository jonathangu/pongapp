import { useCallback, useEffect, useRef, useState } from 'react'
import type { AbilityId, GameState } from '@pongapp/game-core'
import { seatIdentity } from '@pongapp/game-core'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { GameCourt } from '../game/GameCourt'
import type { CourtEffectsSettings } from '../game/PixiCourt'
import { RoomClient, type RoomClientView } from './RoomClient'

interface Props {
  serverUrl: string
  roomCode?: string
  createRequest?: CreateRoomRequest
  quickStart?: boolean
  identity: { guestId: string; displayName: string; ability: AbilityId }
  effects: CourtEffectsSettings
  muted: boolean
  onExit: () => void
  onResult: (state: GameState, playerId: string) => void
}

const initialView: RoomClientView = { status: 'idle', roomCode: '', lobby: null, gameState: null, participant: null, error: null, latencyMs: null }

export function OnlineRoom({ serverUrl, roomCode, createRequest, quickStart = false, identity, effects, muted, onExit, onResult }: Props) {
  const [view, setView] = useState(initialView)
  const [copied, setCopied] = useState(false)
  const clientRef = useRef<RoomClient | null>(null)
  const renderFallbackRef = useRef<GameState | null>(null)
  const resultRecorded = useRef(false)
  const quickReadySent = useRef(false)

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
          if (quickStart && next.lobby?.phase === 'lobby' && next.participant && next.participant.slot !== null && !next.participant.isReady && !quickReadySent.current) {
            quickReadySent.current = true
            client.setReady(true)
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
  }, [createRequest, identity, onResult, quickStart, roomCode, serverUrl])

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
  const inviteUrl = `${window.location.origin}${import.meta.env.BASE_URL}${quickStart ? '?quick=1' : ''}#/room/${view.roomCode}`
  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  const shareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Play PongApp 1v1', text: 'Join my PongApp duel', url: inviteUrl })
        return
      } catch { /* Closing the share sheet is not an error. */ }
    }
    await copyInvite()
  }

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
          <div className="pg-room-code"><strong>{view.roomCode || '······'}</strong><button className="pg-pill" onClick={() => void copyInvite()}>{copied ? 'Copied!' : 'Copy link'}</button></div>
          {quickStart && (
            <div className="pg-quick-invite">
              <div><strong>Phone 1 is ready</strong><span>Send this invite to Phone 2. The duel starts as soon as they open it.</span></div>
              <button className="pg-primary-button" onClick={() => void shareInvite()}>Share 1v1 invite</button>
            </div>
          )}
          <div className="pg-player-list">
            {(view.lobby?.participants ?? []).map((participant, index) => {
              // Seat identity comes from the shared palette, and from the seat the
              // room assigned rather than the participant's position in this list:
              // spectators do not hold a slot, so a list index would hand the next
              // player a colour their paddle will not be drawn in.
              const seat = seatIdentity(participant.slot ?? index)
              return (
                <div className="pg-player" key={participant.id}>
                  <div className="pg-player__identity">
                    <span
                      className={`pg-player__dot pg-seat-mark pg-seat-mark--${seat.pattern}`}
                      style={{ color: seat.hex }}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{participant.displayName}</strong><br />
                      <small>{participant.isAi ? 'AI' : participant.ability}{participant.isHost ? ' · host' : ''} · {seat.label} ({seat.patternLabel})</small>
                    </div>
                  </div>
                  <small>{participant.isReady || participant.isAi ? 'READY' : 'WAITING'}</small>
                </div>
              )
            })}
          </div>
          {view.error && <div className="pg-status pg-status--error">{view.error}</div>}
          <div className="pg-status">{quickStart ? 'Waiting for the second phone. No AI will take their place.' : <>The match starts when every connected player is ready and at least {view.lobby?.mode === 'crosscourt' ? 'four' : view.lobby?.mode === 'arena' ? 'three' : 'two'} paddles are filled.</>}</div>
          {me && me.slot !== null && !quickStart && <button className="pg-primary-button" onClick={() => clientRef.current?.setReady(!me.isReady)}>{me.isReady ? 'Not ready' : 'Ready up'}</button>}
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
      muted={muted}
      extrapolate={false}
      title={matchTitle}
      subtitle={`${view.roomCode} · ${view.latencyMs ?? '—'}ms`}
      onRematch={participant.isHost ? () => { resultRecorded.current = false; clientRef.current?.rematch() } : undefined}
    />
  )
}
