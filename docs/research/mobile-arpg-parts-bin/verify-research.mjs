import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { candidates, assets } from './catalog-data.mjs'
const root = new URL('.',import.meta.url)
const repoRoot = new URL('../../../',root)
const read = async p => JSON.parse(await readFile(new URL(p,root)))
const repos = await read('repository-evidence.json')
const sources = await read('source-evidence.json')
assert.equal(candidates.length,56)
assert.equal(assets.length,4)
assert.equal(new Set(candidates.map(c=>c.repo)).size,56)
assert.equal(repos.repositories.length,56)
assert.equal(repos.failures.length,0)
assert.equal(sources.failures.length,0)
assert.equal(sources.records.length,68)
const map = new Map(repos.repositories.map(r=>[r.repo,r]))
for(const c of candidates){
  for(const k of ['repo','category','name','problem','license','language','quality','decision','saves']) assert.ok(c[k]?.trim(),`${c.repo} missing ${k}`)
  const r=map.get(c.repo)
  assert.ok(r, c.repo)
  assert.match(r.head,/^[a-f0-9]{40}$/)
  assert.match(r.license.sha256,/^[a-f0-9]{64}$/)
  assert.ok(r.license.url.includes(`/blob/${r.head}/`))
  assert.ok(sources.records.some(s=>s.repo===r.repo&&/readme/i.test(s.path)),`README source missing ${r.repo}`)
}
for(const a of assets) for(const k of ['name','url','problem','license','language','quality','decision','saves']) assert.ok(a[k]?.trim(),`${a.name} missing ${k}`)
for(const s of sources.records){
  assert.equal(s.head,map.get(s.repo).head)
  assert.match(s.sha256,/^[a-f0-9]{64}$/)
  assert.ok(s.url.includes(`/blob/${s.head}/`))
  assert.ok(s.bytes>0)
}
const catalogPath=new URL('CATALOG.md',root)
const before=await readFile(catalogPath,'utf8')
execFileSync(process.execPath,[new URL('render-catalog.mjs',root).pathname])
assert.equal(await readFile(catalogPath,'utf8'),before,'Catalog stale: regenerate and review')
assert.equal(before.split('\n').filter(l=>l.startsWith('| [')).length,60)
const artifactNames=(await readdir(root)).filter(p=>/\.(?:md|mjs|json)$/.test(p)&&p!=='verification.json').sort()
const artifactHashes=[]
let localLinks=0
for(const name of artifactNames){
  const bytes=await readFile(new URL(name,root))
  artifactHashes.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length})
  if(!name.endsWith('.md')) continue
  const text=bytes.toString()
  assert.ok(!/turn\d+(?:search|view)\d+/.test(text),'Internal web handle in deliverable')
  for(const m of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){
    if(/^(https?:|#)/.test(m[1])) continue
    await access(new URL(m[1].split('#')[0],new URL(name,root)))
    localLinks++
  }
}
const changed=execFileSync('git',['diff','--name-only','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim().split('\n').filter(Boolean)
assert.ok(changed.every(p=>p==='AGENTS.md'||p.startsWith('docs/')),`Unexpected runtime change: ${changed}`)
const report={status:'passed',runtimeSession:'01a0369d-0914-7190-ac0e-b4d37e1fc052',verifiedAt:new Date().toISOString(),candidateCount:60,repositoryCount:56,assetLibraryCount:4,pinnedLicenseHashes:56,pinnedSourceFiles:68,localLinksChecked:localLinks,checks:['six requested fields plus identity and source for every candidate','unique candidate/repository mapping','no repository/source lookup failures','immutable commit and SHA-256 evidence shape','all source records match repository commit','catalog regeneration byte-identical','all local Markdown artifact links resolve','no internal web citation handles in artifacts','tracked worktree changes limited to AGENTS/docs'],limitations:['No candidate builds, phone benchmarks, security audit or shipping license approvals','External links were researched, not exhaustively re-crawled by this offline verifier','Pre-existing AGENTS.md edits are preserved and not part of this task commit'],artifactHashes}
await writeFile(new URL('verification.json',root),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({...report,artifactHashes:undefined},null,2))
