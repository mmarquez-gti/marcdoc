# MarcDoc — Plan de proyecto

> Estado: **aprobado** · Fecha: 09/10/2026

## 1. Resumen

MarcDoc es un editor de escritorio de Markdown con dos vistas sincronizadas: una renderizada (WYSIWYG) y otra de código. Exporta a PDF, LaTeX y Word (.docx). Su funcionalidad clave es un **adaptador de plantillas Word**: exporta cualquier .md respetando los estilos, encabezados, pies y portada de una plantilla .docx/.dotx, y genera un .docx conforme a OOXML que se ve correctamente en Microsoft Word.

### Decisiones cerradas

| Tema | Decisión |
|---|---|
| Plataforma | Electron, solo Linux (Ubuntu), 100 % offline |
| Licencia | MIT. Pandoc y LaTeX son dependencias externas del sistema: no se empaquetan, la app las detecta y avisa si faltan |
| UI | React + TypeScript, interfaz en inglés (i18n más adelante) |
| Dialecto | GFM + matemáticas `$...$` + notas al pie + front matter YAML |
| Ida y vuelta | Normalización controlada en el MVP; preservación del formato original en una fase posterior |
| Vistas | Lado a lado con scroll sincronizado, conmutables (solo código / solo WYSIWYG / ambas) |
| Imágenes | Rutas relativas; al pegar o arrastrar se copian a `assets/` |
| Exportación | Pandoc como motor + postprocesado propio del .docx |
| PDF | LaTeX (lualatex) por defecto; HTML (Chromium) como alternativa |
| Plantillas Word | Mapeo Markdown → estilo en un archivo junto a cada plantilla; estilos resueltos por `w:styleId` |
| Validación .docx | 4 capas: esquema OOXML (Open XML SDK en Docker), linter propio, comparación visual con LibreOffice, revisión manual en Word Online |
| Proceso | Repositorio git local, sin CI. Vitest + Playwright en local. Menos de 5 h/semana, hitos pequeños |
| Fuera del MVP | Citas BibTeX/CSL, referencias cruzadas, plantillas LaTeX propias, preservación del formato, i18n, empaquetado |

### Entorno verificado (09/10/2026)

Node 22.22, npm 10.9, Python 3.12, Pandoc 3.1.3 (su lector `gfm` admite `footnotes`, `tex_math_dollars` y `yaml_metadata_block`), TeX Live 2023 (lualatex, pdflatex), LibreOffice 26.2, poppler (`pdftoppm`), Docker 29, git 2.43.

No están instaladas las fuentes Carlito/Caladea (métricamente compatibles con Calibri/Cambria). Hacen falta para que la comparación visual sea fiable (ver riesgo R6).

## 2. Elección de tecnologías

### 2.1 Editor WYSIWYG

Es la decisión más arriesgada. Se cerrará con un *spike* en la fase 0 (hito H0.2) y quedará registrada en un ADR.

| Opción | Pros | Contras |
|---|---|---|
| **Milkdown** | Basado en ProseMirror y remark: su modelo nativo es el AST Markdown (mdast). Tiene plugins de GFM, matemáticas y ecosistema unified | Capa de abstracción propia (plugins, *ctx*) que puede estorbar al personalizar. Comunidad menor que Tiptap |
| **Tiptap** | Muy buena experiencia de desarrollo, extensiones maduras, mucha documentación, React oficial | Markdown no es su modelo nativo: la conversión depende de extensiones adicionales. No he verificado el estado actual de su soporte Markdown oficial |
| **ProseMirror directo + remark** | Control total del esquema y del puente mdast ↔ ProseMirror. Facilita la preservación del formato en el futuro (posiciones de origen) | Más código propio (vistas de nodo, *input rules*, atajos) y más horas en un proyecto con poca dedicación |

**Decisión (ADR-0001, 09/10/2026): ProseMirror directo + remark.** El spike descartó Milkdown. Recomendación original: empezar con **Milkdown** y fijar una salida de emergencia. Si el spike muestra que su abstracción impide controlar la serialización, pasar a ProseMirror directo reutilizando los mismos plugins de remark. Criterios del spike: el ida y vuelta del corpus de pruebas es idempotente, se pueden añadir nodos propios (bloque *raw*, front matter) y se puede conservar la línea de origen en cada bloque.

### 2.2 Resto del stack

| Componente | Elección | Alternativa descartada y motivo |
|---|---|---|
| Build | `electron-vite` | Webpack/Forge: más configuración |
| Vista de código | CodeMirror 6 + `@codemirror/lang-markdown` | Monaco: pesado y orientado a código, peor para prosa |
| Parser/serializador | unified / remark (`remark-gfm`, `remark-math`, `remark-frontmatter`) | markdown-it: no produce AST completo serializable |
| Matemáticas en pantalla | KaTeX | MathJax: más lento |
| Manipulación .docx | JSZip + `@xmldom/xmldom` (DOM con espacios de nombres) | Librería `docx`: genera documentos desde cero, no sirve para fusionar con plantillas |
| Validación OOXML | Open XML SDK (.NET) en Docker | Validar contra XSD a mano: incompleto (no cubre reglas semánticas) |
| Comparación visual | LibreOffice headless → PDF → `pdftoppm` → `pixelmatch` | ImageMagick `compare`: no instalado y menos controlable desde TS |
| Tests | Vitest (unitarios) + Playwright con `_electron` (e2e) | — |
| Estilo de código | ESLint + Prettier | — |

Todas las dependencias npm se pedirán explícitamente antes de instalarlas, una por hito.

## 3. Arquitectura

### 3.1 Procesos de Electron

```
┌───────────────── Renderer (React, sandbox) ─────────────────┐
│  CodeView (CodeMirror)  ⇄  SyncController  ⇄  WysiwygView    │
│                         DocumentStore (markdown + estado)    │
└───────────────────────────┬─────────────────────────────────┘
                            │ IPC tipado (contextBridge, preload)
┌───────────────────────────┴─────────────────────────────────┐
│ Main: FileService · AssetService · ToolchainDetector ·       │
│       ExportService → PandocRunner / LatexRunner /           │
│                       DocxTemplateAdapter (core/docx)         │
└──────────────────────────────────────────────────────────────┘
```

- **`core/`** es TypeScript puro, sin Electron, React ni E/S: parseo, serialización, conversión mdast ↔ ProseMirror, adaptador .docx y linter. Se prueba de forma aislada con Vitest.
- **Main** hace toda la E/S: archivos, procesos externos, diálogos.
- **Renderer** con `contextIsolation`, `sandbox`, sin `nodeIntegration` y con una CSP estricta. El HTML embebido en el .md no se ejecuta.
- Los procesos externos (Pandoc, lualatex, LibreOffice) se lanzan con `execFile` y argumentos en array, nunca a través de la shell. LaTeX se ejecuta sin `--shell-escape`.

### 3.2 Sincronización entre vistas

Principios:

1. **Una sola fuente de verdad:** el texto Markdown en `DocumentStore`. El documento ProseMirror es una proyección.
2. **Solo la vista con el foco emite cambios.** La otra es pasiva y recibe transacciones marcadas con `origin: "sync"`, que nunca reenvía. Así se evitan los bucles.
3. **Cambios mínimos, no reemplazos completos**, para conservar el cursor, la selección y el historial de deshacer de la vista pasiva.

Flujos:

- **Código → WYSIWYG:** con un *debounce* (~150 ms) se parsea a mdast y se convierte a un documento ProseMirror. Se compara por bloques de primer nivel (prefijo y sufijo comunes) y solo se reemplaza el rango que difiere.
- **WYSIWYG → Código:** cada transacción del usuario se serializa a Markdown. Se calcula el diff de texto (prefijo y sufijo comunes) y se envía a CodeMirror un único cambio.
- **Construcciones no soportadas** (HTML embebido, sintaxis desconocida): un nodo opaco `rawBlock` o `rawInline` guarda el texto original sin tocarlo. Se ve como un bloque de código no editable en WYSIWYG y se edita en la vista de código. **Esta es la garantía de no perder información.**
- **Normalización:** abrir un .md no lo reescribe. La normalización solo se aplica cuando el usuario edita en WYSIWYG, y la app avisa la primera vez. Las reglas de serialización (marcador de lista `-`, énfasis `*`, títulos ATX, etc.) se fijan en una configuración única y documentada.
- **Scroll sincronizado:** cada bloque ProseMirror guarda su línea de origen (`sourceLine`, tomada de las posiciones de mdast). Con ella se traduce entre líneas de código y posiciones en pantalla.
- **Preparado para preservar el formato (fase 4):** al guardar posiciones de origen por bloque, más adelante se podrán reutilizar los fragmentos originales de los bloques no modificados en lugar de reserializarlos.

Prueba central: para todo archivo del corpus, `serialize(parse(serialize(parse(md))))` es igual a `serialize(parse(md))`. Es decir, la conversión es idempotente tras una normalización.

### 3.3 Exportación

```
.md ──► Pandoc (gfm+tex_math_dollars+footnotes+yaml_metadata_block)
          ├─► LaTeX (.tex) ─► lualatex ─► PDF          [plantilla LaTeX por defecto]
          ├─► HTML ─► Electron printToPDF ─► PDF        [alternativa]
          └─► DOCX ─► DocxTemplateAdapter ─► .docx final ─► DocxLinter
```

El lector de Pandoc y remark interpretan algunos casos límite de forma distinta. El corpus de pruebas incluirá casos para detectarlo (riesgo R4).

### 3.4 Adaptador de plantillas Word

Funciona en tres etapas:

1. **Preparación de la plantilla** (al cargarla):
   - Si es `.dotx`, se cambia el tipo de contenido de `word/document.xml` (de `template.main+xml` a `document.main+xml`).
   - Se extrae el catálogo de estilos: `w:styleId`, nombre visible, tipo y estilo base.
   - Se genera una **reference-doc** de Pandoc derivada de la plantilla.
2. **Conversión con Pandoc** usando esa reference-doc. *Actualizado por ADR-0002:* no se usa un filtro Lua para asignar estilos; la reasignación se hace en el postprocesado. Un filtro Lua solo elimina el bloque de título de Pandoc.
3. **Postprocesado** (en `core/docx`, TypeScript puro):
   - **Fusión:** el paquete base es la *plantilla*, no la salida de Pandoc. El cuerpo generado se inserta en el punto marcado (un párrafo `{{body}}` o un control de contenido etiquetado). La plantilla conserva portada, encabezados y pies, secciones (`w:sectPr`), tema, fuentes y configuración.
   - **Reasignación de estilos por `w:styleId`:** sustituye los estilos propios de Pandoc (`BodyText`, `FirstParagraph`, `Compact`, `SourceCode`, tabla `Table`…) por los que indique el mapeo. Así funcionan igual las plantillas en español (`Ttulo1`) y en inglés (`Heading1`).
   - **Numeración:** fusiona `numbering.xml` de forma coherente (sin colisiones de `abstractNumId`/`numId`) y reinicia las listas ordenadas cuando corresponde.
   - **Portada:** rellena los controles de contenido o las propiedades del documento (título, autor, fecha) con el front matter YAML.
   - **Recursos:** imágenes, relaciones (`.rels`) y `[Content_Types].xml` coherentes.
   - **Estilo sobre formato directo:** todo el formato sale de estilos con nombre. El formato directo hace que los estilos se comporten de forma distinta entre aplicaciones al copiar y pegar. Esto es una **hipótesis** sobre el problema que observas en LibreOffice; la verificaremos con un caso de prueba.

**Archivo de mapeo** junto a la plantilla (`mi-plantilla.docx` → `mi-plantilla.marcdoc.json`):

```json
{
  "version": 1,
  "bodyPlaceholder": "{{body}}",
  "styles": {
    "paragraph": "Normal",
    "heading1": "Ttulo1",
    "heading2": "Ttulo2",
    "blockquote": "Cita",
    "codeBlock": "CodigoFuente",
    "listBullet": "Prrafodelista",
    "table": "Tablaconcuadrcula",
    "caption": "Descripcin",
    "footnoteText": "Textonotapie"
  },
  "cover": { "title": "title", "author": "author", "date": "date" }
}
```

Si falta el archivo de mapeo, se usa un mapeo por defecto basado en los estilos integrados de Word (identificados por `w:name` en inglés, que Word guarda igual en cualquier idioma). Más adelante habrá una interfaz para editar el mapeo eligiendo estilos de una lista que muestre nombre e ID.

### 3.5 Validación del .docx sin Word

| Capa | Herramienta | Qué detecta | Cuándo |
|---|---|---|---|
| a. Esquema OOXML | Open XML SDK en Docker (`tools/ooxml-validator`) | XML no conforme, partes o relaciones incorrectas | Cada test de exportación |
| b. Linter propio | `core/docx/lint.ts` | Estilos referenciados inexistentes, numeración huérfana, IDs duplicados, formato directo, `compatibilityMode` distinto de 15, extensiones exclusivas de LibreOffice | Cada exportación, también desde la app |
| c. Comparación visual | LibreOffice → PDF → PNG → `pixelmatch` contra imágenes de referencia | Regresiones visuales | Tests de exportación |
| d. Word Online | Lista de comprobación manual (`docs/validation/word-online-checklist.md`) | Diferencias reales de renderizado en Word | Al cerrar cada hito de exportación |

Limitaciones que hay que asumir:

- La capa c compara contra LibreOffice, que es justo el renderizador que no queremos tomar como referencia. Sirve para detectar regresiones, no para garantizar fidelidad en Word.
- Word Online no es idéntico a Word de escritorio. Por ejemplo, el comportamiento de algunos campos como el índice puede diferir; no lo he verificado. Es la mejor aproximación disponible.

## 4. Estructura de carpetas

```
marcdoc/
├── PLAN.md  README.md  LICENSE  .gitignore
├── package.json  electron.vite.config.ts  tsconfig*.json
├── docs/
│   ├── adr/                    # 0001-wysiwyg-editor.md, 0002-docx-pipeline.md…
│   └── validation/             # Word Online checklist
├── src/
│   ├── core/                   # pure TS, no Electron/React/I-O
│   │   ├── markdown/           # parse, serialize, mdast <-> ProseMirror, schema
│   │   ├── sync/               # block diff, text diff, source-line mapping
│   │   └── docx/               # package, styles, mapping, merge, numbering, lint
│   ├── main/                   # Electron main process
│   │   ├── services/           # FileService, AssetService, ToolchainDetector
│   │   ├── export/             # PandocRunner, LatexRunner, ExportService
│   │   └── ipc/
│   ├── preload/
│   ├── renderer/               # React app
│   │   ├── components/
│   │   ├── editors/code/
│   │   ├── editors/wysiwyg/
│   │   └── store/
│   └── shared/                 # IPC contract types
├── resources/
│   ├── pandoc/filters/         # Lua filters
│   ├── latex/default/          # default LaTeX template
│   └── templates/docx/         # sample templates + mapping files
├── tests/
│   ├── fixtures/markdown/      # round-trip corpus
│   ├── fixtures/docx/          # reference PNGs
│   ├── unit/
│   └── e2e/
└── tools/
    ├── ooxml-validator/        # Dockerfile + .NET console app
    └── visual-diff/
```

## 5. Fases e hitos

Estimación con unas 4 h/semana. Cada hito es una o dos sesiones de trabajo, deja la app funcionando y termina con tests en verde. Las fechas son orientativas.

### Fase 0 — Cimientos y spikes (≈ 5 semanas)

| Hito | Tareas | Entregable | Duración | Depende de |
|---|---|---|---|---|
| H0.1 | `git init`, scaffold de electron-vite + React + TS, ESLint/Prettier, Vitest, `.gitignore`, README, LICENSE MIT | Ventana vacía que arranca y un test que pasa | 1 sem | — |
| H0.2 | Spike del editor WYSIWYG (Milkdown frente a ProseMirror directo) con corpus mínimo de ida y vuelta | ADR-0001 | 2 sem | H0.1 |
| H0.3 | Spike .docx: Pandoc + reference-doc + fusión con una plantilla de ejemplo; validador Open XML SDK en Docker | ADR-0002, validador funcionando | 2 sem | H0.1 |

### Fase 1 — MVP editor (≈ 14 semanas)

| Hito | Tareas | Duración | Depende de |
|---|---|---|---|
| H1.1 | Shell de la app, abrir/guardar/guardar como, estado «modificado», `ToolchainDetector` con aviso si faltan Pandoc o LaTeX | 1 sem | H0.1 |
| H1.2 | Vista de código con CodeMirror 6 y resaltado Markdown | 1 sem | H1.1 |
| H1.3 | WYSIWYG básico: párrafos, títulos, énfasis, enlaces, listas, citas, código, nodos *raw*; atajos, *input rules* e historial con `prosemirror-*` | 3 sem | H0.2, H1.1 |
| H1.4 | WYSIWYG GFM: tablas (`prosemirror-tables`), listas de tareas, tachado | 3 sem | H1.3 |
| H1.5 | Imágenes con rutas relativas y copia a `assets/`, matemáticas con KaTeX, notas al pie, front matter | 2 sem | H1.3 |
| H1.6 | Sincronización bidireccional con diff mínimo y prueba de idempotencia sobre el corpus | 2 sem | H1.2, H1.4 |
| H1.7 | Scroll sincronizado, conmutar vistas, e2e con Playwright (abrir → editar en ambas vistas → guardar) | 2 sem | H1.6 |

### Fase 2 — MVP exportación (≈ 12 semanas)

| Hito | Tareas | Duración | Depende de |
|---|---|---|---|
| H2.1 | Exportación a `.tex` y a PDF vía lualatex con plantilla por defecto; PDF vía HTML como alternativa | 2 sem | H1.1, H0.3 |
| H2.2 | DOCX básico con Pandoc y una reference-doc propia; capas de validación a y b en los tests | 1 sem | H0.3 |
| H2.3 | Adaptador (I): carga de .docx/.dotx, catálogo de estilos, archivo de mapeo, filtro Lua, reasignación por `styleId` | 3 sem | H2.2 |
| H2.4 | Adaptador (II): fusión con la plantilla (cuerpo, encabezados y pies, secciones), numeración, portada desde YAML | 3 sem | H2.3 |
| H2.5 | Dos plantillas de ejemplo (en español y en inglés), comparación visual (capa c), lista de comprobación de Word Online (capa d) | 2 sem | H2.4 |
| H2.6 | Diálogo de exportación en la UI, gestión de errores de Pandoc y LaTeX, prueba de aceptación del MVP | 1 sem | H2.1, H2.5 |

### Fase 3 — Post-MVP (sin estimar)

Plantillas LaTeX propias, editor visual del mapeo de estilos, citas BibTeX/CSL, referencias cruzadas, empaquetado (AppImage/.deb).

### Fase 4 — Fidelidad avanzada (sin estimar)

Preservación del formato original del .md, i18n, otros sistemas operativos.

### Calendario orientativo

| Fase | Inicio | Fin |
|---|---|---|
| Fase 0 | 12/10/2026 | 15/11/2026 |
| Fase 1 | 16/11/2026 | 21/02/2027 (incluye margen por Navidad) |
| Fase 2 | 22/02/2027 | 16/05/2027 |
| **MVP** | | **≈ 16/05/2027** |

## 6. Criterios de aceptación del MVP

1. Abrir, editar y guardar un .md en ambas vistas, sin perder información. Las construcciones no soportadas se conservan textualmente.
2. Exportar a PDF (lualatex) y a .docx usando una plantilla propia con su archivo de mapeo.
3. El .docx resultante:
   - pasa la validación del Open XML SDK sin errores;
   - pasa el linter propio;
   - se ve igual en LibreOffice y en Word Online según la lista de comprobación: estilos de títulos, cuerpo, listas, tablas, encabezados y pies, y portada.

## 7. Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | La sincronización pierde el cursor o el historial de deshacer, o entra en bucles | Alta | Alto | Solo emite la vista con foco, transacciones marcadas, diff mínimo, tests e2e específicos |
| R2 | Pérdida de información en el ida y vuelta | Media | Alto | Nodos *raw* opacos, corpus de pruebas de idempotencia, no reescribir el archivo hasta que se edite |
| R3 | Rendimiento con documentos grandes (reparseo completo) | Media | Medio | *Debounce*, diff por bloques; medir con un documento de unas 50 páginas antes de optimizar |
| R4 | Pandoc y remark interpretan el Markdown de forma distinta | Media | Medio | Casos límite en el corpus; documentar las diferencias conocidas |
| R5 | Fidelidad del .docx: Word muestra algo distinto a lo que muestra LibreOffice | Alta | Alto | Postprocesado basado en estilos, linter, Word Online en cada hito, `compatibilityMode=15` |
| R6 | Comparación visual poco fiable por fuentes ausentes (Calibri, Cambria, Aptos) | Alta | Medio | Instalar Carlito y Caladea, o usar en las plantillas de ejemplo fuentes disponibles en ambos entornos |
| R7 | Plantillas con estructuras complejas (varias secciones, campos, controles de contenido anidados) | Media | Medio | Empezar con plantillas de ejemplo controladas; documentar lo que no se soporta |
| R8 | ~~Milkdown no permite el control necesario~~ Cerrado: ADR-0001 elige ProseMirror directo. Nuevo riesgo: coste de montar la capa de edición | Media | Medio | Usar los paquetes oficiales `prosemirror-*`; H1.3 y H1.4 ampliados |
| R9 | Versión de Pandoc del sistema (3.1.3) antigua o distinta en otros equipos | Media | Bajo | Declarar una versión mínima y comprobarla en `ToolchainDetector` |
| R10 | Poca dedicación semanal: se amplía el alcance o se pierde el contexto entre sesiones | Alta | Medio | Hitos pequeños, ADRs y notas de estado en cada hito |

## 8. Supuestos y preguntas abiertas

- Las plantillas de ejemplo las crearé yo con LibreOffice o generando el XML directamente. Cuando haya una plantilla real hecha en Word, se añadirá al conjunto de pruebas.
- El linter considerará «exclusivo de LibreOffice» una lista concreta de elementos y atributos que se definirá en H2.2.
- Pendiente de tu aprobación: instalar las fuentes Carlito y Caladea (`fonts-crosextra-carlito`, `fonts-crosextra-caladea`) y descargar la imagen Docker del SDK de .NET (unos 700 MB, cifra no verificada).

## 9. Registro de avance

| Fecha | Hito | Resultado |
|---|---|---|
| 09/10/2026 | H0.1 | Scaffold de Electron + React + TS; typecheck, lint, tests y build en verde |
| 09/10/2026 | H0.2 | ADR-0001: ProseMirror directo + remark (10/10 del corpus sin pérdida). MVP desplazado a ≈ 16/05/2027 |
| 09/10/2026 | H0.3 | ADR-0002: fusión sobre la plantilla + normalizador OOXML; 0 errores en el Open XML SDK. Pendiente: revisión en Word Online |
| 09/10/2026 | **Fase 0 completada** | Siguiente: H1.1 (shell de la app, abrir/guardar, detección de Pandoc/LaTeX) |
| 09/10/2026 | H1.1 | Abrir/guardar con lista de rutas permitidas, aviso de cambios sin guardar, detección de Pandoc/LuaLaTeX. Playwright adelantado desde H1.7 para verificar cada hito |
| 09/10/2026 | H1.2 | Vista de código con CodeMirror 6 (resaltado, búsqueda, historial por documento) |
| 09/10/2026 | H1.3 | Vista WYSIWYG con ProseMirror: barra de formato, atajos, *input rules*; conversión en `core` sin pérdida (lo no modelado se conserva literal) |
| 09/10/2026 | H1.4 | Tablas GFM (`prosemirror-tables`, alineación por columna), listas de tareas con casilla, tachado |
| 09/10/2026 | H1.5 | Imágenes vía protocolo `marcdoc-asset` (solo imágenes del directorio del documento), copia a `assets/`, KaTeX, notas al pie, front matter. `npm audit`: 0 vulnerabilidades |
| 09/10/2026 | H1.6 | Sincronización por bloques con *debounce*; serialización incremental (~53 ms → ~0,5 ms por pulsación en ~11 000 palabras). `sourceLine` eliminado (ver ADR-0001) |
| 09/10/2026 | H1.7 | Scroll sincronizado, modos de vista, prueba de aceptación e2e |
| 09/10/2026 | **Fase 1 completada** | 109 tests unitarios y 29 e2e en verde. Siguiente: H2.1 (exportación a .tex y PDF) |
| 09/10/2026 | H2.1 | Exportación a .tex, PDF vía LuaLaTeX y PDF vía HTML (ventana oculta sin JavaScript). Detección de paquetes LaTeX que faltan. **PDF vía LaTeX sin verificar**: faltan `texlive-luatex` y `texlive-latex-extra` en el equipo |
| 09/10/2026 | H2.2 | Adaptador y linter en `core/docx`; plantilla por defecto; integración: corpus × plantillas validado con el Open XML SDK (0 errores) |
| 09/10/2026 | H2.3–H2.4 | Mapeo validado y mapeo por defecto por nombre de estilo; fusión de notas al pie, numeración y secciones; probado con una plantilla tipo Word |
| 09/10/2026 | H2.5 | Plantillas es/en/default reproducibles; comparación visual con LibreOffice (capa c); lista de comprobación de Word Online (capa d) |
| 09/10/2026 | H2.6 | Diálogo de exportación, errores legibles, prueba de aceptación del MVP |
| 09/10/2026 | **Fase 2 completada (pendiente de verificación manual)** | Criterio 1 del MVP: cumplido. Criterio 2: cumplido para .docx y PDF vía HTML; PDF vía LaTeX pendiente de instalar paquetes. Criterio 3: pendiente de la revisión en Word Online |
| 09/10/2026 | Verificación PDF vía LaTeX | Instalados `texlive-luatex` y `texlive-latex-extra`: PDF vía LuaLaTeX verificado (e2e 38/38). Criterio 2 del MVP cumplido. Queda el criterio 3 (Word Online) |
