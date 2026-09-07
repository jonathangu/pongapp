import { allowedOrigin } from './helpers'

const EVENTS = new Set(['opened', 'first_match', 'level_won', 'offline_ready', 'offline_failed', 'app_error', 'coop_connected', 'coop_reconnecting'])
const CODES = new Set(['storage_unavailable', 'worker_unavailable', 'download_timeout', 'download_failed', 'script_error'])
export function parseClientDiagnostic(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>, event = v.event as Record<string, unknown> | undefined
  const integer = (n: unknown, max: number) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max
  if (Object.keys(v).some(k => !['version', 'supportId', 'build', 'platform', 'online', 'event'].includes(k)) || v.version !== 1 || typeof v.supportId !== 'string' || !/^[A-F0-9]{12}$/.test(v.supportId) ||
    typeof v.build !== 'string' || !/^(development|[a-f0-9]{40})$/.test(v.build) || !['android', 'ios', 'desktop'].includes(String(v.platform)) || typeof v.online !== 'boolean' ||
    !event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).some(k => !['event', 'ageMs', 'level', 'value', 'code'].includes(k)) ||
    !EVENTS.has(String(event.event)) || !integer(event.ageMs, 86400000) || event.level !== undefined && !integer(event.level, 9999) || event.value !== undefined && !integer(event.value, 1000) || event.code !== undefined && !CODES.has(String(event.code))) return null
  return { event: 'starling.client.v1', supportId: v.supportId, build: v.build, platform: v.platform, online: v.online, action: event.event, ageMs: event.ageMs, ...(event.level !== undefined ? { level: event.level } : {}), ...(event.value !== undefined ? { value: event.value } : {}), ...(event.code !== undefined ? { code: event.code } : {}) }
}
export async function clientDiagnostics(request: Request, limiter: RateLimit): Promise<Response> {
  const origin = allowedOrigin(request.headers.get('origin')), headers = { 'access-control-allow-origin': origin ?? 'https://www.jonathangu.com', vary: 'Origin' }
  if (!origin) return new Response(null, { status: 403, headers })
  // The address is only a short-lived rate-limit key. It is never emitted to logs.
  const limit = await limiter.limit({ key: 'puzzle-diagnostics:' + (request.headers.get('cf-connecting-ip') ?? 'local') })
  if (!limit.success) return new Response(null, { status: 429, headers })
  if (Number(request.headers.get('content-length')) > 2048) return new Response(null, { status: 413, headers })
  const reader = request.body?.getReader(); let raw = '', bytes = 0
  if (!reader) return new Response(null, { status: 400, headers })
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    bytes += value.length
    if (bytes > 2048) { await reader.cancel(); return new Response(null, { status: 413, headers }) }
    raw += decoder.decode(value, { stream: true })
  }
  let record: Record<string, unknown> | null
  try { record = parseClientDiagnostic(JSON.parse(raw + decoder.decode())) } catch { record = null }
  if (!record) return new Response(null, { status: 400, headers })
  console.info(record)
  return new Response(null, { status: 204, headers })
}
