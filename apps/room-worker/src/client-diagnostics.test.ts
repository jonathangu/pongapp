import { describe, expect, it, vi } from 'vitest'
import { clientDiagnostics, parseClientDiagnostic } from './client-diagnostics'
const sample = { version: 1, supportId: 'ABCDEF123456', build: 'development', platform: 'android', online: true, event: { event: 'offline_failed', ageMs: 20000, code: 'download_timeout' } }
describe('bounded client diagnostics', () => {
  it('accepts only typed coarse diagnostics', () => {
    expect(parseClientDiagnostic(sample)?.action).toBe('offline_failed')
    for (const value of [null, [], { ...sample, name: 'private' }, { ...sample, event: { ...sample.event, message: 'private' } }, { ...sample, platform: 'full user agent' }, { ...sample, event: { event: 'arbitrary', ageMs: 0 } }]) expect(parseClientDiagnostic(value)).toBeNull()
  })
  it('rejects unapproved origins, rate limits, and oversized bodies', async () => {
    const limiter = { limit: vi.fn().mockResolvedValue({ success: true }) }
    expect((await clientDiagnostics(new Request('https://worker/api/client-diagnostics', { method: 'POST', body: JSON.stringify(sample) }), limiter)).status).toBe(403)
    const request = (body: string) => new Request('https://worker/api/client-diagnostics', { method: 'POST', headers: { origin: 'https://www.jonathangu.com' }, body })
    expect((await clientDiagnostics(request('x'.repeat(2049)), limiter)).status).toBe(413)
    expect((await clientDiagnostics(request('{'), limiter)).status).toBe(400)
    limiter.limit.mockResolvedValue({ success: false }); expect((await clientDiagnostics(request(JSON.stringify(sample)), limiter)).status).toBe(429)
  })
})
