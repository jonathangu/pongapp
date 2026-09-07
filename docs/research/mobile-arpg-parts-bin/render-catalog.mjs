import { readFile, writeFile } from 'node:fs/promises'
import { candidates, assets } from './catalog-data.mjs'
const root = new URL('.',import.meta.url)
const evidence = JSON.parse(await readFile(new URL('repository-evidence.json',root)))
const sources = JSON.parse(await readFile(new URL('source-evidence.json',root)))
const byRepo = new Map(evidence.repositories.map(r=>[r.repo,r]))
const groups = [...new Set(candidates.map(c=>c.category))]
const clean = s => s.replaceAll('|','\\|').replaceAll('\n',' ')
let md = `# Open-source parts catalog\n\nResearch snapshot: ${evidence.observedAt}. ${candidates.length} repositories plus ${assets.length} asset libraries. [Recommendations](README.md) · [Provenance gates](PROVENANCE.md) · [Pinned repository facts](repository-evidence.json) · [Source inspection evidence](source-evidence.json).\n\nThis is a broad screening with selected source/document deep dives, not a full code, security, legal or build audit. “Integrate” means a recommended candidate for a bounded spike, not an installed/approved dependency. Quality statements distinguish documented capabilities and limitations from measured performance; no phone benchmark has been run. Native app is acceptable and browser retention is not required.\n\nCommercial license labels are conditional screening, not legal clearance: preserve notices, review dependency and asset licenses, and meet distribution/source obligations. A code port can remain a derivative work. Copyleft is not a ban on commercial use. License links below are commit-pinned; API NOASSERTION classifications are resolved from actual license text where stated.\n\n“HEAD” means observed default-branch commit date, not last release or a promise of maintainer support. Release tags can be stale, pre-release-like, mirrored or monorepo package-specific; consult the linked upstream rather than treating them as a tested dependency version.\n`
for(const category of groups){
  md += `\n## ${category}\n\n| Project / evidence | Problem solved | License / commercial modification | Language / engine | Activity / quality | Recommendation | Work avoided |\n| --- | --- | --- | --- | --- | --- | --- |\n`
  for(const c of candidates.filter(c=>c.category===category)){
    const r=byRepo.get(c.repo)
    if(!r) throw new Error(`Missing repo ${c.repo}`)
    const s=sources.records.find(s=>s.repo===c.repo&&/readme/i.test(s.path))
    const fact=`HEAD ${r.headCommitted.slice(0,10)}${r.archived?'; archived':''}. ${r.release?`Latest GitHub release: [${r.release.tag}](${r.release.url}), ${r.release.published.slice(0,10)}.`:'No latest stable release returned by API.'}`
    const cells=[`[${c.name}](${r.url})${s?` · [README](${s.url})`:''} · [commit](${r.url}/commit/${r.head})`,c.problem,`${c.license} [License](${r.license.url})`,c.language,`${fact} ${c.quality}`,c.decision,c.saves]
    md+=`| ${cells.map(clean).join(' | ')} |\n`
  }
}
md+='\n## Art and sound assets\n\nLibrary-level policies below were checked on 2026-09-06. They are not downloaded-pack approvals; no assets were imported.\n\n| Library / primary policy | Problem solved | License / commercial modification | Formats | Quality / activity caveat | Recommendation | Work avoided |\n| --- | --- | --- | --- | --- | --- | --- |\n'
for(const a of assets) md+=`| ${[`[${a.name}](${a.url})`,a.problem,a.license,a.language,a.quality,a.decision,a.saves].map(clean).join(' | ')} |\n`
md+='\nPoly Haven API terms source: [official Public API README](https://github.com/Poly-Haven/Public-API/blob/master/README.md). Asset rights and permission to use the live API are different questions.\n'
await writeFile(new URL('CATALOG.md',root),md)
console.log(`Rendered ${candidates.length+assets.length} complete candidate entries in ${groups.length+1} groups.`)
