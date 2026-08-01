/**
 * The gate that keeps the palette single-sourced.
 *
 * Seat colours have to exist twice — as numbers for the WebGL renderer and as
 * strings for CSS — and the previous five copies drifted. Two copies with a test
 * between them is the smallest arrangement that cannot silently rot.
 *
 * The assertions print both sides of every comparison. A gate that reports only
 * pass/fail cannot catch its own misuse: if this file ever stops finding the
 * declarations it is looking for, the "expected" column goes empty and says so,
 * rather than passing on an empty set.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COURT_PALETTE, POWER_UP_IDENTITIES, SEAT_PALETTE } from '@pongapp/game-core'

const tokensPath = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url))
const source = readFileSync(tokensPath, 'utf8')

/** Every `--name: value;` declaration in the file, last one wins. */
function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    found.set(match[1]!.trim(), match[2]!.trim())
  }
  return found
}

const tokens = declarations(source)

/** Follow `var(--alias)` chains so semantic tokens can be checked, not just literals. */
function resolve(name: string, depth = 0): string | undefined {
  const value = tokens.get(name)
  if (value === undefined || depth > 8) return value
  const alias = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value)
  return alias ? resolve(alias[1]!, depth + 1) : value
}

const hexes = new Set(
  [...tokens.values()].flatMap((value) => value.match(/#[0-9a-f]{6}/gi) ?? []).map((hex) => hex.toLowerCase()),
)

describe('tokens.css mirrors the game-core palette', () => {
  it('parsed some declarations at all', () => {
    // Guards the rest of the suite: a rename or a reformat that stops the regex
    // matching would otherwise turn every assertion below into a no-op.
    expect(`${tokens.size} declarations parsed from tokens.css`).toBe(`${tokens.size} declarations parsed from tokens.css`)
    expect(tokens.size).toBeGreaterThan(30)
  })

  it.each(SEAT_PALETTE.map((seat) => [seat.key, seat.cssVar, seat.hex] as const))(
    'seat %s: %s should be %s',
    (_key, cssVar, hex) => {
      expect(`${cssVar}: ${resolve(cssVar) ?? '<missing>'}`).toBe(`${cssVar}: ${hex}`)
    },
  )

  it.each(Object.entries(COURT_PALETTE).map(([name, entry]) => [name, entry.cssVar, entry.hex] as const))(
    'court surface %s: %s should be %s',
    (_name, cssVar, hex) => {
      expect(`${cssVar}: ${resolve(cssVar) ?? '<missing>'}`).toBe(`${cssVar}: ${hex}`)
    },
  )

  it.each(Object.values(POWER_UP_IDENTITIES).map((identity) => [identity.id, identity.hex] as const))(
    'power-up %s uses a colour that exists in tokens.css (%s)',
    (id, hex) => {
      expect(`${id} -> ${hex} present: ${hexes.has(hex.toLowerCase())}`).toBe(`${id} -> ${hex} present: true`)
    },
  )

  it('every seat hex equals its numeric twin', () => {
    for (const seat of SEAT_PALETTE) {
      const fromNumber = `#${seat.color.toString(16).padStart(6, '0')}`
      expect(`${seat.key} hex ${seat.hex} vs number ${fromNumber}`).toBe(`${seat.key} hex ${seat.hex} vs number ${seat.hex}`)
    }
  })

  it('seat marks are distinguishable without colour', () => {
    const patterns = SEAT_PALETTE.map((seat) => seat.pattern)
    expect(`patterns: ${patterns.join(', ')}`).toBe(`patterns: ${[...new Set(patterns)].join(', ')}`)
  })
})
