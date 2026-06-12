// ── 统一 LLM 凭据解析 ──
// gen / eval / create --ai 共用同一套 OpenAI 兼容凭据：
//   WXA_SKILL_EVAL_LLM_BASE_URL / WXA_SKILL_EVAL_LLM_API_KEY / WXA_SKILL_EVAL_LLM_MODEL

import { join } from 'node:path'
import { warn, log, ok } from './utils.js'
import { loadEnvFile, upsertEnvVars } from './env-file.js'

/** 统一的 LLM 环境变量名 */
export const ENV = {
  BASE_URL: 'WXA_SKILL_EVAL_LLM_BASE_URL',
  API_KEY: 'WXA_SKILL_EVAL_LLM_API_KEY',
  MODEL: 'WXA_SKILL_EVAL_LLM_MODEL',
} as const

export interface LlmCredentials {
  /** OpenAI 兼容 BaseURL，已规范化为以 /v1 结尾（不含尾部斜杠） */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** 模型名 */
  model: string
}

// ── Provider 预设 ──

export interface Preset {
  key: string
  label: string
  baseUrl: string
  defaultModel: string
}

export const PRESETS: Preset[] = [
  { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-v4-flash' },
  { key: 'glm', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-5.1' },
  { key: 'kimi', label: 'Kimi（Moonshot）', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.6' },
  { key: 'minimax', label: 'MiniMax', baseUrl: 'https://api.minimaxi.com/v1', defaultModel: 'minimax-m2.7' },
]

/**
 * 应用 provider 预设 + 显式参数覆盖到 process.env。
 * 优先级（由低到高）：
 *   环境变量 / .env  <  --provider 预设  <  --openai-base-url / --openai-api-key / --model
 *
 * 调用方应在 `ensureLlmCredentials()` 之前调用，让预设/覆盖值先写入环境变量，
 * 之后 ensureLlmCredentials 读取到的即为最终优先级结果。
 */
export function applyProviderPreset(opts: {
  provider?: string
  baseUrl?: string
  apiKey?: string
  model?: string
}): void {
  // 1. provider 预设：只在环境变量未设置时填空
  if (opts.provider) {
    const preset = PRESETS.find((p) => p.key === opts.provider)
    if (!preset) {
      warn(`未知 provider "${opts.provider}"，可选值：${PRESETS.map((p) => p.key).join(' / ')}`)
    } else {
      if (!process.env[ENV.BASE_URL]) process.env[ENV.BASE_URL] = preset.baseUrl
      if (!process.env[ENV.MODEL]) process.env[ENV.MODEL] = preset.defaultModel
    }
  }

  // 2. 显式参数：无条件覆盖（最高优先级）
  if (opts.baseUrl) process.env[ENV.BASE_URL] = opts.baseUrl
  if (opts.apiKey) process.env[ENV.API_KEY] = opts.apiKey
  if (opts.model) process.env[ENV.MODEL] = opts.model
}

/**
 * 把任意 BaseURL 规范化为 OpenAI 兼容的 `.../v1` 形式：
 *   https://x/                 -> https://x/v1
 *   https://x/v1               -> https://x/v1
 *   https://x/anthropic        -> https://x/v1   （Anthropic 风格端点换回 v1）
 *   https://x/v1/              -> https://x/v1
 */
function normalizeOpenAiBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  // 去掉 Anthropic 风格后缀
  url = url.replace(/\/(anthropic|messages)$/i, '')
  if (!/\/v\d+$/i.test(url)) {
    url = `${url}/v1`
  }
  return url
}

export interface ResolveOpts {
  /** 命令行 --model 覆盖，最高优先级 */
  modelOverride?: string
  /** 兜底模型名 */
  defaultModel?: string
}

/**
 * 静默解析统一 LLM 凭据，命中返回，缺失返回 null（不打印、不退出）。
 * 从 WXA_SKILL_EVAL_LLM_* 环境变量读取。
 */
export function tryResolveLlmCredentials(opts?: ResolveOpts): LlmCredentials | null {
  const modelOverride = opts?.modelOverride
  const defaultModel = opts?.defaultModel || 'gpt-4o'

  const key = process.env[ENV.API_KEY]
  const base = process.env[ENV.BASE_URL]
  if (key && base) {
    return {
      baseUrl: normalizeOpenAiBaseUrl(base),
      apiKey: key,
      model: modelOverride || process.env[ENV.MODEL] || defaultModel,
    }
  }

  return null
}

/** 打印缺失凭据的环境变量提示 */
function printMissingHint(): void {
  warn('未找到 LLM 凭据')
  log('请配置以下环境变量：')
  log(`  export ${ENV.BASE_URL}=<https://your-endpoint/v1>`)
  log(`  export ${ENV.API_KEY}=<your-key>`)
  log(`  export ${ENV.MODEL}=<model-name>`)
}

/**
 * 解析统一 LLM 凭据；缺失时打印提示并 process.exit(1)。
 * 保留供向后兼容。
 */
export function resolveLlmCredentials(opts?: ResolveOpts): LlmCredentials {
  const creds = tryResolveLlmCredentials(opts)
  if (creds) return creds
  printMissingHint()
  process.exit(1)
}

/**
 * 确保拿到一套 LLM 凭据，按如下顺序：
 *   1. 加载 cwd/.env（不覆盖已显式 export 的环境变量）
 *   2. 静默解析环境变量，命中即返回
 *   3. 未命中且 TTY → 交互式向导，结果持久化到 cwd/.env 并写入 process.env
 *   4. 非 TTY → 打印缺失提示并 exit(1)
 */
export async function ensureLlmCredentials(opts?: ResolveOpts): Promise<LlmCredentials> {
  const envPath = join(process.cwd(), '.env')
  loadEnvFile(envPath)

  const existing = tryResolveLlmCredentials(opts)
  if (existing) return existing

  if (!process.stdin.isTTY) {
    printMissingHint()
    process.exit(1)
  }

  // 交互式向导（动态导入，避免无谓加载 readline/cloudbase）
  const { interactiveSetup } = await import('./credential-setup.js')
  const creds = await interactiveSetup({ defaultModel: opts?.defaultModel })

  // 持久化到 cwd/.env 并注入当前进程
  upsertEnvVars(envPath, {
    [ENV.BASE_URL]: creds.baseUrl,
    [ENV.API_KEY]: creds.apiKey,
    [ENV.MODEL]: creds.model,
  })
  process.env[ENV.BASE_URL] = creds.baseUrl
  process.env[ENV.API_KEY] = creds.apiKey
  process.env[ENV.MODEL] = creds.model
  ok(`已保存凭据到 ${envPath}`)
  log('  （含明文密钥，请注意保管，建议加入 .gitignore）')

  // 应用 --model 覆盖
  const model = opts?.modelOverride || creds.model
  return { ...creds, model }
}
