# ADR-0005: Soporte de Windows y macOS

- **Estado:** aceptado (09/10/2026)
- **Hito:** H4.3

## Contexto

MarcDoc se desarrolla y prueba en Ubuntu. El plan pedía soporte de otros sistemas, pero no hay equipos Windows ni macOS ni integración continua (decisión 19 del plan). Todo lo que sigue se ha comprobado en Linux, simulando la plataforma cuando ha sido posible. **Nada se ha ejecutado en Windows ni en macOS.**

## Decisión: código portable

| Supuesto de POSIX encontrado                                                         | Cambio                                                                                            | Cómo se verificó                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Nombres de archivo extraídos con `/`                                                 | `fileNameOf` acepta `/` y `\`                                                                     | Tests unitarios con rutas `C:\…`                   |
| `TEXINPUTS` separado con `:`                                                         | Se usa `path.delimiter` (`;` en Windows)                                                          | Test unitario con `;`                              |
| Sugerencia `sudo apt install …`                                                      | Sugerencia por plataforma: apt, MacTeX o MiKTeX                                                   | Test unitario por plataforma                       |
| Salida de `kpsewhich` partida por `\n`                                               | Se parte por `\r?\n`                                                                              | Revisión de código                                 |
| Fuentes Carlito y DejaVu fijas en la plantilla LaTeX                                 | Carlito, luego Calibri y, si no, Latin Modern (`\IfFontExistsTF`)                                 | PDF generado con y sin esas fuentes                |
| Archivos CRLF reescritos con LF                                                      | Se detecta el final de línea al abrir y se respeta al guardar                                     | Tests de `FileService`                             |
| Cerrar la ventana cerraba la app; los manejadores IPC y el protocolo no se liberaban | En macOS la app sigue abierta y _activate_ crea otra ventana; cada ventana libera lo que registra | e2e que simula el comportamiento de macOS en Linux |
| Menú sin menú de aplicación                                                          | En macOS, menú de aplicación (Acerca de, Ocultar, Salir) y sin «Salir» en Archivo                 | Revisión de código                                 |

## Decisión: paquetes

- **Windows:** instalador NSIS (no de un clic, con elección de carpeta) y ZIP. Se ha generado el ZIP desde Linux y su estructura es correcta. Falta generar y probar el instalador NSIS.
- **macOS:** DMG, que debe construirse en macOS. Sin firma ni notarización, Gatekeeper pedirá confirmación al abrirlo.
- **Dependencias externas en ambos:** Pandoc (instalador oficial) y, para PDF vía LaTeX, MiKTeX en Windows o MacTeX en macOS.

## Riesgos y trabajo pendiente

- **Sin verificar en las plataformas reales:** detección de Pandoc y de `kpsewhich` (`spawn` sin shell debería encontrar los `.exe`), comportamiento de MiKTeX con `TEXINPUTS`, protocolo de imágenes con rutas de Windows, diálogos y atajos.
- **Atajos:** los textos de ayuda dicen «Ctrl+…». En macOS el atajo real es «⌘», porque los aceleradores usan `CmdOrCtrl`.
- **Herramientas de desarrollo** (`scripts/*.sh`, validador en Docker, LibreOffice y `pdftoppm` en los tests): solo Linux.
- **Recomendación:** antes de anunciar el soporte, añadir integración continua con ejecutores Windows y macOS que pasen las suites unitaria y e2e, o probar a mano con la lista de `docs/validation/`.
