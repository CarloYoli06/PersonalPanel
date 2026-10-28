import { spawn, execFile, type ChildProcess } from 'node:child_process'

export interface SubprocessResult {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
}

export interface SubprocessOptions {
  timeoutMs?: number
  windowsHide?: boolean
  maxBuffer?: number
}

/**
 * Gestor de subprocesos efímeros para los módulos del Hub.
 * Garantiza que todo binario externo (FFmpeg, FFprobe, PowerShell STA/WIA)
 * se ejecute fuera del hilo principal de Electron, se registre mientras corre
 * y se destruya inmediatamente al terminar o al desactivar el módulo.
 */
export class IsolatedProcessTracker {
  private activeChildren = new Set<ChildProcess>()

  get activeCount(): number {
    return this.activeChildren.size
  }

  track(child: ChildProcess): ChildProcess {
    this.activeChildren.add(child)
    const cleanup = (): void => {
      this.activeChildren.delete(child)
    }
    child.once('close', cleanup)
    child.once('exit', cleanup)
    child.once('error', cleanup)
    return child
  }

  execFileAsync(
    binaryPath: string,
    args: string[],
    options: SubprocessOptions = {}
  ): Promise<SubprocessResult> {
    const { timeoutMs = 25_000, windowsHide = true, maxBuffer = 8 * 1024 * 1024 } = options
    return new Promise((resolve) => {
      const child = execFile(
        binaryPath,
        args,
        { windowsHide, timeout: timeoutMs, maxBuffer },
        (err, stdout, stderr) => {
          this.activeChildren.delete(child)
          resolve({
            ok: !err,
            code: err && 'code' in err && typeof err.code === 'number' ? err.code : err ? 1 : 0,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? '')
          })
        }
      )
      this.track(child)
    })
  }

  spawnAsync(
    command: string,
    args: string[],
    options: SubprocessOptions = {}
  ): Promise<SubprocessResult> {
    const { windowsHide = true, timeoutMs = 30_000 } = options
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        windowsHide,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.track(child)

      let stdout = ''
      let stderr = ''
      let timer: NodeJS.Timeout | undefined

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          try {
            child.kill()
          } catch {
            /* ignore */
          }
        }, timeoutMs)
      }

      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString('utf8')
      })
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString('utf8')
      })
      child.on('close', (code) => {
        if (timer) clearTimeout(timer)
        this.activeChildren.delete(child)
        resolve({
          ok: code === 0,
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        })
      })
      child.on('error', (err) => {
        if (timer) clearTimeout(timer)
        this.activeChildren.delete(child)
        reject(err)
      })
    })
  }

  killAll(): void {
    for (const child of this.activeChildren) {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }
    this.activeChildren.clear()
  }
}

