# Changelog

This file records what **this fork** changed relative to upstream
[`dsh-theme-endfield`](https://github.com/ymh0000123/dsh-theme-endfield).
Upstream's own history is not reproduced here.

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
