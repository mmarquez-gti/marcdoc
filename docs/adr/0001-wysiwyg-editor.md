# ADR-0001: Editor WYSIWYG

- **Estado:** aceptado (09/10/2026)
- **Fecha:** 09/10/2026
- **Hito:** H0.2

## Contexto

MarcDoc necesita una vista WYSIWYG sincronizada con el texto Markdown sin perder información (ver `PLAN.md`, sección 3.2). Las candidatas eran:

- **A. Milkdown** (`@milkdown/kit` 7.22.2): framework sobre ProseMirror y remark.
- **B. ProseMirror directo + remark**: esquema y conversores mdast ↔ ProseMirror propios.

Tiptap se descartó en el plan porque Markdown no es su modelo nativo.

Criterios fijados en el plan:

1. Ida y vuelta idempotente y sin pérdida sobre el corpus.
2. Posibilidad de añadir nodos propios (matemáticas, front matter, _raw_).
3. Conservar la línea de origen (`sourceLine`) de cada bloque.

## Método

- El corpus está en `tests/fixtures/markdown/`: 10 archivos con GFM, matemáticas, notas al pie, front matter, HTML y casos límite.
- Para cada archivo se mide:
  - **idempotente:** `md → doc → md₁ → doc → md₂` con `md₁ = md₂`;
  - **sin pérdida:** el mdast de `md₁` es igual al del original, sin contar posiciones;
  - **idéntico:** `md₁ = md` byte a byte (informativo).
- Las dos opciones usan las mismas reglas de serialización (`spikes/wysiwyg/shared/markdown.ts`).
- Para reproducirlo: `npx vitest run --config spikes/vitest.config.ts`.

## Resultados

| Criterio                                           | A. Milkdown                                                                     | B. ProseMirror + remark                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Archivos sin pérdida e idempotentes                | 8/10 sin cambios; 9/10 con un parche                                            | **10/10**                                                                                                                              |
| Archivos idénticos byte a byte                     | —                                                                               | 5/10. El resto difiere solo por la normalización prevista (`*` → `-`, tablas alineadas, setext → ATX, bloques indentados → con vallas) |
| Matemáticas                                        | Nodos propios: el plugin oficial está abandonado y Crepe depende de Vue         | Nodos propios                                                                                                                          |
| Front matter                                       | Nodo propio: no hay plugin                                                      | Nodo propio                                                                                                                            |
| HTML embebido                                      | Lo conserva                                                                     | Lo conserva (`raw_block` / `raw_inline`)                                                                                               |
| Enlaces por referencia                             | **Se pierden las definiciones**: los convierte en enlaces normales              | Se conservan                                                                                                                           |
| `sourceLine` por bloque                            | Posible, pero hay que sobrescribir el esquema de cada nodo del preset (unos 15) | Implementado y probado                                                                                                                 |
| Código propio del spike                            | 142 líneas (3 nodos y un parche)                                                | 387 líneas (esquema y conversores completos)                                                                                           |
| Tamaño minificado (gzip)                           | 445 KB (136 KB)                                                                 | 315 KB (95 KB): ProseMirror 183 KB + remark 132 KB                                                                                     |
| Edición (atajos, _input rules_, tablas, historial) | Incluida                                                                        | **Hay que montarla** con los paquetes oficiales `prosemirror-*`                                                                        |

**Fallo encontrado en Milkdown 7.22.2:** el preset pasa `title: null` a las imágenes sin título. La validación de atributos lo rechaza, se registra un `RangeError` y **la imagen desaparece sin aviso**. Se puede corregir con `imageSchema.extendSchema` en unas 15 líneas (incluido en el spike). Lo preocupante es el tipo de fallo: pérdida silenciosa en el caso más común.

## Decisión

**Opción B: ProseMirror directo con remark** como modelo Markdown.

Motivos:

1. Es la única opción que cumple el criterio 1 sin parches: 10/10 sin pérdida.
2. Con Milkdown, matemáticas, front matter y bloques _raw_ serían nodos propios igualmente. Su ventaja real se reduce a la capa de edición.
3. `sourceLine` y la futura preservación del formato (fase 4) necesitan controlar la conversión. En B el conversor es nuestro; en A habría que sobrescribir el esquema de cada nodo del preset.
4. Hay menos dependencias intermedias entre React y ProseMirror, y el fallo de imágenes muestra el riesgo de depender de su capa de conversión.

## Consecuencias

- **Coste adicional:** la capa de edición se monta con paquetes oficiales y mantenidos: `prosemirror-view`, `-state`, `-commands`, `-keymap`, `-history`, `-inputrules`, `-schema-list`, `-tables`, `-dropcursor` y `-gapcursor`. Estimo **una semana más en H1.3 y otra en H1.4**. El MVP pasaría de ≈ 02/05/2027 a ≈ 16/05/2027.
- El esquema y los conversores del spike (`spikes/wysiwyg/prosemirror/`) son la base de `src/core/markdown/` en H1.3. Se moverán con sus tests.
- Las tablas se modelarán con `prosemirror-tables`, que exige celdas con contenido de bloque. El esquema del spike usa celdas con contenido en línea y habrá que adaptarlo en H1.4.
- Al cerrar este ADR se desinstalan `@milkdown/kit` y `happy-dom`, y se borra `spikes/wysiwyg/milkdown/`. El historial de git conserva el spike.

## Avisos

- `npm audit` informa de 3 vulnerabilidades de severidad baja en `katex`, que es una dependencia transitiva de `remark-math` a través de `micromark-extension-math`. Solo afecta a la salida HTML de esa extensión, que no usamos. La corrección automática bajaría `remark-math` a la versión 3. Se revisará cuando haya una versión corregida.
- La normalización convierte las URL sueltas (`https://…`) en autoenlaces explícitos (`<https://…>`). El significado se conserva, pero es un cambio visible para el usuario.

## Revisión (09/10/2026, hito H1.6)

- **Se elimina el atributo `sourceLine` del esquema.** Al insertar o borrar líneas, su valor cambia en todos los bloques siguientes. ProseMirror considera distintos esos nodos y los vuelve a dibujar, lo que anula el diff mínimo por bloques de la sincronización. La correspondencia bloque ↔ líneas se calcula a partir del texto Markdown cuando hace falta (`src/core/sync/blockLines.ts`). Se apoya en que cada bloque de primer nivel del editor corresponde a un nodo mdast de primer nivel, salvo los párrafos vacíos.
- **Rendimiento medido** con un documento de unas 11 000 palabras (unas 25–30 páginas):
  - Serializar todo el documento costaba ~53 ms por pulsación en el WYSIWYG. Con la caché por bloque (`createIncrementalSerializer`) cuesta ~0,5 ms.
  - Parsear el Markdown cuesta ~150 ms y se ejecuta con _debounce_ (150 ms) al editar en la vista de código. En documentos grandes puede notarse una pausa al dejar de teclear. Mejora prevista si llega a molestar: parsear en un Web Worker o de forma incremental por bloques.

## Revisión (09/10/2026, hito H4.1): preservación del formato

- **Antes:** al editar en el WYSIWYG se reescribía todo el documento con las reglas de normalización.
- **Ahora:** solo se reescriben los bloques de primer nivel editados.
- `BlockSources` (`src/core/markdown/blockSources.ts`) guarda, al parsear, el texto original de cada bloque y los huecos con sus vecinos. Los busca por identidad del nodo y, si deshacer reconstruye un bloque igual, por contenido.
- No se usa un atributo del nodo porque ProseMirror copia los atributos al editar, y el texto guardado quedaría desfasado.
- Cuando un cambio del código se aplica por diff, los nodos conservados reciben el texto nuevo con `adopt`. Así, un cambio solo de formato (`*a*` → `_a_`) no se pierde.
- Sin editar, todo el corpus se reescribe byte a byte igual (test `format-preservation`).
- **Límites:**
  - la unidad es el bloque de primer nivel: editar un elemento de una lista normaliza la lista entera;
  - antes de un bloque editado solo se reutiliza el hueco original si contiene una línea en blanco.
