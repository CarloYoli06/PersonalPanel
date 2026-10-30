#!/usr/bin/env node
const path = require('path')
const os = require('os')
const fs = require('fs')

// Asegurar que Cargo y Rust estén siempre presentes en PATH para esta sesión
const cargoBin = path.join(os.homedir(), '.cargo', 'bin')
if (fs.existsSync(cargoBin)) {
  const currentPath = process.env.PATH || ''
  if (!currentPath.toLowerCase().includes(cargoBin.toLowerCase())) {
    process.env.PATH = `${cargoBin}${path.delimiter}${currentPath}`
  }
}

// Delegar al CLI oficial de Tauri
require('@tauri-apps/cli/tauri')

