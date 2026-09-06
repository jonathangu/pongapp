import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const dist = fileURLToPath(new URL('../apps/web/dist/', import.meta.url))
const candidates = ['index.html', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  ...(await readdir(join(dist, 'assets'), { withFileTypes: true })).filter(file => file.isFile() && !file.name.endsWith('.map')).map(file => 'assets/' + file.name),
  ...(await readdir(join(dist, 'art/starling'))).filter(file => /\.(webp|glb)$/.test(file)).map(file => 'art/starling/' + file)]
const files = []
for (const path of [...new Set(candidates)].sort()) {
  const body = await readFile(join(dist, path))
  files.push({ url: '/pongapp/' + (path === 'index.html' ? '' : path), bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') })
}
const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 20)
const manifest = { format: 'starling-pack-v1', version, bytes: files.reduce((n, f) => n + f.bytes, 0), files }
await writeFile(join(dist, 'starling-pack.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Starling offline pack: ${files.length} files, ${(manifest.bytes / 1048576).toFixed(2)} MiB, ${version}`)
