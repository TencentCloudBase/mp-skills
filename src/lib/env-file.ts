// ── .env 文件读写 ──
// 给 gen/eval 提供轻量的 .env 持久化：交互式向导选出的凭据写回 cwd/.env，
// 下次运行自动加载。不引入 dotenv 依赖，自己解析 KEY=VALUE。

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * 解析一行 `KEY=VALUE`，返回 [key, value]；不是合法赋值行时返回 null。
 * - 跳过空行与 `#` 注释
 * - 容忍 `export KEY=VALUE`
 * - 去掉值两侧成对的单/双引号
 */
function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const withoutExport = trimmed.replace(/^export\s+/, '')
  const eq = withoutExport.indexOf('=')
  if (eq <= 0) return null

  const key = withoutExport.slice(0, eq).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null

  let value = withoutExport.slice(eq + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return [key, value]
}

/**
 * 读取 .env 并注入 process.env。
 * 已存在的环境变量不覆盖（显式 export 的优先级最高）。
 */
export function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    return
  }
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseLine(line)
    if (!parsed) continue
    const [key, value] = parsed
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

/**
 * 把若干 KEY=VALUE 合并写回 .env：
 * - 已存在的键就地更新其值，保留行的相对位置
 * - 不存在的键追加到文件末尾
 * - 其他行（注释、无关变量、空行）原样保留
 */
export function upsertEnvVars(path: string, vars: Record<string, string>): void {
  const pending = new Map(Object.entries(vars))
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : []

  const out: string[] = []
  for (const line of lines) {
    const parsed = parseLine(line)
    if (parsed && pending.has(parsed[0])) {
      const key = parsed[0]
      out.push(`${key}=${formatValue(pending.get(key)!)}`)
      pending.delete(key)
    } else {
      out.push(line)
    }
  }

  // 去掉结尾多余空行后再追加新键
  while (out.length && out[out.length - 1].trim() === '') out.pop()
  for (const [key, value] of pending) {
    out.push(`${key}=${formatValue(value)}`)
  }

  writeFileSync(path, out.join('\n') + '\n', 'utf8')
}

/** 值含空白或特殊字符时用双引号包裹 */
function formatValue(value: string): string {
  if (value === '' || /[\s#"'=]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`
  }
  return value
}
