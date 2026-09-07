import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { createMatchGame, findMatchMove, MATCH_SIZE, matchNeighbors, matchPhase, playMatchSwap, restoreMatchGame, type MatchBoard, type MatchGame } from '@pongapp/game-core'
import { diagnosticsReport, logDiagnostic, supportId } from './diagnostics'
import { createPuzzleRoom, PuzzleConnection, puzzleInvitation } from './puzzle-connection'
import type { PuzzleServerMessage } from '@pongapp/protocol'
import themeSong from './assets/story/each-way-i-turn.m4a'
import './styles/puzzle.css'

const SAVE = 'starling.puzzle.v1'
const COLORS = ['Coral shell', 'Blue drop', 'Gold star', 'Green leaf', 'Purple flower']
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
function readGame() {
  try { return restoreMatchGame(localStorage.getItem(SAVE)) ?? createMatchGame() }
  catch { return createMatchGame() }
}
function saveGame(game: MatchGame) {
  try { localStorage.setItem(SAVE, JSON.stringify(game)) }
  catch { logDiagnostic('app_error', { code: 'storage_unavailable' }) }
}
function Gem({ color }: { color: number }) {
  return <svg viewBox="0 0 56 56" aria-hidden="true" className={`gem gem-${color}`}>
    {color === 0 ? <><path d="M9 34C-2 12 12 3 21 12C26 0 37 2 38 13C52 4 61 21 47 36L29 48Z"/><path className="gem-detail" d="M16 19L26 38M28 15V37M40 20L32 38"/></> :
      color === 1 ? <path d="M28 4C24 13 8 24 8 35C8 58 48 58 48 35C48 24 32 13 28 4Z"/> :
      color === 2 ? <path d="M28 4L35 19L52 21L39 33L43 50L28 41L13 50L17 33L4 21L21 19Z"/> :
      color === 3 ? <><path d="M47 6C15 5 3 18 8 37C14 56 45 49 47 6Z"/><path className="gem-detail" d="M15 42L37 17M21 35L19 24M29 27L38 27"/></> :
      <><path d="M28 7C37-4 48 7 43 18C58 17 61 35 46 38C53 51 36 59 28 46C20 59 3 51 10 38C-5 35-2 17 13 18C8 7 19-4 28 7Z"/><circle className="gem-center" cx="28" cy="28" r="7"/></>}
    <path className="gem-glint" d={color === 1 ? 'M20 28Q15 34 19 40' : 'M17 17L20 14'}/>
  </svg>
}
function Boat() {
  return <svg viewBox="0 0 130 100" aria-hidden="true" className="little-boat">
    <path d="M63 12V75" stroke="#79534d" strokeWidth="4" strokeLinecap="round"/>
    <path d="M58 17L18 63H58Z" fill="#fff5d7" stroke="#e3c98c" strokeWidth="2"/>
    <path d="M69 23V63H105Z" fill="#f7b693" stroke="#e2947b" strokeWidth="2"/>
    <path d="M62 11L88 16L62 23Z" fill="#e06c70"/>
    <g><path d="M25 75Q20 47 38 48Q53 49 49 76" fill="#513d46"/><circle cx="37" cy="64" r="11" fill="#f3ba91"/><path d="M25 60Q25 44 44 51L49 59Q35 58 34 52L29 60" fill="#513d46"/><path d="M33 67Q37 71 41 67" fill="none" stroke="#ac625b" strokeWidth="1.6"/><circle cx="33" cy="63" r="1.3"/><circle cx="42" cy="63" r="1.3"/></g>
    <g><circle cx="85" cy="65" r="10" fill="#f3ba91"/><path d="M74 64Q69 47 89 52L96 61L86 57L77 63" fill="#513d46"/><circle cx="81" cy="65" r="1.3"/><circle cx="90" cy="65" r="1.3"/><path d="M82 70Q86 73 89 69" fill="none" stroke="#ac625b" strokeWidth="1.6"/></g>
    <g><path d="M51 77V67Q51 53 63 56Q76 55 75 77" fill="#513d46"/><circle cx="63" cy="69" r="9" fill="#f3ba91"/><path d="M54 66Q54 55 66 58L72 64L61 62L58 67" fill="#513d46"/><path d="M71 57L77 53V61L71 58L67 61V53Z" fill="#89c8df"/><path d="M55 78Q63 72 71 78" fill="#b6a1d5"/><circle cx="59" cy="69" r="1.2"/><circle cx="67" cy="69" r="1.2"/><path d="M60 73Q63 75 66 72" fill="none" stroke="#ac625b" strokeWidth="1.5"/></g>
    <path d="M11 74Q60 79 120 71L108 91Q61 104 23 91Z" fill="#d98d61" stroke="#805345" strokeWidth="3"/>
    <path d="M23 84Q66 89 108 81" fill="none" stroke="#f9ce91" strokeWidth="3"/>
  </svg>
}

export default function PuzzleApp() {
  const [game, setGame] = useState(readGame), [board, setBoard] = useState<MatchBoard>(() => game.board)
  const [selected, setSelected] = useState<number | null>(null), [cleared, setCleared] = useState<number[]>([])
  const [busy, setBusy] = useState(false), [hint, setHint] = useState(() => game.level === 1 && game.collected === 0)
  const [notice, setNotice] = useState(''), [burst, setBurst] = useState(''), [panel, setPanel] = useState(false)
  const [sound, setSound] = useState(true), [music, setMusic] = useState(false), [offline, setOffline] = useState('Checking…')
  const [reportMessage, setReportMessage] = useState('')
  const [roomCode, setRoomCode] = useState(puzzleInvitation), [connectionStatus, setConnectionStatus] = useState('')
  const [partnerHere, setPartnerHere] = useState(false), [inviteOpen, setInviteOpen] = useState(false), [creating, setCreating] = useState(false)
  const connection = useRef<PuzzleConnection | null>(null), receive = useRef<(message: PuzzleServerMessage) => void>(() => {})
  const drag = useRef<{ index: number; x: number; y: number } | null>(null), skipClick = useRef(false), busyRef = useRef(false)
  const generation = useRef(0), audio = useRef<AudioContext | null>(null), song = useRef<HTMLAudioElement>(null)
  const worker = useRef<ServiceWorker | null>(null), packPort = useRef<MessagePort | null>(null)
  const phase = matchPhase(game), connectionPaused = Boolean(roomCode && connectionStatus)
  const hintMove = hint && !busy && phase === 'playing' ? findMatchMove(board) : null
  const fraction = Math.min(1, game.collected / game.target)
  const tone = (combo = 0) => {
    if (!sound) return
    try {
      audio.current ??= new AudioContext()
      const ctx = audio.current
      void ctx.resume().catch(() => {})
      for (const [i, semitone] of [0, 4, 7].entries()) {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain(), start = ctx.currentTime + i * .045
        oscillator.type = 'sine'; oscillator.frequency.value = 440 * 2 ** ((semitone + Math.min(combo, 5) * 2) / 12)
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.075, start + .012); gain.gain.exponentialRampToValueAtTime(.001, start + .25)
        oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + .26)
      }
    } catch { /* Audio is optional; the puzzle always works without it. */ }
  }
  useEffect(() => {
    logDiagnostic('opened', { level: game.level })
    return () => { generation.current++; void audio.current?.close(); packPort.current?.close() }
  }, [])
  useEffect(() => {
    if (busy || phase !== 'playing' || panel) return
    const timer = setTimeout(() => setHint(true), 5500)
    return () => clearTimeout(timer)
  }, [game, busy, phase, panel])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 2600)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    const media = song.current
    if (!media) return
    media.volume = .35
    if (music && !document.hidden) void media.play().catch(() => { setMusic(false); setNotice('Tap Music again to play.') })
    else media.pause()
  }, [music])
  useEffect(() => {
    const visible = () => {
      if (document.hidden) song.current?.pause()
      else if (music) void song.current?.play().catch(() => setMusic(false))
    }
    document.addEventListener('visibilitychange', visible)
    return () => document.removeEventListener('visibilitychange', visible)
  }, [music])
  useEffect(() => {
    let alive = true
    const timeout = setTimeout(() => { if (alive) setOffline('Play works now. Offline setup can be retried below.') }, 12000)
    if (!('serviceWorker' in navigator) || !isSecureContext || import.meta.env.DEV) { clearTimeout(timeout); setOffline('Play online. Offline saving needs the published app.'); return }
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
        const ready = registration.active ? registration : await navigator.serviceWorker.ready
        if (!alive) return
        worker.current = ready.active
        const channel = new MessageChannel(); packPort.current = channel.port1
        channel.port1.onmessage = event => {
          if (!alive) return
          clearTimeout(timeout)
          setOffline(event.data.ready ? 'Ready offline ✓' : 'Save this little game for offline play.')
        }
        worker.current?.postMessage({ type: 'starling-status' }, [channel.port2])
      } catch { if (alive) { clearTimeout(timeout); setOffline('Offline setup unavailable. You can still play.'); logDiagnostic('offline_failed', { code: 'worker_unavailable' }) } }
    })()
    return () => { alive = false; clearTimeout(timeout); packPort.current?.close() }
  }, [])

  const animate = async (before: MatchGame, a: number, b: number, authoritative?: MatchGame, teamwork = false) => {
    generation.current++
    busyRef.current = true; setBusy(true); setSelected(null); setHint(false); setNotice('')
    const token = generation.current, result = playMatchSwap(before, a, b)
    const final = authoritative ?? result.state
    setCleared([])
    setBoard(result.swapped)
    await wait(150)
    if (token !== generation.current) return
    if (!result.valid) {
      setBoard(before.board); setNotice('Make a line of 3. No move lost!')
      await wait(150)
    } else {
      // Commit the complete turn before animation: closing the app never loses it.
      if (!roomCode) saveGame(final)
      if (before.collected === 0) logDiagnostic('first_match', { level: before.level })
      for (let i = 0; i < result.frames.length; i++) {
        if (token !== generation.current) return
        const frame = result.frames[i]!
        setBoard(frame.board); setCleared(frame.cleared); setBurst(i > 0 ? ['Lovely!', 'Wonderful!', 'Amazing!'][Math.min(i - 1, 2)]! : `+${frame.gained}`); tone(i)
        await wait(240)
        if (token !== generation.current) return
        setCleared([]); setBoard(result.frames[i + 1]?.board ?? result.state.board)
        await wait(180)
      }
      if (token !== generation.current) return
      setGame(final); setBoard(final.board)
      if (result.shuffled) setNotice('Fresh pieces. Keep going!')
      if (teamwork) setNotice('Luma cheers you on! Together +3 ♡')
      if (matchPhase(final) === 'won') { tone(4); logDiagnostic('level_won', { level: before.level, value: final.moves }) }
    }
    if (token !== generation.current) return
    setBurst(''); setBusy(false); busyRef.current = false
  }
  const resetBoard = (next: MatchGame) => {
    generation.current++; setGame(next); setBoard(next.board); setCleared([]); setSelected(null); setBurst(''); setBusy(false); busyRef.current = false
  }
  receive.current = message => {
    const client = connection.current
    if (client) setPartnerHere(client.presence[client.role === 0 ? 1 : 0])
    if (message.type === 'welcome') resetBoard(message.party.game)
    else if (message.type === 'state') {
      if (message.move) void animate(message.move.before, message.move.a, message.move.b, message.party.game, message.move.teamwork)
      else resetBoard(message.party.game)
    } else if (message.type === 'error') {
      setNotice(message.code === 'stale' ? 'Your partner just moved. Try another match!' : message.code === 'unavailable' ? 'Make a line of 3. No move lost!' : '')
    }
  }
  useEffect(() => {
    if (!roomCode) return
    const client = new PuzzleConnection(roomCode, message => receive.current(message), setConnectionStatus)
    connection.current = client
    return () => { client.dispose(); connection.current = null }
  }, [roomCode])
  const turn = (a: number, b: number) => {
    if (busyRef.current || creating || phase !== 'playing' || panel || inviteOpen || connectionPaused || !matchNeighbors(a, b)) return
    if (roomCode) {
      if (connection.current?.send({ kind: 'swap', a, b })) { busyRef.current = true; setBusy(true); setSelected(null) }
    } else void animate(game, a, b)
  }
  const invite = async () => {
    if (roomCode) { setInviteOpen(true); return }
    if (busyRef.current || creating) return
    setCreating(true)
    try {
      const code = await createPuzzleRoom(game)
      history.replaceState(null, '', `#/together/${code}`); setRoomCode(code); setInviteOpen(true)
    } catch { setNotice('Could not make an invitation. Check your connection and try again.') }
    finally { setCreating(false) }
  }
  const leaveRoom = () => {
    connection.current?.dispose(); setRoomCode(''); setConnectionStatus(''); setPartnerHere(false); setInviteOpen(false)
    history.replaceState(null, '', location.pathname + location.search); resetBoard(readGame())
  }
  const share = async () => {
    const url = location.origin + import.meta.env.BASE_URL + `#/together/${roomCode}`
    try {
      if (navigator.share) await navigator.share({ title: 'Starling · play together', text: 'Join me, Mara, Finn & Luma. One little board, together.', url })
      else { await navigator.clipboard.writeText(url); setNotice('Invitation copied. Send it to your partner.'); setInviteOpen(false) }
    } catch { /* The invitation remains selectable below if sharing is unavailable. */ }
  }
  const choose = (index: number) => {
    if (skipClick.current) { skipClick.current = false; return }
    if (busyRef.current || phase !== 'playing') return
    setHint(false)
    if (selected === index) setSelected(null)
    else if (selected !== null && matchNeighbors(selected, index)) void turn(selected, index)
    else setSelected(index)
  }
  const pointerDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (busyRef.current) return
    skipClick.current = false; drag.current = { index, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current; drag.current = null
    if (!start || busyRef.current) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return
    skipClick.current = true
    const target = start.index + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : Math.sign(dy) * MATCH_SIZE)
    if (matchNeighbors(start.index, target)) void turn(start.index, target)
  }
  const nextLevel = () => {
    if (roomCode) { connection.current?.send({ kind: 'next' }); return }
    generation.current++
    const next = createMatchGame(game.level + 1, game.seed)
    saveGame(next); setGame(next); setBoard(next.board); setSelected(null); setCleared([]); setHint(false); setBurst(''); setNotice(''); setBusy(false); busyRef.current = false
  }
  const extraMoves = () => { if (roomCode) { connection.current?.send({ kind: 'more' }); return }; const next = { ...game, moves: 5 }; saveGame(next); setGame(next); setHint(true) }
  const download = () => {
    if (!worker.current) { setOffline('Reload once to retry offline setup. Your puzzle is saved.'); return }
    packPort.current?.close()
    const channel = new MessageChannel(); packPort.current = channel.port1
    setOffline('Saving the game…')
    const timeout = setTimeout(() => { setOffline('That took too long. Tap Save offline to retry.'); logDiagnostic('offline_failed', { code: 'download_timeout' }); channel.port1.close() }, 20000)
    channel.port1.onmessage = event => {
      const data = event.data
      if (data.type === 'complete') { clearTimeout(timeout); setOffline('Ready offline ✓'); logDiagnostic('offline_ready') }
      else if (data.type === 'error') { clearTimeout(timeout); setOffline(data.message ?? 'Could not save offline. Please retry.'); logDiagnostic('offline_failed', { code: 'download_failed' }) }
      else if (data.type === 'progress') setOffline(`Saving · ${Math.round(data.bytes / data.totalBytes * 100)}%`)
    }
    worker.current.postMessage({ type: 'starling-download' }, [channel.port2])
  }
  const copyReport = async () => {
    const report = diagnosticsReport()
    try { await navigator.clipboard.writeText(report); setReportMessage('Copied. Send this report with your message.') }
    catch {
      const link = document.createElement('a'), url = URL.createObjectURL(new Blob([report], { type: 'text/plain' }))
      link.href = url; link.download = `starling-support-${supportId}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      setReportMessage('Support report downloaded.')
    }
  }
  return <main className="puzzle-app">
    <audio ref={song} src={themeSong} preload="none" loop/>
    <div className="sky-cloud cloud-one"/><div className="sky-cloud cloud-two"/>
    <div className="puzzle-shell">
      <header className="puzzle-header"><a href={import.meta.env.BASE_URL} className="puzzle-brand"><span>✦</span> STARLING</a><div><button className="round-control" aria-label={sound ? 'Turn sound off' : 'Turn sound on'} onClick={() => setSound(!sound)}>{sound ? '♪' : '♪̸'}</button><button className="round-control" aria-label="Settings and help" onClick={() => setPanel(true)}>☰</button></div></header>
      <section className="puzzle-goal" aria-label="Level goal">
        <div className="level-pill">LEVEL {game.level}</div>
        <h1>A little closer to home.</h1>
        <p>Match 3 to move the boat.</p>
        <div className="puzzle-counts"><span><b>{Math.min(game.collected, game.target)}</b> / {game.target} pieces</span><span><b>{game.moves}</b> moves</span></div>
        <div className="goal-meter" role="progressbar" aria-label="Rescue progress" aria-valuenow={Math.min(game.collected, game.target)} aria-valuemin={0} aria-valuemax={game.target}><div style={{ width: `${fraction * 100}%` }}/></div>
      </section>
      <div className={'rescue-sea' + (phase === 'won' ? ' rescued' : '')} aria-hidden="true"><div className="sea-island"><span>⚑</span></div><div className="boat-position" style={{ left: `${7 + fraction * 57}%` }}><Boat/></div><div className="sea-wave wave-back"/><div className="sea-wave wave-front"/><span className="sea-spark spark-one">✧</span><span className="sea-spark spark-two">✧</span></div>
      <div className="family-caption">Mara, Finn & Luma <span>{roomCode ? partnerHere ? '♡ Playing together' : '♡ Partner can join anytime' : '♡ One little family'}</span></div>
      <section className="puzzle-play" aria-label="Puzzle">
        <div className={'match-board' + (busy ? ' is-busy' : '')} role="group" aria-label="Match-three board. Swap two neighbors to make a line of three.">
          <div className="board-squares" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i}/>)}</div>
          {board.map((piece, index) => <button key={piece.id} data-piece={index} className={'piece' + (selected === index ? ' selected' : '') + (cleared.includes(index) ? ' clearing' : '') + (hintMove?.includes(index) ? ' hinted' : '')} style={{ left: `${index % 6 / 6 * 100}%`, top: `${Math.floor(index / 6) / 6 * 100}%` }} aria-label={`${COLORS[piece.color]}, row ${Math.floor(index / 6) + 1}, column ${index % 6 + 1}`} aria-pressed={selected === index} disabled={busy || phase !== 'playing'} onClick={() => choose(index)} onPointerDown={event => pointerDown(event, index)} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null }}><Gem color={piece.color}/></button>)}
          {burst && <div className="match-burst" key={burst} aria-hidden="true">{burst}</div>}
          {!busy && phase !== 'playing' && <div className="level-result" role="dialog" aria-modal="true" aria-label={phase === 'won' ? 'Rescue complete' : 'More moves'}>
            <div className="result-stars" aria-hidden="true">{phase === 'won' ? '✦ ✦ ✦' : '♡'}</div>
            <h2>{phase === 'won' ? 'Home, together!' : 'A little further…'}</h2>
            <p>{phase === 'won' ? 'One little match. One happy reunion.' : 'Take five more moves. On us.'}</p>
            <button className="puzzle-primary" disabled={connectionPaused} autoFocus onClick={phase === 'won' ? nextLevel : extraMoves}>{phase === 'won' ? 'Next little voyage →' : 'Keep going +5'}</button>
          </div>}
        </div>
      </section>
      {connectionPaused && <div className="connection-notice" role="status">{connectionStatus} <button onClick={leaveRoom}>Play solo</button></div>}
      <p className="puzzle-hint" role="status">{notice || (busy ? 'Look at them go!' : phase === 'won' ? 'Nice sailing!' : selected !== null ? 'Now tap a piece beside it.' : hintMove ? 'Try swapping the two glowing pieces.' : 'Tap two neighbors. Or swipe to swap.')}</p>
      <footer className="puzzle-footer"><button className="together-button" onClick={() => void invite()} disabled={creating || busy}>{creating ? 'Making invitation…' : roomCode ? 'Your shared game ♡' : 'Play together ♡'}</button><button onClick={() => { setHint(true); setSelected(null) }} disabled={busy || phase !== 'playing'}>Show a move <span>✧</span></button></footer>
    </div>
    {inviteOpen && <div className="puzzle-modal" onClick={() => setInviteOpen(false)}><section role="dialog" aria-modal="true" aria-label="Play together" className="puzzle-settings" onClick={event => event.stopPropagation()}><header><h2>Better together ♡</h2><button className="round-control" autoFocus aria-label="Close invitation" onClick={() => setInviteOpen(false)}>×</button></header><p>Send this invitation to your partner. You both match on the same board. Either of you can move, anytime.</p><p>Take turns sometimes and Luma adds a little +3 cheer!</p><input className="invite-link" aria-label="Invitation link" readOnly value={location.origin + import.meta.env.BASE_URL + `#/together/${roomCode}`} onFocus={event => event.target.select()}/><button className="puzzle-primary" onClick={() => void share()}>Share invitation</button><button className="leave-together" onClick={leaveRoom}>Back to my solo game</button></section></div>}
    {panel && <div className="puzzle-modal" onClick={() => setPanel(false)}><section role="dialog" aria-modal="true" aria-label="Settings and help" className="puzzle-settings" onClick={event => event.stopPropagation()}>
      <header><h2>A little help</h2><button className="round-control" autoFocus aria-label="Close settings" onClick={() => setPanel(false)}>×</button></header>
      <p>Swap two neighboring pieces. Make a line of three matching shapes. Each match brings the boat closer to home.</p>
      <div className="help-gems" aria-hidden="true"><Gem color={0}/><Gem color={0}/><Gem color={0}/><span>→ ♡</span></div>
      <label className="setting-row">Sound effects <input type="checkbox" checked={sound} onChange={event => setSound(event.target.checked)}/></label>
      <label className="setting-row">Music <input type="checkbox" checked={music} onChange={event => setMusic(event.target.checked)}/></label>
      {music && <small>Each Way I Turn · Jonathan Gu</small>}
      <div className="offline-option"><button onClick={download}>Save offline</button><span role="status">{offline}</span><small>Optional. Music streams separately.</small></div>
      <details className="support-details"><summary>Something not working?</summary><p>Support ID: <b>{supportId}</b></p><p>Basic error and progress diagnostics contain no names, messages, or saved voyages.</p><button onClick={() => void copyReport()}>Copy support report</button><p role="status">{reportMessage}</p></details>
      <button className="puzzle-primary" onClick={() => setPanel(false)}>Back to the game</button>
    </section></div>}
  </main>
}
