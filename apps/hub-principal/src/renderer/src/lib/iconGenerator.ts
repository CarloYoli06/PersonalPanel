import type { BrandingConfig } from '@panel/core-sdk'

/**
 * Genera un icono PNG cuadrado (256x256) en base64 a partir de 1 o 2 iniciales
 * y un color de fondo simple para usarlo en la ventana, barra de tareas y System Tray.
 */
export function renderInitialsIconDataUrl(initials: string, color: string): string {
  const clean = (initials.trim().slice(0, 2) || 'P').toUpperCase()
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  // Fondo redondeado estilo Windows 11 / macOS squircle
  const radius = 58
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(size - radius, 0)
  ctx.quadraticCurveTo(size, 0, size, radius)
  ctx.lineTo(size, size - radius)
  ctx.quadraticCurveTo(size, size, size - radius, size)
  ctx.lineTo(radius, size)
  ctx.quadraticCurveTo(0, size, 0, size - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()

  ctx.fillStyle = color
  ctx.fill()

  // Borde interior sutil para destacar en barra de tareas oscura y clara
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.stroke()

  // Texto de las iniciales centrado
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${clean.length === 1 ? 136 : 112}px Inter, "Segoe UI", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(clean, size / 2, size / 2 + 6)

  return canvas.toDataURL('image/png')
}

export const BRANDING_PRESET_COLORS: { label: string; hex: string }[] = [
  { label: 'Violeta Albedo', hex: '#8b5cf6' },
  { label: 'Cyan Escáner', hex: '#00b4d8' },
  { label: 'Fucsia FileDiet', hex: '#d946ef' },
  { label: 'Esmeralda', hex: '#10b981' },
  { label: 'Ámbar', hex: '#f59e0b' },
  { label: 'Rosa', hex: '#f43f5e' },
  { label: 'Azul Real', hex: '#3b82f6' },
  { label: 'Grafito', hex: '#334155' }
]

export function buildBrandingPayload(
  mode: 'logo' | 'initials',
  initials: string,
  color: string
): BrandingConfig {
  const cleanInitials = (initials.trim().slice(0, 2) || 'PA').toUpperCase()
  if (mode === 'initials') {
    return {
      mode: 'initials',
      initials: cleanInitials,
      color,
      dataUrl: renderInitialsIconDataUrl(cleanInitials, color)
    }
  }
  return {
    mode: 'logo',
    initials: cleanInitials,
    color
  }
}

