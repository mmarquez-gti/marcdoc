# MarcDoc

Desktop Markdown editor with two synchronized views (WYSIWYG and source) and export to PDF,
LaTeX and Word (.docx), including export that follows the styles of a Word template.

> Status: early development (phase 0). See [PLAN.md](PLAN.md).

## Requirements

- Linux (Ubuntu)
- Node.js >= 22.12
- External tools used for export (detected at runtime, not bundled):
  - [Pandoc](https://pandoc.org/) >= 3.1
  - TeX Live with `lualatex`

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
