# Godot browser art provenance

Created for this refresh with the built-in image generation tool; no CLI/API fallback, asset purchase or external character IP. Original generated PNG alpha is preserved. Godot imports generate mipmaps for small on-screen sprites.

## New assets

- `apps/godot/assets/starling.png`: original brass rescue ship; source generation `exec-0f790f8c-bb5b-47a2-b75f-c84e220a0c16.png`.
- `apps/godot/assets/island.png`: original lantern island; source generation `exec-3fae3497-c210-4fa5-9b8a-3ae72771039f.png`.
- `apps/godot/assets/manta.png`: original pirate manta; source generation `exec-a52e034e-de80-41f6-bdc2-fa7cf575cd38.png`.

## Prompts

### Ship

Use case: stylized-concept. Asset type: transparent PNG sprite for a premium 2D co-op browser adventure named Starling. Create ONE original charming round rescue ship seen straight-on in orthographic cross-section: a circular brass-and-ivory spherical bathysphere with warm amber wooden decks inside a deep blue-green glass dome, four thin horizontal accessible platforms with ladders, small central glowing mint reactor at bottom. Ship silhouette must be roughly circular, entire object visible centered, fills 85% of square image. Painterly hand-crafted storybook game art, bold beautiful silhouette readable at 90 pixels, clean rich textured shapes, warm highlights and teal shadows, subtle worn metal, small cloth pennants and lamps; polished not photorealistic. Important production constraints: no crew or people, no guns or turret barrels (animated separately), no background scene, no ocean, no ground, no text, no labels, no watermark. Genuinely transparent background with alpha around hull. Interior remains opaque dark teal and warm wood so tiny animated crew can be drawn over it. No dramatic perspective; exactly front orthographic circular cutaway.

### Island

Use case: stylized-concept. Asset type: single transparent environment sprite for a premium 2D storybook ocean exploration game. Primary request: ONE charming small rugged island with mossy turquoise stone cliffs, rounded lush layered green trees, a tiny amber-lit cream lighthouse and red-orange roof, rope jetty and little golden lamps. Slight overhead orthographic game viewpoint, roughly circular footprint. Rich hand-painted textures, beautifully sculpted simple shapes, teal shadows and warm cream light, cheerful adventurous mood, visually readable at 150 pixels. Center entire island with generous padding in square canvas. Genuinely transparent background with alpha, no ocean or ground outside the island, no surrounding mist, no shadow extending far from island, no text, no labels, no people, no logos or watermark. This is a production game sprite, not a scene illustration.

### Manta

Use case: stylized-concept. Asset type: transparent game enemy sprite for a premium hand-painted 2D ocean fantasy adventure. Primary request: ONE original small mechanical manta-ray pirate drone, overhead orthographic view facing right. Rounded dark coral-red armored shell, broad graceful wing fins, a glowing pale amber eye at its pointed right-facing nose, brass rivets, dark teal underside, two small luminous red-orange engine pods. Charming but clearly dangerous. Rich storybook painted texture, sculpted clean graphic silhouette, broad simple shapes readable at 50 pixels. Entire creature centered, ample transparent padding. Genuinely transparent alpha background, no scene, no water, no shadow outside silhouette, no text, no watermark, no other objects. Not realistic, not grotesque, no familiar franchise design.

## Reused project assets

Additional wild-island art: `apps/godot/assets/wild-island.png`, built-in generation `exec-d3063372-825d-4c26-b9fa-df49a2d0a24b.png`. Prompt: Use case: stylized-concept. Asset type: ONE transparent game environment sprite for a premium hand-painted 2D ocean adventure. Create a small wild uninhabited rocky islet: irregular rounded teal-grey weathered cliff rocks, lush moss, three wind-bent leafy trees, a few warm yellow grasses and tiny flowers, turquoise wet stone at its foot. Slight overhead orthographic game view. No buildings, no tower, no people, no dock. Rich painterly storybook texture, softly sculpted chunky forms, clear clean silhouette readable at 100 pixels, warm upper-left sunlight and deep teal shadows. Entire island centered in square canvas with padding. Genuinely transparent alpha background, no ocean plane or surrounding scene, no external cast shadow, no text, no labels, no watermark. Original production game sprite.

The six creature sprites (glasswing, ram-beetle, jelly, needle, sentinel, guardian) are copied from the project's existing original Starling artwork under `apps/web/public/art/starling`. The original locally synthesized Lantern Wake score and effects are reused through RescueAudio. No third-party audio recordings.

## Engine

Godot 4.7.2 is MIT licensed: https://github.com/godotengine/godot/blob/4.7.2-stable/LICENSE.txt . Exported engine artifacts include upstream copyright notices; source and dependency license record must remain available with the release.
