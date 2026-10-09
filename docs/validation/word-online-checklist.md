# Revisión manual en Word Online (capa d)

Las capas automáticas (Open XML SDK, linter y comparación visual con LibreOffice) garantizan que el .docx es conforme y que no hay regresiones. **No garantizan que Word lo muestre igual.** Esta revisión cubre ese hueco. Se hace al cerrar cada hito que toque la exportación a Word y siempre que cambien las plantillas o el adaptador.

## Preparación

1. Genera los documentos de revisión:

   ```sh
   npm run validation:samples
   ```

   Se crean en `.work/validation/`:
   - `marcdoc-review-default.docx`: plantilla por defecto;
   - `marcdoc-review-sample-es.docx`: plantilla en español con portada;
   - `marcdoc-review-sample-en.docx`: plantilla en inglés con portada.

2. Súbelos a OneDrive y ábrelos con Word Online. Ábrelos también en LibreOffice para comparar.
3. Word Online no es idéntico a Word de escritorio. Anota en «Observaciones» si algo parece depender de eso. Por ejemplo, Word Online no actualiza algunos campos.

## Comprobaciones

Marca cada punto con ✅ (igual en ambos), ⚠️ (diferencia menor) o ❌ (diferencia que hay que corregir).

| #   | Elemento         | Qué comprobar                                                                                                                                                     | default | es  | en  |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --- | --- |
| 1   | Apertura         | Abre sin avisos de reparación ni de «modo de compatibilidad»                                                                                                      |         |     |     |
| 2   | Portada          | Título, autor y fecha del YAML en sus estilos; sin encabezado en la primera página (es/en). En _default_, el título aparece al principio                          |         |     |     |
| 3   | Encabezado y pie | Texto del encabezado a partir de la página 2; número de página centrado en el pie                                                                                 |         |     |     |
| 4   | Títulos          | Nivel 1–3 con fuente, color y tamaño de la plantilla. En el panel de estilos, el estilo aplicado es el de la plantilla («Título 1»/«Heading 1»), no uno de Pandoc |         |     |     |
| 5   | Párrafos         | Texto justificado; la línea antes de un salto manual no se estira                                                                                                 |         |     |     |
| 6   | Énfasis          | Cursiva, negrita, tachado y código en línea (estilo de carácter de la plantilla)                                                                                  |         |     |     |
| 7   | Enlaces          | Estilo «Hipervínculo»/«Hyperlink»; se abren al hacer clic                                                                                                         |         |     |     |
| 8   | Cita             | Estilo «Cita»/«Quote» con borde izquierdo                                                                                                                         |         |     |     |
| 9   | Listas           | Viñetas y numeración anidadas; la lista que empieza en 3 empieza en 3; las listas sueltas mantienen su espaciado                                                  |         |     |     |
| 10  | Tareas           | Las casillas ☐/☒ se ven                                                                                                                                           |         |     |     |
| 11  | Tablas           | Estilo de tabla de la plantilla, fila de cabecera destacada y alineación por columna (izquierda, centro, derecha)                                                 |         |     |     |
| 12  | Imagen           | Visible y con el tamaño correcto                                                                                                                                  |         |     |     |
| 13  | Ecuaciones       | La ecuación en línea y la de bloque son ecuaciones de Word editables, no texto ni imagen                                                                          |         |     |     |
| 14  | Notas al pie     | Numeración correcta, texto al pie de página, separador visible                                                                                                    |         |     |     |
| 15  | Código           | Bloques de código en monoespaciada con resaltado de sintaxis                                                                                                      |         |     |     |
| 16  | HTML embebido    | Se muestra como texto literal; no rompe el documento                                                                                                              |         |     |     |
| 17  | Copiar y pegar   | Copia una sección con títulos y lista a un documento nuevo de Word: los estilos se conservan como estilos (comprueba el panel de estilos)                         |         |     |     |
| 18  | Guardado         | Guardar en Word Online y volver a abrir en LibreOffice no pierde estilos                                                                                          |         |     |     |

## Registro

| Fecha | Versión (commit) | Revisor | Resultado | Observaciones |
| ----- | ---------------- | ------- | --------- | ------------- |
|       |                  |         |           |               |
