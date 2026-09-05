import { describe, expect, it } from 'vitest'
import { createRoomRequestSchema, parseWireMessage, PROTOCOL_VERSION } from '../src'

describe('Two Oars co-op protocol v5', () => {
  it('accepts the deliberately small room request', () => {
    expect(createRoomRequestSchema.parse({ hostName: 'Jonathan' })).toEqual({ hostName: 'Jonathan', mode: 'coop' })
    expect(createRoomRequestSchema.parse({ hostName: 'Jonathan', roomName: "Jonathan's Arena" })).toEqual({
      hostName: 'Jonathan', roomName: "Jonathan's Arena", mode: 'coop',
    })
    expect(createRoomRequestSchema.parse({ hostName: 'Jonathan', mode: 'versus' }).mode).toBe('versus')
    expect(createRoomRequestSchema.safeParse({ hostName: 'Jonathan', roomName: 'A' }).success).toBe(false)
  })

  it('rejects legacy room configuration instead of retaining dead modes', () => {
    expect(createRoomRequestSchema.safeParse({ hostName: 'Jonathan', mode: 'arena' }).success).toBe(false)
  })

  it('accepts tiny paddle inputs and rejects incompatible clients', () => {
    expect(parseWireMessage(JSON.stringify({
      type: 'input', seq: 3, paddle: 0.7,
    }))).toEqual({ type: 'input', seq: 3, paddle: 0.7 })
    expect(parseWireMessage(JSON.stringify({
      type: 'hello', version: PROTOCOL_VERSION - 1,
      guestId: 'guest-12345678', displayName: 'Player', role: 'player',
    }))).toBeNull()
    expect(parseWireMessage('{broken')).toBeNull()
  })

  it('accepts privacy-safe connection diagnostics and rejects free-form telemetry', () => {
    expect(parseWireMessage(JSON.stringify({
      type: 'hello', version: PROTOCOL_VERSION,
      guestId: 'guest-12345678', displayName: 'Player', role: 'player',
      clientSessionId: '7edbbf48-1cf6-4e72-8847-e37af6082dbf', reconnectAttempt: 2,
    }))).toMatchObject({ clientSessionId: '7edbbf48-1cf6-4e72-8847-e37af6082dbf', reconnectAttempt: 2 })
    expect(parseWireMessage(JSON.stringify({
      type: 'clientTelemetry', event: 'network_sample', latencyMs: 22, latencyP95Ms: 40,
      jitterMs: 5, snapshotGapP95Ms: 38, connectionQuality: 'good',
    }))).toMatchObject({ type: 'clientTelemetry', event: 'network_sample', latencyMs: 22 })
    expect(parseWireMessage(JSON.stringify({
      type: 'clientTelemetry', event: 'network_sample', note: 'free-form text must never reach logs',
    }))).toBeNull()
    expect(parseWireMessage(JSON.stringify({
      type: 'clientTelemetry', event: 'performance_sample', frameGapP95Ms: 24,
      maxFrameGapMs: 91, renderP95Ms: 8, longFrameCount: 2, freezeCount: 0,
      rendererResolution: 1.5, renderQuality: 'full',
    }))).toMatchObject({ event: 'performance_sample', rendererResolution: 1.5 })
  })
})
