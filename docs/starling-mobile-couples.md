# Starling: a crossing for two

Runtime session: `01a0369d-0914-7190-ac0e-b4d37e1fc052`.

## Acceptance contract — 2026-09-06

Jonathan requests a substantial visual, storytelling and gameplay redesign for two people playing on separate small phones, portrait first. Keep Mara and Finn's inheritance story; add the original choices-and-growth song and four supplied instrumentals. Music must play inside the game, with an immediate off control. Begin gently, teach what to do and why through actions, and offer an optional difficulty increase. Installation plus a verified complete offline pack is mandatory before launching; installed users can play offline solo or online co-op.

No authentication, public matchmaking, chat, purchases or unrelated RackeTapp changes. Preserve existing saves and user-owned AGENTS.md edits. No physical-phone verification is claimed without actual hardware evidence.

## Implementation decisions

- Onboarding checks that the app is actually running standalone, not a stored “installed” checkbox. Install first, then download in the installed app: Safari and its home-screen web app can have separate storage. Verify the full pack in the current context before enabling play. Invite codes remain visible and can be entered after installation.
- Teach steering, rescue, station switching and teamwork in a calm first crossing. Show one concrete objective at a time; learning progress and difficulty are authoritative and saved.
- Use a single soundtrack media element for all six tracks. Instrumentals fill sailing; lyrical themes mark opening, learning and ending. Music off persists independently of effects.
- Refresh the actual in-game hull, water presentation, portrait framing and readable job controls, not only the landing illustration.

## Ledger

| Stage | Evidence |
| --- | --- |
| Intake | User requests 02:08–02:23 UTC Sep 7; one phone each, portrait, mandatory install and tutorial confirmed. |
| Secondary song checkpoint | Existing two-song and choice-reflection implementation locally passed 188 tests and four-viewport browser/offline/co-op checks before broader redesign. See `docs/starling-each-way-i-turn.md`. |
| New artwork | Built-in image generation produced a portrait Starling harbor departure; source retained under generated_images. Integration and final visual verification pending. |
| Implementation | In progress. |
| Release | Not yet deployed; do not treat this ledger as completion. |

## Platform evidence

- [WebKit Safari 17.2: only cookies, not other local storage, copied when adding a home-screen app](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/).
- [MDN standalone display-mode detection](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Create_a_standalone_app).
- [WebKit storage quotas, persistence and eviction](https://webkit.org/blog/14403/updates-to-storage-policy/).
