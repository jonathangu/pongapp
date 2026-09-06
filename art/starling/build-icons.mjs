import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const sharp = require(process.env.STARLING_SHARP || '/Users/guclaw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')
const source = fileURLToPath(new URL('./source/app-icon.png', import.meta.url))
const output = fileURLToPath(new URL('../../apps/web/public/', import.meta.url))
for (const [name, size] of [['starling-icon-192.png', 192], ['starling-icon-512.png', 512], ['starling-icon-maskable-512.png', 512], ['starling-apple-touch-icon.png', 180]]) {
  await sharp(source).resize(size, size).png().toFile(output + name)
}
