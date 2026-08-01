const siteUrl = new URL(process.env.PONGAPP_SITE_URL ?? 'https://www.jonathangu.com/pongapp/')
const roomServerUrl = process.env.ROOM_SERVER_URL ?? 'https://pongapp-room.fly.dev'
const deploymentId = process.env.DEPLOYMENT_ID ?? Date.now().toString(36)

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

async function fetchCurrent(pathname) {
  const url = new URL(pathname, siteUrl)
  url.searchParams.set('deploy', deploymentId)
  return fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })
}

async function verifyDeployment() {
  const pageResponse = await fetchCurrent(siteUrl.pathname)
  invariant(pageResponse.ok, `PongApp page returned ${pageResponse.status}`)
  const html = await pageResponse.text()
  const scriptPath = html.match(/src="(\/pongapp\/assets\/index-[^"]+\.js)"/)?.[1]
  invariant(scriptPath, 'PongApp page did not reference its production JavaScript bundle')

  const scriptResponse = await fetchCurrent(scriptPath)
  invariant(scriptResponse.ok, `PongApp bundle returned ${scriptResponse.status}`)
  const script = await scriptResponse.text()
  invariant(script.includes(roomServerUrl), `PongApp bundle did not target ${roomServerUrl}`)
  invariant(!script.includes('pongapp-room.pongapp-room-worker.workers.dev'), 'PongApp bundle still targeted the retired Cloudflare room endpoint')

  const workerResponse = await fetchCurrent('/pongapp/sw.js')
  invariant(workerResponse.ok, `Service-worker retirement script returned ${workerResponse.status}`)
  const worker = await workerResponse.text()
  invariant(worker.includes('registration.unregister()'), 'Stale-shell retirement worker was not deployed')

  const keyArtResponse = await fetchCurrent('/pongapp/arena-keyart.jpg')
  invariant(keyArtResponse.ok, `PongApp key art returned ${keyArtResponse.status}`)
  console.log(`production-smoke ok: ${siteUrl.href} -> ${scriptPath} -> ${roomServerUrl}`)
}

let finalError
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    await verifyDeployment()
    process.exit(0)
  } catch (error) {
    finalError = error
    if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
}

throw finalError
