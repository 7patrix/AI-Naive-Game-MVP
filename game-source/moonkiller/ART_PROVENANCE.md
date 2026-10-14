# Original asset provenance

Generated for MoonKiller / Mothwake on 2026-10-07 using the built-in imagegen tool. No external game artwork was supplied or extracted. Original hooded courier, crooked inn, municipal archive clocktower, apothecary, forge and crescent-moth / lantern signs.

| Source file | Delivered texture / sprites | Production work |
|---|---|---|
| buildings.png | inn, archive, apothecary, forge | 4 alpha connected components; preserved RGBA edges; bottom-center anchors |
| props.png | lamp, well, noticeboard, tree, bench, fence | 6 alpha components; no rectangular atlas bleed |
| courier.png | courier_0 through courier_5 | 3×2 cells, trimmed and aligned into identical 434×643 canvases |
| paving.png | paving material | Ground texture rendered with repeat sampling and procedural muddy path margins |
| details.png | supplies, brambles, waymarker, milestone | 4 alpha connected components; preserved original generated pixels |

`tools/prepare_art.py` performs deterministic separation, alpha-preserving crop, sprite anchoring and the contact sheet. It does not repaint assets or remove backgrounds. Prompts are retained in `tools/art_prompts.json`.

No paid resource purchases, existing-game trademarks or extracted textures. AI-generated imagery has no claim of exclusive copyright in jurisdictions where that is unavailable. UI Chinese / Latin text uses the official Noto Sans CJK SC Regular font under SIL OFL 1.1; source and license accompany the project in `assets/fonts/` and the exports. Godot runtime licensing remains under its upstream license. No proprietary system-font bytes are distributed.

## v3 architecture textures

Generated originally with the built-in imagegen tool on 2026-10-07. No external reference game assets were used. `assets/art/v3/inn_front.png` is a flat front elevation with no roof or side perspective. `materials.png` is an opaque 3×2 atlas of side elevation, slate, timber, masonry, door leaf and plaster. `fronts.png` is a three-panel flat elevation atlas for the archive, apothecary and forge. `icons.png` contains independent moth, clock, herb and anvil sign faces with transparency.

Deterministic rectangular atlas separation produced the individual textures. Crops of the generated wall and masonry textures provide attic/shop window, one/two-storey side and flagstone variants; alpha bounding-box crops align sign faces. The imagegen originals remain in the project. Flat textures are applied to fixed wall and real roof geometry, with independent depth and shared lighting. No perspective-baked whole-building sprite is used by the current v3 architecture.

## v4 original courier animation

Four new transparent 3×3 original animation sheets were generated with the built-in imagegen tool on 2026-10-07, referencing only this project's original courier artwork. `assets/art/v4/front_sheet.png`, `back_sheet.png`, `right_sheet.png` and `left_sheet.png` remain as generated. The opposite profiles were authored independently, not mirrored. Production briefs are recorded as summaries (not verbatim prompt transcripts) in `tools/v4_art_briefs.json`.

`tools/prepare_courier_v4.py` separates nine cells per direction at a fixed scale, aligns feet/head anchors, and removes vertical neighboring-cell contamination using the largest connected alpha body's vertical bounds. It preserves the original RGBA pixels and gives the cloak sufficient transparent margin. Runtime front/back/right heads use fixed original v3 head cutouts; the left head is a fixed cutout of its new idle. Animated lower bodies contain eight stepping poses and an idle pose. No extracted game art, third-party purchased art, or external asset license dependency was introduced.

## v6 original first-night residents and interiors

Generated with the built-in imagegen tool on 2026-10-07. References were only this project's original courier and inn material. No Don't Starve asset, external game sprite or purchased art was supplied. Three new full-body residents have distinct original clothing and silhouettes: innkeeper A-Huai, apothecary Wen-Xian and clockkeeper Old Ke. Two opaque wall drawings depict an inn hearth and an apothecary cabinet. Original generated sheets and verbatim prompts remain in `assets/art/first_night/`.

`tools/prepare_first_night.py` crops the three equal source columns by their alpha bounds, uniformly resizes them onto 434×643 transparent canvases with ground pixel 638, and crops two wall panels. It never repaints pixels, removes a background, or generates replacements. Existing original timber, stone, bench and supplies textures dress physical cutaway rooms. `preparation.json` records actual source bounds, scale and wall dimensions.
