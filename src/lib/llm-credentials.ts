// ── 统一 LLM 凭据解析 ──
// gen（opencode）与 eval（wxa-skills-eval）都基于 OpenAI 兼容协议。
// 为支持 BYOK，CLI 只要求用户填一套 OpenAI 凭据：
//   OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL
// 同时保留回退：ANTHROPIC_* 与 CLOUDBASE_*（均按 OpenAI 兼容端点对待）。

import { join } from 'node:path'
import { warn, log, ok } from './utils.js'
import { loadEnvFile, upsertEnvVars } from './env-file.js'

export interface LlmCredentials {
  /** OpenAI 兼容 BaseURL，已规范化为以 /v1 结尾（不含尾部斜杠） */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** 模型名 */
  model: string
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
 * 优先级：
 *   1. OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL
 *   2. ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY / ANTHROPIC_MODEL
 *   3. CLOUDBASE_AI_ENDPOINT / CLOUDBASE_API_KEY / CLOUDBASE_AI_MODEL
 */
export function tryResolveLlmCredentials(opts?: ResolveOpts): LlmCredentials | null {
  const modelOverride = opts?.modelOverride
  const defaultModel = opts?.defaultModel || 'gpt-4o'

  // 1. OpenAI（首选）
  const openaiKey = process.env.OPENAI_API_KEY
  const openaiBase = process.env.OPENAI_BASE_URL
  if (openaiKey && openaiBase) {
    return {
      baseUrl: normalizeOpenAiBaseUrl(openaiBase),
      apiKey: openaiKey,
      model: modelOverride || process.env.OPENAI_MODEL || defaultModel,
    }
  }

  // 2. Anthropic 回退（CloudBase 网关同时暴露 Anthropic 协议，端点换回 /v1 即可）
  const anthropicKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY
  const anthropicBase = process.env.ANTHROPIC_BASE_URL
  if (anthropicKey && anthropicBase) {
    return {
      baseUrl: normalizeOpenAiBaseUrl(anthropicBase),
      apiKey: anthropicKey,
      model: modelOverride || process.env.ANTHROPIC_MODEL || defaultModel,
    }
  }

  // 3. CloudBase 回退
  const cbKey = process.env.CLOUDBASE_API_KEY
  const cbBase = process.env.CLOUDBASE_AI_ENDPOINT
  if (cbKey && cbBase) {
    return {
      baseUrl: normalizeOpenAiBaseUrl(cbBase),
      apiKey: cbKey,
      model: modelOverride || process.env.CLOUDBASE_AI_MODEL || defaultModel,
    }
  }

  return null
}

/** 打印缺失凭据的环境变量提示 */
function printMissingHint(): void {
  warn('未找到 LLM 凭据')
  log('请配置一套 OpenAI 兼容凭据（推荐）：')
  log('  export OPENAI_BASE_URL=<https://your-endpoint/v1>')
  log('  export OPENAI_API_KEY=<your-key>')
  log('  export OPENAI_MODEL=<model-name>')
  log('')
  log('或使用以下任一回退方案：')
  log('  ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN [+ ANTHROPIC_MODEL]')
  log('  CLOUDBASE_AI_ENDPOINT + CLOUDBASE_API_KEY [+ CLOUDBASE_AI_MODEL]')
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
    OPENAI_BASE_URL: creds.baseUrl,
    OPENAI_API_KEY: creds.apiKey,
    OPENAI_MODEL: creds.model,
  })
  process.env.OPENAI_BASE_URL = creds.baseUrl
  process.env.OPENAI_API_KEY = creds.apiKey
  process.env.OPENAI_MODEL = creds.model
  ok(`已保存凭据到 ${envPath}`)
  log('  （含明文密钥，请注意保管，建议加入 .gitignore）')

  // 应用 --model 覆盖
  const model = opts?.modelOverride || creds.model
  return { ...creds, model }
}
