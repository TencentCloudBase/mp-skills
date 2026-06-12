// ── 工具函数 ──

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createSpinner } from 'nanospinner'
import pc from 'picocolors'

export const colors = pc

export function log(msg: string): void {
  console.log(msg)
}

export function warn(msg: string): void {
  console.log(pc.yellow(`  !  ${msg}`))
}

export function ok(msg: string): void {
  console.log(`  ok  ${msg}`)
}

export function title(msg: string): void {
  console.log(`\n${pc.bold(msg)}`)
}

export function kv(label: string, value: string): void {
  console.log(`  ${pc.dim(`${label.padEnd(9)} :`)} ${pc.cyan(value)}`)
}

export interface Spinner {
  update(text: string): void
  success(text?: string): void
  error(text?: string): void
}

export function spinner(text: string, opts?: { enabled?: boolean }): Spinner {
  let currentText = text
  const enabled = opts?.enabled ?? true
  const animated = enabled && process.stdout.isTTY && process.stderr.isTTY && !process.env.CI

  if (!animated) {
    log(currentText)
    return {
      update(nextText: string) {
        currentText = nextText
      },
      success(nextText?: string) {
        ok(nextText || currentText)
      },
      error(nextText?: string) {
        warn(nextText || currentText)
      },
    }
  }

  const instance = createSpinner(currentText, { stream: process.stderr, color: 'cyan' }).start()
  return {
    update(nextText: string) {
      currentText = nextText
      instance.update({ text: nextText, color: 'cyan' })
    },
    success(nextText?: string) {
      currentText = nextText || currentText
      instance.success({ text: currentText, mark: '✓' })
    },
    error(nextText?: string) {
      currentText = nextText || currentText
      instance.error({ text: currentText, mark: '✗' })
    },
  }
}

/**
 * 解析小程序源码根（app.json 所在目录）。
 *
 * 优先读取 project.config.json 中的 `miniprogramRoot`：
 * - 字段缺失 → 视为 `./`（与 project.config.json 同目录）
 * - 字段存在 → 相对 project.config.json 所在目录解析；即使写成 `/`
 *   也按相对 `./` 处理（去掉开头的斜杠）。
 *
 * 若没有 project.config.json，则回退到布局探测：
 * app.json 在 `miniprogram/` 子目录，或直接在项目根。
 *
 * 找不到时返回 null。
 */
export function resolveMiniprogramRoot(projectPath: string): string | null {
  const configPath = join(projectPath, 'project.config.json')
  if (existsSync(configPath)) {
    let miniprogramRoot = ''
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'))
      if (typeof config?.miniprogramRoot === 'string') {
        miniprogramRoot = config.miniprogramRoot
      }
    } catch {
      // 解析失败时按缺失处理，继续走 ./ 与回退逻辑
    }
    // 去掉开头的斜杠，即使是 "/" 也代表相对 project.config.json 的 ./
    const rel = miniprogramRoot.replace(/^[/\\]+/, '')
    const root = rel ? resolve(projectPath, rel) : projectPath
    if (existsSync(join(root, 'app.json'))) return root
    // miniprogramRoot 指向的目录没有 app.json，继续走回退探测
  }

  const inMini = join(projectPath, 'miniprogram', 'app.json')
  if (existsSync(inMini)) return join(projectPath, 'miniprogram')
  const inRoot = join(projectPath, 'app.json')
  if (existsSync(inRoot)) return projectPath
  return null
}

/**
 * 解析 project.config.json 中的 `cloudfunctionRoot`。
 * 没有配置时返回 null，调用方自行 fallback。
 */
export function resolveCloudfunctionRoot(projectPath: string): string | null {
  const configPath = join(projectPath, 'project.config.json')
  if (!existsSync(configPath)) return null
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    if (typeof config?.cloudfunctionRoot === 'string' && config.cloudfunctionRoot) {
      const rel = config.cloudfunctionRoot.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
      return resolve(projectPath, rel)
    }
  } catch {
    // 解析失败按缺失处理
  }
  return null
}
