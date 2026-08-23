import { describe, expect, it } from 'vitest'
import { allowedOrigin, generateRoomCode, validRoomCode } from '../src/helpers'

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
})
