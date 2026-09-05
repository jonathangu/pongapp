# Orbital power play

Runtime session: `01a0369d-0914-7190-ac0e-b4d37e1fc052`.
Baseline: b737d073, integrated cylinder vista.

## User correction and acceptance

- Far fewer border objects. No scenic fences; the cylinder is a navigable world.
- Freely travel all the way around its circumference, with no invisible side stops or wrap seam.
- Camera looks 10 degrees more downward than the baseline, retaining sky/horizon at the sides.
- Every control responds immediately. Holding Left/Right continuously steers; individual taps add a stronger dodge impulse. Holding Shoot streams powerful shells; taps fire heavier splash shots.
- Hold or tap Recover. Always usable when damaged, with a clear saved shared progress bar; taps contribute more quickly. No hidden resource lockout.
- Real touch, mouse and keyboard support. Release, pointer cancellation, lost capture, help, blur, background, disconnect and rematch cannot leave a hold stuck. Simultaneous controls and both players work.
- Preserve authoritative deterministic multiplayer, cumulative tap idempotency, direct/relay fallback and stale-client rejection. Bump protocol/ruleset for this control/geometry change. Verify a real local Durable Object and the production worker.
- Curved projection/picking/collisions/projectiles all use shortest distances around the cylinder, including the seam. Fix the previously documented neutral-teammate target reset as part of the new input contract.
- No Clearing/RackeTapp/Supabase changes; preserve unrelated AGENTS.md. No new paid services, timer or delegated task.

## Product vision: a living toy-world rescue run

The central fantasy is a tiny crew with absurd firepower surfing an impossible, beautiful world. It should feel good before the player understands it: forward motion is automatic, sideways movement is free, and the first press makes something unmistakably happen. Holds are comfortable; taps are energetic accents, not repetitive strain requirements.

The world should feel enormous through composition, not object count: open silhouettes, one memorable landmark, generous sky, distant weather, luminous falling rewards and readable explosions. The cylinder is the distinctive movement mechanic, not a corridor with curved walls. The crew and threats own the foreground.

The emotional goal is to bring friends home. The existing rescue-and-guardian objective fits this better than a generic survival score. A satisfying long-term run is: instantly glide and blast; rescue a first friend early; gain surprising visible powers; see the world transform; take down a spectacular guardian; fly home with the rescued crew; instantly replay/share. Failure should invite one more adventure, not feel like an account/progression chore.

This release implements the user's movement, camera, power and recovery changes and cleans the visual density. It retains the current five-chapter/guardian structure. A bespoke opening encounter, richer chapter transitions, guardian choreography, rescue passengers and a playable homecoming are recommended next slices, NOT claimed as shipped here. Avoid inventory screens, multiple currencies, loadout homework, skill trees or a broad open-world build before the first ten seconds are excellent.

Success criteria: first input visible within one simulation tick; full orbit possible within a few seconds of holding; tap stronger than a comparable short hold; fire starts immediately and sustains; recovery progress legible without opening help; open sky and one focal action area; zero input sticking; smooth mobile browser play.

## Implemented and locally verified

- Co-op ruleset9 / protocol8; versus ruleset6 unchanged. Full2π coordinates, wrapped collision/homing/targeting and a smoothly following cylinder with no side clamps. Camera pitch is exactly baseline+10°.
- Held steering settles at .026 coordinate units/tick; tap impulse .06. Held shells damage7, power-tap shells damage14 with a wider blast. Projectiles/objects/effects remain capped.
- Recovery requires180 shared work: five taps, approximately three seconds holding, or two seconds holding with salvage. Progress is saved, and zero salvage never prevents repair.
- Separate pointer/keyboard sources support simultaneous holds. Release/cancel/lost capture/blur/background/help/rematch clear controls. Explicit target-sequence events prevent a neutral teammate from clearing manual aim.
- Removed dense bank, rock and mountain fences. Sparse distant landmarks preserve open foreground and the full-circumference terrain. WebGL and fallback projection/picking share the same smoothed roll.
- `pnpm check`:93 tests plus lint, typecheck and production build passed. Real local Durable Object co-op/versus and stale protocol7 refresh rejection passed. RTC/direct+relay tests include guest full orbit, held firing/free repair, release/stale rejection, exact-once tap bursts, persistent manual aim, rematch/background/reconnect and invitation UI.
- Five worlds under sustained held fire plus repeated power taps: DPR3 browser emulation (renderer capped1.5),4×CPU, p95≈16.7ms, no>250ms freezes, no browser exceptions; model failure and GPU loss retain usable fallback.20 deterministic balance seeds completed the rescue/guardian objective; this is not a human fun assessment.

Evidence: `/Users/guclaw/.openclaw/workspace/task-artifacts/orbital-power-play/`. Cross-browser control and production deployment receipts are recorded there; only the final live receipt establishes release completion. This supersedes historical tap-only acceptance scripts; use `scripts/orbital-controls-smoke.mjs` for the current four-button contract.
