// src/lib/ai-generate.ts
// ── AI 辅助生成 Skill 的流程库 ──
// 由 src/commands/create.ts 在 --ai 模式下调用。
// 不解析 CLI 参数：调用方需把 projectPath / miniprogramRoot / outputPath / 可选 name 算好后传入。
//
// 鉴权：BYOK——OpenAI 兼容凭据（OPENAI_BASE_URL / _API_KEY / _MODEL）。

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { colors, kv, log, title, warn } from './utils.js'
import { ensureLlmCredentials, applyProviderPreset, type LlmCredentials } from './llm-credentials.js'
import { ensureSkill, globalSkillsRoot } from './skill-installer.js'
import {
  resolveOpencodeBin,
  buildOpencodeConfig,
  opencodeModelArg,
  runOpencode,
  runOpencodeInteractive,
} from './opencode.js'

const GENERATE_SKILL_NAME = 'wxa-skills-generate'
const VALIDATE_SKILL_NAME = 'wxa-skills-validate'

export interface RunAiGenerateArgs {
  /** 小程序项目根（绝对路径，已校验存在 project.config.json + app.json）。 */
  projectPath: string
  /** 已解析的小程序源码根（含 app.json 的目录，绝对路径）。 */
  miniprogramRoot: string
  /**
   * agent 工作目录（绝对路径）。语义由调用方根据是否传入 name 决定：
   *   - 给了 name → `<mp>/skills/<name>/`，agent 直接在此写 Skill 文件，不再建子目录
   *   - 没给 name → `<mp>/skills/`，agent 自决子目录名
   */
  outputPath: string
  /** 可选 skill 名。仅作 system prompt / initial message 的 hint；outputPath 须由调用方根据是否传入 name 预先计算。 */
  name?: string
  /** 可选 CloudBase 环境 ID，存在时透传到子进程的 `CLOUDBASE_ENV_ID`。 */
  env?: string
  /** 可选业务场景描述，附加到 system prompt 的 `# 业务场景` 段。 */
  scenario?: string
  /** 可选 LLM 提供方预设（deepseek / glm / kimi / minimax 等），用于预填 baseUrl 与默认 model。 */
  provider?: string
  /** 可选模型名，覆盖 provider 预设与 OPENAI_MODEL；最终模型由 ensureLlmCredentials 解析。 */
  model?: string
  /** 可选本轮诉求；存在时直接作为 initial message 的任务文本，否则回落到默认探索 / 生成话术。 */
  query?: string
  /** 是否走 opencode `run` 一次性模式；不传则进入交互式 TUI（用户可 Ctrl+C 退出）。 */
  nonInteractive?: boolean
}

export async function runAiGenerate(args: RunAiGenerateArgs): Promise<void> {
  const { projectPath, miniprogramRoot, outputPath, name, env, scenario, provider, model, query, nonInteractive } =
    args

  // 入参契约：路径必须绝对 + miniprogramRoot 必须含 app.json。
  // 这些条件由调用方（create.ts）保证；这里做最后一道防线，配置错误时立即失败而非生成假产物。
  if (!isAbsolute(projectPath)) {
    throw new Error(`projectPath 必须是绝对路径：${projectPath}`)
  }
  if (!isAbsolute(miniprogramRoot)) {
    throw new Error(`miniprogramRoot 必须是绝对路径：${miniprogramRoot}`)
  }
  if (!isAbsolute(outputPath)) {
    throw new Error(`outputPath 必须是绝对路径：${outputPath}`)
  }
  if (!existsSync(join(miniprogramRoot, 'app.json'))) {
    throw new Error(`miniprogramRoot 不含 app.json：${miniprogramRoot}`)
  }

  // 若指定了 provider，将对应预设的 baseUrl / defaultModel 注入 process.env；
  // model 显式参数优先级更高，最后覆盖。
  applyProviderPreset({ provider, model })

  // 统一凭据解析：先读环境变量/.env，缺失且交互式时弹出向导并持久化
  const creds = await ensureLlmCredentials({
    modelOverride: model,
    defaultModel: 'gpt-4o',
  })

  const opencodeBin = resolveOpencodeBin()
  if (!opencodeBin) {
    warn('未找到 opencode 命令')
    log('请安装后重试：')
    log('  npm install -g opencode-ai')
    process.exit(1)
  }

  const genSkillDir = await ensureSkill({
    skillName: GENERATE_SKILL_NAME,
    verifySubpath: 'SKILL.md',
    extraSearchBases: [process.cwd(), projectPath],
    spinnerEnabled: !nonInteractive,
  })
  if (!genSkillDir) {
    warn(`无法获取 ${GENERATE_SKILL_NAME}`)
    log('请检查网络，或手动安装：')
    log(`  npx mp-skills add wechat-miniprogram/ai-mode-skills --skill ${GENERATE_SKILL_NAME}`)
    process.exit(1)
  }

  const validateSkillDir = await ensureSkill({
    skillName: VALIDATE_SKILL_NAME,
    verifySubpath: 'SKILL.md',
    extraSearchBases: [process.cwd(), projectPath],
    spinnerEnabled: !nonInteractive,
  })
  if (!validateSkillDir) {
    warn(`无法获取 ${VALIDATE_SKILL_NAME}`)
    log('请检查网络，或手动安装：')
    log(`  npx mp-skills add wechat-miniprogram/ai-mode-skills --skill ${VALIDATE_SKILL_NAME}`)
    process.exit(1)
  }

  mkdirSync(outputPath, { recursive: true })

  // 仅采集事实：outputPath 下已存在哪些 Skill 产物。
  // 仅当未指定 name（即 outputPath = <mp>/skills/）时扫描子目录；指定 name 时 outputPath 本身即 skill 目录。
  const existingSkills = name ? [] : listExistingSkills(outputPath)

  const systemPrompt = buildSystemPrompt({
    projectPath,
    miniprogramRoot,
    outputPath,
    scenario,
    name,
    generateSkillName: GENERATE_SKILL_NAME,
    validateSkillName: VALIDATE_SKILL_NAME,
  })

  const initialMessage = buildInitialMessage({ query, name, existingSkills })

  const configContent = buildOpencodeConfig(creds, {
    skillPaths: [globalSkillsRoot()],
    systemPrompt,
  })

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCODE_CONFIG_CONTENT: configContent,
  }
  if (env) {
    childEnv.CLOUDBASE_ENV_ID = env
  }

  title(existingSkills.length > 0 ? '🤖 启动 Skill agent（输出目录已有产物）...' : '🤖 启动 Skill 生成 agent...')
  kv('项目源码', projectPath)
  kv('输出目录', outputPath)
  if (name) kv('Skill 名', name)
  if (existingSkills.length > 0) kv('已有 Skill', existingSkills.join(', '))
  if (query) kv('本轮诉求', query)
  if (env) kv('TCB 环境', env)
  if (provider) kv('Provider', provider)
  kv('模型', creds.model)
  kv('端点', creds.baseUrl)
  kv('模式', nonInteractive ? 'non-interactive（一次性）' : 'interactive（多轮，Ctrl+C 退出）')
  log('')

  if (nonInteractive) {
    await runNonInteractive(opencodeBin, outputPath, creds, childEnv, initialMessage)
    return
  }

  await runInteractive(opencodeBin, outputPath, creds, childEnv, initialMessage)
}

async function runInteractive(
  bin: string,
  outputPath: string,
  creds: LlmCredentials,
  env: NodeJS.ProcessEnv,
  initialMessage: string,
): Promise<void> {
  const args = [
    outputPath,
    '--model',
    opencodeModelArg(creds),
    '--prompt',
    initialMessage,
  ]

  const exitCode = await runOpencodeInteractive(bin, args, env)
  log('')
  title('已退出生成会话')
  kv('输出目录', outputPath)
  log(colors.dim('  产物已写入上述目录，可继续用 mp-skills validate / eval 检查'))
  if (exitCode !== 0) {
    log(colors.dim(`  （opencode 退出码 ${exitCode}）`))
  }
}

async function runNonInteractive(
  bin: string,
  outputPath: string,
  creds: LlmCredentials,
  env: NodeJS.ProcessEnv,
  initialMessage: string,
): Promise<void> {
  const args = [
    'run',
    initialMessage,
    '--model',
    opencodeModelArg(creds),
    '--dir',
    outputPath,
    '--format',
    'json',
    '--dangerously-skip-permissions',
    '--print-logs',
  ]

  const exitCode = await runOpencode(bin, args, env)
  if (exitCode !== 0) {
    warn(`opencode 执行失败（退出码 ${exitCode}）`)
    process.exit(exitCode || 1)
  }

  title('[OK] Skill 生成完成')
  kv('输出目录', outputPath)
}

function listExistingSkills(outputPath: string): string[] {
  if (!existsSync(outputPath)) return []
  try {
    return readdirSync(outputPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(outputPath, d.name, 'SKILL.md')))
      .map((d) => d.name)
  } catch {
    return []
  }
}

function buildInitialMessage(args: { query?: string; name?: string; existingSkills: string[] }): string {
  const { query, name, existingSkills } = args

  const stateLine =
    existingSkills.length > 0
      ? `\n\n（输出目录已存在 Skill 产物：${existingSkills.map((s) => `\`${s}\``).join('、')}）`
      : ''

  let task: string
  if (query) {
    task = query
  } else if (name) {
    task = `请探索当前小程序项目，根据其已有代码生成名为 \`${name}\` 的 Skill，并用 wxa-skills-validate 校验通过。`
  } else {
    task = '请探索当前小程序项目，根据其已有代码生成符合规范的 Skill，并用 wxa-skills-validate 校验通过。'
  }

  return `${task}${stateLine}`
}

function buildSystemPrompt(args: {
  projectPath: string
  miniprogramRoot: string
  outputPath: string
  scenario?: string
  name?: string
  generateSkillName: string
  validateSkillName: string
}): string {
  const { projectPath, miniprogramRoot, outputPath, scenario, name, generateSkillName, validateSkillName } = args

  const scenarioSection = scenario
    ? `
# 业务场景
${scenario}
`
    : ''

  // 工作目录语义：给了 name 时 outputPath 本身即 skill 目录；否则 agent 自建子目录。
  const workspaceLines = name
    ? `- 工作目录即 Skill 目录（绝对路径）：\`${outputPath}\`
- **直接在工作目录下写入 Skill 文件**（mcp.json / SKILL.md / index.js / apis/ / components/ 等），**不要**再建子目录。
- 写文件用相对工作目录的相对路径（如 \`SKILL.md\`、\`apis/searchItems.js\`）。
- 当前目标 Skill 名称：\`${name}\`。`
    : `- 工作目录即输出目录：\`${outputPath}\`
- 在工作目录下创建 \`<skill-name>/\` 子目录，写入 mcp.json / SKILL.md / index.js / apis/ / components/ 等。
- 写文件用相对工作目录的相对路径（如 \`drink-skill/SKILL.md\`）。`

  return `你是微信小程序 Coding Agent，分析已有小程序项目，依据 \`${generateSkillName}\` 的规范，产出对应的小程序 Skill 分包、开发新 Skill 和 维护已有 Skill。在 Skill 更新完成前**必须**经过 \`${validateSkillName}\` 校验；校验失败则按报错修复并重新校验，直到通过为止。

<skills>
- \`${generateSkillName}\`：Skill 生成工作流规范，指导如何分析项目并产出 Skill。
- \`${validateSkillName}\`：Skill 静态校验与修复规范，用于校验产物并定位错误。
在动手前，先阅读 \`${generateSkillName}\` 的 SKILL.md 了解推荐工作流；遇到不确定的产物结构时再查阅它。
</skills>

<workspace-info>
- 小程序项目根（绝对路径）：\`${projectPath}\`
- 小程序源码根（含 app.json，绝对路径）：\`${miniprogramRoot}\`
  - 入口配置：\`${miniprogramRoot}/app.json\`
  - 页面目录：\`${miniprogramRoot}/pages/\`
${workspaceLines}
</workspace-info>

${scenarioSection}

<system-reminder>
# 边界与约束
1. 不固定步骤，但目标固定：产物必须能通过 \`${validateSkillName}\` 的校验。
2. 生成后主动调用 \`${validateSkillName}\` 校验；若失败，按报错修复并重新校验，直到通过。
3. 优先在已有产物上增量修改，不要每轮推倒重来。
4. 不要编造输入项目中不存在的页面、接口或字段；信息不足时基于源码中可确认的内容做最合理推断，并在产物中说明假设。
5. 关键节点用简洁文字向用户汇报进展（生成了哪个 Skill、有哪些原子接口、校验结果）。
6. \`index.js\` 需要 createSkill 并注册 API, registerAPI 需要保证 handler 为函数。
7. 产物生成并通过静态校验后即视为完成，**不要**提示用户手动验证（如 \`cli auto\`、\`execute\`、\`render\` 等命令）。
   \`\`\`js
   // apis/searchItems.js — 定义：export named async function
   async function searchItems(params) { ... }
   module.exports = searchItems

   // index.js — 注册：createSkill + 解构导入 + 传函数自身
   const searchItems = require('./apis/searchItems')
   const skill = wx.modelContext.createSkill('skills/{name}')
   skill.registerAPI('searchItems', searchItems)
   \`\`\`
</system-reminder>`
}
