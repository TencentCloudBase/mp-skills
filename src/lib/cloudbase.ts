// ── CloudBase 集成 ──
// 为交互式凭据向导的 cloudbase 分支提供：
//   - 命令行透传（resolveCloudbaseBin / runCloudbaseJson）
//   - 登录态读取与兜底重登（readAuthCredential / isLoginValid / ensureLogin）
//   - 腾讯云 OpenAPI 调用（@cloudbase/manager-node commonService）
//   - 环境/密钥列表、创建密钥（CLI 子进程）
//   - 模型清单、密钥明文（commonService OpenAPI）
//
// 已实测验证的事实见计划文档；这里只做工程化封装。

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import CloudBase from '@cloudbase/manager-node'

// ── cloudbase CLI 可执行文件 ──

/** 解析 cloudbase 命令：优先全局，回退本包 node_modules/.bin */
export function resolveCloudbaseBin(): string | null {
  const probe = spawnSync('which', ['cloudbase'], { encoding: 'utf8' })
  if (probe.status === 0 && probe.stdout.trim()) {
    return 'cloudbase'
  }
  // dist/lib/ → dist/ → 包根目录
  const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const local = resolve(pkgRoot, 'node_modules/.bin/cloudbase')
  if (existsSync(local)) return local
  return null
}

/**
 * 调用 cloudbase CLI 并解析其 `--json` 输出。
 * CLI 在 JSON 前可能打印 `- Loading data...` 等噪声，需剥离到首个 `{`。
 * 失败返回 null。
 */
export function runCloudbaseJson(args: string[]): any | null {
  const bin = resolveCloudbaseBin()
  if (!bin) return null
  const result = spawnSync(bin, args, { encoding: 'utf8' })
  if (result.status !== 0) return null
  const out = result.stdout || ''
  const start = out.indexOf('{')
  if (start < 0) return null
  try {
    return JSON.parse(out.slice(start))
  } catch {
    return null
  }
}

// ── 登录态 ──

export interface CloudbaseCredential {
  tmpSecretId: string
  tmpSecretKey: string
  tmpToken: string
  tmpExpired: number
}

/** 读取 ~/.config/.cloudbase/auth.json 中的临时凭据 */
export function readAuthCredential(): CloudbaseCredential | null {
  const authPath = join(homedir(), '.config', '.cloudbase', 'auth.json')
  if (!existsSync(authPath)) return null
  try {
    const auth = JSON.parse(readFileSync(authPath, 'utf8'))
    const c = auth?.credential
    if (c?.tmpSecretId && c?.tmpSecretKey && c?.tmpToken) {
      return {
        tmpSecretId: c.tmpSecretId,
        tmpSecretKey: c.tmpSecretKey,
        tmpToken: c.tmpToken,
        tmpExpired: Number(c.tmpExpired) || 0,
      }
    }
  } catch {
    // ignore
  }
  return null
}

/** 登录态是否有效（存在且未过期，留 60s 余量） */
export function isLoginValid(): boolean {
  const c = readAuthCredential()
  if (!c) return false
  // tmpExpired 在 auth.json 中是毫秒级时间戳（如 1781183796000），
  // 归一到秒后再比较，留 60s 余量。
  const expiredSec = c.tmpExpired > 1e12 ? Math.floor(c.tmpExpired / 1000) : c.tmpExpired
  const nowSec = Math.floor(Date.now() / 1000)
  return expiredSec - 60 > nowSec
}

/**
 * 确保已登录：无效则交互式 `cloudbase login`（继承 stdio）。
 * 返回最终的有效凭据，失败返回 null。
 */
export function ensureLogin(): CloudbaseCredential | null {
  if (isLoginValid()) return readAuthCredential()

  const bin = resolveCloudbaseBin()
  if (!bin) return null

  const result = spawnSync(bin, ['login'], { stdio: 'inherit' })
  if (result.status !== null && result.status !== 0) return null

  return isLoginValid() ? readAuthCredential() : null
}

// ── manager-node OpenAPI 封装 ──

/**
 * 用临时凭据初始化 manager-node 实例。
 * 注意：CLI 子进程（如 listEnvs）可能刷新 auth.json 中的临时 token，
 * 故每次调用前重新读取最新凭据，避免用到已失效的旧 token。
 */
function makeApp(cred: CloudbaseCredential, envId: string): CloudBase {
  const fresh = readAuthCredential() || cred
  return CloudBase.init({
    secretId: fresh.tmpSecretId,
    secretKey: fresh.tmpSecretKey,
    token: fresh.tmpToken,
    envId,
    region: 'ap-shanghai',
  })
}

// ── 环境 / 密钥（CLI 子进程） ──

export interface CloudbaseEnv {
  envId: string
  alias?: string
}

/** 列出 CloudBase 环境 */
export function listEnvs(): CloudbaseEnv[] {
  const json = runCloudbaseJson(['env', 'list', '--json'])
  const data = json?.data
  if (!Array.isArray(data)) return []
  return data.filter((e: any) => e?.envId).map((e: any) => ({ envId: e.envId, alias: e.alias || e.Alias }))
}

export interface CloudbaseApiKey {
  keyId: string
  name: string
  /** 列表接口返回的是掩码值（eyJhbG******） */
  maskedKey?: string
}

/** 列出某环境下的 API Key（明文需另用 getApiKeyPlaintext 取） */
export function listApiKeys(envId: string): CloudbaseApiKey[] {
  const json = runCloudbaseJson(['env', 'apikey', 'list', '-e', envId, '--json'])
  const list = json?.data?.Data
  if (!Array.isArray(list)) return []
  return list
    .filter((k: any) => k?.KeyId)
    .map((k: any) => ({ keyId: k.KeyId, name: k.Name || '', maskedKey: k.ApiKey }))
}

/**
 * 新建一个 publish_key，返回明文 ApiKey（仅创建时返回）。
 * 失败返回 null。
 */
export function createApiKey(envId: string, name: string): string | null {
  const json = runCloudbaseJson(['env', 'apikey', 'create', name, '-e', envId, '--type', 'publish_key', '--json'])
  const apiKey = json?.data?.ApiKey || json?.ApiKey
  return typeof apiKey === 'string' && apiKey ? apiKey : null
}

// ── 模型清单 / 密钥明文（commonService OpenAPI） ──

export interface CloudbaseModel {
  /** 模型分组名，如 cloudbase / deepseek */
  group: string
  /** 模型名，如 deepseek-v3.2 */
  model: string
  /** 是否已在该环境开启（未开启需去控制台开通） */
  enabled: boolean
}

/**
 * 拉取某环境**已开启**的模型集合：`{group}/{model}` 形式。
 * 来源 DescribeAIModels（区别于 DescribeManagedAIModelList 的全量目录）——
 * 其返回的各分组 Models[] 即该环境已开通的模型。
 */
async function fetchEnabledModelSet(cred: CloudbaseCredential, envId: string): Promise<Set<string>> {
  const res = await makeApp(cred, envId)
    .commonService('tcb', '2018-06-08')
    .call({ Action: 'DescribeAIModels', Param: { EnvId: envId } })
  const groups = res?.AIModels
  const set = new Set<string>()
  if (!Array.isArray(groups)) return set
  for (const g of groups) {
    const group = g?.GroupName
    const models = g?.Models
    if (!group || !Array.isArray(models)) continue
    for (const m of models) {
      if (m?.Model) set.add(`${group}/${m.Model}`)
    }
  }
  return set
}

/**
 * 拉取某环境的全量模型目录，并标注每个模型是否已开启。
 */
export async function listModels(cred: CloudbaseCredential, envId: string): Promise<CloudbaseModel[]> {
  const enabledSet = await fetchEnabledModelSet(cred, envId)
  const res = await makeApp(cred, envId)
    .commonService('tcb', '2018-06-08')
    .call({ Action: 'DescribeManagedAIModelList', Param: { EnvId: envId } })
  const groups = res?.ManagedAIModelList
  if (!Array.isArray(groups)) return []
  const out: CloudbaseModel[] = []
  for (const g of groups) {
    const group = g?.GroupName
    const models = g?.Models
    if (!group || !Array.isArray(models)) continue
    for (const m of models) {
      if (m?.Model) {
        out.push({ group, model: m.Model, enabled: enabledSet.has(`${group}/${m.Model}`) })
      }
    }
  }
  return out
}

/** 取某个已有 API Key 的明文 */
export async function getApiKeyPlaintext(
  cred: CloudbaseCredential,
  envId: string,
  keyId: string,
): Promise<string | null> {
  const res = await makeApp(cred, envId)
    .commonService('lowcode', '2021-01-08')
    .call({ Action: 'DescribeApiKeyTokens', Param: { EnvId: envId, KeyIdList: [keyId] } })
  const data = res?.Data
  if (Array.isArray(data) && data[0]?.ApiKey) return data[0].ApiKey
  return null
}

/** 组装 CloudBase AI 网关的 OpenAI 兼容 baseURL */
export function buildGatewayBaseUrl(envId: string, model: CloudbaseModel): string {
  return `https://${envId}.api.tcloudbasegateway.com/v1/ai/${model.group}`
}
