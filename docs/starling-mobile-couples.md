# Starling: a crossing for two

Runtime session: `01a0369d-0914-7190-ac0e-b4d37e1fc052`.

## Acceptance contract — 2026-09-06

Jonathan requests a substantial visual, storytelling and gameplay redesign for two people playing on separate small phones, portrait first. Keep Mara and Finn's inheritance story; add the original choices-and-growth song and four supplied instrumentals. Music must play inside the game, with an immediate off control. Begin gently, teach what to do and why through actions, and offer an optional difficulty increase. Installation plus a verified complete offline pack is mandatory before launching; installed users can play offline solo or online co-op.

No authentication, public matchmaking, chat, purchases or unrelated RackeTapp changes. Preserve existing saves and user-owned AGENTS.md edits. No physical-phone verification is claimed without actual hardware evidence.

## Implementation decisions

- Onboarding checks that the app is actually running standalone, not a stored “installed” checkbox. Install first, then download in the installed app: Safari and its home-screen web app can have separate storage. Verify the full pack in the current context before enabling play. Invite codes remain visible and can be entered after installation.
- Teach steering, rescue, station switching and teamwork in a calm first crossing. Show one concrete objective at a time; learning progress and difficulty are authoritative and saved.
- Use a single soundtrack media element for all seven tracks. Instrumentals fill sailing; lyrical themes mark opening, learning, ending and the second act. Music off persists independently of effects.
- Refresh the actual in-game hull, water presentation, portrait framing and readable job controls, not only the landing illustration.

## Ledger

| Stage | Evidence |
| --- | --- |
| Intake | User requests 02:08–02:23 UTC Sep 7; one phone each, portrait, mandatory install and tutorial confirmed. |
| Secondary song checkpoint | Existing two-song and choice-reflection implementation locally passed 188 tests and four-viewport browser/offline/co-op checks before broader redesign. See `docs/starling-each-way-i-turn.md`. |
| New artwork | Harbor departure, wooden working boat, distinct royal survey ship, and two four-spread manga atlases. Exact prompts, original and final paths, and alpha repair are recorded in `docs/starling-mobile-assets.md`. |
| Implementation | Five action-driven practice steps; captain-authoritative saved difficulty; occasional AI daughter; eight sea-story encounters followed by five sky/gate/inner-world scenes; portrait controls; mandatory standalone installation and full verified pack; seven in-game recordings. |
| Local checks | Node 22 `pnpm check`: 204 tests, typecheck, lint, Godot import/runtime/export and production web build passed. Full log `/Users/guclaw/.openclaw/workspace/task-artifacts/starling-mobile-final-check.log`. Pack: 36 files, 93.00 MiB (under the 100,000,000-byte safety limit). |
| Browser / offline | Fresh install and invite gates, 320/390/844/1440 px layouts, opening and sailing playback passed. Actual visible pointer/station controls complete tutorial and all five Part II scenes. Seven offline tracks play and seek; range request returns 206/1000 bytes; chapter and mute survive offline cold restart. Evidence in `/Users/guclaw/.openclaw/workspace/task-artifacts/starling-mobile-couples/local-final-layouts/` and `local-journey/`. |
| Authoritative full journey | Local Durable Object: all eight sea moments, all five Part II scenes and final `won`, 150 ms each-way simulated latency, every tenth input dropped, 107.248 seconds wall time, 2 peers / 1066+ frames each / zero peer errors. Save and trace: `/Users/guclaw/.openclaw/workspace/task-artifacts/starling-mobile-couples/local-full-two-act/`. Legacy room smoke also passed. |
| Release | Not yet deployed; do not treat this ledger as completion. |

## Added family / second-act request

The default two player roles remain mother Mara and nine-year-old Finn. Their four-year-old younger daughter is an intermittent AI shield-helper, not a required third player. Provisional name Luma; user may rename her. Add a sequenced second act inspired by the supplied “Three Hearts Inside a Stolen” recording: sea to sky to space, a stolen survey ship, dying sun, a forbidden gate opened by the sun's recorded heartbeat, a living inner world, and a six-winged golden creature answering the daughter's lights. Big moments use full-color manga cut flashes and short, large dialogue with simple actions. Existing sea story and choice-growth themes remain first; do not silently replace them.

Source: `/Users/guclaw/Downloads/Three Hearts Inside a Stolen.m4a`, 304.720 s, 48 kHz stereo Opus audio plus subtitle stream. SHA-256 `2c6c2a3ee430eab80e333b9860c79428a68fe3a82d1db07ae7d83806e779b6b5`. Original preserved; AAC audio-only web derivative plays 304.733 s including encoder padding. New total soundtrack: seven tracks.

## Repaired during real UI verification

- Opening audio previously began a ranged network read while installation switched to the verified cache, causing a media demuxer read error. `preload="none"` defers audio until a user gesture after pack preparation; four-viewport checks now require actual opening playback beyond two seconds and no media error.
- Repeated station taps could reset a character's ladder route. Reissuing the same job now preserves the route; a core regression repeats the helm order every six simulation ticks and requires arrival.
- Offline setup initially offered Download while it was still checking an existing pack. It now waits for the status and manifest, and the copy consistently says install → open icon → download there.
- Invitation hash changes now populate the join form even when Starling was already open; the player still explicitly taps Join ship, and installation remains required.
- Automated standalone display-mode emulation is explicitly marked. This is not evidence of an actual iPhone/Android installation or a hardware playtest; those remain a device acceptance follow-up, not a claim made by this release.

## Platform evidence

- [WebKit Safari 17.2: only cookies, not other local storage, copied when adding a home-screen app](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/).
- [MDN standalone display-mode detection](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Create_a_standalone_app).
- [WebKit storage quotas, persistence and eviction](https://webkit.org/blog/14403/updates-to-storage-policy/).
