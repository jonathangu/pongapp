// Mechanical production encoding only; original ImageGen pixels/alpha are retained in source/.
import { mkdir, access, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const sharp = require(process.env.STARLING_SHARP || '/Users/guclaw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const root = fileURLToPath(new URL('../../', import.meta.url)), source = join(root, 'art/starling/source'), output = join(root, 'apps/web/public/art/starling')
await mkdir(source, { recursive: true })
for (const name of ['observatory-hull', 'glasswing', 'ram-beetle', 'jelly', 'needle', 'sentinel', 'guardian']) {
  const original = join(source, `${name}.png`)
  try { await access(original) } catch { await rename(join(output, `${name}.png`), original) }
  await sharp(original).resize({ width: name === 'observatory-hull' ? 1254 : 768 }).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(join(output, `${name}.webp`))
}
