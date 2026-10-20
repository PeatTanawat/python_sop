# Sara SOP: third-party license review

Reviewed on 2026-10-20 from the files currently in this project. This is a practical inventory, not legal advice or a complete software bill of materials.

## Project code and assets

- The repository has no project `LICENSE` file. The `© Tanawat` notice identifies the requested credit, but it does not grant reuse rights to other people. Unless Tanawat is the rights holder and separately grants permission, the project's own code should not be treated as cleared for commercial reuse.
- `Folder_Pixel.avif` is included in the desktop executable build, but its source and license are not documented here. Confirm its provenance or replace it with an original or clearly licensed asset before commercial distribution.
- `makeform-droplet-link.svg` is not listed in the executable build and is not referenced by the web or extension pages. Its provenance is also undocumented; do not distribute it commercially until its source is confirmed.

## Dependencies and fonts

- **Pillow** — MIT-CMU license; commercial use is permitted. Preserve its copyright and permission notice in supporting documentation when redistributing it. [License](https://github.com/python-pillow/Pillow/blob/main/LICENSE)
- **pynput** — LGPL-3.0; commercial use is permitted, but distributing the desktop executable with it carries LGPL notice and relinking/replacement obligations. Include the license and review the packaging method before selling the bundled executable. [License](https://github.com/moses-palmer/pynput/blob/master/COPYING.LGPL)
- **pywin32** — the package contains components under different licenses. The `win32` component used for clipboard access has a BSD-style license that permits binary redistribution with its notice, conditions, and disclaimer. Check the actual bundled component license files when building a release. [Component license](https://github.com/mhammond/pywin32/blob/main/win32/License.txt) · [Project license notes](https://github.com/mhammond/pywin32#licenses)
- **PyInstaller** — its GPL license includes an exception allowing commercial applications to be bundled; the resulting executable still has to comply with its dependencies' licenses. [PyInstaller license](https://pyinstaller.org/en/v6.22.3/license.html)
- **DM Sans and Manrope** — served remotely by Google Fonts in the web UI; both are under the SIL Open Font License, which permits commercial use subject to its terms. The fonts are not bundled as files in this repository. [DM Sans source and license](https://github.com/googlefonts/dm-fonts) · [Manrope license](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt)

No noncommercial-only license was found among the declared Python dependencies or the web fonts. The unresolved project-code license and undocumented image assets are the items that prevent this repository, as it stands, from being fully cleared for commercial distribution.
