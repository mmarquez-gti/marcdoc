# ADR-0006: Interfaz de línea de comandos

- **Estado:** aceptado (14/10/2026)

## Contexto

Se quiere usar MarcDoc dentro de flujos automatizados, en particular con un agente (Claude Code) que exporte un Markdown a Word con una plantilla, o a PDF, y que abra ficheros en el editor. Hasta ahora toda la funcionalidad estaba detrás de la interfaz gráfica, y la aplicación ni siquiera abría el fichero recibido como argumento, aunque el paquete la asocia a los `.md`.

La exportación ya vivía en el proceso principal (`ExportService`), sin depender de la interfaz. El PDF vía HTML, en cambio, imprime con Chromium (`printToPDF`), así que exige el runtime de Electron: no basta un script de Node.

## Opciones consideradas

| Opción                | A favor                                                                                  | En contra                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **CLI en el binario** | Sin dependencias ni puertos; cualquier agente o script la usa; reutiliza `ExportService` | Arrancar Electron cuesta algo más de medio segundo por orden                                          |
| Servidor HTTP local   | Un proceso persistente evita los arranques                                               | Puerto abierto, autenticación y ciclo de vida que gestionar; no aporta nada al agente frente a la CLI |
| Servidor MCP          | Integración nativa con Claude                                                            | Dependencia nueva (SDK de MCP); puede construirse más adelante como capa fina sobre la CLI            |

## Decisión

1. **El mismo ejecutable** decide al arrancar si actúa como CLI o como editor (`src/main/index.ts`). El análisis de argumentos es puro y está en `src/core/cli/args.ts`. Las órdenes son `export`, `open`, `templates` y `help`. Un único argumento que no es una orden es un fichero que abrir en el editor, como hacen los gestores de archivos (también se aceptan URI `file://`, por el `%U` del `.desktop`).
2. **`export`** no crea ventana: llama a `ExportService` y termina con un código de salida (`0` correcto, `1` fallo, `2` argumentos incorrectos). `--json` imprime el resultado o el error para que el agente lo lea. La plantilla se pasa con `--template` y se usa su mapeo `.marcdoc.json` como en la aplicación.
3. **Instancia única** (`requestSingleInstanceLock`). Una segunda instancia entrega la ruta a la primera con `additionalData` en lugar de abrir otra ventana. No se usa su `argv`, porque Chromium puede añadirle opciones propias.
4. **`open` vuelve al instante.** Si hay un editor abierto, le entrega el fichero. Si no, lanza uno desacoplado (`detached`) y termina, para no bloquear al agente. Con AppImage se relanza `$APPIMAGE`, porque el binario interno deja de existir cuando el proceso que montó la imagen termina.
5. **Abrir desde fuera respeta los cambios sin guardar:** el proceso principal envía la ruta al renderer, que pregunta antes de descartarlos. Solo se pueden abrir las rutas solicitadas así (`OpenRequests`), igual que `FileService` solo escribe rutas elegidas por el usuario. Las peticiones que llegan antes de que el renderer escuche se guardan hasta que está listo.

## Consecuencias

- Ya no se pueden tener dos ventanas abiertas lanzando la aplicación dos veces. Las pruebas e2e no se ven afectadas: cada una usa su propio `MARCDOC_USER_DATA`, y el bloqueo de instancia única depende de esa carpeta.
- Las órdenes de la CLI no toman el bloqueo, así que se puede exportar con el editor abierto.
- La CLI no está localizada: los mensajes salen en inglés.
- Las opciones escritas antes de la orden se consideran de Electron o Chromium (por ejemplo `--no-sandbox`, que algunos sistemas necesitan con la AppImage) y se ignoran. Por eso `marcdoc --opcion-desconocida` abre el editor en lugar de dar un error. La excepción es `--help`.
- En modo CLI se desactiva la aceleración por GPU. No se muestra nada y así se evitan avisos de controladores en stderr (observado con Wayland y Vulkan).
- Sin pantalla gráfica (por ejemplo, un servidor sin X ni Wayland), Electron no arranca, y la CLI tampoco. No se ha probado con `xvfb`.
- Solo se ha verificado en Linux, con la build de desarrollo. Falta comprobar la AppImage y el `.deb` empaquetados (ADR-0005).
