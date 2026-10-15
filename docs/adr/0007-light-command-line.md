# ADR-0007: Línea de comandos ligera sin Electron

- **Estado:** aceptado (15/10/2026)

## Contexto

La CLI de ADR-0006 vive en el binario de Electron: la AppImage pesa unos 130 MB y necesita una sesión gráfica, aunque no muestre ninguna ventana. Para usar MarcDoc en flujos automatizados (agentes, scripts, servidores) se quería una versión ligera.

De todo lo que usa la exportación, solo dependían de Electron dos piezas: la impresión del PDF vía HTML (`printToPDF` de Chromium) y la localización de los recursos. Pandoc, el adaptador de plantillas Word, jszip y xmldom ya funcionan con Node puro.

## Decisión

1. **Un script de Node aparte, `marcdoc-cli`**, con el mismo código que la app. Usa el mismo analizador de argumentos (`parseLiteCommandLine`), y `runExport` y `ExportService` sin cambios. Vite (ya presente) lo empaqueta en un solo fichero CommonJS con las dependencias dentro (`vite.cli.config.ts`). `scripts/build-cli.sh` le añade `resources/` y genera `dist/marcdoc-cli-<versión>.tar.gz`, de unos 150 KB.
2. **`ExportService` recibe la impresora de PDF por el constructor** (`HtmlToPdf`). La app le pasa la de Electron; la CLI ligera, la de Chrome.
3. **PDF vía HTML con el Chrome o Chromium del sistema**, en modo headless. Se busca `MARCDOC_CHROME` y, si no está definida, `google-chrome-stable`, `google-chrome`, `chromium` y `chromium-browser` en el PATH. Si no hay ninguno, el error lo explica y sugiere `--format pdf-latex`. Se usa un perfil temporal, para no tocar el del usuario ni una instancia abierta. El resultado se comparó con el de la app sobre el mismo documento: tamaño A4, márgenes y fondos iguales.
4. **Sin JavaScript al imprimir, mediante CSP.** El HTML sale del documento del usuario y puede llevar `<script>` en HTML crudo. La opción de Chrome que desactiva JavaScript (`--blink-settings=scriptEnabled=false`) impide que Chrome headless imprima (comprobado con Chrome 146). Por eso se inserta una política `script-src 'none'; object-src 'none'` al principio de `<head>`. Se verificó que bloquea los scripts y que la impresión funciona.
5. **Solo `export`, `templates` y `help`.** `open` necesita el editor y no se incluye.
6. **Build local** (`npm run build:cli`). El workflow de releases no publica el paquete por ahora.

## Consecuencias

- Requisitos: Node.js 22.12 o posterior y Pandoc. Además, Chrome o Chromium para el PDF vía HTML y TeX Live para el PDF vía LaTeX. No necesita pantalla gráfica.
- Al probarlo sin Pandoc apareció un fallo compartido con la app. La opción `timeout` de `spawn` deja vivo su temporizador cuando el ejecutable no existe, y el proceso seguía en marcha dos minutos después de informar del error. `runPandoc` y la impresión con Chrome usan ahora un temporizador propio, que se cancela al terminar.
- Chrome escribe avisos propios en stderr; solo se muestran si la impresión falla.
- Solo se ha probado en Linux.
