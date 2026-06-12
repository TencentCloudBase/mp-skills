// ── gen 命令 ──
// 把 gen 做成一个「面向 Skill 生成任务的 opencode 代理」：
//   - 直接覆盖 opencode 主 agent（build）的 system prompt，预置目标 / 边界（不固定步骤）
//   - 注册 wxa-skills-generate + wxa-skills-validate 两个官方 skill 给 opencode
//   - 默认进入交互式 TUI，模型自主多轮「读项目 → 生成 → 校验 → 修复」
//     用户随时 Ctrl+C 退出
//   - --non-interactive 走 run 模式一次性跑完（脚本 / CI 兜底）
//
// 鉴权：统一 BYOK——只需一套 OpenAI 兼容凭据（OPENAI_BASE_URL/_API_KEY/_MODEL）。

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { colors, kv, log, title, warn, resolveMiniprogramRoot } from '../lib/utils.js'
import { trackCommand } from '../lib/telemetry.js'
import { ensureLlmCredentials, applyProviderPreset, type LlmCredentials } from '../lib/llm-credentials.js'
import { ensureSkill, globalSkillsRoot } from '../lib/skill-installer.js'
import {
  resolveOpencodeBin,
  buildOpencodeConfig,
  opencodeModelArg,
  runOpencode,
  runOpencodeInteractive,
} from '../lib/opencode.js'

const GENERATE_SKILL_NAME = 'wxa-skills-generate'
const VALIDATE_SKILL_NAME = 'wxa-skills-validate'

interface GenOptions {
  env: string
  output?: string
  scenario?: string
  provider?: string
  model?: string
  query?: string
  nonInteractive?: boolean
}

export async function genCommand(projectDir: string, opts: GenOptions): Promise<void> {
  await trackCommand({ command: 'gen' })

  const projectPath = resolve(projectDir)

  if (!existsSync(projectPath)) {
    warn(`项目目录不存在: ${projectPath}`)
    process.exit(1)
  }

  // 兼容两种布局：app.json 在 miniprogram/ 子目录，或直接在项目根，
  // 以及通过 project.config.json 的 miniprogramRoot 指定的目录。
  const miniprogramRoot = resolveMiniprogramRoot(projectPath)
  if (!miniprogramRoot) {
    warn('当前目录不是小程序项目（未找到 app.json）')
    log('请提供包含 app.json 的小程序项目路径（支持源码在根目录或 miniprogram/ 子目录）')
    process.exit(1)
  }

  // --output 默认使用小程序的 miniprogram root，产物直接写入项目源码目录
  const outputPath = resolve(opts.output ?? miniprogramRoot)

  // 若指定了 --provider，将对应预设的 baseUrl / defaultModel 注入 process.env；
  // --model 显式参数优先级更高，最后覆盖。
  applyProviderPreset({ provider: opts.provider, model: opts.model })

  // 统一凭据解析：先读环境变量/.env，缺失且交互式时弹出向导并持久化
  const creds = await ensureLlmCredentials({
    modelOverride: opts.model,
    defaultModel: 'gpt-4o',
  })

  // 解析 opencode 可执行文件
  const opencodeBin = resolveOpencodeBin()
  if (!opencodeBin) {
    warn('未找到 opencode 命令')
    log('请安装后重试：')
    log('  npm install -g opencode-ai')
    process.exit(1)
  }

  // 确保两个官方 skill 就位（按需下载到 ~/.mp-skills/skills），并注册给 opencode
  const genSkillDir = await ensureSkill({
    skillName: GENERATE_SKILL_NAME,
    verifySubpath: 'SKILL.md',
    extraSearchBases: [process.cwd(), projectPath],
    spinnerEnabled: !opts.nonInteractive,
  })
  if (!genSkillDir) {
    warn(`无法获取 ${GENERATE_SKILL_NAME}`)
    log('请检查网络，或手动安装：')
    log(`  mp-skills add wechat-miniprogram/ai-mode-skills --skill ${GENERATE_SKILL_NAME}`)
    process.exit(1)
  }

  const validateSkillDir = await ensureSkill({
    skillName: VALIDATE_SKILL_NAME,
    verifySubpath: 'SKILL.md',
    extraSearchBases: [process.cwd(), projectPath],
    spinnerEnabled: !opts.nonInteractive,
  })
  if (!validateSkillDir) {
    warn(`无法获取 ${VALIDATE_SKILL_NAME}`)
    log('请检查网络，或手动安装：')
    log(`  mp-skills add wechat-miniprogram/ai-mode-skills --skill ${VALIDATE_SKILL_NAME}`)
    process.exit(1)
  }

  // 准备输出目录（agent 的工作目录）
  mkdirSync(outputPath, { recursive: true })

  // 仅采集「事实」：输出目录里已存在哪些 Skill 产物。
  // 不在 JS 里硬判定「生成 / 修改」——把事实 + 用户 -q 诉求一起交给 agent，
  // 由它结合上下文自行判断本轮是「全新生成」「在已有产物上修改」还是「新增一个 Skill」。
  const existingSkills = listExistingSkills(outputPath)

  const systemPrompt = buildSystemPrompt({
    projectPath,
    miniprogramRoot,
    outputPath,
    scenario: opts.scenario,
    generateSkillName: GENERATE_SKILL_NAME,
    validateSkillName: VALIDATE_SKILL_NAME,
    existingSkills,
  })

  // 初始任务消息：陈述事实（已有产物、用户诉求），让 agent 自行判定意图后推进。
  const initialMessage = buildInitialMessage({ query: opts.query, existingSkills })

  // 注入：BYOK provider + skills.paths（发现两个官方 skill）+ 主 agent system prompt
  const configContent = buildOpencodeConfig(creds, {
    skillPaths: [globalSkillsRoot()],
    systemPrompt,
  })

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCODE_CONFIG_CONTENT: configContent,
  }
  // 仅在显式提供 --env 时透传（BYOK 下非必需）
  if (opts.env) {
    childEnv.CLOUDBASE_ENV_ID = opts.env
  }

  title(existingSkills.length > 0 ? '🤖 启动 Skill agent（输出目录已有产物）...' : '🤖 启动 Skill 生成 agent...')
  kv('项目源码', projectPath)
  kv('输出目录', outputPath)
  if (existingSkills.length > 0) kv('已有 Skill', existingSkills.join(', '))
  if (opts.query) kv('本轮诉求', opts.query)
  if (opts.env) kv('TCB 环境', opts.env)
  if (opts.provider) kv('Provider', opts.provider)
  kv('模型', creds.model)
  kv('端点', creds.baseUrl)
  kv('模式', opts.nonInteractive ? 'non-interactive（一次性）' : 'interactive（多轮，Ctrl+C 退出）')
  log('')

  if (opts.nonInteractive) {
    await runNonInteractive(opencodeBin, outputPath, creds, childEnv, initialMessage)
    return
  }

  await runInteractive(opencodeBin, outputPath, creds, childEnv, initialMessage)
}

/**
 * 交互式模式：进入 opencode TUI，预置初始任务消息。
 * agent 在 TUI 内自主多轮推进，用户可继续追问或随时 Ctrl+C 退出。
 */
async function runInteractive(
  bin: string,
  outputPath: string,
  creds: LlmCredentials,
  env: NodeJS.ProcessEnv,
  initialMessage: string,
): Promise<void> {
  const args = [
    outputPath, // TUI 工作目录（positional [project]）
    '--model',
    opencodeModelArg(creds),
    '--prompt',
    initialMessage,
  ]

  const exitCode = await runOpencodeInteractive(bin, args, env)
  // TUI 退出（含用户 Ctrl+C）属正常结束，不当作失败
  log('')
  title('已退出生成会话')
  kv('输出目录', outputPath)
  log(colors.dim('  产物已写入上述目录，可继续用 mp-skills validate / eval 检查'))
  if (exitCode !== 0) {
    log(colors.dim(`  （opencode 退出码 ${exitCode}）`))
  }
}

/**
 * 非交互模式：run 一次性跑完，捕获 NDJSON 事件流打印精简进度。
 * 适合脚本 / CI。
 */
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

  title('✅ Skill 生成完成')
  kv('输出目录', outputPath)
}

// 列出输出目录下已存在的 Skill 子目录（含 SKILL.md 的视为一个 Skill 产物）。
// 仅作为「事实」交给 agent，由 agent 自行判定本轮是生成还是修改。
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

// 构建进入会话时的初始任务消息。
// 简单规则：
//   - 有 -q：直接用用户的诉求作为本轮目标（具体怎么做交给 system prompt 的工作流）。
//   - 无 -q：默认探索当前小程序项目，根据已有代码生成 Skill。
// 输出目录现状（已有哪些产物）作为事实附在末尾，供 agent 判断是生成还是修改。
function buildInitialMessage(args: { query?: string; existingSkills: string[] }): string {
  const { query, existingSkills } = args

  const stateLine =
    existingSkills.length > 0
      ? `\n\n（输出目录已存在 Skill 产物：${existingSkills.map((s) => `\`${s}\``).join('、')}）`
      : ''

  const task = query
    ? query
    : '请探索当前小程序项目，根据其已有代码生成符合规范的 Skill，并用 wxa-skills-validate 校验通过。'

  return `${task}${stateLine}`
}

/**
 * 构建注入给主 agent（build）的 system prompt。
 * 只规定「目标 / 边界 / 可用能力」，不规定固定步骤——让模型借助
 * wxa-skills-generate / wxa-skills-validate 两个 skill 自主决定工作流。
 */
function buildSystemPrompt(args: {
  projectPath: string
  miniprogramRoot: string
  outputPath: string
  scenario?: string
  generateSkillName: string
  validateSkillName: string
  existingSkills: string[]
}): string {
  const { projectPath, miniprogramRoot, outputPath, scenario, generateSkillName, validateSkillName, existingSkills } =
    args

  const scenarioSection = scenario
    ? `
# 业务场景
${scenario}
`
    : ''

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
- 工作目录即输出目录：\`${outputPath}\`
- 在工作目录下创建 \`<skill-name>/\` 子目录，写入 mcp.json / SKILL.md / index.js / apis/ / components/ 等。
- 写文件用相对工作目录的相对路径（如 \`drink-skill/SKILL.md\`）。
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
