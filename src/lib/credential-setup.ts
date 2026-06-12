// ── 交互式凭据向导 ──
// gen/eval 在未配置 LLM 凭据时调用：让用户选 provider 并填必要信息，
// 返回一套统一的 OpenAI 兼容凭据（LlmCredentials）。
//
// provider：cloudbase / deepseek / glm / kimi / minimax / 自定义。
// - cloudbase：login → 选环境 → 选模型 → 选/新建 apikey → 拼网关凭据
// - 预设：内置 endpoint + 默认 model，只需填 key（model 可改）
// - 自定义：endpoint / key / model 全部手填
//
// 交互基于 enquirer + cli-table3：支持方向键选择、当前项高亮、模型表格展示。

import Enquirer from 'enquirer'
import Table from 'cli-table3'
import type { LlmCredentials } from './llm-credentials.js'
import { colors, log, warn, ok, title, kv } from './utils.js'
import {
  ensureLogin,
  listEnvs,
  listApiKeys,
  createApiKey,
  listModels,
  getApiKeyPlaintext,
  buildGatewayBaseUrl,
  type CloudbaseCredential,
  type CloudbaseModel,
} from './cloudbase.js'

// ── 预设 provider 表 ──

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

// ── prompt 封装 ──

interface PromptTextOptions {
  default?: string
  required?: boolean
  blankLineAfter?: boolean
}

interface PromptSelectOptions {
  choicesHeader?: string
  footer?: string
  initialIndex?: number
  blankLineAfter?: boolean
}

interface PromptChoice<T> {
  name: string
  message: string
  value: T
  hint?: string
  disabled?: boolean | string
}

const SELECT_FOOTER = colors.dim('↑↓ 选择 · Enter 确认')
const INPUT_FOOTER = colors.dim('Enter 确认')

const BORDERLESS_TABLE_CHARS = {
  top: '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  bottom: '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  left: '',
  'left-mid': '',
  mid: '',
  'mid-mid': '',
  right: '',
  'right-mid': '',
  middle: ' ',
} as const

function abortPrompt(): never {
  warn('已取消配置')
  process.exit(1)
}

function normalizeTextInput(input: string, opts?: PromptTextOptions): string {
  const value = input.trim()
  if (value) return value
  if (opts?.default !== undefined) return opts.default
  return ''
}

async function promptText(label: string, opts?: PromptTextOptions): Promise<string> {
  const answers = await Enquirer.prompt<{ value: string }>({
    type: 'input',
    name: 'value',
    message: label,
    initial: opts?.default,
    footer: INPUT_FOOTER,
    validate(input: string) {
      const value = normalizeTextInput(input, opts)
      if (value || !opts?.required) return true
      return '该项不能为空，请重新输入'
    },
    format(input: string) {
      return normalizeTextInput(input, opts)
    },
    result(input: string) {
      return normalizeTextInput(input, opts)
    },
    onCancel() {
      abortPrompt()
    },
  } as any)
  if (opts?.blankLineAfter) log('')
  return answers.value
}

/**
 * 单选：支持方向键、当前项高亮、Enter 确认。
 */
async function promptSelect<T>(
  promptTitle: string,
  items: T[],
  render: (item: T, index: number) => string,
  opts?: PromptSelectOptions,
): Promise<T> {
  const choices: PromptChoice<T>[] = items.map((item, index) => ({
    name: String(index),
    message: render(item, index),
    value: item,
  }))

  const getChoice = (name: string): PromptChoice<T> => {
    const choice = choices[Number(name)]
    if (!choice) abortPrompt()
    return choice
  }

  const answers = await Enquirer.prompt<{ value: T }>({
    type: 'select',
    name: 'value',
    message: promptTitle,
    choices,
    initial: Math.max(0, Math.min(opts?.initialIndex ?? 0, Math.max(items.length - 1, 0))),
    footer: opts?.footer ?? SELECT_FOOTER,
    choicesHeader: opts?.choicesHeader,
    format(name: string) {
      return getChoice(name).message
    },
    result(name: string) {
      return getChoice(name).value
    },
    onCancel() {
      abortPrompt()
    },
  } as any)

  if (opts?.blankLineAfter) log('')
  return answers.value
}

function renderBorderlessTable(head: string[], rows: string[][]): string[] {
  const table = new Table({
    head,
    chars: BORDERLESS_TABLE_CHARS,
    style: {
      'padding-left': 1,
      'padding-right': 1,
      head: [],
      border: [],
      compact: true,
    },
  })
  rows.forEach((row) => table.push(row))
  return table.toString().split('\n')
}

async function promptModelSelect(
  promptTitle: string,
  models: CloudbaseModel[],
  opts?: { blankLineAfter?: boolean },
): Promise<CloudbaseModel> {
  const lines = renderBorderlessTable(
    [colors.bold('模型'), colors.bold('提供商'), colors.bold('状态')],
    models.map((model) => [model.model, model.group, model.enabled ? colors.green('已开启') : colors.yellow('未开启')]),
  )

  const [header = '', ...rows] = lines
  return promptSelect(
    promptTitle,
    models,
    (model, index) => rows[index] ?? `${model.model}  ${model.group}  ${model.enabled ? '已开启' : '未开启'}`,
    { choicesHeader: colors.dim(header), blankLineAfter: opts?.blankLineAfter },
  )
}

// ── 主入口 ──

interface ProviderChoice {
  key: string
  label: string
}

/**
 * 交互式选出一套 LLM 凭据。
 * 仅应在 TTY 环境下调用（调用方负责判断 process.stdin.isTTY）。
 */
export async function interactiveSetup(opts?: { defaultModel?: string }): Promise<LlmCredentials> {
  const choices: ProviderChoice[] = [
    { key: 'cloudbase', label: 'CloudBase（云开发 AI 网关，自动获取密钥）' },
    ...PRESETS.map((p) => ({ key: p.key, label: p.label })),
    { key: 'custom', label: '自定义（手填 endpoint / key / model）' },
  ]

  const choice = await promptSelect('请选择 LLM 提供方：', choices, (c) => c.label, { blankLineAfter: true })

  if (choice.key === 'cloudbase') {
    return setupCloudbase(opts)
  }
  if (choice.key === 'custom') {
    return setupCustom()
  }
  const preset = PRESETS.find((p) => p.key === choice.key)!
  return setupPreset(preset)
}

/** 预设：固定 endpoint，填 key，model 可改 */
async function setupPreset(preset: Preset): Promise<LlmCredentials> {
  title(`配置 ${preset.label}`)
  kv('端点', preset.baseUrl)
  const apiKey = await promptText('请输入 API Key', { required: true, blankLineAfter: true })
  const model = await promptText('模型名', { default: preset.defaultModel })
  return { baseUrl: preset.baseUrl, apiKey, model }
}

/** 自定义：全部手填 */
async function setupCustom(): Promise<LlmCredentials> {
  title('自定义 OpenAI 兼容凭据')
  const baseUrl = await promptText('Base URL（如 https://api.openai.com/v1）', { required: true })
  const apiKey = await promptText('API Key', { required: true, blankLineAfter: true })
  const model = await promptText('模型名', { required: true })
  return { baseUrl, apiKey, model }
}

/** CloudBase：login → 选环境 → 选模型 → 选/新建 apikey → 拼网关凭据 */
async function setupCloudbase(opts?: { defaultModel?: string }): Promise<LlmCredentials> {
  log('')
  title('CloudBase 登录')
  const cred = ensureLogin()
  if (!cred) {
    warn('CloudBase 登录失败或未安装 cloudbase CLI')
    log('请先安装：npm install -g @cloudbase/cli，然后重试')
    process.exit(1)
  }
  ok('已登录 CloudBase')

  // 选环境
  const envs = listEnvs()
  if (envs.length === 0) {
    warn('未获取到任何 CloudBase 环境，请先在控制台创建环境')
    process.exit(1)
  }
  const env = await promptSelect(
    '请选择 CloudBase 环境：',
    envs,
    (e) => `${e.envId}${e.alias ? `（${e.alias}）` : ''}`,
    { blankLineAfter: true },
  )

  // 选模型
  title('正在拉取可用模型...')
  let models
  try {
    models = await listModels(cred, env.envId)
  } catch (err) {
    warn(`拉取模型失败: ${(err as Error).message}`)
    process.exit(1)
  }
  if (models.length === 0) {
    warn('该环境下没有可用的托管 AI 模型')
    process.exit(1)
  }

  // 已开启的排在前面，便于选择
  models.sort((a, b) => Number(b.enabled) - Number(a.enabled))

  // 循环直到选中一个「已开启」的模型；选到未开启的给出控制台引导后重选
  let model = await promptModelSelect('请选择模型：', models, { blankLineAfter: true })
  while (!model.enabled) {
    warn(`模型 ${model.group}/${model.model} 尚未在该环境开启`)
    log('  请先到 CloudBase 控制台开通该模型：')
    log(`  https://tcb.cloud.tencent.com/dev?envId=${env.envId}#/ai?tab=text-aiModel`)
    log('  开通后回到这里重新选择（或直接选择已开启的模型）。')
    model = await promptModelSelect('请重新选择模型：', models, { blankLineAfter: true })
  }

  // 选/新建 apikey
  const apiKey = await resolveCloudbaseApiKey(cred, env.envId)

  const baseUrl = buildGatewayBaseUrl(env.envId, model)
  const modelField = `${model.group}/${model.model}`
  ok(`已配置 CloudBase 网关：${modelField}`)
  return { baseUrl, apiKey, model: modelField }
}

/** 选已有 API Key（取明文）或新建一个 */
async function resolveCloudbaseApiKey(cred: CloudbaseCredential, envId: string): Promise<string> {
  const keys = listApiKeys(envId)

  type KeyChoice = { kind: 'existing'; keyId: string; name: string } | { kind: 'new' }
  const items: KeyChoice[] = [
    ...keys.map((k) => ({ kind: 'existing' as const, keyId: k.keyId, name: k.name })),
    { kind: 'new' as const },
  ]

  const picked = await promptSelect(
    '请选择 API Key：',
    items,
    (it) => (it.kind === 'new' ? '➕ 新建一个 API Key' : `${it.name || '(未命名)'} [${it.keyId}]`),
    { blankLineAfter: true },
  )

  if (picked.kind === 'existing') {
    title('正在获取密钥明文...')
    try {
      const plain = await getApiKeyPlaintext(cred, envId, picked.keyId)
      if (plain) {
        ok('已获取密钥')
        return plain
      }
      warn('获取密钥明文失败，改为新建一个')
    } catch (err) {
      warn(`获取密钥明文失败: ${(err as Error).message}，改为新建一个`)
    }
  }

  // 新建
  const name = await promptText('新 API Key 名称', { default: 'mp-skills' })
  const created = createApiKey(envId, name)
  if (!created) {
    warn('创建 API Key 失败')
    process.exit(1)
  }
  ok('已创建 API Key')
  return created
}
