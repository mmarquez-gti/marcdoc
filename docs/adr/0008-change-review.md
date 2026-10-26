# ADR-0008: Revisión de cambios externos al documento

- **Estado:** aceptado (26/10/2026)

## Contexto

Los documentos se editan también fuera de MarcDoc, sobre todo con Claude Code, que modifica el `.md` en disco. Puede hacerlo con el documento abierto en la app o con la app cerrada. El usuario quiere ver resaltado qué ha cambiado desde la última vez que revisó el documento, y aceptar o rechazar cada cambio.

Hoy MarcDoc no vigila el archivo. Si se modifica en disco con el documento abierto, la app no lo detecta, y al guardar sobrescribe esos cambios sin aviso.

Los documentos no están en un repositorio git, y el usuario no quiere que lo estén.

## Decisión

1. **Vigilar el archivo abierto desde el proceso main.** `fs.watch` sobre el directorio del documento, filtrando por nombre. Muchos editores y herramientas escriben con un archivo temporal y un renombrado, y eso rompe la vigilancia directa del archivo. Los eventos se agrupan con _debounce_. `FileService` guarda el último contenido que leyó o escribió, y un evento cuyo contenido coincide con él se ignora: es una escritura propia.
2. **Recarga o conflicto.** Si el documento no tiene cambios sin guardar, el contenido nuevo se aplica con un cambio mínimo (`minimalTextChange`) para conservar el cursor. Si los tiene, un banner deja elegir entre recargar (se pierden los cambios propios) o mantener la versión propia (al guardar, se sobrescribe la del disco). No hay fusión a tres bandas.
3. **Línea base persistente fuera de la carpeta del documento.** La línea base es la última versión que el usuario dio por buena. Se guarda en `userData/review/<sha256 de la ruta>.json` con la ruta, el contenido y la fecha. Se actualiza al guardar, al marcar como revisado y al resolver todos los cambios. Así se detectan también los cambios hechos con la app cerrada: al abrir, si el disco difiere de la línea base, se entra en modo revisión.
4. **Modo revisión.** Se activa cuando el contenido difiere de la línea base. Aceptar un fragmento lo incorpora a la línea base. Rechazarlo devuelve el documento al texto de la línea base en ese fragmento; el documento queda con cambios sin guardar. La lógica (fragmentos, aceptar, rechazar, pendientes) vive en `src/core/review/` sin dependencias de Electron ni React.
5. **Vista de código con `@codemirror/merge`.** `unifiedMergeView` con `original` igual a la línea base muestra el diff en línea, con botones para aceptar o rechazar cada fragmento. Se fija la versión 6.12.2 (09/06/2026); la 6.12.3 tenía una semana al tomar la decisión.
6. **Vista WYSIWYG con decoraciones por bloque.** Los bloques añadidos o modificados se resaltan y se marca dónde se borró algo, a partir de los fragmentos y del mapeo de líneas a bloques. Aceptar y rechazar se hace desde una barra de revisión común a las dos vistas, no palabra a palabra.

### Alternativas descartadas

- **Git como almacén de versiones.** Ofrece historial y diff de serie, pero obliga a crear repositorios o hacer commits en las carpetas del usuario, que no lo quiere.
- **Carpeta oculta junto al documento (`.marcdoc/`).** Es portable, pero ensucia las carpetas del usuario y se copiaría o sincronizaría con ellas.
- **Implementar un diff propio o usar `diff` (jsdiff).** `@codemirror/merge` ya trae el diff y la interfaz de aceptar y rechazar para la vista de código. Una segunda librería solo para el núcleo duplicaría funcionalidad. Queda por comprobar en F2 que su función `diff` se puede importar desde `core` sin arrastrar la vista; si no, se reconsidera.

## Consecuencias

- Se añade la dependencia `@codemirror/merge`.
- `userData` guarda copias del contenido de los documentos revisados. Son locales y no salen del equipo.
- La atribución es «externo» o «propio»: la app no sabe si el cambio externo lo hizo Claude u otro programa.
- Con cambios sin guardar y una edición externa a la vez, solo se puede quedar una de las dos versiones.
- En el WYSIWYG, aceptar y rechazar es menos preciso que en la vista de código.
- `fs.watch` en Linux cubre bien un archivo dentro de un directorio. Si el directorio se mueve o se borra, solo se avisa.
- El historial completo de versiones (instantáneas, comparar y restaurar) queda para una fase posterior y reutilizará el almacén de la línea base.
