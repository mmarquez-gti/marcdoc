# ADR-0003: Citas bibliográficas

- **Estado:** aceptado (09/10/2026)
- **Hito:** H3.4

## Contexto

El usuario quiere citas con BibTeX/CSL. La sintaxis estándar de Pandoc es `[@clave, p. 3]` y la formatea `--citeproc` con la bibliografía y el estilo CSL del front matter. MarcDoc lee el Markdown con el lector `gfm` de Pandoc (ADR-0002) y con remark en el editor (ADR-0001).

Comprobaciones hechas con Pandoc 3.1.3:

- El lector `gfm` no admite la extensión `citations` («The extension citations is not supported for gfm»).
- `commonmark_x` tampoco la admite. Además, frente a nuestro dialecto, activa extensiones que cambian la interpretación del texto: `smart`, `subscript` con `~`, `fancy_lists`, `definition_lists`… Y desactiva `autolink_bare_uris`, con lo que el AST del corpus cambia (`04-gfm-extras.md`).
- Pasar al lector `markdown` de Pandoc cambiaría la interpretación de todo el documento respecto a lo que muestra el editor.
- El editor escapaba los corchetes al reescribir el texto (`\[@doe2020]`). El significado se conserva, pero el código fuente queda ensuciado.

## Decisión

1. **Editor:** un plugin de remark (`src/core/markdown/citations.ts`) convierte los grupos `[…@clave…]` del texto en nodos `citation`. Se escriben tal como se tecleaban, sin escapes, y en el WYSIWYG son un nodo propio que se edita desde la barra («Cite»). Teclear el `]` final de `[@clave]` crea la cita.
2. **Exportación:** se mantiene el lector `gfm`. El filtro `resources/pandoc/filters/citations.lua` reúne el texto de cada grupo entre corchetes que contiene una clave y lo **analiza con el lector `markdown` del propio Pandoc**, para no reimplementar su sintaxis. Le sigue `--citeproc` en todos los formatos.
3. **Bibliografía y estilo:** se indican en el front matter (`bibliography: refs.bib`, `csl: apa.csl`, `lang: es-ES`). Las rutas relativas se resuelven desde la carpeta del documento a través de `--resource-path` (verificado).
4. **Word:** nueva clave de mapeo `bibliography` para el estilo de las entradas de la bibliografía (estilo integrado «Bibliography» de Word).

## Consecuencias y limitaciones

- Solo se reconoce la forma **entre corchetes**: `[@a]`, `[@a, p. 3]`, `[see -@a; @b]`. La forma narrativa sin corchetes (`@doe2020 dice…`) no se reconoce, para no confundir menciones del tipo «@usuario» habituales en GFM.
- No se reconocen grupos con formato dentro (`[*véase* @a]`): el filtro solo une texto plano.
- La bibliografía va al final del documento. Pandoc permite colocarla con `::: {#refs}`, pero GFM no tiene esa sintaxis.
- Sin `csl:`, citeproc usa Chicago autor-fecha. MarcDoc no incluye estilos CSL; para APA 7, descarga `apa.csl` del repositorio oficial de estilos CSL y ponlo junto al documento.
- Una clave que no está en la bibliografía sale como `(clave?)`, y la exportación muestra el aviso de citeproc.
