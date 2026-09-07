import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RescueSession } from '../src/game/rescue/RescueSession'
import { createRescueGame, isSoloCrossing, type RescueState } from '@pongapp/game-core'

class SilentSocket {
  static OPEN = 1
  static instances: SilentSocket[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(readonly url: string) { SilentSocket.instances.push(this) }
  send(data: string) { this.sent.push(data) }
  // Reproduce a transport whose close handshake never invokes the browser callback.
  close() { this.readyState = 2 }
  open() { this.readyState = 1; this.onopen?.() }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }) }
}

describe('Starling connection lifecycle', () => {
  let events: EventTarget, network: { onLine: boolean }, session: RescueSession | undefined
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] })
    events = new EventTarget(); network = { onLine: true }; SilentSocket.instances = []
    vi.stubGlobal('window', events); vi.stubGlobal('navigator', network); vi.stubGlobal('WebSocket', SilentSocket)
    vi.stubGlobal('history', { replaceState: vi.fn() })
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  })
  afterEach(() => { session?.dispose(); session = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })
  function start() {
    session = new RescueSession({ name: 'Captain', guestId: 'test-guest-123', online: true, code: 'ABC234', server: 'https://room.example' })
    const socket = SilentSocket.instances[0]!
    socket.open(); welcome(socket)
    return socket
  }
  function welcome(socket: SilentSocket) {
    socket.receive({ type: 'welcome', version: 1, playerId: session!.playerId, token: 'same-private-reconnect-token', code: 'ABC234', state: structuredClone(session!.authoritative), presence: [], started: true })
  }
  it('launches guided solo at the helm, with automatic cannon and meal support', () => {
    session = new RescueSession({ name: 'Mara', guestId: 'solo-guest-123', story: true, guided: true, server: 'https://room.example' })
    expect(isSoloCrossing(session.state)).toBe(true)
    expect(session.state.crew.find(c => c.id === session!.playerId)?.seat).toBe('engine')
    expect(session.state.crew.find(c => c.id === session!.state.story!.sonId)?.seat).toBe('east')
    expect(session.state.crew.find(c => c.id === 'pip')?.seat).toBe('galley')
    expect(SilentSocket.instances).toHaveLength(0)
  })
  it('upgrades an older story save to solo without rewriting its decisions or source save', () => {
    const saved = createRescueGame({ story: true }), original = structuredClone(saved)
    session = new RescueSession({ name: 'Mara', guestId: 'solo-guest-123', story: true, guided: true, saved, server: 'https://room.example' })
    expect(isSoloCrossing(session.state)).toBe(true)
    expect(session.state.story).toEqual(original.story); expect(saved).toEqual(original)
    expect(session.state.seamanship?.step).toBe(5)
  })
  it('does not enable solo captain mode for an online invitation or imported solo save', () => {
    const saved: RescueState = createRescueGame({ story: true, guided: true }); saved.captainMode = true
    session = new RescueSession({ name: 'Mara', guestId: 'online-guest-123', story: true, guided: true, online: true, code: 'ABC234', saved, server: 'https://room.example' })
    expect(session.state.captainMode).toBeUndefined(); expect(isSoloCrossing(session.state)).toBe(false)
  })
  it('recovers on network return even if the old socket never emits close', () => {
    const old = start(), lateClose = old.onclose!, lateMessage = old.onmessage!
    network.onLine = false; events.dispatchEvent(new Event('offline'))
    expect(session!.connected).toBe(false); expect(session!.status).toContain('Offline')
    vi.advanceTimersByTime(25000); expect(SilentSocket.instances).toHaveLength(1)
    network.onLine = true; events.dispatchEvent(new Event('online'))
    expect(SilentSocket.instances).toHaveLength(2)
    const replacement = SilentSocket.instances[1]!; replacement.open(); welcome(replacement)
    expect(JSON.parse(replacement.sent[0]!).token).toBe('same-private-reconnect-token')
    lateClose({ code: 4001 }); lateMessage({ data: JSON.stringify({ type: 'error', message: 'stale transport' }) })
    expect(session!.connected).toBe(true); expect(session!.status).toContain('Online'); expect(session!.error).toBe('')
  })
  it('replaces a silent transport after eight seconds without relying on navigator events', () => {
    const old = start()
    vi.advanceTimersByTime(7999); expect(SilentSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1); expect(SilentSocket.instances).toHaveLength(2)
    expect(old.readyState).toBe(2); expect(session!.connected).toBe(false)
    const replacement = SilentSocket.instances[1]!; replacement.open(); welcome(replacement)
    expect(session!.connected).toBe(true)
  })
  it('keeps a healthy connection alive while updates arrive', () => {
    const socket = start()
    for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(6000); socket.receive({ type: 'pong', at: performance.now() }) }
    expect(SilentSocket.instances).toHaveLength(1); expect(session!.connected).toBe(true)
  })
  it('does not fight a deliberate tab transfer or terminal rejection', () => {
    const socket = start(); socket.onclose!({ code: 4001 })
    events.dispatchEvent(new Event('online')); vi.advanceTimersByTime(60000)
    expect(SilentSocket.instances).toHaveLength(1); expect(session!.status).toBe('Connection closed')
  })
  it('cleans up all timers and network listeners when the game exits', () => {
    start(); session!.dispose()
    events.dispatchEvent(new Event('offline')); events.dispatchEvent(new Event('online')); vi.advanceTimersByTime(60000)
    expect(vi.getTimerCount()).toBe(0); expect(SilentSocket.instances).toHaveLength(1)
  })
  it('does not create duplicate transports while a welcome is pending', () => {
    session = new RescueSession({ name: 'Captain', guestId: 'test-guest-123', online: true, code: 'ABC234', server: 'https://room.example' })
    events.dispatchEvent(new Event('online')); events.dispatchEvent(new Event('online'))
    expect(SilentSocket.instances).toHaveLength(1)
  })
})
