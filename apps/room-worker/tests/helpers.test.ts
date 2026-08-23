import { describe, expect, it } from 'vitest'
import { acceptClientTelemetry, allowedOrigin, classifyWebSocketClose, generateRoomCode, validRoomCode } from '../src/helpers'

describe('room worker helpers', () => {
  it('generates readable six-character room codes', () => {
    const code = generateRoomCode()
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    expect(code).not.toMatch(/[01IO]/)
    expect(validRoomCode(code)).toBe(true)
  })

  it('rejects malformed room codes', () => {
    expect(validRoomCode('ABCDEF')).toBe(true)
    expect(validRoomCode('ABCD1F')).toBe(false)
    expect(validRoomCode('abcdef')).toBe(false)
    expect(validRoomCode('ABCDE')).toBe(false)
  })

  it('allows production and local clients only', () => {
    expect(allowedOrigin('https://www.jonathangu.com')).toBe('https://www.jonathangu.com')
    expect(allowedOrigin('https://jonathangu.com')).toBe('https://jonathangu.com')
    expect(allowedOrigin('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173')
    expect(allowedOrigin('https://attacker.example')).toBeNull()
  })

  it('classifies close codes without persisting client-provided reasons', () => {
    expect(classifyWebSocketClose(4001)).toBe('replaced')
    expect(classifyWebSocketClose(1000)).toBe('normal')
    expect(classifyWebSocketClose(1006)).toBe('abnormal')
    expect(classifyWebSocketClose(4002)).toBe('stale')
    expect(classifyWebSocketClose(null)).toBe('error')
    expect(classifyWebSocketClose(4555)).toBe('other')
  })

  it('deduplicates UI signals and rate-limits network telemetry', () => {
    const surface = acceptClientTelemetry('control_surface_visible', 0, null, null, 1_000)
    expect(surface).toEqual({ accepted: true, uiMask: 1, lastNetworkAt: null, lastPerformanceAt: null })
    expect(acceptClientTelemetry('control_surface_visible', surface.uiMask, null, null, 1_001).accepted).toBe(false)
    const network = acceptClientTelemetry('network_sample', surface.uiMask, null, null, 2_000)
    expect(network).toEqual({ accepted: true, uiMask: 1, lastNetworkAt: 2_000, lastPerformanceAt: null })
    expect(acceptClientTelemetry('network_sample', 1, 2_000, null, 10_000).accepted).toBe(false)
    expect(acceptClientTelemetry('network_sample', 1, 2_000, null, 17_000).accepted).toBe(true)
    const performance = acceptClientTelemetry('performance_sample', 1, 2_000, null, 3_000)
    expect(performance.lastPerformanceAt).toBe(3_000)
    expect(acceptClientTelemetry('performance_sample', 1, 2_000, 3_000, 12_000).accepted).toBe(false)
  })
})
