# PongApp operating contract

## Mission

PongApp is RackeTapp's fast, beautiful browser side game. Optimize the loop
`open -> choose a mode -> play within seconds -> rematch or share a room`.

## Product invariants

- Keep guest play instant; authentication is optional.
- The room server is authoritative for scores, physics, abilities, and results.
- Cosmetics and mastery never change gameplay power.
- No text chat or public matchmaking in the first release.
- Preserve the RackeTapp visual family without importing RackeTapp application
  code or tennis-specific legal acceptance.
- Keep the game core framework-neutral so it can later be mounted in RackeTapp.

## Standalone boundary

- Keep PongApp standalone at `/pongapp/` until Jonathan requests integration.
- Do not edit RackeTapp, its Supabase project, or its account/legal flows.
- Guest identity and progression remain device-local for this release.
- Browser code never receives server secrets.

## Verification

Run `pnpm check`. For UI changes, verify the guest AI journey and online lobby
at phone and desktop sizes. Do not publish if simulation, protocol, or room
integration tests fail.
