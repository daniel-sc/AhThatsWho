# AhThatsWho — Aha identity

The fixed identity is the AhThatsWho name and the approved chunky black “ah!” lettering. The selected design is Hello again / G — Margin notes: a coral header, compact open list, cobalt notebook margin, expressive first names, and readable surnames. See the [redesign brief](../../docs/redesign-brief.md) for the accepted decisions and validation.

The palette is coral `#ff624f`, cobalt `#163bee`, ink text `#161616`, paper canvas `#fffefb`, white fields `#ffffff`, and supporting text `#56524c`. Search matches use yellow `#ffcc57`. Danger and recording retain red. The in-app mark remains the exact approved black artwork. General installation icons use coral backgrounds. The iOS Home Screen icon uses the same silhouette in coral on an opaque charcoal tile, keeping the foreground bright when the system darkens the background. HTML references `apple-touch-icon-v2.png`; the conventional fallback is identical.

Locally bundled Bricolage Grotesque provides expressive headings and readable names. Atkinson Hyperlegible Next carries controls, details, and forms. Font files and their SIL Open Font Licenses live in `src/assets/fonts/`; both fonts are precached for offline use. No runtime font service is required.

Source: `aha-mark-source.png`, extracted from the approved first draft using the built-in image generation tool. Rebuild web and installation icons with `node scripts/icons.mjs`. A separate maskable icon keeps the mark inside the safe area. Generated delivery assets live in `public/`.

## Production extraction prompt

Use case: precise-object-edit. Extract the exact bold black handwritten lowercase 'ah!' symbol from the supplied selected AhThatsWho logo draft. Remove the bottom AhThatsWho wordmark completely. Remove the yellow background to genuine transparency. Preserve the distinctive chunky slanted lowercase a and h connected together and the playful separate exclamation point exactly as in the reference. Flat solid near-black #151515 fill, clean smooth sharp edges, no shadows, gradients, texture or additional elements. Center the isolated mark on a square transparent canvas with 10% blank margin on left/right; preserve original symbol proportions, do not stretch. This is the production brand mark for web and app icons.

## iOS dark appearance

The previously deployed icon was verified to match the black-on-coral asset. The reported nearly-black Home Screen appearance could not be reproduced without a physical iPhone. The high-contrast asset is a mitigation, not a verified fix to iOS recoloring. New installs request a new icon URL. Existing Home Screen icons may retain their installed image; do not remove an installed app with local notes without first preserving the data. Device confirmation is still needed.
