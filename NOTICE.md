# NOTICE

## Upstream project

This repository is a **fork** of:

- **dsh-theme-endfield** — https://github.com/ymh0000123/dsh-theme-endfield
- **Copyright (c) ymh0000123**
- Licence: MIT (see [LICENSE](LICENSE), retained verbatim from upstream)

This fork lives at https://github.com/DoctorxPriestess/dsh-theme-endfield-contour-rework.

The **repository name** and the installed **package name** are the same,
`dsh-theme-endfield-contour-rework` (that is what DSH records in the profile, and the settings
namespace is derived from it). `dsh plugin add` takes the repository, `dsh plugin rm` takes the
package name.

All original credits belong to the upstream author. The theme itself — colour tokens, typography, the zero-radius "industrial editorial" styling, the start-up loader, the thunder title, the watermark, the settings page skeleton, the stylesheet guards (`check.js` / `selftest.js`), the test harness and the CI workflow — is upstream work. This fork extends it and replaces the contour engine.

The fork is distributed under the same MIT terms. The upstream copyright notice and permission notice are kept in `LICENSE` as required by the MIT licence; the fork does not add a separate copyright holder line to that file, because all of the code in this repository is derived from the upstream work plus modifications released under the same terms.

## What this fork changes

See [CHANGELOG.md](CHANGELOG.md) for the full list. In short: the contour background was re-implemented as a precomputed, seamlessly tileable terrain whose contour lines are extracted once with marching squares, cached into an offscreen canvas, and then only translated per frame. The settings that drive it were reworked accordingly (scroll switch, 8 directions, pixel-per-second speed, density), and three defects found during that work were fixed.

The package was also **renamed** from `dsh-theme-endfield` to `dsh-theme-endfield-contour-rework`, with its own settings namespace, so that it can be installed alongside upstream. Settings are therefore **not** shared with upstream; the fork starts from its own defaults.

## AI disclosure

This project was developed with **extensive AI assistance**. Most implementation changes were generated through AI-assisted coding workflows, and then verified through running tests, debugging and iterative fixes.

It is published transparently as an AI-assisted modification. Users should review the changes before using this fork in a production environment.

## Third-party design reference

The visual style references the *Arknights: Endfield* official site (https://endfield.hypergryph.com) as a design reference. No fonts, images or other assets from that site are redistributed in this repository. The two files under `assets/` are screenshots of this plugin itself, taken by the upstream project.

## No warranty

Provided "as is", without warranty of any kind, as stated in the MIT licence. In particular this fork documents that it has only been tested on **DSH 0.1.1-rc.2** (see the Compatibility section of [README.md](README.md)); other versions are untested.
