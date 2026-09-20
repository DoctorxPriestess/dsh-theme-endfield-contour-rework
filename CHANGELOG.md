# Changelog

This file records what **this fork** changed relative to upstream
[`dsh-theme-endfield`](https://github.com/ymh0000123/dsh-theme-endfield).
Upstream's own history is not reproduced here.

## 1.4.0 — the whole ladder rougher, accelerating: stop 12 now 61% feature terrain

### 需求：12 档的陡峭特征地形占比 55%–65%，整条阶梯按越来越快的曲线抬升

The top stop carried 44.0% feature terrain; the target is 55–65%, reached by raising the whole ladder
along a **convex** curve — the plains/hills stops keep their landform budget, and each step near the
top buys more than the one below it.

- Seven growth tables (cliff, cliff band, primitive density, primitive scale, ridge, valley, slope
  form) are now convex from stop 6 on. Measured gain in feature coverage over 1.3.1, stops 6 → 12:
  **0 / 0 / +2.4 / +2.7 / +5.7 / +8.4 / +17.4** points.
- Stop 12: feature terrain 44.0% → **61.4%**, cliffs 26.7% → **42.3%**; stops 1–5 (plains, hills,
  lakes) measure unchanged.
- Still under the 75% ceiling at every stop, plateaus still fall to nothing by stop 10, cliff share
  still rises at every later stop, and the high-mountain tail still carries increasing ink
  (467k → 473k → 480k → 491k).

### 量出来的取舍：占比靠带宽买，陡峭度反而会掉

Feature coverage is bought almost entirely with the cliff **band width**, because cliff *strength* is
already saturated at the top stops (0.90 → 0.98 changes coverage by 0.1 points at an unchanged band).
Widening the band spreads the same staircase over more area, so per-cell steepness and total ink fall
slightly instead of rising. Measured at stop 12:

| candidate | band | coverage | cliff | grad RMS | steep cells | stroke |
| --- | --- | --- | --- | --- | --- | --- |
| 1.3.1 | 0.17 | 44.0% | 26.7% | .0365 | 31.5% | 507k |
| narrow | 0.20 | 55.5% | 33.0% | .0361 | 30.2% | 492k |
| **shipped** | **0.25** | **61.4%** | **42.3%** | .0366 | 30.8% | 491k |
| wide | 0.26 | 63.2% | 43.6% | .0370 | 30.9% | 495k |
| wider | 0.27 | 67.5% | 45.9% | .0359 | 29.2% | 471k |

The shipped point is mid-window (61.4%) with steepness essentially unchanged from before (~31%); if a
future request wants every cell steeper rather than more of the sheet covered, the lever is the
relief / ridge / valley tails, not the band width. Recorded in the engineering notes.

### 测试

Two new assertions, both mutation-verified:

- **the growth is convex** — increments must be non-decreasing across the seven growth tables from
  stop 6 (the "0 → first value" entry step is skipped, since cliffs switch on at stop 8); a linear
  ladder fails. Replacing the cliff row with a concave one fails with
  `cliff: stop 10 (step 0.220 < 0.300)`.
- **the top stop's measured coverage is inside 55–65%** — asserted on the field, not the tables;
  restoring the old band fails with `the top stop covers 48.5% … outside the stated 55.0%-65.0% window`.

Full CI 29/29 green.

## 1.3.1 — stop 10 was a roughness dip: the slider went UP and the sheet went calmer

### 修掉一个逐表断言抓不到的缺陷

Every parameter table was in order after 1.3.0 — cliffs growing stop by stop, plateaus gone from
stop 10, every strength within range, the whole suite green. Rendering the ladder side by side showed
it anyway: **stop 10 carried 429k px of stroke where the stops around it carried 467k and 477k**, so
dragging the slider up made the sheet visibly *calmer*. A mid-ladder local minimum reads to the user
as the slider being broken.

Cause: stop 10 was the only high-mountain stop with a **basin bias** — the macro elevation table ran
−0.20 / −0.16 at stops 9 and 10 (lowland) against +0.20 / +0.26 at stops 11 and 12 (mountain), so a
stop labelled high mountain sagged into lowland. No per-table range check and no monotonicity check can
see that by construction; it takes measuring the **field**.

- 第 10 档宏观高程 −0.16 → **0.00**（高山段不该带盆地偏向）、起伏尾部强度 0.24 → **0.34**。
- Measured: 429k → **473k** px of stroke, landing between stop 9 (467k) and stop 11 (477k); steep cells
  26.7% → 31.2%; cliffs 19.0% → 20.0%, still below stop 11's 20.6% so cliff monotonicity holds.
- All other stops measure **byte-for-byte unchanged**.
- New assertion, checked against the measured field rather than the tables: **no stop in the
  high-mountain tail (9–12) may carry less than 95% of the mean ink of its two neighbours**, and the
  last stop must be the tail's maximum. Mutation-verified — restoring the old values makes it fail with
  `stop 10 429k vs 472k around it (9% calmer)`. The 8 → 9 step stays exempt on purpose: that is the
  mid-to-high-mountain transition, where the design trades mountain count for landform drama
  (486k → 467k, cells growing from 280px to 600px).

Also recorded in the engineering notes: gradient-RMS roughness is normalised by the value range, so it
**cannot** be compared across stops with different water — clamping water to a plane cuts the range's
low tail and inflates the metric (stop 10 measured .0325, and .0383 with an added water plane at
unchanged relief). Cross-stop roughness comparisons use ink instead.

## 1.3.0 — landform layer: terrain types, plateaus, cliffs and a feature catalogue

### 地貌层：每个档位是一种地形 + 一组解析式特征地形

The roughness slider no longer only makes the noise finer — each stop now names a **terrain class**
(plains / hills / low, mid and high mountains) and stacks a set of landforms on it. Every landform is
**analytic**: a monotone height remap, or a local primitive. There is no erosion, flow accumulation or
sediment simulation, and that ceiling is deliberate — a simulated landscape needs iterative passes
over the whole tile, which would turn a ~100 ms rebuild into seconds and break the exactly-tileable
guarantee the seamless scroll depends on, for detail nobody can see in a 1px-stroke background.

- Twelve new tables (`CONTOUR_TERRAIN_*`), one entry per stop: terrain class, macro elevation trend,
  slope shape, ridge lines, valley lines, plateau, cliff, cliff band width, sharp peaks / deep
  valleys, water level, primitive density and scale.
- Slope form: `u^k` with a low-frequency mask varying the exponent — 凹坡 (lines bunch at the top) in
  one region, 凸坡 (lines bunch at the bottom) in another, 均坡 in between.
- 山脊线 / 分水岭 come from ridged noise (`1 - |n|`), 山谷线 / 冲沟 from narrow troughs at the zero
  crossings of their own octave.
- 陡崖 is the **other** shape of the same staircase: many steps with thin ramps, and applied only
  inside bands. 高原 uses few steps with wide treads, also banded. Both are smoothstep-soft, because a
  hard quantiser puts real slope discontinuities into the field and the level lines crossing them
  carry corners no amount of Chaikin / B-spline smoothing removes.
- Water is an **exact plane**: everything below the level is clamped to it, so lakes and a fjord draw
  no interior lines at all. Water appears at 8 stops (plains lakes, basin water, alpine lakes) and the
  remaining 4 stay dry.
- Feature primitives, placed by hashing a slot grid and evaluated on **toroidal** offsets so a landform
  straddling the tile edge is drawn identically on both sides: 冲积扇 / 洪积扇 / 泥石流扇 / 三角洲,
  火山锥 / 火口湖, 天坑 / 矿坑 / 冰斗 / 牛轭湖 / 潟湖, 峰林 / 峰丛 / 角峰, 刃脊 / 沙嘴 / 堤坝,
  峡湾 / 阶地河道, 沙丘 / 雅丹, 倒石堆.

**Plateaus decrease with roughness; cliffs increase and peak at stop 12** (the request): plateau
strength is 0.75 / 0.60 / 0.45 / 0.20 at stops 6–9 and **0 from stop 10 on**; cliff strength and band
width both grow from stop 8 to stop 12. Measured on the field: plateau area 25.8% → 22.0% → 21.5% →
15.1% → none, cliff area 11.6% → 15.7% → 19.2% → 20.6% → **27.0%**.

**No landform layer covers 75% of the sheet** — a stated ceiling, asserted per stop from the
generator's own bookkeeping (a cell counts once a feature moved it by ≥2% of the height range, about
one contour interval). Measured worst case: 44.0% at stop 12; every stop is between 4% and 44%.

### 一份实测出来的重调：山地段变成「山更少更大」

With landforms on top, the old top stops (250 px cell, 6 octaves, persistence 0.62) measured as
uniform speckle — 1400+ polylines and 925k px of stroke at stop 12, unreadable. What sets legibility
is the number of local **extrema** per tile, so stops 9–12 now use *larger* cells (360 / 440 / 520 /
600 px) with 5 octaves: fewer, bigger mountains, and the drama comes from the cliffs (27%), sharp
peaks and deep valleys. Measured: 500–800 polylines, 40–60 per iso-level (the ceiling is 90). The
ladder's monotonicity promise therefore moves from raw frequency to measured structure: every stop
draws, plateau area falls, cliff area rises to the maximum at stop 12, feature coverage stays <75%.

### 修掉一个真缺陷：斑块在索引上环绕，接缝错位一格

The primitives first wrapped with `i % cols`, but the grid is not a whole number of cells wide (the
texture is quantised to 128px against a 10px grid), so one index step is not one period and a landform
crossing the seam was displaced by up to a cell. Found by bisecting the pipeline stage by stage and
measuring the first-vs-last column: every stage alone showed 0 except the primitives, at 2.2e-2.
Wrapping by **coordinate** (and mirroring the padded edge row/column) brings the seam error to exactly
**0**, which `test/contour-roughness.test.js` now asserts at every stop. The directional shapes (dune
ripples, arête strike, fjord cross-section) also had to use the shortest **signed** toroidal offset,
or the same boundary was evaluated with opposite directions on the two sides.

### 测试

`test/contour-roughness.test.js` was rewritten around the new layer: twelve well-formed tables, the
default stop still exactly the shipped fBm constants, the plateau/cliff patterns as tables **and** as
measured field coverage, the <75% ceiling per stop, water flatness (exactly equal heights), exact tile
periodicity, and a measured legibility ceiling per iso-level. `test/contour-cusps.test.js` now sweeps
**every** stop that carries a landform (two sizes × two densities × 12 stops): worst turn is still
1.1°, unchanged from before the layer existed.

## 1.2.0 — cliffs, plateaus, and the twice-clicked slider fix

### 悬崖与高原：第 10–12 档换了地形形状

The three roughest stops are no longer "the same terrain, only finer": from stop 10 up the height
field is pushed through a **soft staircase**, which flattens it into plateaus and squeezes the
relief into narrow cliff faces. On the sheet that is what the request asked for — a plateau carries
no contour at all (a wide blank area) and the face between two plateaus carries several lines
bunched into a near-parallel bundle.

- `client.js` gains `CONTOUR_ROUGHNESS_TERRACE = [0 …×9, 0.35, 0.62, 0.88]` plus `contourTerrace()`
  and `contourTerraceField()`. Stops up to and including the shipped default carry strength `0` and
  take the same short-circuit branch, so their fields stay **bit-for-bit** what they were.
- The staircase is a pointwise remap of the finished fBm field into `2 + round(4 × strength)` levels
  with smoothstep ramps (`w = min(0.45, 0.5 × strength)`), applied after the octave sum rather than
  per octave: it acts on the landscape as a whole (a change of shape, not another frequency).
- **Soft** edges, not `floor()`: a hard quantiser puts real slope discontinuities into the field,
  and the contours crossing them carry corners that no amount of Chaikin / B-spline smoothing
  removes. `test/contour-cusps.test.js` now sweeps **every terraced stop** separately (two sizes ×
  two densities); the worst turn stays at 1.1°, identical to the un-terraced terrain.
- Measured on the fixed-seed suite: plateau share 3.9% at the default stop → 32% / 54% / 68% at
  stops 10/11/12, and of the terrain that is *not* plateau the steep share climbs 35% → 51% / 64% /
  83%. Stroke length is deliberately **not** the metric across those stops — a staircase swaps many
  scattered contours for a few long bundles, so 575k → 569k px hides a complete change of picture.
- The staircase shape itself was picked by rendering true-scale strips across candidate shapes: a
  wider span (7 levels and up) leaves a third of the sheet empty with single lines on the faces, a
  narrower one flattens half the picture. `2 + round(4 × strength)` keeps the sheet legible.

### 修复：粗糙度/密度/方向「要点两次才生效」

- `scope.set()` commits asynchronously, so any handler that wrote a preference and immediately read
  it back acted on the **previous** value — the visible symptom was a detent needing two clicks
  (the first one only refreshed the row). `prefsSet` now records the written value in a page-local
  **write-through overlay** (`prefsWritten`) that `prefsGet` prefers until the host echo lands, at
  which point `prefsSettleWritten()` retires the entry and the scoped snapshot takes over again.
- `test/prefs-write-latency.test.js` reproduces the original ordering with a deliberately deferred
  scope stub: it fails when the overlay is removed (verified), and it also pins the other half of the
  contract — an unconfirmed write must stay effective page-locally instead of silently reverting.

## 1.1.0 — terrain roughness slider

### 地形粗糙度：一个 12 档滑块，低=平原、高=极端山地

The contour sheet now has one more setting, and it is the only one that changes the **shape** of
the landscape rather than how it is drawn:

- `client.js` gains `CONTOUR_ROUGHNESS_BASE` / `_PERSIST` / `_OCTAVES` (12 stops each) plus
  `contourTerrainProfile()` and `contourOctaveLadder()`. The fBm field generator reads the stop
  instead of fixed constants, so roughness drives the largest noise cell (960 → 250 px), the
  octave-to-octave amplitude ratio (0.24 → 0.62) and the octave budget (2 → 6).
- The default stop is index `7`, and its three entries **are** the shipped constants
  (`CONTOUR_BASE_CELL` / `CONTOUR_PERSIST` / `CONTOUR_OCTAVES`), so existing installs keep the map
  they already have. `test/contour-roughness.test.js` asserts that equality, so it cannot drift.
- The setting row is a real `<input type="range">` (12 detents), not twelve buttons: the same
  states plus drag and keyboard operation, with `aria-label`/`aria-valuetext` naming the stop.
  It writes `contour-roughness` (index) and follows the contour layer's on/off like its siblings.
- Changing it **regenerates the terrain from the same seed**, so the map is re-tuned rather than
  re-rolled (the same determinism rule resize already followed), and the rebuild is coalesced —
  a drag crosses several detents and only the last one is built.
- The octave ladder is now truncated at the permutation table's period ceiling instead of clamping
  individual octaves: a clamped octave re-adds a scale that is already present instead of adding a
  finer one. At the shipped stop (and every size the perf suite covers) the ladder is unchanged.

Why the top end is not "as rough as possible": rendering all twelve stops and comparing them showed
the sheet turns into uniform speckle once the finest octave carries more than roughly a tenth of
the amplitude at a near-grid cell size. The tables therefore stop at 0.62 persistence, and the top
stops keep the base cell high enough for the ladder to retain its fifth octave, which spreads the
fine energy instead of concentrating it. `test/contour-roughness.test.js` sweeps all twelve stops
(field → marching squares) and asserts: every stop draws contours, ring count and total stroke
length grow at **every** detent, no stop draws debris, and the finest-octave share stays under 12%
on five different texture sizes.

## 1.0.0 — fork release

Based on upstream `main` (the rolling `refs/heads/main` tarball, fetched 2026-09-10).
Only tested on **DSH 0.1.1-rc.2** (`web` profile, Windows).

### README rewritten for readers, not for the implementer

The first README draft doubled as a development log: the contour defects (`hCount`/`NaN` edge
ids, the sub-pixel spline barbs) and the algorithm names (marching squares, Catmull-Rom) were on
the front page. That reads as alarming to someone deciding whether to install a theme, and it
buries the two things a reader actually wants — how to install it, and what changed for them.

- `README.md` / `README.zh-CN.md` are now: intro → install → features → screenshots →
  compatibility → test results → documentation → licence, with a short block at the top for the
  fork notice, the AI disclosure and the tested DSH version.
- The origin section is one engineering sentence now (upstream provides the theme framework,
  styling system, loader, settings infrastructure and testing scaffolding; this fork replaces
  the contour animation subsystem) instead of a catalogue praising each upstream component.
- The defects, their measurements and the reasoning moved to
  [docs/engineering-notes.md](docs/engineering-notes.md), where they are a linkable subsection
  (`### 重构中修掉的缺陷（含实测）`). The README keeps a one-line pointer.

### Repository URL and package name

The fork is published at `DoctorxPriestess/dsh-theme-endfield-contour-rework`. The repository
(`repository`/`homepage`/`bugs` and every install hint) was wrong or mismatched before: it pointed
at a repository that does not exist. The package is now named after the repository too (see
[Package renamed to match the repository](#package-renamed-to-match-the-repository) below).

- `package.json` `repository` / `homepage` / `bugs` now point at the real repository.
- The install hints in `cordis.patch.yml`, `index.js` and `client.js` follow it.
- `test:fork` does not assume the repository name equals the package name — it checks that every
  `dsh plugin add` hint (including the README lines users copy) equals the URL in `package.json`,
  and that every `dsh plugin rm` line uses the package name, so mixing the two up is caught. (The
  two names happen to coincide now; the rule deliberately does not depend on that.)

### Attribution hardening

- `LICENSE` is **not touched**: it stays byte-identical to upstream (same SHA-256, verified
  against both the installed copy and the original vendored tarball), and `git log` shows it was
  only ever added.
- `client.js` and `index.js` headers now carry the upstream project, its copyright line and a
  pointer to `LICENSE` / `NOTICE.md`, so a single copied file still carries its provenance —
  the root-level files do not travel with it.
- `package.json` gained the standard npm `contributors` entry crediting upstream.
- `test:fork` asserts the attribution positively (LICENSE keeps the upstream MIT copyright line,
  README and NOTICE name the upstream repository and copyright), not just that a string is absent.

### Package renamed to match the repository

- The package is now `dsh-theme-endfield-contour-rework` — the same name as the repository — with
  version `1.0.0`. It was `dsh-theme-endfield-ai-contour-fork` in the first packaged archive, <!-- identity-check: allow-upstream -->
  which meant every install/uninstall instruction carried two names that had to be kept straight.
- The rename touches one string that is simultaneously: the npm name, the bundle row name in
  `cordis.patch.yml`, the bundle row id (`theme-endfield-contour-rework`), the client
  `ModuleLoader` id, the host settings namespace (`ctx.settings.register`), the client key prefix,
  the browser prefs key, and the test fixtures. A half-done rename fails silently — the plugin
  installs but never mounts, or settings writes are rejected — which no syntax or pixel test can
  see, so it is done by one scripted replacement and then verified by
  `.github/scripts/fork-identity-check.js` (`npm run test:fork`), which compares all of those
  projections against `package.json` and now also asserts that no preference key hardcodes the
  package name. **24/24 projections consistent** after the rename.
- Settings namespace follows the package, so a profile that already had the previous name keeps
  its section under the old key while the plugin reads the new one: those users would start from
  defaults. `tools/migrate-prefs.js` exists for that case — it copies a section to the new
  namespace (and can convert the pre-kebab keys) after backing the file up. Nobody has that
  section today (the fork was never installed), so this is a convenience, not a required step.
- Docs updated where the old "the repository name and the package name differ" wording became
  false (README ×2, `NOTICE.md`), and the install section now states the single name.

### Contour engine — replaced

The previous engine deformed a Gaussian-bump field every frame and re-ran marching squares
plus smoothing at up to 120 fps. It is replaced by a **precompute-once, translate-forever**
engine:

- **Terrain**: tileable Perlin gradient noise (seeded 512-entry permutation table, 8 gradient
  directions) summed over 5 octaves (fBm, persistence `0.5`), sampled on a 10px grid. Each
  octave's period is `round(size / baseCell)` clamped to the permutation table's safe limit,
  so the field is *exactly* periodic with the texture size and the texture tiles seamlessly —
  including across the tile border, with no seam to hide.
- **Contours**: marching squares at 8 / 14 / 22 / 34 iso-levels (the density setting),
  stitched into polylines by edge-id adjacency in **tile space**, so a contour crossing a
  tile border continues from the opposite edge and closes into a ring.
- **Rendering**: Chaikin ×3 + constrained Catmull-Rom smoothing (handles capped at
  0.62 × the shorter neighbour segment) is applied **once**, and the result is painted into an
  offscreen canvas.
- **Per frame**: advance the scroll offset by `px/s × real frame interval` and `drawImage` the
  cached texture once (at most 4 times when the viewport spans a tile seam). Terrain
  generation, contour extraction and re-rendering are **zero** per frame — asserted both by
  static inspection of `contourFrame()` and by counting calls while driving 300 frames.
- Texture size is 3× the viewport, quantised to 128px, capped at 4096 device pixels per side
  and 8.3e6 CSS px², at DPR ≤ 2. Measured one-off build cost: 17ms at 320×240, 89ms at
  1432×753, 95ms at 1920×1080.

### Settings — reworked

- **Removed** the frame-rate setting (`24 / 60 / 120 FPS`). The engine renders once and only
  translates the texture, so there is nothing for a frame rate to configure. Verified: on the
  old engine the same pixels were re-extracted and re-painted every frame.
- **Added** contour scroll switch, 8-way scroll direction, scroll speed in
  **pixels per second** (`12 / 24 / 48 / 96 / 192`, default 48) and contour density
  (4 levels, default 14 iso-levels).
- Speed is frame-rate independent by construction (`px/s × dt`).
- Changing density re-extracts contours from the **same** terrain; direction and speed only
  update two cached numbers; neither regenerates the terrain.
- **New terrain per enable**: the permutation table is re-seeded whenever the background is
  switched on, so "turn it off and on again" gives a different map. Within one session the
  same seed and size always reproduce the same terrain, and a resize reuses the seed.
- The settings row group follows the master switch: with the contour background off, the
  direction / speed / density buttons are disabled and say why.

### Fixed

- **Nothing under a hyphenated preference key ever persisted (upstream-origin defect, found
  in the field).** Seven of the fourteen settings — `contourAnim`, `contourDir`, `contourSpeed`,
  `contourDensity`, `contourScrollPause`, `watermarkPersist`, `thunderAnim` — could be switched,
  reported a successful write, appeared in `settings.yaml`, and were back at their default after
  the next reload.
  - Cause: the browser side addresses a setting by a kebab-case key
    (`dsh-…-contour-speed`) while the host schema declares the field in camelCase
    (`contourSpeed`), and the settings service serves a namespace **strictly from its declared
    fields**. The key→field mapping was an identity slice of the key, so the write went to an
    undeclared name: the host stored it, but it was dropped from every served section, so the
    client could only ever read back the schema default. Single-word settings (`radius`,
    `thunder`, `contour`, `loader`) hid it because their key suffix and field name coincide.
  - Evidence (live GUI, before the fix): clicking 12 px/s logged
    `commit contour-speed = 0 status= ready mode= host` and `settings.yaml` gained
    `contour-speed: "0"`, yet the row highlighted 48 (the default) again after a reload.
  - Fix: keys are translated to the schema field name (kebab → camelCase) in one helper, and
    every raw key is derived from `PREFS_NS` instead of being spelled out 28 times, so a rename
    cannot leave half of them behind.
  - Verified after the fix, in the real GUI: set speed 192 → reload → still 192; the scope
    snapshot is now `status= ready writable= true valueKeys= 14`.
  - Stale kebab entries already in `settings.yaml` stay there and are inert; they were never
    readable, so no behaviour changes for them. `tools/migrate-prefs.js` can convert them
    (and move a section to the renamed namespace) with a backup, if wanted.
- **The test fixtures shared the defect, which is why the suite stayed green.** Both
  `settings-scope` fixtures mapped keys with the same identity slice, so the mocks agreed with
  the broken client and every test built on them passed. They now perform the same conversion as
  `client.js`, and `prefs-key-mapping` asserts that agreement. Seeding a field the schema does
  not declare is now a loud failure too (previously it was dropped on the floor: the page test
  silently measured a default).
- **The `--screenshot=` fallback leaked a whole browser instance per screenshot.** On a machine
  with the Store/AppX build of Edge, `Application\msedge.exe` forwards the request to the real
  instance and exits, so the "one-shot process" assumption behind that path is wrong: one
  `thunder-shot` run left 11 processes behind, which accumulated and made the full suite
  intermittently report "page produced no results". The fallback now waits for the file to land
  and then cleans up by the run's unique profile token. The cleanup refuses non-unique tokens:
  matching is a case-insensitive command-line substring test, so a token like `profile` could
  otherwise kill the user's own browser.
- **`prefers-reduced-motion` regression (introduced during the rewrite, then fixed).**
  The `matchMedia` query had been cached at module load to avoid a per-frame allocation. That
  ignored later OS changes and broke the contract upstream's `thunder-edges` test checks in the
  same process. It is read live again on every reconcile; the cost is negligible next to the
  blit, and `contour-perf` now asserts the gating live ("loop resumes after the preference is
  cleared").
- **Duplicate contours and vertex teleports (real engine defect).**
  `contourGenerateField()` computed `hCount` but did not return it, while the extractor
  destructured it to build vertical edge ids (`hCount + j*cols + i`). Every vertical edge id
  became `NaN`; assigning `NaN` into an `Int32Array` silently stores `0`, and `es[NaN]` is a
  no-op that never stamps a visit, so the stitcher started from a phantom id and followed the
  **previous** iso-level's link chain — emitting that level's vertices again. Symptom: the same
  ring appearing at several levels, and >100px jumps inside a single curve. Pixel tests were
  green because nothing was painted incorrectly, only something that should not exist. Caught
  by two structural assertions in `contour-cusps` (no duplicate extraction; no vertex jump
  larger than one grid step). Fix: one line. Effect after the fix: p99 turn angle on the
  rendered curves fell from 21.9° to 1.5°, duplicate paths 4 → 0, rings 4 → 981.
- **Sub-pixel barbs at grazing contours (real engine defect).** Where a contour grazes a grid
  point, marching squares emits two intersections ~0.03px apart; the Catmull-Rom handle length
  is derived from neighbouring segments (~10px), so the stub received a handle hundreds of
  times its own length and bulged into a ~0.7px barb. Consecutive points closer than 0.1px are
  now folded before smoothing — invisible at a 1px stroke, and it removes the degenerate input.

### Tests

- `contour-cusps.test.js`, `contour-smoothness.test.js` and `contour-perf.test.js` were
  **rewritten to run in Node with a stubbed 2d context**, executing the real functions sliced
  out of `client.js`. They no longer need a browser, and they measure the rendered curves
  (sampled with de Casteljau) rather than pixel diffs.
  - cusps: 6 viewports × 2 densities — no cusp (>150°), no sharp angle, p99 < 12°, closed rings
    really drawn as rings, no duplicate contours, no vertex jump > one grid step, all
    coordinates finite and inside the texture, shortest drawn contour ≥ 45px and smallest ring
    box ≥ 25px (specks), plus seed lifecycle (same seed+size ⇒ identical terrain, different
    seed ⇒ different terrain, density change reuses the field).
  - smoothness: every drawn curve still follows its source polyline (worst vertex deviation
    2.6px, mean 0.35px) and maximum turn falls from 175° (raw polyline) to 0.6° (drawn curve).
    Documentation in the file records that per-arc-length resampling **must not** be used here:
    it widens a 0.5px fold-back to 1px and reports an invisible feature as a 158° corner.
  - perf: cost shape (zero regeneration over 300 frames, density change = 1 re-extract + 1
    repaint, static check that `contourFrame()` contains no build/extract/render call), measured
    build and per-frame cost, texture size caps, and the scroll gating matrix.
- `settings-rows.test.js`, `settings-durable-hold.test.js`, both `settings-scope` fixtures and
  `thunder-shot.js` were updated for the new settings rows and keys.
- `package.json`: added `test:fork`, and `test:node` now runs the fork identity check first.
- **Line-ending tolerance.** The three contour harnesses slice declarations out of `client.js`
  by line (blank-line separators, `/^.../m` anchors), which made them fail on a CRLF checkout —
  and CRLF is what git hands you by default on Windows, and what `git archive` produced for the
  first packaged tarball. They now normalise line endings before slicing, verified by running
  them against a CRLF copy of `client.js`. A `.gitattributes` (`* text=auto eol=lf`, binary
  webp) was added so the repository also normalises to LF on every checkout and export.

### Docs

- `README.md` is now the English README (attribution, AI disclosure, compatibility, changes,
  install, settings, development, limitations, screenshots); the original Chinese README lives
  on as `README.zh-CN.md`, both cross-linked.
- Added `NOTICE.md` (attribution + AI disclosure) and this `CHANGELOG.md`.
- `docs/features.md` — the contour sections now describe the tileable-terrain architecture and
  the new settings rows.
- `docs/engineering-notes.md` — new section documenting the current architecture, the two engine
  defects with their measurements, the measurement trap above, and the reduced-motion
  regression; the previous per-frame-engine sections are retained but explicitly marked as
  historical. The "light dot" section notes that the engine change makes stable polyline indices
  possible for that unimplemented idea.
- `docs/testing.md` — rewritten for the rewritten suite (what is asserted, what is measured,
  what was calibrated against what), and extended with how the browser is found and how page
  results are transported.

### Browser test transport and portability (late addition, after the first packaged archive)

The browser suite could not run at all on the machine this fork was verified on: Edge there is
the Store/AppX build, and `Application\msedge.exe` is a launcher stub that forwards arguments
into the running session — `--version` prints nothing, stdout is empty and `--screenshot=`
writes no file, all with exit code 0. Headless itself was fine (`--remote-debugging-port`
answered normally), so the suite needed a different way to read results.

- Added `test/lib/browser.js`: one place that **finds** a browser (explicit env vars → `PATH` →
  per-user installs → machine-wide installs → `EdgeCore\<version>`) and **transports** results
  (CDP first, `--dump-dom` stdout as fallback). Calling `process.stdout` for results was the
  original design and is kept working, so Linux/CI behaves exactly as before.
- All 14 browser-driving test files now take discovery from that module; each test's own
  orchestration, parsing and thresholds are untouched. `execFileSync` is re-exported as a
  drop-in shim that only intercepts `--dump-dom` / `--screenshot=`, so call sites did not change.
- `--virtual-time-budget=N` is reproduced with `Emulation.setVirtualTimePolicy` instead of being
  passed through: the native flag makes the browser exit when the budget expires, which takes the
  CDP connection with it. Without fast-forwarding, four tests went from ~4s to ~120s each.
- The whole suite now runs on Windows: **`test:ci` 21/21 in 57s**, plus the non-blocking coverage
  and perf checks. Previously 15 of 21 could not run here at all.
- Measured, and fixed, while building this: process cleanup **must be restricted by image name**
  (the Node bridge's own command line carries the profile path, so an unrestricted match killed
  the process that was about to write stdout — which looks exactly like "CDP never came up");
  the child's internal timeout must be shorter than the parent's `spawnSync` timeout, or cleanup
  never runs and the leftover browser makes the next launch be forwarded instead of started; and
  `hover-check.js` — which keeps its own CDP plumbing for the 4x font work — left a whole
  nine-process browser instance behind, because `proc.kill()` only kills the launcher stub on
  such a machine. It now calls the shared `shutdownBrowser()` (browser-level `Browser.close`),
  which is the only thing that reliably ends an instance that is not your own child.
- `contour-specks.test.js` was rewritten to measure in **tile space**. Its old invariants belonged
  to the per-frame engine: "no path may lie outside the visible canvas" and "at least 40px of
  stroke visible in the viewport". With a tile ~3x the viewport, ~85% of paths legitimately sit
  outside the viewport at any moment (3237 of ~3900 across 5 runs were reported as debris), and a
  long contour entering the viewport at an angle legitimately shows a short visible fragment. The
  invariants are now measured on each path's own length and bounding box — the same rules the
  Node-side `contour-cusps` test asserts — plus coordinate finiteness and a tile-bounds check.
  The randomness, blank-cell and ink-density checks are unchanged and still pass.

### Screenshot transport made deterministic on a hostile machine

The screenshot tests were flaky on the verification machine (~3 of 8 runs), and all three failure
modes turned out to be **transport** faults that surfaced as absurd assertions — "the wordmark is
painting ON TOP of the popover", "contrast 17.3:1", "page produced no results". After the fixes,
`watermark-stacking` passes 8/8 with byte-identical measurements (1.229:1 every time).

- **The renderer stops producing frames when the virtual clock is paused.** The transport
  reproduces `--virtual-time-budget=N` with `Emulation.setVirtualTimePolicy`, and when the budget
  expires the clock pauses — so `Page.captureScreenshot` waited for a frame that never came (until
  the 60s CDP timeout), then fell back to `--screenshot=`, which on a Store/AppX Edge machine
  writes an unpainted frame. Fixed by resuming the clock before capturing, retrying the capture
  once, and retrying the whole CDP capture once before ever using the fallback.
  **The nudge must be tiny** (`CLOCK_NUDGE_MS = 100`): it exists to let the compositor emit a
  frame, not to let the page evolve. A 3000ms nudge immediately broke `thunder-shot`, whose budget
  (1400ms) has to land inside the thunder plate's 3s hold — the extra time crossed the auto-hide
  and produced four screenshots of an empty page, the exact trap that test's own header documents.
- **Frames were captured before the page had painted.** Fast-forwarding timers does not guarantee
  the compositor produced the corresponding frame: two captures that must differ came out
  identical. Captures now wait for two animation frames first.
- **A popover captured mid-entrance-animation sits where the DOM says it does not.** The same page
  measured `y=244` and `y=315` across runs, so the watermark showing through the popover's rounded
  corners was counted as "leaking on top of it" by that test's zero-tolerance assertion. Waiting
  for finite CSS animations to finish fixes it — but it is **opt-in per test**
  (`--wait-animations`), because some tests want precisely a mid-animation frame: enabling it
  globally made `thunder-shot` capture after the plate's 3s auto-hide. `iterations: Infinity`
  animations are never awaited (the promise never settles).
- **A mount race looked like a broken page.** Readiness was judged by `document.readyState` alone,
  which is already `complete` on the initial `about:blank`; evaluating after the navigation to the
  fixture destroyed the execution context and threw `page threw: Uncaught`. Readiness now also
  requires the page URL to match the requested one.

After these fixes the flaky test passes 8/8 with byte-identical measurements (1.229:1 every run),
and two consecutive full-suite runs are green with zero leftover browser processes.

### CI was running 25 of 27 tests

`test` and `test:ci` were two hand-maintained copies of the same list, and `test:ci` was missing
`contour-coverage` and `contour-perf` — so two consecutive all-green CI-style runs reported
success while `contour-perf` was in fact broken (it needed `PREFS_NS` in its harness sandbox after
the preference keys became derived from the namespace). It was caught only by running the suite
from the packed archive, which is exactly the drift `run-tests.js` warns about in its own header
("the list always drifts in the direction of CI running one fewer test").

- `contour-perf` and `contour-coverage` are now in `test:ci` (1.1s and 3.5s respectively).
- `test` is defined as `npm run test:ci`, so the list exists once and cannot drift again.
- `contour-perf`'s harness now injects `PREFS_NS` (extracted from `client.js`, not retyped).
