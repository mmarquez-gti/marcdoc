# MarcDoc

Desktop Markdown editor with two synchronized views (WYSIWYG and source) and export to PDF,
LaTeX and Word (.docx), including export that follows the styles of a Word template.

> Status: editor complete (phase 1); export in progress (phase 2). See [PLAN.md](PLAN.md).

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
  - TeX Live with `lualatex`
- For development only: Docker, used to run the Open XML SDK validator in `tools/ooxml-validator`

## Installation

```sh
npm install
```

## Usage

| Command          | Description                       |
| ---------------- | --------------------------------- |
| `npm run dev`    | Start the app in development mode |
| `npm run build`  | Type-check and build into `out/`  |
| `npm test`       | Run unit tests                    |
| `npm run lint`   | Lint the code                     |
| `npm run format` | Format the code                   |

## License

[MIT](LICENSE)
