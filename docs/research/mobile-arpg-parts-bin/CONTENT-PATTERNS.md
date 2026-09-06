# Content patterns worth reusing

This is a source-informed design proposal, not implemented game code. We studied general structures; we did not copy game content, formulas, licensed implementations or names. Porting an implementation between languages would still require license review.

## Findings mapped to our game

| Area | Observed reference | Proposed original application |
| --- | --- | --- |
| Items and affixes | Flare separates item definitions, bonuses and level-scaled values; GLoot supplies reusable prototypes and inventory constraints. | Item definition is immutable content; item instance stores identity, rolled affix IDs/values and mutable state. Affix eligibility uses tags and exclusion groups. The inventory adapter stores instances without deciding combat behavior. |
| Skills and triggers | Flare's power parser supports data-referenced effects and triggers around casting, damage, wall contact and expiry. | A core/skill declares small behaviors triggered by typed combat events. Wall-hit effects are first-class because ricochet is our identity. Bound every chain and make its cause visible. |
| Monsters | Flare StatBlock contains combat/AI power and progression fields; Veloren groups abilities through a manifest. | Enemy archetypes reference movement, attack, telegraph, defense and loot profiles. Variants change a small data patch, not a subclass tree. Behavior-tree actions call these narrow profiles. |
| Loot | Cataclysm item groups distinguish a collection of independent possibilities from a weighted selection; Flare applies level and campaign conditions. | Separate drop count, item-family selection, rarity, affix pool and numeric rolls. Use a seeded loot RNG stream and validate normalized probabilities and eligibility. Design our own economy. |
| Maps and rooms | Flare uses external map authoring; WFC and DeBroglie demonstrate tile constraints. | Author room shapes and metadata in an existing editor; connect a route graph, then dress it. Validate exit reachability, spawn clearance and ricochet geometry. |
| Saves | Flare saves player progression, equipment/action-related state; Cataclysm explicitly migrates removed/replaced content IDs by type. | Version save schema and content pack independently. Save stable IDs plus instance state, not engine pointers. Provide migrations, missing-content diagnostics and round-trip/golden tests. |
| Damage and status | Flare exposes typed damage/effect parameters; OpenMW separates magic-effect records from runtime machinery. | Define a documented resolution order: base impact → additive modifiers → multipliers → defense/resistance → final damage → after-hit events. Clarify caps, rounding and stacking, with inspectable intermediate values. No copied balance formula. |
| Progression | Flare exposes level/experience and level-dependent values; Wesnoth offers scenario and ability data boundaries. | Keep experience curves, unlock prerequisites and difficulty/reward tables in versioned content. Separate run growth from any permanent progression; do not silently change the existing competitive game's power policy. |

### Exact sources inspected

- Flare: [ItemManager.h](https://github.com/flareteam/flare-engine/blob/dab2fb220b1d8505d63905eca108a29c8c7fd80c/src/ItemManager.h), [PowerManager.cpp](https://github.com/flareteam/flare-engine/blob/dab2fb220b1d8505d63905eca108a29c8c7fd80c/src/PowerManager.cpp), [LootManager.cpp](https://github.com/flareteam/flare-engine/blob/dab2fb220b1d8505d63905eca108a29c8c7fd80c/src/LootManager.cpp), [SaveLoad.cpp](https://github.com/flareteam/flare-engine/blob/dab2fb220b1d8505d63905eca108a29c8c7fd80c/src/SaveLoad.cpp), [StatBlock.h](https://github.com/flareteam/flare-engine/blob/dab2fb220b1d8505d63905eca108a29c8c7fd80c/src/StatBlock.h). We inspected relevant definitions and parser/save sections, not every execution path.
- Cataclysm: DDA: [JSON inheritance](https://github.com/CleverRaven/Cataclysm-DDA/blob/b9054a1074041dab7e8e2e52e238ba5e571788d2/doc/JSON/JSON_INHERITANCE.md), [item spawning](https://github.com/CleverRaven/Cataclysm-DDA/blob/b9054a1074041dab7e8e2e52e238ba5e571788d2/doc/JSON/ITEM_SPAWN.md), [obsoletion and migration](https://github.com/CleverRaven/Cataclysm-DDA/blob/b9054a1074041dab7e8e2e52e238ba5e571788d2/doc/JSON/OBSOLETION_AND_MIGRATION.md). Its inheritance rules are type-specific; copy neither its full complexity nor an assumption of universal deep merging.
- Veloren: [ability manifest](https://github.com/veloren/veloren/blob/f5cf03e8eb107dfe382903aeb98a102e83afa628/assets/common/abilities/ability_set_manifest.ron).
- OpenMW: [magic-effect record](https://github.com/OpenMW/openmw/blob/def941246531187d27cc8ceea8baf8b1894a994e/components/esm3/loadmgef.hpp).
- Wesnoth: [ability schema](https://github.com/wesnoth/wesnoth/blob/a6023944c8b3a151f9b4b660cb95975abaa3c44b/data/schema/units/abilities.cfg).
- Permissive implementation candidates: [GLoot](https://github.com/peter-kish/gloot), [Beehave](https://github.com/bitbrain/beehave), [DeBroglie](https://github.com/BorisTheBrave/DeBroglie). See the catalog for pinned README/license evidence.

## Small composable vocabulary, not a universal scripting language

Proposed content families: `core`, `affix`, `skill`, `enemy`, `room`, `room_modifier`, `boss_phase`, `loot_table`, `status`, `progression_curve`.

Each definition should have a stable namespaced ID, schema version, tags, presentation references and typed behavior configuration. Keep definition data separate from live mutable component state. Use shallow prototypes or explicit fragments with well-defined merge rules; reject cycles, unknown fields and duplicate IDs at build time. Prefer composition over deep inheritance.

Initial behavior vocabulary might include `reflect_velocity`, `apply_impulse`, `spawn_projectile`, `split_projectile`, `capture_orbit`, `release_orbit`, `apply_status`, `modify_stat`, `emit_telegraph` and `transition_phase`. Every behavior has a typed configuration, bounded runtime cost and a unit test. Add a new behavior only when existing primitives cannot express a genuinely new mechanic cleanly.

Illustrative original content—not copied, not an implemented schema:

```json
{
  "id": "affix.echo_prism",
  "schemaVersion": 1,
  "eligibleTags": ["core", "ricochet"],
  "trigger": "projectile.wall_reflected",
  "conditions": { "minTravel": 3, "excludeTags": ["echo_child"] },
  "behavior": {
    "type": "split_projectile",
    "count": 2,
    "spreadDegrees": 24,
    "damageScale": 0.35,
    "childTags": ["echo_child"]
  },
  "limits": { "perRootProjectile": 1, "maxGeneration": 1 }
}
```

The physics library reports a reflection/contact; our adapter emits an event; a validated affix selects a small behavior; presentation consumes the result. An orbiting core should use the same event/behavior system, not an unrelated `OrbitMage` class with duplicate damage logic. These are design proposals to test in the next prototype.

Required semantics before implementation:

- Stable event ordering with tick, source, target, parent event and root projectile IDs. A bounded queue prevents recursive proc explosions. Deliberate deferral to the next tick must be explicit.
- Defined effect stacking: replace, refresh, independent stacks or strongest-only; source ownership and removal rules. Damage and animation timing cannot silently diverge.
- Separate RNG streams for combat, loot and generation. Seed plus content/version hash must appear in replay/debug output.
- Structural schema validation plus semantic checks: referenced IDs exist, graph cycles are allowed only where bounded, numbers are finite, probabilities/weights are valid, durations and counts stay within limits.
- Authoring hot reload through validated transactions between ticks; reject invalid edits without destroying a running session. Networked matches must not accept arbitrary untrusted content or debug mutations.
- Inspectors explain “why”: stat contribution breakdown, selected loot group, aggro target, rejected condition, exact parent of each proc, collision normal and before/after velocity.
- Property tests cover bounded energy/projectile growth, no double-hit from one contact, save/load equivalence and room reachability. Golden fixtures protect intended behavior while libraries are upgraded.

The authoring success test is concrete: add a core variant, an affix, an enemy variant and a room modifier through data; write a small behavior only for a genuinely new mechanic. If each addition requires editing several large central classes, the prototype fails the architecture goal even if it runs quickly.
