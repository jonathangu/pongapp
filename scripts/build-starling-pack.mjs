import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const dist = fileURLToPath(new URL('../apps/web/dist/', import.meta.url))
const candidates = ['index.html', 'manifest.webmanifest', 'favicon.svg', 'starling-apple-touch-icon.png', 'starling-icon-192.png', 'starling-icon-512.png', 'starling-icon-maskable-512.png',
  ...(await readdir(join(dist, 'assets'), { withFileTypes: true })).filter(file => file.isFile() && /\.(js|css|woff2)$/.test(file.name)).map(file => 'assets/' + file.name)]
const files = []
for (const path of [...new Set(candidates)].sort()) {
  const body = await readFile(join(dist, path))
  files.push({ url: '/pongapp/' + (path === 'index.html' ? '' : path), bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') })
}
const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 20)
const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const manifest = { format: 'starling-pack-v1', version, revision, bytes: files.reduce((n, f) => n + f.bytes, 0), files }
if (manifest.bytes > 3000000) throw new Error('The simple puzzle offline pack must stay below 3 MB')
await writeFile(join(dist, 'starling-pack.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Starling offline pack: ${files.length} files, ${(manifest.bytes / 1048576).toFixed(2)} MiB, ${version}`)
