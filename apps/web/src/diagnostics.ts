type DiagnosticEvent = 'opened' | 'first_match' | 'level_won' | 'offline_ready' | 'offline_failed' | 'app_error' | 'coop_connected' | 'coop_reconnecting'
type Details = { level?: number; value?: number; code?: 'storage_unavailable' | 'worker_unavailable' | 'download_timeout' | 'download_failed' | 'script_error' }
type Row = { event: DiagnosticEvent; ageMs: number } & Details
const started = Date.now(), rows: Row[] = [], sent = new Set<string>()
export const supportId = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
const build = import.meta.env.VITE_RELEASE_ID || 'development'
const platform = /Android/i.test(navigator.userAgent) ? 'android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'ios' : 'desktop'
const endpoint = (import.meta.env.VITE_ROOM_SERVER_URL || (import.meta.env.PROD ? 'https://pongapp-room.pongapp-room-worker.workers.dev' : 'http://127.0.0.1:8787')) + '/api/client-diagnostics'
export function logDiagnostic(event: DiagnosticEvent, details: Details = {}) {
  const row: Row = { event, ageMs: Math.min(86400000, Date.now() - started), ...details }
  rows.push(row); if (rows.length > 60) rows.shift()
  // At most one event of each kind/level per page, capped at 20 small requests.
  const key = `${event}:${details.level ?? ''}:${details.code ?? ''}`
  if (sent.has(key) || sent.size >= 20) return
  sent.add(key)
  const body = { version: 1, supportId, build, platform, online: navigator.onLine, event: row }
  void fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true, signal: AbortSignal.timeout(5000) }).catch(() => {})
}
export function diagnosticsReport() {
  return JSON.stringify({ version: 1, supportId, build, platform, online: navigator.onLine, viewport: { width: innerWidth, height: innerHeight }, displayMode: matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser', serviceWorker: Boolean(navigator.serviceWorker?.controller), events: rows }, null, 2)
}
window.addEventListener('error', () => logDiagnostic('app_error', { code: 'script_error' }))
window.addEventListener('unhandledrejection', () => logDiagnostic('app_error', { code: 'script_error' }))
