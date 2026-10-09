# ADR-0002: Cadena de exportación a .docx con plantillas Word

- **Estado:** aceptado (09/10/2026)
- **Hito:** H0.3

## Contexto

MarcDoc debe exportar Markdown a un .docx que respete una plantilla Word (estilos, portada, encabezados y pies) y que sea conforme a OOXML, para que Word lo muestre correctamente. Ver `PLAN.md`, secciones 3.4 y 3.5. El plan proponía Pandoc con una reference-doc derivada de la plantilla, un filtro Lua para asignar estilos y un postprocesado que fusiona el resultado con la plantilla.

## Experimentos y hallazgos

Código en `spikes/docx/`. Tests: `npx vitest run --config spikes/vitest.config.ts`.

1. **La salida de Pandoc 3.1.3 no es conforme al esquema.**
   - Un documento sencillo da 21 errores en el Open XML SDK (perfil Microsoft 365), y la propia `reference.docx` de Pandoc da 9.
   - Casi todos son de orden de elementos dentro de `rPr`, `pPr`, `style`, `tblStylePr` y `settings`.
   - Hay además valores inválidos: `w:nsid` con menos de 8 dígitos hexadecimales, `w:jc="start"` y `w:tblHeader w:val="true"`.
   - Word suele tolerarlos, pero cumplir el esquema es un requisito explícito del proyecto.
2. **Pandoc resuelve los estilos de la reference-doc por nombre, no por ID.** Con una plantilla de Word en español (`w:styleId="Ttulo1"`, `w:name="heading 1"`), Pandoc escribe `Ttulo1`. Las plantillas localizadas funcionan sin traducir nada.
3. **Pandoc añade sus propios estilos** (`FirstParagraph`, `Compact`, `BlockText`, `SourceCode`, `VerbatimChar`…) y **hace referencia a `Table` sin definirlo** cuando la reference-doc no lo trae.
4. **Pandoc conserva** el `sectPr`, los encabezados y pies y el modo de compatibilidad de la reference-doc. **Descarta** el cuerpo (portada, controles de contenido, marcador) y las partes del paquete que no conoce.
5. **El filtro Lua para asignar estilos no hace falta.** Es más simple reasignar los IDs en el postprocesado usando el _nombre_ del estilo de Pandoc, que no depende del idioma. El único filtro Lua necesario elimina el bloque de título de Pandoc, porque la portada viene de la plantilla.
6. Con el postprocesado del spike, el corpus combinado (títulos, listas anidadas, tablas, tareas, matemáticas, notas al pie, código con resaltado, imagen, enlaces y portada desde YAML) se exporta con **0 errores** en el Open XML SDK. LibreOffice lo renderiza con los estilos de la plantilla.

## Decisión

Cadena de exportación:

```
.md ─► Pandoc (--from=gfm, --reference-doc=plantilla preparada, filtro Lua sin bloque de título)
     ─► fusión sobre el paquete de la PLANTILLA (no sobre el de Pandoc)
     ─► reasignación de estilos por nombre de Pandoc → clave Markdown → styleId de la plantilla
     ─► normalización OOXML (orden de elementos y valores)
     ─► validación (SDK en desarrollo y tests, linter propio en la app)
```

Detalles:

- **Preparación de la plantilla:** si es `.dotx`, se cambia el tipo de contenido de la parte principal a `document.main+xml`.
- **Fusión.** El paquete base es la plantilla. Del resultado de Pandoc se importa:
  - el cuerpo (sin su `sectPr`) en lugar del párrafo `{{body}}`;
  - las relaciones que usa el cuerpo (hipervínculos e imágenes, con nuevos IDs);
  - la numeración (se añade a la de la plantilla con IDs desplazados);
  - las notas al pie, con sus separadores;
  - los estilos que se usan y la plantilla no define (por ejemplo, los de resaltado de código), tomados de la salida de Pandoc o de su `reference.docx` por defecto.
- **Archivo de mapeo:** `<plantilla>.marcdoc.json`, con claves Markdown (`paragraph`, `compactParagraph`, `heading1`…`heading6`, `blockquote`, `codeBlock`, `inlineCode`, `table`, `caption`, `footnoteText`, `footnoteReference`, `hyperlink`) que apuntan a `styleId` de la plantilla. Un ID que no exista en la plantilla es un error explícito.
- **Portada:** los controles de contenido con `w:tag` se rellenan con las claves del front matter indicadas en `cover`. El front matter se obtiene con la variable `$meta-json$` de Pandoc, así que no hace falta otro parser de YAML.
- **Normalizador:** reordena `rPr`, `pPr`, `tblPr`, `tcPr` y `style` según la secuencia del esquema ECMA-376. Corrige `nsid`/`tmpl` (8 dígitos hexadecimales), `jc` (`start`/`end` → `left`/`right`) y los booleanos `true` (elemento sin `val`). Informa de los elementos desconocidos en lugar de descartarlos.
- **Validador:** `tools/ooxml-validator` (.NET 10 y DocumentFormat.OpenXml 3.5.1) en Docker, invocado con `scripts/validate-docx.sh`. Los documentos entran al contenedor por `stdin` en un tar, porque Docker Desktop solo comparte algunas rutas del host. El contenedor se ejecuta sin red y con un usuario sin privilegios.

## Consecuencias

- El código del spike (`ooxml.ts`, `normalize.ts`, `pipeline.ts`) es la base de `src/core/docx/` en H2.2–H2.4. Antes hay que separar la E/S (Pandoc, sistema de archivos) de la lógica pura, tal como exige el plan para `core/`.
- El PLAN (sección 3.4) se actualiza: se elimina el filtro Lua de asignación de estilos.
- Dependencias nuevas: `jszip` y `@xmldom/xmldom`. Pasarán de desarrollo a ejecución en H2.2.
- La plantilla de ejemplo `resources/templates/docx/sample-es.{docx,dotx}` se genera con `spikes/docx/sample-template.ts`, que imita cómo guarda Word una plantilla en español. Supera el SDK con 0 errores.

## Limitaciones y riesgos pendientes

- **Ninguna validación en Word real todavía.** Falta la capa d (Word Online) sobre `.work/pipe/out.docx`.
- Solo se ha probado con una plantilla creada por nosotros. Quedan por probar:
  - plantillas con numeración propia (el código existe, pero ningún test lo ejecuta);
  - plantillas con varias secciones;
  - controles de contenido con _data binding_ y partes `customXml`.
- Las notas al pie de Pandoc **sustituyen** a las de la plantilla. Es correcto mientras la plantilla solo tenga los separadores, pero hay que verificar que `settings.xml` no haga referencia a IDs de nota inexistentes.
- Las matemáticas se convierten a OMML nativo de Word (verificado: `m:oMath` y `m:oMathPara` en el resultado).
- Imágenes: solo `png`, `jpeg`, `gif` y `svg`. SVG en Word necesita una imagen PNG alternativa para versiones antiguas; no se ha verificado.
- El estilo `Normal` de la plantilla de ejemplo está justificado, y por eso las líneas que terminan en salto manual se estiran. Word hace lo mismo, así que se corregirá en la plantilla, no en el pipeline.
- LibreOffice está instalado como snap y no puede leer ni escribir en `/tmp`. Los renderizados se hacen en `.work/`, que está excluido de git.
