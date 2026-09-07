/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const origin = 'https://www.jonathangu.com', base = origin + '/pongapp/'
function offlineStatus(engineEra: boolean, missingFile = false) {
  const file = { url: engineEra ? '/pongapp/godot/index.wasm' : '/pongapp/assets/index-puzzle.js', sha256: 'verified-fixture' }
  const manifest = { version: 'test', files: [file] }
  const context = {
    URL, Response,
    self: { location: { href: base + 'sw.js', origin }, addEventListener() {} },
    caches: { async open(name: string) { return { async match(key: string) {
      if (name === 'starling-meta-v1' && key === base + '__starling_active__') return Response.json({ cache: 'starling-pack-test', version: 'test' })
      if (key === base + '__starling_complete__') return Response.json(manifest)
      if (!missingFile && key === origin + file.url) return new Response('fixture', { headers: { 'x-starling-sha256': file.sha256 } })
      return undefined
    } } } },
  }
  return runInNewContext(source + '\ncheckedPack()', context) as Promise<{ ready: boolean; reason?: string }>
}
it('never advertises an old engine download as an offline-ready puzzle', async () => {
  expect(await offlineStatus(true)).toMatchObject({ ready: false, reason: 'update_available' })
})
it('requires every saved puzzle asset, and accepts an intact puzzle pack', async () => {
  expect(await offlineStatus(false)).toMatchObject({ ready: true })
  expect(await offlineStatus(false, true)).toMatchObject({ ready: false, reason: 'evicted' })
})
