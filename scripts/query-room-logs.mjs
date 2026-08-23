const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const apiToken = process.env.CLOUDFLARE_API_TOKEN
const email = process.env.CLOUDFLARE_EMAIL
const globalApiKey = process.env.CLOUDFLARE_API_KEY
const minutesArgument = process.argv.find((value) => value.startsWith('--minutes='))
const traceArgument = process.argv.find((value) => value.startsWith('--trace='))
const minutes = Math.max(1, Math.min(10_080, Number(minutesArgument?.split('=')[1] ?? 60)))
const trace = traceArgument?.split('=')[1]?.trim().toUpperCase()

if (!accountId) throw new Error('Set CLOUDFLARE_ACCOUNT_ID.')
if (!apiToken && !(email && globalApiKey)) {
  throw new Error('Set CLOUDFLARE_API_TOKEN, or CLOUDFLARE_EMAIL and CLOUDFLARE_API_KEY.')
}
if (trace && !/^[A-F0-9]{8}$/.test(trace)) throw new Error('Support traces contain exactly eight hexadecimal characters.')

const now = Date.now()
const body = {
  queryId: `pongapp-room-rca-${now}`,
  timeframe: { from: now - minutes * 60_000, to: now },
  view: 'events',
  parameters: {
    datasets: ['cloudflare-workers'],
    needle: { value: trace ?? 'pongapp.room.lifecycle.v2', matchCase: false },
  },
  limit: 2_000,
  dry: true,
}
const headers = { 'content-type': 'application/json' }
if (apiToken) headers.authorization = `Bearer ${apiToken}`
else {
  headers['x-auth-email'] = email
  headers['x-auth-key'] = globalApiKey
}

const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/query`, {
  method: 'POST', headers, body: JSON.stringify(body),
})
const payload = await response.json()
if (!response.ok || payload.success === false) {
  const message = payload.errors?.map((error) => error.message).join('; ') || `HTTP ${response.status}`
  throw new Error(`Cloudflare log query failed: ${message}`)
}

const safeFields = [
  'event', 'schemaVersion', 'action', 'supportTraceId', 'roomSessionId', 'matchSessionId',
  'connectionId', 'replacementConnectionId', 'clientSessionId', 'replacementClientSessionId',
  'phase', 'gameTick', 'roomAgeMs', 'connectedPlayers', 'connectedSpectators', 'reservedPlayerSlots',
  'slot', 'requestedRole', 'assignedRole', 'reconnectAttempt', 'hadReconnectToken', 'helloLatencyMs',
  'closeCategory', 'closeCode', 'wasClean', 'errorType', 'connectedMs', 'firstInputSeen',
  'replacementPresent', 'msAfterHello', 'latencyMs', 'latencyP95Ms', 'jitterMs',
  'snapshotGapP95Ms', 'connectionQuality', 'reason', 'announcedVersion', 'durationSeconds',
  'frameGapP95Ms', 'maxFrameGapMs', 'renderP95Ms', 'longFrameCount', 'freezeCount',
  'rendererResolution', 'renderQuality',
]

function recordFromSource(source) {
  if (source && typeof source === 'object') return source
  if (typeof source !== 'string') return null
  try { return JSON.parse(source) } catch { return null }
}

const rows = []
const eventsResult = payload.result?.events
const events = Array.isArray(eventsResult) ? eventsResult : eventsResult?.events ?? []
for (const event of events) {
  const record = recordFromSource(event.source)
  if (!record || record.event !== 'pongapp.room.lifecycle.v2') continue
  const row = { timestamp: new Date(event.timestamp).toISOString() }
  for (const field of safeFields) if (record[field] !== undefined) row[field] = record[field]
  rows.push(row)
}
rows.sort((left, right) => left.timestamp.localeCompare(right.timestamp))
for (const row of rows) console.log(JSON.stringify(row))
console.error(`pongapp room logs: ${rows.length} lifecycle events over ${minutes} minute(s)${trace ? ` for trace ${trace}` : ''}`)
