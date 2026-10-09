import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { EXPORT_FORMATS, type ExportFormat } from '../core/export/formats'
import { LOCALE_NAMES, LOCALES, type Locale, type Translate } from '../shared/i18n'
import { IpcChannel, type MenuCommand } from '../shared/ipc'

export function buildApplicationMenu(
  window: BrowserWindow,
  t: Translate,
  locale: Locale,
  onLocaleChange: (locale: Locale) => void,
): Menu {
  const send = (command: MenuCommand) => () =>
    window.webContents.send(IpcChannel.MenuCommand, command)

  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    // macOS puts About, Hide and Quit in an application menu named after the app.
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: t('menu.file'),
      submenu: [
        { id: 'open', label: t('menu.open'), accelerator: 'CmdOrCtrl+O', click: send('open') },
        { type: 'separator' },
        { id: 'save', label: t('menu.save'), accelerator: 'CmdOrCtrl+S', click: send('save') },
        {
          id: 'save-as',
          label: t('menu.saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: send('save-as'),
        },
        { type: 'separator' },
        {
          id: 'export',
          label: t('menu.export'),
          accelerator: 'CmdOrCtrl+E',
          click: send('export'),
        },
        {
          label: t('menu.exportAs'),
          submenu: (Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => ({
            id: `export-${format}`,
            label: `${t(`export.format.${format}`)}…`,
            click: send(`export-${format}`),
          })),
        },
        ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'quit' } as const]),
      ],
    },
    { role: 'editMenu', label: t('menu.edit') },
    {
      label: t('menu.view'),
      submenu: [
        {
          id: 'view-split',
          label: t('menu.viewSplit'),
          accelerator: 'CmdOrCtrl+1',
          click: send('view-split'),
        },
        {
          id: 'view-wysiwyg',
          label: t('menu.viewWysiwyg'),
          accelerator: 'CmdOrCtrl+2',
          click: send('view-wysiwyg'),
        },
        {
          id: 'view-source',
          label: t('menu.viewSource'),
          accelerator: 'CmdOrCtrl+3',
          click: send('view-source'),
        },
        { type: 'separator' },
        {
          label: t('menu.language'),
          submenu: LOCALES.map((candidate) => ({
            id: `locale-${candidate}`,
            label: LOCALE_NAMES[candidate],
            type: 'radio' as const,
            checked: candidate === locale,
            click: () => onLocaleChange(candidate),
          })),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}
