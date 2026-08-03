import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState, PalType } from '@pongapp/game-core'
import { seatIdentity } from '@pongapp/game-core'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { GameCourt } from '../game/GameCourt'
import type { CourtEffectsSettings } from '../game/PixiCourt'
import { inviteUrlFor, normalizeRoomCode, pongHomeUrlFor } from './invite'
import { RoomClient, type RoomClientView } from './RoomClient'

interface Props {
  serverUrl: string
  roomCode?: string
  createRequest?: CreateRoomRequest
  identity: { guestId: string; displayName: string }
  effects: CourtEffectsSettings
  muted: boolean
  onExit: () => void
  onResult: (state: GameState, playerId: string) => void
}

const initialView: RoomClientView = {
  status: 'idle', roomCode: '', lobby: null, gameState: null, participant: null, error: null,
  latencyMs: null, latencyP95Ms: null, jitterMs: null, snapshotGapP95Ms: null, connectionQuality: 'good',
}

export function OnlineRoom({ serverUrl, roomCode, createRequest, identity, effects, muted, onExit, onResult }: Props) {
  const [view, setView] = useState(initialView)
  const [copied, setCopied] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const clientRef = useRef<RoomClient | null>(null)
  const renderFallbackRef = useRef<GameState | null>(null)
  const resultRecorded = useRef(false)

  useEffect(() => {
    let disposed = false
    let unsubscribe: () => void = () => undefined
    const start = async () => {
      try {
        const createdCode = roomCode ?? (createRequest ? await RoomClient.createRoom(serverUrl, createRequest) : '')
        const code = normalizeRoomCode(createdCode)
        if (!code || disposed) throw new Error('That invite link is missing its room code.')
        const nextUrl = inviteUrlFor(window.location.origin, import.meta.env.BASE_URL, code, true)
        if (nextUrl) window.history.replaceState(null, '', nextUrl)
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
    window.history.replaceState(null, '', pongHomeUrlFor(window.location.origin, import.meta.env.BASE_URL))
    onExit()
  }
  const getState = useCallback(() => {
    if (clientRef.current) return clientRef.current.getRenderState()
    if (renderFallbackRef.current) return renderFallbackRef.current
    throw new Error('No online game state is available.')
  }, [])
  const subscribeState = useCallback((listener: (state: GameState) => void) => clientRef.current?.subscribeState(listener) ?? (() => undefined), [])
  const participantId = view.participant?.id
  const activeRoomCode = normalizeRoomCode(view.roomCode || roomCode || view.lobby?.roomCode || '')
  const inviteUrl = activeRoomCode ? inviteUrlFor(window.location.origin, import.meta.env.BASE_URL, activeRoomCode, true) : null

  const copyInvite = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setInviteError(null)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setInviteError('Clipboard access was blocked. Use Share and send this page.')
    }
  }
  const shareInvite = async () => {
    if (!inviteUrl) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Pal Duel!', text: 'Fight my Paddle Pals in PongApp', url: inviteUrl })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copyInvite()
  }

  if (view.status === 'error') {
    return <section className="pg-lobby"><div className="pg-lobby-card"><p className="pg-kicker">Connection error</p><h2>Room unavailable</h2><p className="pg-status pg-status--error">{view.error}</p><button className="pg-primary-button" onClick={exit}>Back home</button></div></section>
  }

  if (!view.gameState || !participantId || view.lobby?.phase === 'lobby') {
    return (
      <section className="pg-lobby pg-lobby--duel">
        <header className="pg-match__topbar"><div><strong>Private Pal Duel</strong><span>{activeRoomCode ? `Room ${activeRoomCode}` : 'Creating your invite…'}</span></div><button onClick={exit}>Exit</button></header>
        <div className="pg-lobby-card">
          {!activeRoomCode ? (
            <><div className="pg-orbit-loader" aria-hidden="true"><i /><i /><i /></div><h2>Opening your duel…</h2><p>The full invite link appears as soon as the room exists.</p></>
          ) : (
            <>
              <p className="pg-kicker">One link. One rival. Fight.</p>
              <h2>Invite Player 2</h2>
              <button className="pg-share-button" onClick={() => void shareInvite()}><span>↗</span><strong>{copied ? 'Invite copied!' : 'Share duel link'}</strong><small>Room {activeRoomCode} is already inside it</small></button>
              <div className="pg-player-list">
                {(view.lobby?.participants ?? []).filter((participant) => participant.slot !== null).map((participant) => {
                  const seat = seatIdentity(participant.slot ?? 0)
                  return <div className="pg-player" key={participant.id}><span className={`pg-player__dot pg-seat-mark--${seat.pattern}`} style={{ color: seat.hex }} /><div><strong>{participant.id === participantId ? 'You' : participant.displayName}</strong><small>{participant.connected ? participant.id === participantId ? 'Ready automatically' : 'Connected — starting now' : 'Reconnecting…'}</small></div></div>
                })}
                {(view.lobby?.participants.filter((participant) => participant.slot !== null).length ?? 0) < 2 && <div className="pg-player pg-player--empty"><span>2</span><div><strong>Waiting for your rival</strong><small>They tap the link once. No account and no room code entry.</small></div></div>}
              </div>
              {inviteError && <p className="pg-status pg-status--error">{inviteError}</p>}
              <button className="pg-text-button" onClick={() => void copyInvite()}>{copied ? 'Copied' : 'Copy instead'}</button>
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <GameCourt
      getState={getState}
      subscribe={subscribeState}
      onTarget={(_, target) => clientRef.current?.setTarget(target)}
      onSummon={(_, type: PalType) => clientRef.current?.summon(type)}
      onExit={exit}
      localPlayerIds={view.participant?.slot === null ? [] : [participantId]}
      settings={effects}
      muted={muted}
      title="Online Pal Duel"
      subtitle={`${view.roomCode} · server-authoritative`}
      network={{ latencyMs: view.latencyMs, latencyP95Ms: view.latencyP95Ms, jitterMs: view.jitterMs, quality: view.connectionQuality }}
      onRematch={() => { resultRecorded.current = false; clientRef.current?.rematch() }}
    />
  )
}
