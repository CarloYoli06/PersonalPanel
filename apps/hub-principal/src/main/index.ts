import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, Tray } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { HUB_IPC, type BrandingConfig, type HubAppSettings } from '@panel/core-sdk'
import { ModuleHost } from './module-host'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const moduleHost = new ModuleHost()

const DEFAULT_APP_SETTINGS: HubAppSettings = {
  closeToTray: true,
  branding: {
    mode: 'logo',
    initials: 'PA',
    color: '#8b5cf6'
  }
}

let appSettings: HubAppSettings = { ...DEFAULT_APP_SETTINGS }

function getAppSettingsPath(): string {
  return path.join(app.getPath('userData'), 'panel-hub-settings.json')
}

function loadAppSettings(): HubAppSettings {
  try {
    const raw = fs.readFileSync(getAppSettingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<HubAppSettings>
    appSettings = {
      closeToTray: parsed.closeToTray ?? DEFAULT_APP_SETTINGS.closeToTray,
      branding: {
        ...DEFAULT_APP_SETTINGS.branding,
        ...(parsed.branding ?? {})
      }
    }
  } catch {
    appSettings = { ...DEFAULT_APP_SETTINGS }
  }
  return appSettings
}

function saveAppSettings(): void {
  try {
    fs.writeFileSync(getAppSettingsPath(), JSON.stringify(appSettings, null, 2))
  } catch (e) {
    console.error('[HubMain] Error guardando app settings:', e)
  }
}

function resolveDefaultLogoPath(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'icon.png'),
    path.join(__dirname, '../../build/icon.png'),
    path.resolve(process.cwd(), 'apps/hub-principal/build/icon.png'),
    path.resolve(process.cwd(), 'LogoAlbedo.png')
  ]
  return candidates.find((p) => fs.existsSync(p))
}

function resolveCurrentNativeIcon(): Electron.NativeImage {
  if (appSettings.branding.mode === 'initials' && appSettings.branding.dataUrl) {
    const img = nativeImage.createFromDataURL(appSettings.branding.dataUrl)
    if (!img.isEmpty()) return img
  }
  const logoPath = resolveDefaultLogoPath()
  if (logoPath) {
    const img = nativeImage.createFromPath(logoPath)
    if (!img.isEmpty()) return img
  }
  return nativeImage.createEmpty()
}

function applyBrandingIcons(): void {
  const icon = resolveCurrentNativeIcon()
  if (icon.isEmpty()) return

  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.setIcon(icon)
    } catch {
      /* ignore */
    }
  }

  if (tray) {
    try {
      const trayIcon = icon.resize({ width: 16, height: 16, quality: 'best' })
      tray.setImage(trayIcon)
    } catch {
      /* ignore */
    }
  }
}

function showAndNavigate(route?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
  }
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (route) {
    mainWindow.webContents.send(HUB_IPC.trayNavigateToModule, route)
  }
}

function rebuildTrayMenu(): void {
  if (!tray) return
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Panel Personal · Hub Modular',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Abrir Panel Principal',
      click: () => showAndNavigate('dashboard')
    },
    {
      label: 'FileDiet · Control de Videos',
      click: () => showAndNavigate('mod-video')
    },
    {
      label: 'Escaner Albedo · Digitalización',
      click: () => showAndNavigate('mod-scanner')
    },
    {
      label: 'PC Optimizer · Rendimiento & Privacidad',
      click: () => showAndNavigate('mod-optimizer')
    },
    {
      label: 'PDF Studio · Control de PDF',
      click: () => showAndNavigate('mod-pdf')
    },
    {
      label: 'Configuración y Personalización',
      click: () => showAndNavigate('settings')
    },
    { type: 'separator' },
    {
      label: 'Mantener activo en segundo plano al cerrar',
      type: 'checkbox',
      checked: appSettings.closeToTray,
      click: (item) => {
        appSettings.closeToTray = item.checked
        saveAppSettings()
        rebuildTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: 'Salir completamente',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
}

function setupSystemTray(): void {
  if (tray) return
  const baseIcon = resolveCurrentNativeIcon()
  const trayIcon = baseIcon.isEmpty()
    ? baseIcon
    : baseIcon.resize({ width: 16, height: 16, quality: 'best' })

  tray = new Tray(trayIcon)
  tray.setToolTip('Panel Personal · Ecosistema Modular')
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      return
    }
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      showAndNavigate()
    }
  })
  tray.on('double-click', () => showAndNavigate())
  rebuildTrayMenu()
}

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, '../preload/index.js'),
    path.join(__dirname, '../preload/index.mjs'),
    path.join(__dirname, '../preload/preload.js')
  ]
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]
}

function createWindow(): void {
  const preloadPath = resolvePreloadPath()
  const icon = resolveCurrentNativeIcon()

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Panel Personal Hub',
    icon: icon.isEmpty() ? undefined : icon,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#a1a1aa',
      height: 40
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  // Si `closeToTray` está activo, al pulsar la X la ventana se oculta en la bandeja del sistema
  // (área inferior derecha de Windows, junto a NVIDIA / Seguridad de Windows) liberando recursos de UI.
  mainWindow.on('close', (event) => {
    if (!isQuitting && appSettings.closeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function registerWindowAndThemeIpc(): void {
  ipcMain.on(HUB_IPC.windowMinimize, () => mainWindow?.minimize())
  ipcMain.on(HUB_IPC.windowMaximize, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on(HUB_IPC.windowClose, () => mainWindow?.close())

  ipcMain.on(HUB_IPC.themeSetNative, (_e, resolvedTheme: 'dark' | 'light') => {
    nativeTheme.themeSource = resolvedTheme
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
      if (resolvedTheme === 'light') {
        mainWindow.setBackgroundColor('#f8fafc')
        mainWindow.setTitleBarOverlay({
          color: '#f8fafc',
          symbolColor: '#334155',
          height: 40
        })
      } else {
        mainWindow.setBackgroundColor('#09090b')
        mainWindow.setTitleBarOverlay({
          color: '#09090b',
          symbolColor: '#a1a1aa',
          height: 40
        })
      }
    } catch {
      /* ignore on platforms without titleBarOverlay */
    }
  })

  ipcMain.handle(HUB_IPC.appGetSettings, () => appSettings)

  ipcMain.handle(HUB_IPC.appSetBranding, (_e, branding: BrandingConfig): HubAppSettings => {
    appSettings.branding = branding
    saveAppSettings()
    applyBrandingIcons()
    return appSettings
  })

  ipcMain.handle(HUB_IPC.appSetCloseToTray, (_e, closeToTray: boolean): HubAppSettings => {
    appSettings.closeToTray = closeToTray
    saveAppSettings()
    rebuildTrayMenu()
    return appSettings
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showAndNavigate()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.panelpersonal.hub')
    loadAppSettings()
    registerWindowAndThemeIpc()
    moduleHost.init()
    createWindow()
    setupSystemTray()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showAndNavigate()
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
    void moduleHost.shutdownAll()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !appSettings.closeToTray) {
      app.quit()
    }
  })
}
