// Read-only upstream inspection. Never installs or executes candidate project code.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
const exec = promisify(execFile)
const repos = [
  'flareteam/flare-engine','OpenDiablo2/OpenDiablo2','diasurgical/DevilutionX','OpenMW/openmw','veloren/veloren','CleverRaven/Cataclysm-DDA','wesnoth/wesnoth','GDQuest/godot-open-rpg',
  'godotengine/godot','bevyengine/bevy','o3de/o3de','phaserjs/phaser','pixijs/pixijs','coronalabs/corona',
  'jrouwe/JoltPhysics','dimforge/rapier','erincatto/box2d','piqnt/planck.js',
  'recastnavigation/recastnavigation','isaac-mason/recast-navigation-js','BehaviorTree/BehaviorTree.CPP','bitbrain/beehave','limbonaut/limboai','Mugen87/yuka','snape/RVO2',
  'mxgmn/WaveFunctionCollapse','BorisTheBrave/DeBroglie','Auburn/FastNoiseLite','ondras/rot.js',
  'lsalzman/enet','heroiclabs/nakama','colyseus/colyseus',
  'ocornut/imgui','wolfpld/tracy','cocopon/tweakpane','SanderMertens/flecs','skypjack/entt','NateTheGreatt/bitECS',
  'mapeditor/tiled','deepnight/ldtk','donmccurdy/glTF-Transform','nathanhoad/godot_dialogue_manager','inkle/ink','YarnSpinnerTool/YarnSpinner','xyflow/xyflow','rjsf-team/react-jsonschema-form','ajv-validator/ajv','clauderic/dnd-kit','peter-kish/gloot','expressobits/inventory-system',
  'Alchemist0823/three.quarks','pmndrs/postprocessing','ashima/webgl-noise','goldfire/howler.js','Tonejs/Tone.js','chr15m/jsfxr'
]
const api = async path => JSON.parse((await exec('gh',['api',path],{maxBuffer:8*1024*1024})).stdout)
const results = [], failures = []
let cursor = 0
await Promise.all(Array.from({length:5},async()=>{
  while(cursor<repos.length){
    const requested = repos[cursor++]
    try {
      const repo = await api(`repos/${requested}`)
      const commit = await api(`repos/${repo.full_name}/commits/${repo.default_branch}`)
      let license = null, licenseError = null, release = null
      try {
        const l = await api(`repos/${repo.full_name}/license?ref=${commit.sha}`)
        const bytes = Buffer.from(l.content,'base64')
        license={path:l.path,blobSha:l.sha,sha256:createHash('sha256').update(bytes).digest('hex'),spdx:l.license?.spdx_id,name:l.license?.name,url:`https://github.com/${repo.full_name}/blob/${commit.sha}/${l.path}`,bytes:bytes.length}
      } catch {licenseError='No license returned by GitHub license endpoint; inspect root/individual files before reuse.'}
      try {const r = await api(`repos/${repo.full_name}/releases/latest`);release={tag:r.tag_name,published:r.published_at,url:r.html_url}} catch { /* No latest stable release is not evidence of inactivity. */ }
      results.push({requested,repo:repo.full_name,url:repo.html_url,description:repo.description,language:repo.language,archived:repo.archived,defaultBranch:repo.default_branch,head:commit.sha,headCommitted:commit.commit.committer.date,pushed:repo.pushed_at,license,licenseError,release})
      console.log(repo.full_name,license?.spdx??'REVIEW',repo.archived?'ARCHIVED':'',commit.commit.committer.date)
    } catch(error){failures.push({repo:requested,error:String(error).split('\n')[0]});console.log('FAILED',requested)}
  }
}))
results.sort((a,b)=>repos.indexOf(a.requested)-repos.indexOf(b.requested))
await writeFile(new URL('repository-evidence.json',import.meta.url),JSON.stringify({observedAt:new Date().toISOString(),method:'Read-only GitHub API metadata, default-branch commit and pinned license lookup; no build audit or candidate execution.',repositories:results,failures},null,2)+'\n')
console.log('Recorded',results.length,'repositories;',failures.length,'lookup failures')
