// Read-only upstream evidence; generated records contain hashes/links, not vendored code.
import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
const exec = promisify(execFile)
const root = new URL('.', import.meta.url)
const { repositories } = JSON.parse(await readFile(new URL('repository-evidence.json', root)))
const api = async p => JSON.parse((await exec('gh', ['api', p], { maxBuffer: 8e6 })).stdout)
const extra = {
  'ocornut/imgui': ['docs/README.md'],
  'flareteam/flare-engine': ['src/ItemManager.h','src/LootManager.cpp','src/PowerManager.cpp','src/SaveLoad.cpp','src/StatBlock.h'],
  'CleverRaven/Cataclysm-DDA': ['doc/JSON/JSON_INHERITANCE.md','doc/JSON/ITEM_SPAWN.md','doc/JSON/OBSOLETION_AND_MIGRATION.md'],
  'wesnoth/wesnoth': ['copyright','data/schema/units/abilities.cfg'],
  'veloren/veloren': ['assets/common/abilities/ability_set_manifest.ron'],
  'OpenMW/openmw': ['components/esm3/loadmgef.hpp']
}
const records = [], failures = []
for (const r of repositories) {
  try {
    const listing = await api(`repos/${r.repo}/contents?ref=${r.head}`)
    const readme = listing.find(f => /^readme(?:\.(?:md|rst|txt|markdown))?$/i.test(f.name))
    for (const path of [...(readme ? [readme.path] : []), ...(extra[r.repo] || [])]) {
      const f = await api(`repos/${r.repo}/contents/${path}?ref=${r.head}`)
      const bytes = Buffer.from(f.content, 'base64'), content = bytes.toString()
      records.push({ repo:r.repo, head:r.head, path, url:`${r.url}/blob/${r.head}/${path}`, sha256:createHash('sha256').update(bytes).digest('hex'), bytes:bytes.length })
      const lines = content.split('\n')
      const selected = path === readme?.path
        ? lines.filter(l => !l.startsWith('[!') && !l.startsWith('<') && /[a-z]{4}/i.test(l)).slice(0,18).join('\n').slice(0,1200)
        : lines.map((l,i)=>({l,i})).filter(({l})=>/class |struct |serialize|migration|distribution|collection|affix|bonus|power|damage|experience|level|GPL|License|copy-from/.test(l)).slice(0,15).map(({l,i})=>`${i+1}: ${l}`).join('\n').slice(0,1300)
      console.log(`\n${r.repo} ${path}\n${selected}`)
    }
  } catch(e) { failures.push({repo:r.repo, error:String(e).split('\n')[0]}) }
}
await writeFile(new URL('source-evidence.json',root), JSON.stringify({observedAt:new Date().toISOString(), method:'Pinned primary README screening and selected source/document inspections. Not a build, security, or full-code audit.',records,failures},null,2)+'\n')
console.log(JSON.stringify({records:records.length, failures}))
