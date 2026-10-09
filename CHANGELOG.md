# Changelog

All notable changes to MarcDoc are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

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

[0.1.0]: https://github.com/mmarquez-gti/marcdoc/releases/tag/v0.1.0
