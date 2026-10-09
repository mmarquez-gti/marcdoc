# MarcDoc

Desktop Markdown editor with two synchronized views (WYSIWYG and source) and export to PDF,
LaTeX and Word (.docx), including export that follows the styles of a Word template.

> Status: MVP feature-complete (phases 0–2), pending the manual review in Word. See [PLAN.md](PLAN.md).

## Features

- Two synchronized views of the same file: a word-processor-like document view and a
  Markdown source view with syntax highlighting. Edits in either view appear in the other;
  scrolling one scrolls the other. Show both, or only one (`Ctrl+1`, `Ctrl+2`, `Ctrl+3`).
- GitHub Flavored Markdown (tables, task lists, strikethrough), math (`$…$`, `$$…$$`,
  rendered with KaTeX), footnotes and YAML front matter.
- Nothing is lost: constructs the document view does not model (e.g. raw HTML) are kept
  verbatim and edited in the source view. Opening a file never rewrites it; editing in the
  document view writes normalized Markdown.
- Images use paths relative to the document. Pasted or dropped images are copied into an
  `assets/` folder next to it (save the document first).
- Export (`Ctrl+E`) to Word (.docx), PDF via LaTeX, PDF via HTML and LaTeX (.tex).
- Word export follows a template (.docx or .dotx): its styles, cover page, headers and
  footers, sections and list numbering. A `<template>.marcdoc.json` file next to the
  template maps Markdown elements to the template's style IDs (see
  `resources/templates/docx/*.marcdoc.json`); without it, Word's built-in styles are used.
  Templates in any Word UI language work. Every .docx is normalized to the OOXML schema and
  checked by a linter; see `docs/adr/0002-docx-pipeline.md` and
  `docs/validation/word-online-checklist.md`.

## Document view shortcuts

| Shortcut                                                                      | Action                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `Ctrl+B` / `Ctrl+I` / `` Ctrl+` `` / `Ctrl+Shift+X`                           | Bold / italic / inline code / strikethrough            |
| `Ctrl+Alt+1`…`6`, `Ctrl+Alt+0`                                                | Heading 1–6, normal text                               |
| `Ctrl+Shift+8` / `Ctrl+Shift+7`                                               | Bulleted / numbered list                               |
| `Tab` / `Shift+Tab`                                                           | Indent / outdent list item; next / previous table cell |
| `Shift+Enter`                                                                 | Line break                                             |
| Markdown syntax (`# `, `- `, `1. `, `> `, ` ``` `, `**bold**`, `$x$`, `[ ] `) | Converted while typing                                 |

## Requirements

- Linux (Ubuntu)
- Node.js >= 22.12
- External tools used for export (detected at runtime, not bundled):
  - [Pandoc](https://pandoc.org/) >= 3.1
  - For PDF via LaTeX: TeX Live with LuaLaTeX and the packages Pandoc's template needs
    (`sudo apt install texlive-luatex texlive-latex-extra`)
  - For development only: LibreOffice and `pdftoppm` (visual regression tests)
- For development only: Docker, used to run the Open XML SDK validator in `tools/ooxml-validator`

## Installation

### From a package

Build the packages with `npm run package`; they are written to `dist/`:

- **AppImage:** `chmod +x MarcDoc-<version>.AppImage` and run it. Requires FUSE 2
  (`libfuse2t64` on Ubuntu 24.04, `libfuse2` before).
- **Debian/Ubuntu:** `sudo apt install ./marcdoc_<version>_amd64.deb`. Installs Pandoc as a
  dependency and recommends the LaTeX packages for PDF via LaTeX.

### From source

```sh
npm install
npm run dev
```

## Usage

| Command                                | Description                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                          | Start the app in development mode                                                                            |
| `npm run build`                        | Type-check and build into `out/`                                                                             |
| `npm test`                             | Run unit tests                                                                                               |
| `npm run test:e2e`                     | Build and run end-to-end tests against the Electron app                                                      |
| `npm run test:integration`             | Export the corpus to Word with every template and validate it (requires Pandoc; Docker for the Open XML SDK) |
| `npm run validation:samples`           | Export review documents for the Word Online checklist into `.work/validation/`                               |
| `npm run validate:docx -- <file.docx>` | Validate a .docx with the Open XML SDK (requires Docker)                                                     |
| `npm run package`                      | Build the AppImage and .deb into `dist/`                                                                     |
| `npm run test:packaged`                | Build the unpacked app and run a smoke test against it                                                       |
| `npm run lint`                         | Lint the code                                                                                                |
| `npm run format`                       | Format the code                                                                                              |

## License

[MIT](LICENSE)
