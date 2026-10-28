<div align="center">

  <img src="./LogoAlbedo.png" alt="Panel Personal Logo" width="140" style="border-radius: 28px; margin-bottom: 12px;" />

  # Panel Personal · Hub Modular de Escritorio

  **Ecosistema de utilidades de alto rendimiento para Windows estilo PowerToys & Raycast.**  
  Construido con una arquitectura de **Monorepo Workspaces**, **Lazy Loading integral** y **aislamiento de subprocesos bajo demanda**.

  [![Electron](https://img.shields.io/badge/Electron-33.2-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
  [![React](https://img.shields.io/badge/React-18.3-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
  [![Platform](https://img.shields.io/badge/Platform-Windows_x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://www.microsoft.com/windows)

  <br />

  <p align="center">
    <a href="#-descarga-e-instalación">Descargar Instalador</a> •
    <a href="#-capturas-de-pantalla">Capturas</a> •
    <a href="#-módulos-integrados">Módulos</a> •
    <a href="#-arquitectura-y-rendimiento">Arquitectura</a> •
    <a href="#-desarrollo-local">Desarrollo</a>
  </p>

</div>

---

## 📸 Capturas de Pantalla

<div align="center">

### Vista Principal (Dashboard)
_Panel central con métricas en vivo, lanzamiento de herramientas y conmutación de módulos activos._

![Dashboard Hub](./docs/screenshots/dashboard.png)

<br />

| FileDiet (Compresor de Video) | Escaner Albedo (Digitalización WIA) |
|:---:|:---:|
| ![FileDiet](./docs/screenshots/module-video.png) | ![Escaner](./docs/screenshots/module-scanner.png) |
| _Compresión por lotes GPU NVENC / CPU x264_ | _Digitalización WIA/WiFi + Editor Canvas y PDF_ |

<br />

### Configuración, Temas e Icono Dinámico
_Gestor de segundo plano (System Tray), selector de tema (Oscuro/Claro/Sistema) y generador de iniciales._

![Ajustes y Personalización](./docs/screenshots/settings.png)

</div>

---

## ⚡ Características Principales

- **Cero Consumo de RAM en Reposo:** Mediante Dynamic Imports (`React.lazy`), los módulos y sus motores de renderizado o edición no consumen recursos hasta que el usuario los abre. Al volver al Hub, la memoria se libera inmediatamente.
- **Aislamiento de Tareas Pesadas:** Motores como **FFmpeg** y los scripts de drivers **Windows WIA / PowerShell STA** corren en procesos hijos (`child_process`) efímeros que mueren inmediatamente al finalizar o cancelar la operación.
- **Bandeja del Sistema (System Tray):** Opción de mantener la suite en segundo plano junto al reloj de Windows (como NVIDIA o Seguridad de Windows). Un clic restaura la aplicación y el clic derecho ofrece acceso rápido a cada herramienta.
- **Identidad e Iconografía Personalizable:** Permite al usuario alternar entre el **Logo Albedo** oficial o generar dinámicamente un icono con sus **Iniciales (1 o 2 letras) y color personalizado**, actualizándose en tiempo real en la ventana y la bandeja.
- **Sistema de Temas Unificado:** Soporte completo para **Modo Oscuro**, **Modo Claro** y **Automático (Sistema)** con sincronización nativa del `titleBarOverlay` de Windows.

---

## 🧩 Módulos Integrados

### 🎬 1. FileDiet · Control de Videos
- Compresión inteligente por lotes para formatos `.mp4`, `.mkv`, `.mov` y `.avi`.
- Aceleración por hardware dedicada con **NVIDIA NVENC (`h264_nvenc`)** con fallback automático a **CPU (`libx264`)**.
- Perfiles de calidad (`Calidad Alta`, `Balanceado -75%`, `Máxima Reducción`) y escalado automático inteligente a 1080p.
- Cola de procesamiento secuencial para no sobrecargar CPU/GPU.

### 📄 2. Escaner Albedo · Digitalización WIA
- Conexión directa con escáneres USB y de red/WiFi mediante el estándar nativo **Windows Image Acquisition (WIA)**.
- Modo de escaneo inteligente que memoriza el escáner predeterminado o despliega el selector nativo de Windows.
- **Motor Canvas Integrado:** Recorte manual, detección y auto-recorte de márgenes blancos, rotación 90°, espejo y calibración de brillo/contraste.
- Exportación directa a **PDF multipágina** (Letter / A4) o imágenes individuales (`.png` / `.jpg`).

### ⚡ 3. PC Optimizer · Rendimiento & Privacidad
- Limpieza profunda de temporales de usuario, caché Prefetch y descargas residuales de Windows Update.
- Desactivación de telemetría y recolección de diagnósticos en segundo plano (`DiagTrack`, Advertising ID, Feedback).
- Aceleración de respuesta visual desactivando animaciones y transparencias pesadas.
- Detección y administración de programas de inicio automático (claves `Run` de registro) y liberación de RAM.

---

## 🏛️ Estructura del Monorepo

```text
PanelPersonal/
├── LogoAlbedo.png                  # Imagen maestra de identidad de la suite
├── docs/screenshots/               # Capturas de pantalla para documentación
│   ├── dashboard.png
│   ├── module-video.png
│   ├── module-scanner.png
│   └── settings.png
│
├── apps/
│   └── hub-principal/              # Shell / Contenedor principal Electron (@panel/hub)
│       ├── build/                  # Iconos nativos (.ico multirresolución y .png)
│       └── src/
│           ├── main/               # Ventana, Bandeja del Sistema y ModuleHost
│           ├── preload/            # ContextBridge seguro y tipado
│           └── renderer/           # Dashboard, Settings y navegación por pestañas
│
├── packages/
│   ├── core-sdk/                   # Contrato ModuleManifest, IPC y ProcessTracker
│   └── ui-kit/                     # Tokens semánticos, ThemeProvider y componentes
│
└── modules/
    ├── mod-video/                  # FileDiet: Backend FFmpeg + Vistas React Lazy
    ├── mod-scanner/                # Escaner Albedo: Scripts WIA + Editor Canvas Lazy
    └── mod-optimizer/              # PC Optimizer: Scripts PowerShell + Ajustes de Windows Lazy
```

---

## 📦 Descarga e Instalación

El instalador para Windows x64 se compila con **NSIS**, permitiendo elegir la ruta de instalación y creando accesos directos en el menú de inicio y escritorio:

| Tipo | Archivo | Ubicación |
|:---|:---|:---|
| **Instalador Oficial** | `Panel Personal Hub Setup 1.0.0.exe` | [`release/`](./release/) |
| **Versión Portable** | `win-unpacked/Panel Personal Hub.exe` | [`release/win-unpacked/`](./release/win-unpacked/) |

---

## 🛠️ Desarrollo Local

### Requisitos
- **Node.js** `>= 18.0.0` (Probado en `v22.14.0`)
- **npm** `>= 9.0.0`
- **Windows 10 / 11 (x64)**

### Comandos de Ejecución

```bash
# 1. Instalar dependencias en todo el monorepo
npm install

# 2. Iniciar en entorno de desarrollo con Hot-Reload
npm run dev

# 3. Comprobación estricta de tipos de TypeScript (Node & Web)
npm run typecheck

# 4. Compilar bundles optimizados para producción
npm run build

# 5. Generar el instalador ejecutable de Windows (.exe)
npm run dist
```

---

## ➕ Cómo Añadir Nuevos Módulos en el Futuro

La arquitectura está diseñada para escalar de forma inmediata:

1. Crea una carpeta en `modules/mod-tu-herramienta/` con su propio `package.json`.
2. Implementa el contrato `ModuleManifest` de `@panel/core-sdk` exportando tu vista con `React.lazy(() => import('./renderer/TuVista'))`.
3. Registra el manifiesto en `apps/hub-principal/src/renderer/src/registry.ts`.
4. El módulo aparecerá automáticamente en el Hub con Lazy Loading, soporte de temas y control de encendido/apagado.

---

<div align="center">
  <sub>Desarrollado con dedicación bajo arquitectura modular para Windows. MIT License.</sub>
</div>
