// ── opencode 公共封装 ──
// gen / eval（agent 模式）共用：可执行文件解析、BYOK provider 注入、
// NDJSON 事件流解析、SKILL.md 获取（本地候选 → 24h 缓存 → GitHub raw）。

import { existsSync } from 'node:fs'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { colors, log, warn } from './utils.js'
import type { LlmCredentials } from './llm-credentials.js'

// opencode provider 名（注入到 OPENCODE_CONFIG_CONTENT）
// 注意：opencode 把 models 映射的「键名」当作实际 API 模型名发送，
// 因此键名必须是真实模型名（用 creds.model 动态填入）。
export const OC_PROVIDER = 'byok'

/**
 * 解析 opencode 可执行文件路径：
 *   1. 全局命令（which opencode）
 *   2. 本包 node_modules/.bin/opencode
 */
export function resolveOpencodeBin(): string | null {
  const probe = spawnSync('which', ['opencode'], { encoding: 'utf8' })
  if (probe.status === 0 && probe.stdout.trim()) {
    return 'opencode'
  }
  // dist/commands/ → dist/ → 包根目录
  const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const local = resolve(pkgRoot, 'node_modules/.bin/opencode')
  if (existsSync(local)) return local
  return null
}

/**
 * 生成 OPENCODE_CONFIG_CONTENT 的 JSON：
 *   - 注入一个名为 byok 的 OpenAI 兼容 provider（models 的键名即为真实模型名）
 *   - 可选注入 skills.paths，让 opencode 通过标准机制自动发现指定目录下的 skill
 *     （目录约定：每个 skill 一个子目录，子目录内含 SKILL.md，opencode 从 paths 列表
 *     的每个目录扫描 *\/SKILL.md。绝对路径与 ~ 都支持）
 */
export function buildOpencodeConfig(
  creds: LlmCredentials,
  opts?: { skillPaths?: string[] },
): string {
  const config: Record<string, any> = {
    provider: {
      [OC_PROVIDER]: {
        npm: '@ai-sdk/openai-compatible',
        name: 'BYOK',
        options: {
          baseURL: creds.baseUrl,
          apiKey: creds.apiKey,
        },
        models: {
          [creds.model]: { name: creds.model },
        },
      },
    },
  }
  if (opts?.skillPaths && opts.skillPaths.length > 0) {
    config.skills = { paths: opts.skillPaths }
  }
  return JSON.stringify(config)
}

/** opencode run 的 --model 参数值（byok/<model>） */
export function opencodeModelArg(creds: LlmCredentials): string {
  return `${OC_PROVIDER}/${creds.model}`
}

/**
 * 启动 opencode 子进程，逐行解析 NDJSON 事件流并打印精简进度。
 * 返回退出码。
 */
export function runOpencode(
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn(bin, args, {
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
    })

    // opencode 在流式出错时仍可能以退出码 0 结束，需据 error 事件判定失败
    let sawError = false

    const rl = createInterface({ input: child.stdout! })
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        if (printEvent(JSON.parse(trimmed))) sawError = true
      } catch {
        // 非 JSON 行（opencode 偶尔输出装饰），原样打印
        log(`  ${trimmed}`)
      }
    })

    child.on('error', (err) => {
      warn(`无法启动 opencode: ${err.message}`)
      resolvePromise(1)
    })
    child.on('close', (code) => {
      rl.close()
      const exit = code ?? 0
      resolvePromise(exit !== 0 ? exit : sawError ? 1 : 0)
    })
  })
}

/**
 * 打印单条 opencode NDJSON 事件（精简版）。
 * 事件类型：step_start / tool_use / text / step_finish / error
 * 返回 true 表示该事件是错误事件。
 */
function printEvent(evt: unknown): boolean {
  const e = evt as {
    type?: string
    error?: { data?: { message?: string } }
    part?: {
      type?: string
      tool?: string
      text?: string
      reason?: string
      state?: { input?: Record<string, unknown>; output?: string }
      tokens?: { total?: number }
    }
  }

  switch (e.type) {
    case 'error': {
      const msg = e.error?.data?.message ?? '未知错误'
      log(colors.red(`  ✗ opencode 出错: ${msg}`))
      return true
    }
    case 'tool_use': {
      const tool = e.part?.tool ?? 'tool'
      const summary = summarizeInput(e.part?.state?.input)
      log(colors.cyan(`  🔧 ${tool}${summary ? `(${summary})` : ''}`))
      break
    }
    case 'text': {
      const text = e.part?.text
      if (text) {
        const t = text.trim()
        if (t) log(colors.dim(`  💬 ${t.slice(0, 200)}${t.length > 200 ? '...' : ''}`))
      }
      break
    }
    case 'step_finish': {
      if (e.part?.reason === 'stop') {
        const total = e.part?.tokens?.total
        if (typeof total === 'number') log(colors.green(`  ✓ 完成一步（累计 tokens: ${total}）`))
      }
      break
    }
    // step_start 不打印，避免噪音
  }
  return false
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const obj = input as Record<string, unknown>
  if (typeof obj.filePath === 'string') return obj.filePath as string
  if (typeof obj.path === 'string') return obj.path as string
  if (typeof obj.command === 'string') {
    const cmd = obj.command as string
    return cmd.slice(0, 60) + (cmd.length > 60 ? '...' : '')
  }
  if (typeof obj.pattern === 'string') return obj.pattern as string
  return ''
}

// ── SKILL.md 获取：本地候选 → 24h 缓存 → GitHub raw ──

const CACHE_TTL = 24 * 60 * 60 * 1000

/**
 * 获取某个 Skill 的 SKILL.md 文本（作为系统提示词）。
 * @param rawUrl     GitHub raw URL（缓存键 + 远端兜底）
 * @param localAbsCandidates 本地已安装的绝对候选路径
 */
export async function fetchSkillMd(
  rawUrl: string,
  localAbsCandidates: string[],
): Promise<string | null> {
  // 1. 本地已安装
  for (const abs of localAbsCandidates) {
    if (existsSync(abs)) {
      const content = await readFile(abs, 'utf8').catch(() => '')
      if (content) return content
    }
  }

  // 2. 缓存（24h）
  const cached = await readCache(rawUrl)
  if (cached) return cached

  // 3. GitHub 下载
  const fresh = await downloadSkillMd(rawUrl)
  if (fresh) {
    await writeCache(rawUrl, fresh)
    return fresh
  }

  return null
}

async function downloadSkillMd(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'mp-skills-cli' } })
    if (!res.ok) return null
    const text = await res.text()
    return text || null
  } catch {
    return null
  }
}

async function readCache(rawUrl: string): Promise<string | null> {
  try {
    const cachePath = getCachePath(rawUrl)
    const s = await stat(cachePath).catch(() => null)
    if (!s || Date.now() - s.mtimeMs > CACHE_TTL) return null
    return await readFile(cachePath, 'utf8')
  } catch {
    return null
  }
}

async function writeCache(rawUrl: string, content: string): Promise<void> {
  try {
    await writeFile(getCachePath(rawUrl), content, 'utf8')
  } catch {
    // 缓存失败不阻塞
  }
}

function getCachePath(rawUrl: string): string {
  const hash = createHash('sha256').update(rawUrl).digest('hex').slice(0, 16)
  return join(tmpdir(), `mp-skills-skillmd-${hash}.cache`)
}
