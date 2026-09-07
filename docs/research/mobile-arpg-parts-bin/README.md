# Mobile ARPG: reuse-first research and recommendation

Research completed 2026-09-06. Runtime `01a0369d-0914-7190-ac0e-b4d37e1fc052`.

## Decision summary

**Godot is the leading candidate for a small, same-project native-and-web comparison. No engine migration is approved or implemented by this report.** The user accepts installed apps and has an Android phone; their willing co-tester has an iPhone. The user also values the lower friction of opening a browser link. Native is allowed, browser retention is not mandatory, and easy first play remains an important product advantage. This does not retire the released browser game.

The likely winning combination is an open engine/editor, a small number of focused plugins, coherent permissive art, and our own compact combat/content layer. We should own the pleasure of steering, reflecting, orbiting and splitting attacks, and the build combinations that emerge from it. We should not own a new renderer, physics solver, level editor or inventory-widget framework without evidence that existing choices fail.

- [60-candidate catalog](CATALOG.md): every entry records the problem, license/commercial conditions, language, activity/quality, recommendation and work avoided.
- [Content-pattern findings](CONTENT-PATTERNS.md): items, affixes, skills, enemies, loot, maps, saves, damage and progression; proposed original composition model.
- [Provenance and adoption gates](PROVENANCE.md): exact versions, separate code/asset rights, license conditions and maintenance ownership.
- [Standing reuse-first policy](../../OPEN-SOURCE-FIRST.md): research before major subsystem implementation.
- [Repository evidence](repository-evidence.json) and [source evidence](source-evidence.json): exact observed commits, license hashes and selected inspected files. [Progress and verification](PROGRESS.md).

Assumptions: preserve the possibility of commercial distribution; do not assume the user has chosen closed-source licensing. Prefer minimal distribution friction while keeping copyleft projects available as architecture references. Both iOS and Android are relevant; exact device models/OS versions, minimum device floor, visual dimension and orientation remain open. Recommendations below are judgments from documentation/source screening, not measured phone results.

## Engine comparison after the native-app clarification

| Candidate | What it lets us reuse | Agent-editable stack / iteration cost | Mobile verdict |
| --- | --- | --- | --- |
| Godot | Editor, scenes/resources, animation import/blending, navigation, UI, audio, physics, export tools | MIT source; text-based scripts/resources; native extension escape hatch. A permanent engine fork remains expensive to maintain. | First prototype. Try GDScript and engine systems before introducing native plugins. |
| Existing TypeScript + Three/Pixi | Current simulation, tests, UI and room logic | Extremely easy local code iteration; more game-tooling and native packaging work remains. | Preserve as combat/reference baseline, not a mandatory equal-sized browser rewrite. |
| Bevy | ECS and Rust engine systems | Excellent compositional code model; upstream explicitly warns about missing features and breaking releases. More editor/content tooling to assemble. | Secondary only if Godot fails a concrete simulation/authoring requirement. |
| O3DE | Large modular native 3D engine/editor | Full source, but large build and tooling footprint. This is a host-development cost, not a claim about phone RAM. | Defer for this game; no evidence we need its scale. |
| Solar2D / Phaser | Native 2D workflow / browser 2D framework respectively | Accessible scripting and narrower feature set; less suitable if rich 3D becomes necessary. | Useful focused alternatives, not additional stacks to combine with Godot. |

Sources: [Godot overview](https://github.com/godotengine/godot), [Bevy's own stability warning](https://bevy.org/learn/quick-start/introduction/), [O3DE requirements](https://docs.o3de.org/docs/welcome-guide/requirements/). Commit-pinned licenses and activity are in the catalog. “Open source” gives us the ability to inspect and patch the stack; it does not make engine maintenance free or automatically improve feel.

Godot's iOS route uses macOS, Xcode and export templates; Android has a documented SDK/JDK export path. GDScript is the simplest initial choice: C# mobile support is still described as experimental in these export docs. Signing, store accounts and release distribution are separate work, not performed or purchased here. [iOS export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_ios.html), [Android export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html).

Try a browser export early from the same small project. Godot web currently requires its Compatibility/WebGL2 path; C# projects do not export to web, and native extensions introduce web-build/isolation considerations. Start with GDScript and a compatible visual baseline, then measure whether optional native enhancements justify divergence. [Godot web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).

### Distribution strategy: easy first play, installation when worthwhile

A browser link avoids an app-install step, but “instant” still depends on download size, startup, sign-in friction and phone performance. Proposed strategy: a genuinely playable shared-link experience for discovery, plus an installed build if it delivers a meaningfully better repeat-play experience. It is also acceptable for the browser build to remain the main experience if measurements show it feels excellent. Do not force an install merely because native is available.

The two willing testers can tolerate installation during development, allowing us to measure the ceiling as well as the easy-entry path. For iPhone beta distribution, TestFlight is a standard option, but it still involves its app and a beta installation; it is not equivalent to a click-and-play webpage. Account, signing and review setup must be checked separately before choosing that route. [Apple TestFlight](https://developer.apple.com/testflight/). Android supports direct development-device testing. [Android device testing](https://developer.android.com/studio/run/device).

Prefer one content/combat project with export-specific settings, not separate native and browser games. A lightweight web demo is a possible fallback, not a decided scope cut. If a chosen plugin or renderer makes web export expensive, expose that tradeoff before adoption instead of silently abandoning easy sharing.

## Recommended reuse map

| Subsystem | Native-first starting point | Alternative / trigger | What remains original |
| --- | --- | --- | --- |
| Physics | Godot physics, with a deliberate 2D vs true-3D choice | Jolt through Godot for 3D; Box2D or Rapier only if measured gaps justify an extension | Collision-to-combat rules, reflection ownership, trajectory powers, hit/proc budgets |
| Enemy movement | Godot navigation/avoidance and Beehave | LimboAI for better measured workflow/performance; Recast/RVO only for unmet needs | Aggro, telegraphs, spacing, attack roles and response to knockback |
| Inventory | GLoot behind our item-instance model | Expresso Inventory System if crafting/features justify extension cost | Affix eligibility, build semantics, readable phone interaction |
| Rooms / biomes | LDtk or Tiled for authored rooms; FastNoiseLite fields | rot.js generators; offline DeBroglie/WFC for constrained dressing | Route graph, combat pacing, ricochet surfaces, reward/risk decisions |
| Assets / animation | Coherent Kenney/Quaternius packs; Godot import/AnimationTree | glTF Transform preprocessing; selected Poly Haven materials | Art direction, silhouette language, animation timing and encounter readability |
| Content editing | Engine inspectors first; JSON Schema/Ajv forms when needed | React Flow for graph authoring, Dialogue Manager for actual dialogue needs | Typed behavior vocabulary, validation and balancing rules |
| Debugging | Engine debugger/profiler plus domain overlays | Tracy/native debug UI only when warranted; Tweakpane for retained web tooling | Trajectories, event causality, damage breakdowns, proc chain and aggro inspectors |
| Network | No new backend for the single-player feel prototype | Colyseus vs Nakama when scope demands; ENet via engine for native transport | Authority, reconciliation, anti-cheat boundaries and progression policy |
| VFX / sound | Engine particles/audio plus curated permissive assets | three.quarks/Howler for the existing browser path; jsfxr offline SFX | Impact timing, sound palette and visual prioritization |

These are mutually conditional candidates, not a shopping list to install. Especially avoid adding two physics engines, two ECS worlds, three dialogue systems or multiple backends before measuring a need.

### Physics is a design substrate, not the entire combat model

A stylized 3D presentation does not require full 3D gameplay physics. Compare a 2D gameplay plane with a genuinely 3D arena only if height/vertical trajectories materially improve play. Godot's Jolt integration is **3D**, not a replacement for its 2D physics. [Godot Jolt integration](https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html).

Reuse broad phase, contacts, continuous collision detection and queries. Own a thin gameplay adapter that turns contact facts into stable events and applies reflection, deflection, orbit capture/release and split budgets. Do not let both the solver and custom bounce code apply the same impulse. Test corner contacts, grazing angles, very fast projectiles, thin walls, moving reflectors and repeated contacts explicitly. Hundreds of enemies need sensible collision filtering and navigation budgeting, not necessarily hundreds of mutually colliding rigid bodies.

Rapier is the strongest browser physics candidate if we retain that route. Current Box2D also documents deterministic behavior under stated conditions; neither claim means our whole game automatically replays identically. RNG streams, command/event order, content version and initialization must also be controlled. [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/), [Box2D simulation/determinism](https://box2d.org/documentation/md_simulation.html).

### Generate playable structure before decorative variety

Use an explicit route graph connecting authored room templates with validated entrances, exits, boss/reward placement and traversal clearance. Use noise for biome masks and WFC for constrained dressing afterward. WFC's local adjacency rules alone do not promise connectivity; DeBroglie adds backtracking and non-local constraints, but still needs a solve budget and fallback room. Test reachability across many seeds and keep a known-good authored fallback. [WFC reference](https://github.com/mxgmn/WaveFunctionCollapse), [DeBroglie](https://github.com/BorisTheBrave/DeBroglie).

### Mobile beauty depends on restraint and coherence

Proposed direction: readable stylized arenas, strong enemy/attack silhouettes, one consistent material palette, and a clear visual distinction between physical surfaces, harmless spectacle and damaging attacks. Begin with a coherent asset family. Resize textures, bake expensive detail and cap particle overdraw. Avoid large scanned assets and full-screen effects simply because they are available.

The player's thumb must not cover the trajectory they need to read. Compare drag-to-steer/aim and a small-control scheme, with optional aim assistance and forgiving pickup/equip actions. Keep builds interesting through physical behavior, not through twelve tiny ability buttons. Inventory should support tap-to-equip and clear comparisons even if drag/drop exists. These are proposed design tests, not validated findings about player preference.

## Next bounded experiment — not implemented in this research turn

Build one native Godot room using licensed prototype assets, three enemies (chaser, ranged attacker, shielding/reflecting enemy), one short boss sequence and three physically distinct builds:

1. Precision ricochet: deliberate wall returns and high-impact timing.
2. Orbit-and-release: capture moving attacks, then release them into an opening.
3. Controlled splitting: a few readable child projectiles with strict chain limits.

Reuse current combat test cases and timings where they remain relevant. Add one affix and one enemy variant entirely through structured content to prove the authoring model. Test native and browser exports on the user's Android and the co-tester's iPhone, recording the exact device/OS/browser versions; then broaden to an agreed minimum device tier. Keep the released browser build untouched.

Proposed acceptance contract (targets to agree and measure, **not results**):

- Sustained 60 Hz presentation goal; record p50/p95/p99 frame times through a 10-minute combat run. Investigate repeated frames over 33 ms and all long stalls; report memory, temperature/throttling symptoms and battery drain context rather than guessing fixed universal budgets.
- Compare 20, 100 and 200 enemies plus deliberately heavy projectile/proc cases. Record active collision bodies, AI tick cost, draw calls, overdraw and worst event-chain length. These are stress tiers, not a promise that the game needs 200 enemies.
- Measure touch-to-visible response with device instrumentation or high-speed video. Aim for p95 below 80 ms initially; tune from actual device evidence and player feedback.
- Test one-handed/two-handed grip, left/right thumb, safe areas, small-screen text, audio interruption, app switching, background/foreground recovery, offline start and save/load.
- Compare a fresh shared-link visit with native installation/first launch. Record compressed download size, cold/warm time to controllable gameplay, failed starts and the number of user steps. Test a real mobile connection; avoid forcing accounts for the discovery build. Record differences in feel and visual clarity between exports.
- Show a trajectory overlay, collision normals, damage calculation breakdown, source/parent IDs for triggered effects, seeded replay and spawn-any-content panel. Debug UI must be excluded or disabled in production builds.
- Verify at least 1,000 room seeds for traversal and loot/content reference validity, plus golden save migration and deterministic combat fixtures where determinism is intended.

Reject or revise Godot for an observed failure: unacceptable sustained phone performance, unreliable export/lifecycle, excessive content-authoring friction, physics needs not solvable through a small adapter, or excessive startup/export costs that undermine the agreed sharing experience. Compare two exports of one slice before considering a second engine. A device benchmark and an engine decision are future gates, not missing evidence for completion of this research report.

## License findings that change the shortlist

- Correcting the common assumption: DevilutionX's **current** source uses a noncommercial-restricted Sustainable Use License. It is not an approved commercial code donor. [Current license](https://github.com/diasurgical/DevilutionX/blob/0ff3186238e7c2786c4d52c21ecce1cb83723ed9/LICENSE.md).
- OpenDiablo2 is archived. Flare, OpenMW, Veloren and Wesnoth remain useful architecture references, but their copyleft licenses are not interchangeable with MIT. Cataclysm: DDA uses an unusual CC-BY-SA project license. See pinned primary licenses in the catalog.
- A repository license does not license Diablo/Morrowind data or every bundled asset. WFC explicitly excludes sample images from its software license. OpenGameArt requires per-asset review.
- Small focused projects are genuinely valuable here: GLoot, Beehave, FastNoiseLite, jsfxr and shader noise snippets can save substantial work without importing another game's world or identity.

No candidate code or assets were copied into the game, no dependencies installed, and no production or save data changed. This pass establishes a reusable research base and a native-first testing recommendation, not production-readiness certification for 60 projects.
