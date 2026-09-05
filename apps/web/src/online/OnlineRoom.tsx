import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoopGameState } from '@pongapp/game-core'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { CoopRiver } from '../game/CoopRiver'
import { inviteUrlFor, normalizeRoomCode, pongHomeUrlFor } from './invite'
import { RoomClient, type RoomClientView } from './RoomClient'

interface Props {
  serverUrl: string
  roomCode?: string
  createRequest?: CreateRoomRequest
  identity: { guestId: string; displayName: string }
  onExit: () => void
}
const initialView: RoomClientView = { status: 'idle', roomCode: '', lobby: null, gameState: null, participant: null, error: null, latencyMs: null, latencyP95Ms: null, jitterMs: null, snapshotGapP95Ms: null, connectionQuality: 'good' }

export function OnlineRoom({ serverUrl, roomCode, createRequest, identity, onExit }: Props) {
  const [view, setView] = useState(initialView)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const clientRef = useRef<RoomClient | null>(null)
  const fallbackRef = useRef<CoopGameState | null>(null)
  const reportedTelemetry = useRef(new Set<string>())

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
        unsubscribe = client.subscribe((next) => { if (next.gameState) fallbackRef.current = next.gameState; setView(next) })
        client.connect()
      } catch (error) {
        setView({ ...initialView, status: 'error', error: error instanceof Error ? error.message : 'Could not open the boat.' })
      }
    }
    void start()
    return () => { disposed = true; unsubscribe(); clientRef.current?.close(); clientRef.current = null }
  }, [createRequest, identity, roomCode, serverUrl])

  const exit = () => { window.history.replaceState(null, '', pongHomeUrlFor(window.location.origin, import.meta.env.BASE_URL)); onExit() }
  const getState = useCallback(() => { if (clientRef.current) return clientRef.current.getRenderState(); if (fallbackRef.current) return fallbackRef.current; throw new Error('No river state is available.') }, [])
  const subscribeState = useCallback((listener: (state: CoopGameState) => void) => clientRef.current?.subscribeState(listener) ?? (() => undefined), [])
  const participantId = view.participant?.id
  const activeRoomCode = normalizeRoomCode(view.roomCode || roomCode || view.lobby?.roomCode || '')
  const roomName = view.lobby?.roomName ?? createRequest?.roomName ?? (activeRoomCode ? `Boat ${activeRoomCode}` : 'Your boat')
  const inviteUrl = activeRoomCode ? inviteUrlFor(window.location.origin, import.meta.env.BASE_URL, activeRoomCode, true) : null
  const players = view.lobby?.participants.filter((participant) => participant.slot !== null) ?? []
  const isHost = view.participant?.slot === 0 || (Boolean(createRequest) && view.participant === null)
  const edgeLabel = view.latencyMs === null ? (view.status === 'connecting' ? 'Connecting to the river…' : 'Edge room ready') : `${view.latencyMs}ms round trip · ${view.connectionQuality === 'good' ? 'smooth' : view.connectionQuality}`

  useEffect(() => {
    const event = view.participant?.slot === null ? 'room_full_visible' : view.gameState && participantId ? 'control_surface_visible' : null
    if (!event || reportedTelemetry.current.has(event)) return
    reportedTelemetry.current.add(event); clientRef.current?.reportTelemetry(event)
  }, [participantId, view.gameState, view.participant?.slot])

  const copyInvite = async () => {
    if (!inviteUrl) return
    try { await navigator.clipboard.writeText(inviteUrl); setInviteError(null); setCopied(true); setShared(true); window.setTimeout(() => setCopied(false), 1800) }
    catch { setInviteError('Clipboard access was blocked. Use Share and send this page.') }
  }
  const shareInvite = async () => {
    if (!inviteUrl) return
    if (navigator.share) {
      try { await navigator.share({ title: 'Two Oars', text: `Grab the other oar on ${roomName}—let’s row together.`, url: inviteUrl }); setShared(true); return }
      catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return }
    }
    await copyInvite()
  }

  if (view.status === 'error' || (view.status === 'closed' && view.error)) return <section className="oars-lobby"><div className="oars-card"><p className="oars-kicker">River connection</p><h2>{view.status === 'closed' ? 'Your oar is open elsewhere' : 'We lost the boat'}</h2><p>{view.error}</p>{view.lobby?.supportTraceId && <small>Support trace {view.lobby.supportTraceId}</small>}<button className="oars-primary" onClick={exit}>Back home</button></div></section>
  if (view.participant?.slot === null) return <section className="oars-lobby"><div className="oars-card"><p className="oars-kicker">Private boat · two rowers</p><h2>Both oars are taken</h2><p>This trip already has two people aboard. If one of them is you, reopen the original tab or device to reconnect your oar.</p><button className="oars-primary" onClick={exit}>Back home</button></div></section>

  if (!view.gameState || !participantId || view.lobby?.phase === 'lobby') {
    return <section className="oars-lobby">
      <header className="oars-lobby__top"><span className="oars-mini-logo">◒ TWO OARS</span><button onClick={exit}>Exit</button></header>
      <div className="oars-card">
        {!activeRoomCode ? <><div className="oars-loader">◒</div><h2>Launching your boat…</h2><p>Your private invite is almost ready.</p></> : <>
          <div className="oars-boat-mark" aria-hidden="true"><span>●</span><span>●</span></div>
          <p className="oars-kicker">One boat · two oars · same team</p>
          <h2>{isHost ? 'Text this link. That’s the lobby.' : `You’re aboard ${roomName}`}</h2>
          <p className="oars-lede">Your friend taps once and takes the other oar. The trip starts automatically—no account, app, or setup.</p>
          <div className="oars-steps"><span className="is-done"><b>✓</b>Boat ready</span><i/><span className={shared ? 'is-done' : 'is-now'}><b>{shared ? '✓' : '2'}</b>{shared ? 'Link sent' : 'Send link'}</span><i/><span className={players.length >= 2 ? 'is-done' : ''}><b>{players.length >= 2 ? '✓' : '3'}</b>Row together</span></div>
          <p className={`oars-edge oars-edge--${view.connectionQuality}`}><i />{edgeLabel}</p>
          {isHost && <button className="oars-share" onClick={() => void shareInvite()}><span>↗</span><strong>{copied ? 'Invite copied!' : 'Text the invite'}</strong><small>Opens straight into the empty oar</small></button>}
          {isHost && inviteUrl && <div className="oars-link"><input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Private boat invite"/><button onClick={() => void copyInvite()}>{copied ? 'Copied' : 'Copy'}</button></div>}
          <div className="oars-crew">
            {players.map((person) => <div key={person.id}><span className={`oars-side oars-side--${person.slot === 0 ? 'left' : 'right'}`}>{person.slot === 0 ? 'L' : 'R'}</span><p><strong>{person.id === participantId ? 'You' : person.displayName}</strong><small>{person.connected ? person.id === participantId ? 'Oar ready' : 'Aboard — starting!' : 'Reconnecting…'}</small></p></div>)}
            {players.length < 2 && <div className="is-empty"><span className="oars-side">?</span><p><strong>Waiting for your person</strong><small>Keep this open. We start the instant they arrive.</small></p></div>}
          </div>
          {inviteError && <p className="oars-error">{inviteError}</p>}
        </>}
      </div>
    </section>
  }

  return <CoopRiver getState={getState} subscribe={subscribeState} localPlayerId={participantId} title={roomName} roomCode={view.roomCode} network={{ latencyMs: view.latencyMs, quality: view.connectionQuality, reconnecting: view.status === 'connecting' }} onPaddle={(power) => clientRef.current?.setPaddle(power)} onExit={exit} onRematch={() => clientRef.current?.rematch()} />
}
