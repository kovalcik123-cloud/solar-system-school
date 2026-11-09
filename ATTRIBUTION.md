# Earth texture attribution

The following unmodified 2048 × 1024 JPEG textures are by **Solar System Scope (INOVE)**:

- `2k_earth_daymap.jpg` — Earth daytime surface.
- `2k_earth_nightmap.jpg` — Earth nighttime city lights.
- `2k_earth_clouds.jpg` — Earth cloud coverage.

Source: [Solar System Scope — Planet Textures](https://www.solarsystemscope.com/textures/).
Original downloads: `https://ssi.solarsystemscope.com/textures/download/` followed by each filename above.
License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

The publisher's texture page, verified on 2026-10-09, states: “Distributed under Attribution 4.0 International license” and “You may use, adapt, and share these textures for any purpose, even commercially.” The three files were uploaded to this repository by the project owner. All three were verified as 2K JPEG images. The day map is byte-identical to the existing `earth.jpg`.

No image files were modified. The application changes their rendered appearance through lighting, a grayscale cloud transparency mask, and night-side masking. The cloud layer and atmosphere use illustrative proportions; the atmosphere is generated in a shader, not a supplied image. No endorsement by Solar System Scope or NASA is implied.

When distributing this application or its assets, retain the creator credit, source link, license link, and modification notice. CC BY 4.0 permits commercial use and adaptation, requires appropriate credit and indication of changes, and prohibits additional restrictions that prevent others exercising the licensed rights. See the linked license for full terms.

This attribution covers these three Earth assets only; it does not establish provenance or licensing for other existing repository textures.

# Milky Way background attribution

`stars.jpg` — a 2048 × 1024 equirectangular texture of the Milky Way, "2k_stars_milky_way", by **Solar System Scope (INOVE)**.

Source: [Wikimedia Commons — File:Solarsystemscope_texture_2k_stars_milky_way.jpg](https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_2k_stars_milky_way.jpg) (original publisher: [Solar System Scope — Planet Textures](https://www.solarsystemscope.com/textures/)).
License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

Verification: the repository file's SHA-1 `20f8d2530941fa2671f3475abe88e48cdc062f0f` (SHA-256 `ec2240e6f3784d962ab81609b228bfd470e87c86d1fed5e99134d4cd3de24239`, 251 454 bytes) matches the SHA-1 published for the Wikimedia Commons file; the match was checked by the project owner against the Commons file metadata.

The image file is unmodified. The application maps it onto the background sky sphere in Explore and, in the Light Laboratory experiments, shows it as a static backdrop with an adjusted tone (displayed about 1.5 times brighter than the source by a small tone adjustment; the file itself is not changed). No endorsement by Solar System Scope is implied.
