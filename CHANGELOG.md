# Changelog

All notable changes to MarcDoc are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The open document follows changes other programs make to its file, such as an agent
  editing it. Without unsaved changes, the editor shows the new content in place. With unsaved
  changes, a banner asks whether to use the version on disk or keep your own.
- A warning appears when the open file is deleted or moved; saving writes it again.
- Review of outside changes: when another program changes the open file, or changed it while
  MarcDoc was closed, the source view shows what changed since you last reviewed the document.
  Accept or reject each change, or all at once from the review bar. The reviewed version is
  kept in MarcDoc's own settings folder, not next to your files.
- The document view highlights the paragraphs added or changed since your last review and
  shows deleted text struck through where it was.

### Fixed

- Saving no longer overwrites, without warning, changes another program made to the file while
  it was open.

## [0.1.3] - 2026-10-15

### Added

- Command line: `marcdoc export <file.md>` exports to Word (with `--template`), PDF or LaTeX
  without opening a window, with a `--json` result and exit codes for scripts and agents.
  `marcdoc open <file>` opens a file in the editor and returns at once; `marcdoc templates`
  lists the bundled Word templates.
- Files given on the command line or opened from the file manager are opened at start-up.
- Light command line, `marcdoc-cli`: the `export` and `templates` commands on plain Node.js,
  without Electron, in a 150 KB archive (`npm run build:cli`). PDF through HTML is printed with
  Google Chrome or Chromium.

### Changed

- MarcDoc runs as a single instance: launching it again with a file opens that file in the
  existing window (after asking about unsaved changes) instead of starting a second window.

### Fixed

- Word export failed with "Unsupported image type: media/rIdN.svgz" for any SVG image. Pandoc
  stores SVG images with the .svgz extension; they are now copied as .svg, and compressed ones
  are decompressed, since Word reads only plain SVG.
- The command line kept running for two minutes after reporting that Pandoc was missing.

## [0.1.2] - 2026-10-13

### Added

- File → Import Word document… converts a .docx into a Markdown file and opens it. Images are
  extracted next to it, in `assets/<document name>/`.
- The document view shows the formatting of the Word template chosen for export (MarcDoc's
  default template when none is chosen): fonts, sizes, colours, alignment, spacing and page
  margins of the mapped styles. View → Word template look turns it off. The page stays white
  in dark mode. Table styles, heading numbering, headers and footers are not shown yet.

### Changed

- Pasting HTML into the document view collapses the runs of normal and no-break spaces that
  LibreOffice pads clipboard text with. Lone no-break spaces, code, math and plain-text pastes
  are kept.
- Word export: when any heading is numbered by hand, the template's automatic heading numbering
  is switched off for every heading, so numbers are neither doubled nor mixed.

## [0.1.1] - 2026-10-09

### Fixed

- Word export failed with "Style "TableNormal" is used but defined neither in the template nor
  by Pandoc" when the template had no table style of its own and was made in a Word language
  other than English. Inherited styles are now found by their built-in name.
- Copied table styles no longer become a second default table style in the template.

## [0.1.0] - 2026-10-09

First public release. Linux only (AppImage and .deb).

### Editor

- Two synchronized views of the same Markdown file: a word-processor-like document view and a
  source view with syntax highlighting. Edits and scrolling follow each other.
- GitHub Flavored Markdown (tables, task lists, strikethrough), math with KaTeX, footnotes,
  YAML front matter, citations `[@key]` and cross-references `[@fig:id]`, `[@tbl:id]`.
- Editing in the document view rewrites only the blocks you change; the rest of the file
  keeps its original formatting. Constructs the document view does not model (such as raw
  HTML) are kept verbatim.
- Pasted or dropped images are copied into an `assets/` folder next to the document.
- Interface in English and Spanish; light and dark themes.

### Export

- Word (.docx) following a template (.docx or .dotx): styles, cover page, headers and
  footers, sections and list numbering. A visual editor maps Markdown elements to the
  template's styles. Templates in any Word interface language work.
- Every .docx is normalized to the OOXML schema and checked by a linter.
- PDF through LuaLaTeX (with your own Pandoc LaTeX template if you want) or through HTML,
  and LaTeX source.
- Citations formatted with citeproc from the bibliography and CSL style in the front matter;
  numbered figures and tables.

### Known limitations

- Requires Pandoc 3.1 or later installed on the system; PDF via LaTeX also requires TeX Live
  with LuaLaTeX (`texlive-luatex`, `texlive-latex-extra`).
- Windows and macOS builds are configured but have not been tested.
- Word output has been validated with the Open XML SDK and LibreOffice; the manual review in
  Microsoft Word is still pending (see `docs/validation/word-online-checklist.md`).

[0.1.2]: https://github.com/mmarquez-gti/marcdoc/releases/tag/v0.1.2
[0.1.1]: https://github.com/mmarquez-gti/marcdoc/releases/tag/v0.1.1
[0.1.0]: https://github.com/mmarquez-gti/marcdoc/releases/tag/v0.1.0
