import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const context = { self: { location: { href: 'https://example.test/pongapp/sw.js', origin: 'https://example.test' }, addEventListener() {} }, URL, Headers, Response, rangeResponse: undefined as unknown as (request: Request, response: Response) => Promise<Response> }
runInNewContext(source + '\nglobalThis.rangeResponse = rangeResponse', context)
const request = (range: string) => new Request('https://example.test/pongapp/assets/song.m4a', { headers: { range } })
const audio = () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { 'content-type': 'audio/mp4' } })
describe('offline theme song byte ranges', () => {
  it('serves a bounded 206 range with correct audio headers', async () => {
    const response = await context.rangeResponse(request('bytes=2-5'), audio())
    expect(response.status).toBe(206); expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(response.headers.get('content-length')).toBe('4'); expect(response.headers.get('content-type')).toBe('audio/mp4')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3, 4, 5])
  })
  it('handles suffix and open-ended seeks', async () => {
    expect(await (await context.rangeResponse(request('bytes=-3'), audio())).arrayBuffer()).toEqual(new Uint8Array([7, 8, 9]).buffer)
    expect(await (await context.rangeResponse(request('bytes=8-'), audio())).arrayBuffer()).toEqual(new Uint8Array([8, 9]).buffer)
  })
  it('rejects impossible or multipart ranges instead of corrupting playback', async () => {
    for (const range of ['bytes=20-30', 'bytes=5-2', 'bytes=-0', 'bytes=0-2,4-5', 'bytes=-', 'garbage']) {
      const response = await context.rangeResponse(request(range), audio())
      expect(response.status, range).toBe(416); expect(response.headers.get('content-range')).toBe('bytes */10')
    }
  })
  it('leaves complete responses untouched for normal pack and engine reads', async () => {
    const response = audio()
    expect(await context.rangeResponse(new Request('https://example.test/pongapp/'), response)).toBe(response)
  })
})
