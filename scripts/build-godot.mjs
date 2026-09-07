import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..'), version = '4.7.2'
const cache = resolve(homedir(), '.cache/pongapp-godot', version)
const destination = resolve(root, '.tools/godot')
mkdirSync(cache, { recursive: true }); mkdirSync(destination, { recursive: true })
const prefix = `https://github.com/godotengine/godot-builds/releases/download/${version}-stable/`
function download(name, file, hash) {
  if (!existsSync(file)) execFileSync('curl', ['-fL', '--retry', '3', prefix + name, '-o', file], { stdio: 'inherit' })
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== hash) throw new Error(`Godot checksum mismatch: ${name}`)
}
let binary = process.env.GODOT_BIN
if (!binary) {
  const mac = process.platform === 'darwin'
  const archive = resolve(cache, mac ? 'Godot_macos.zip' : 'Godot_linux.zip')
  binary = resolve(cache, mac ? 'Godot.app/Contents/MacOS/Godot' : `Godot_v${version}-stable_linux.x86_64`)
  if (!existsSync(binary)) {
    download(`Godot_v${version}-stable_${mac ? 'macos.universal' : 'linux.x86_64'}.zip`, archive, mac ? 'c58a24e31d720be9d62f60cb5627c4e695fb72f21b0cfe1bc9ccaa9a3b3ba63e' : 'cadd3204e728a35d3f13adb7fd0d7902636b79f6b95c40c265eb73b6c35329e4')
    execFileSync('unzip', ['-qo', archive, '-d', cache])
  }
}
const templates = resolve(cache, 'templates.tpz')
for (const variant of ['release', 'debug']) {
  const name = `web_nothreads_${variant}.zip`, source = resolve(cache, 'templates', name)
  if (!existsSync(source)) {
    download(`Godot_v${version}-stable_export_templates.tpz`, templates, 'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011')
    execFileSync('unzip', ['-qo', templates, `templates/${name}`, '-d', cache])
  }
  copyFileSync(source, resolve(destination, name))
}
const project = resolve(root, 'apps/godot'), output = resolve(root, 'apps/web/public/godot')
mkdirSync(output, { recursive: true })
function run(args) {
  const result = spawnSync(binary, ['--headless', '--path', project, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  const logs = (result.stdout || '') + (result.stderr || '')
  if (result.status !== 0 || /SCRIPT ERROR|Parse Error|ERROR:/.test(logs)) throw new Error(logs || result.error?.message || 'Godot failed')
  console.log(`Godot ${args.join(' ')}: passed`)
}
run(['--editor', '--import'])
run(['--quit-after', '2'])
run(['--export-release', 'Web', resolve(output, 'index.html')])
copyFileSync(resolve(project, 'LICENSE-GODOT.txt'), resolve(output, 'LICENSE-GODOT.txt'))
copyFileSync(resolve(project, 'COPYRIGHT-GODOT.txt'), resolve(output, 'COPYRIGHT-GODOT.txt'))
console.log(`Godot ${version} browser export ready`)
