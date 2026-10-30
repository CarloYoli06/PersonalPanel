<div align="center">

  <img src="./LogoAlbedo.png" alt="Panel Personal Logo" width="140" style="border-radius: 28px; margin-bottom: 12px;" />

  # Panel Personal · Hub Modular de Escritorio

  **Ecosistema de utilidades de alto rendimiento para Windows estilo PowerToys & Raycast.**  
  Construido con una moderna arquitectura híbrida de **Tauri v2**, **Rust Cargo Workspaces**, **Monorepo npm**, **Lazy Loading integral** y **subprocesos nativos bajo demanda**.

  [![Tauri](https://img.shields.io/badge/Tauri-2.2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
  [![Rust](https://img.shields.io/badge/Rust-1.99-000000?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
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

## 🚀 Novedades de la Versión 2.0 (Reescritura en Tauri v2 & Rust)

- **Reducción de tamaño del 95%:** El instalador pasó de **~130 MB** (Electron) a solo **~6.1 MB** (Tauri v2 + NSIS).
- **Consumo mínimo de memoria:** De consumir más de 150 MB en reposo a escasos **~30 MB de RAM**.
- **Ventana Frameless Personalizada:** Interfaz sin bordes nativos toscos, con botones propios de control (minimizar, maximizar/restaurar, cerrar con realce en rojo) y región de arrastre suave (`data-tauri-drag-region`).
- **Arrastre nativo de archivos desde Windows Explorer:** Soporte OLE nativo en **FileDiet** y **PDF Studio** con detección inmediata de rutas en disco y resaltado visual reactivo.
- **Reordenamiento interactivo en el Dashboard:** Arrastre táctil y por ratón mediante *Pointer Events* con indicador *"Soltar aquí para reordenar"* y botones directos de desplazamiento `[ < ]` y `[ > ]`.
- **Cero dependencias de Node.js en tiempo de ejecución:** Todo el backend corre directamente como código máquina en binarios nativos de Rust.

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

| PC Optimizer (Rendimiento & Privacidad) | PDF Studio (Control de PDF) |
|:---:|:---:|
| ![PC Optimizer](./docs/screenshots/module-optimizer.png) | ![PDF Studio](./docs/screenshots/module-pdf.png) |
| _Limpieza de caché, telemetría y apps de inicio_ | _Unir, dividir, organizar, comprimir y convertir_ |

<br />

### Configuración, Temas e Identidad Visual
_Gestor de segundo plano (System Tray), selector de tema (Oscuro/Claro/Sistema) y generador de iniciales con logo predeterminado._

![Ajustes y Personalización](./docs/screenshots/settings.png)

</div>

---

## ⚡ Características Principales

- **Cero Consumo de RAM en Reposo:** Mediante Dynamic Imports (`React.lazy`), los módulos y sus motores de renderizado o edición no consumen recursos hasta que el usuario los abre. Al volver al Hub, la memoria se libera inmediatamente.
- **Aislamiento de Tareas Pesadas en Rust:** Motores como **FFmpeg** y los scripts de drivers **Windows WIA / PowerShell STA** son orquestados por crates nativos de Rust de manera asíncrona sin bloquear la interfaz.
- **Bandeja del Sistema (System Tray):** Opción de mantener la suite en segundo plano junto al reloj de Windows (como NVIDIA o Seguridad de Windows). Un clic restaura la aplicación y el clic derecho ofrece acceso rápido a cada herramienta.
- **Identidad e Iconografía Personalizable:** Permite al usuario alternar entre el **Logo Albedo** oficial (embebido de fábrica en el binario) o generar dinámicamente un icono con sus **Iniciales (1 o 2 letras) y color personalizado**, actualizándose en tiempo real en la ventana y la bandeja.
- **Sistema de Temas Unificado:** Soporte completo para **Modo Oscuro**, **Modo Claro** y **Automático (Sistema)** con sincronización nativa en tiempo real.

---

## 🧩 Módulos Integrados

### 🎬 1. FileDiet · Control de Videos
- Compresión inteligente por lotes para formatos `.mp4`, `.mkv`, `.mov` y `.avi`.
- Detección de arrastre y suelta nativo desde el Explorador de archivos de Windows.
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

### 📕 4. PDF Studio · Control Integral de Documentos
- Arrastre y suelta nativo reactivo desde Windows Explorer con resaltado visual luminoso.
- **Unir PDF (Merge):** Fusión ultrarrápida por lotes con reordenamiento interactivo y portada previa.
- **Dividir y Extraer:** Extracción por rangos personalizados (`1-4, 7`), selección manual en cuadrícula visual o separación completa de cada página.
- **Organizar y Rotar:** Miniaturas nítidas generadas en memoria (`pdfjs-dist/legacy`), rotación libre en 90° e inserción de nuevos documentos.
- **Comprimir y Optimizar:** 3 perfiles (Estructural sin pérdida, Balanceado 150 DPI y Máximo 100 DPI) con cálculo comparativo de reducción.
- **Convertir y Sellar:** Conversión de imágenes (JPG, PNG, WebP) a PDF, extracción de páginas a imágenes, numeración de páginas y marcas de agua.

---

## 🏛️ Estructura del Monorepo

```text
PanelPersonal/
├── Cargo.toml                       # Cargo Workspace raíz (orquestador Rust)
├── package.json                     # Monorepo npm Workspaces
├── LogoAlbedo.png                   # Identidad maestra oficial de la suite
├── release/                         # Instaladores NSIS generados para distribución
│   └── Panel Personal Hub Setup 2.0.0.exe
│
├── apps/
│   └── hub-principal/               # Aplicación Host principal (@panel/hub)
│       ├── src-tauri/               # Host nativo Tauri v2 + Rust
│       │   ├── Cargo.toml
│       │   ├── tauri.conf.json      # Configuración de ventana, NSIS e iconos
│       │   ├── icons/               # Iconos multirresolución (.ico, .png)
│       │   └── src/lib.rs           # Comandos IPC, System Tray y gestión de ventana
│       └── src/
│           └── renderer/            # Dashboard, Settings y navegación (React + Vite)
│
├── packages/
│   ├── core-sdk/                    # Contratos de tipos, IPC Bridge y manifiestos
│   └── ui-kit/                      # Tokens de diseño, ThemeProvider y controles
│
└── modules/                         # Módulos híbridos (Rust Crates + React UI)
    ├── mod-video/                   # FileDiet: Crate nativo mod_video + UI React
    ├── mod-scanner/                 # Escaner Albedo: Crate nativo mod_scanner + UI Canvas
    ├── mod-optimizer/               # PC Optimizer: Crate nativo mod_optimizer + UI React
    └── mod-pdf/                     # PDF Studio: Crate nativo mod_pdf + UI pdf-lib/pdfjs
```

---

## 📦 Descarga e Instalación

Los instaladores compilados para Windows x64 se distribuyen de forma oficial a través de **GitHub Releases**:

| Tipo | Archivo | Tamaño | Descarga |
|:---|:---|:---|:---|
| **Instalador Oficial NSIS** | `Panel Personal Hub Setup 2.0.0.exe` | **~6.1 MB** | [⬇️ Descargar desde Releases](https://github.com/CarloYoli06/PersonalPanel/releases) |

> 💡 **Nota**: Para compilar tu propio instalador localmente en tu equipo, ejecuta `npm run dist`. El ejecutable quedará generado dentro de la carpeta local `release/`.

---

## 🛠️ Desarrollo Local

### Requisitos
- **Node.js** `>= 18.0.0`
- **npm** `>= 9.0.0`
- **Rust & Cargo** `>= 1.80.0` (Toolchain `stable-x86_64-pc-windows-msvc`)
- **Windows 10 / 11 (x64)**

### Comandos de Ejecución

```bash
# 1. Instalar dependencias del monorepo
npm install

# 2. Iniciar en entorno de desarrollo con Hot-Reload (Vite + Tauri Dev)
npm run dev

# 3. Comprobación estricta de tipos de TypeScript
npm run typecheck

# 4. Compilar la aplicación y generar el instalador de producción (.exe)
npm run dist
```

---

## ➕ Cómo Añadir Nuevos Módulos en el Futuro

La arquitectura está diseñada para escalar de forma inmediata:

1. Crea una carpeta en `modules/mod-tu-herramienta/` con su `package.json` y su crate de Rust en `src-rust/`.
2. Añade el nuevo crate al `Cargo.toml` raíz del workspace.
3. Implementa el contrato `ModuleManifest` de `@panel/core-sdk` exportando tu vista con `React.lazy(() => import('./renderer/TuVista'))`.
4. Registra el manifiesto en `apps/hub-principal/src/renderer/src/registry.ts`.
5. El módulo aparecerá automáticamente en el Hub con Lazy Loading, soporte de temas, reordenamiento interactivo y control de encendido/apagado.

---

<div align="center">
  <sub>Desarrollado con dedicación bajo arquitectura modular ultraligera en Tauri v2 para Windows. MIT License.</sub>
</div>
