import { useCallback, useEffect, useRef, useState } from 'react'
import type { VersusGameState } from '@pongapp/game-core'
import type { CreateRoomRequest } from '@pongapp/protocol'
import { VersusRiver } from '../game/VersusRiver'
import { inviteUrlFor, normalizeRoomCode, pongHomeUrlFor } from './invite'
import { VersusClient, type VersusClientView } from './VersusClient'

const empty: VersusClientView = { status: 'idle', roomCode: '', lobby: null, gameState: null, participant: null, error: null, latencyMs: null }

export function OnlineVersusRoom({ serverUrl, roomCode, createRequest, identity, onExit }: {
  serverUrl: string; roomCode?: string; createRequest?: CreateRoomRequest
  identity: { guestId: string; displayName: string }; onExit: () => void
}) {
  const [view, setView] = useState(empty)
  const [copied, setCopied] = useState(false)
  const clientRef = useRef<VersusClient | null>(null)
  useEffect(() => {
    let disposed = false; let unsubscribe: () => void = () => undefined
    void (async () => {
      try {
        const raw = roomCode ?? (createRequest ? await VersusClient.createRoom(serverUrl, createRequest) : '')
        const code = normalizeRoomCode(raw)
        if (!code || disposed) throw new Error('This race link is missing its room code.')
        const url = inviteUrlFor(window.location.origin, import.meta.env.BASE_URL, code, true, 'versus')
        if (url) window.history.replaceState(null, '', url)
        const client = new VersusClient(serverUrl, code, identity); clientRef.current = client
        unsubscribe = client.subscribe(setView); client.connect()
      } catch (error) { setView({ ...empty, status: 'error', error: error instanceof Error ? error.message : 'Could not open the race.' }) }
    })()
    return () => { disposed = true; unsubscribe(); clientRef.current?.close(); clientRef.current = null }
  }, [createRequest, identity, roomCode, serverUrl])
  const exit = () => { window.history.replaceState(null, '', pongHomeUrlFor(window.location.origin, import.meta.env.BASE_URL)); onExit() }
  const subscribe = useCallback((listener: (state: VersusGameState) => void) => clientRef.current?.subscribeState(listener) ?? (() => undefined), [])
  const tap = useCallback(() => clientRef.current?.tap(), [])
  const rematch = useCallback(() => clientRef.current?.rematch(), [])
  const code = normalizeRoomCode(view.roomCode || roomCode || view.lobby?.roomCode || '')
  const title = view.lobby?.roomName ?? createRequest?.roomName ?? 'Rapid Rivals'
  const invite = code ? inviteUrlFor(window.location.origin, import.meta.env.BASE_URL, code, true, 'versus') : null
  const players = view.lobby?.participants.filter((person) => person.slot !== null) ?? []
  const host = view.participant?.slot === 0 || Boolean(createRequest && !view.participant)
  const share = async () => {
    if (!invite) return
    if (navigator.share) { try { await navigator.share({ title: 'Rapid Rivals', text: 'Race me down the river—tap this link and you’re in.', url: invite }); return } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return } }
    try { await navigator.clipboard.writeText(invite); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch { /* input remains selectable */ }
  }
  if (view.status === 'error' || (view.status === 'closed' && view.error)) return <section className="oars-lobby race-lobby"><div className="oars-card"><p className="oars-kicker">Rapid Rivals</p><h2>Race unavailable</h2><p>{view.error}</p><button className="oars-primary" onClick={exit}>Back home</button></div></section>
  if (view.participant?.slot === null) return <section className="oars-lobby race-lobby"><div className="oars-card"><p className="oars-kicker">Rapid Rivals</p><h2>This race is full</h2><p>Both boats are already on the water.</p><button className="oars-primary" onClick={exit}>Back home</button></div></section>
  if (!view.gameState || !view.participant || view.lobby?.phase === 'lobby') return <section className="oars-lobby race-lobby"><header className="oars-lobby__top"><span className="oars-mini-logo">⚡ RAPID RIVALS</span><button onClick={exit}>Exit</button></header><div className="oars-card race-card"><div className="race-versus-mark"><span>●</span><b>VS</b><span>●</span></div><p className="oars-kicker">Two boats · one finish line</p><h2>{host ? 'Send the challenge.' : 'Challenge accepted.'}</h2><p>Tap the link, take the second boat, and race instantly. Switch lanes to dodge rocks and steal speed stars.</p>{host && <button className="oars-share race-share" onClick={() => void share()}><span>↗</span><strong>{copied ? 'Challenge copied!' : 'Text the race link'}</strong><small>No account. No ready button. Just race.</small></button>}{host && invite && <div className="oars-link"><input readOnly value={invite}/><button onClick={() => void share()}>Copy</button></div>}<div className="oars-crew">{players.map((person) => <div key={person.id}><span className={`oars-side oars-side--${person.slot === 0 ? 'left' : 'right'}`}>{person.slot === 0 ? 'A' : 'B'}</span><p><strong>{person.id === view.participant?.id ? 'You' : person.displayName}</strong><small>{person.connected ? 'Boat ready' : 'Reconnecting…'}</small></p></div>)}{players.length < 2 && <div className="is-empty"><span className="oars-side">?</span><p><strong>Waiting for your rival</strong><small>The countdown starts when they open the link.</small></p></div>}</div></div></section>
  return <VersusRiver initialState={view.gameState} subscribe={subscribe} localPlayerId={view.participant.id} title={title} roomCode={view.roomCode} latencyMs={view.latencyMs} reconnecting={view.status === 'connecting'} peer={view.peer} onTap={tap} onExit={exit} onRematch={rematch}/>
}
