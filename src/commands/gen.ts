// ── gen 命令 ──
// 把 gen 做成一个「面向 Skill 生成任务的 opencode 代理」：
//   - 预置 system 约束（目标 / 边界，不固定步骤流程）
//   - 注册 wxa-skills-generate + wxa-skills-validate 两个官方 skill 给 opencode
//   - 默认进入交互式 TUI，agent 自主多轮「读项目 → 生成 → 校验 → 修复」
//     用户随时 Ctrl+C 退出
//   - --non-interactive 走 run 模式一次性跑完（脚本 / CI 兜底）
//
// 鉴权：统一 BYOK——只需一套 OpenAI 兼容凭据（OPENAI_BASE_URL/_API_KEY/_MODEL）。

import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { colors, kv, log, title, warn, resolveMiniprogramRoot } from '../lib/utils.js'
import { trackCommand } from '../lib/telemetry.js'
import { ensureLlmCredentials, type LlmCredentials } from '../lib/llm-credentials.js'
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
const GEN_AGENT_NAME = 'mp-skills-gen'

interface GenOptions {
  env: string
  output: string
  scenario?: string
  model?: string
  nonInteractive?: boolean
}

export async function genCommand(projectDir: string, opts: GenOptions): Promise<void> {
  await trackCommand({ command: 'gen' })

  const projectPath = resolve(projectDir)
  const outputPath = resolve(opts.output)

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

  const systemPrompt = buildSystemPrompt({
    projectPath,
    miniprogramRoot,
    outputPath,
    scenario: opts.scenario,
    generateSkillName: GENERATE_SKILL_NAME,
    validateSkillName: VALIDATE_SKILL_NAME,
  })

  // 注入：BYOK provider + skills.paths（发现两个官方 skill）+ 自定义 agent（system 约束）
  const configContent = buildOpencodeConfig(creds, {
    skillPaths: [globalSkillsRoot()],
    agent: { name: GEN_AGENT_NAME, prompt: systemPrompt },
  })

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCODE_CONFIG_CONTENT: configContent,
  }
  // 仅在显式提供 --env 时透传（BYOK 下非必需）
  if (opts.env) {
    childEnv.CLOUDBASE_ENV_ID = opts.env
  }

  title('🤖 启动 Skill 生成 agent...')
  kv('项目源码', projectPath)
  kv('输出目录', outputPath)
  if (opts.env) kv('TCB 环境', opts.env)
  kv('模型', creds.model)
  kv('端点', creds.baseUrl)
  kv('模式', opts.nonInteractive ? 'non-interactive（一次性）' : 'interactive（多轮，Ctrl+C 退出）')
  log('')

  if (opts.nonInteractive) {
    await runNonInteractive(opencodeBin, outputPath, creds, childEnv)
    return
  }

  await runInteractive(opencodeBin, outputPath, creds, childEnv)
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
): Promise<void> {
  const args = [
    outputPath, // TUI 工作目录（positional [project]）
    '--agent',
    GEN_AGENT_NAME,
    '--model',
    opencodeModelArg(creds),
    '--prompt',
    INITIAL_TASK_MESSAGE,
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
): Promise<void> {
  const args = [
    'run',
    INITIAL_TASK_MESSAGE,
    '--agent',
    GEN_AGENT_NAME,
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

// 进入会话时的初始任务消息（具体「怎么做」由 system prompt + skill 指引，agent 自主决定）
const INITIAL_TASK_MESSAGE =
  '请开始：分析输入小程序项目，在输出目录生成符合 wx.modelContext 规范的 Skill，并用 wxa-skills-validate 校验、按报错自行修复，直到校验通过。'

/**
 * 构建注入给 agent 的 system prompt。
 * 只规定「目标 / 边界 / 可用能力」，不规定固定步骤——让 agent 借助
 * wxa-skills-generate / wxa-skills-validate 两个 skill 自主决定工作流。
 */
function buildSystemPrompt(args: {
  projectPath: string
  miniprogramRoot: string
  outputPath: string
  scenario?: string
  generateSkillName: string
  validateSkillName: string
}): string {
  const parts: string[] = []
  parts.push('你是小程序 Skill 生成专家，负责把一个现有微信小程序项目重构为符合 `wx.modelContext` 规范的 Skill 分包。')
  parts.push('')
  parts.push('# 可用能力（opencode 标准 skill，按需自行调用其 SKILL.md）')
  parts.push(`- \`${args.generateSkillName}\`：Skill 生成工作流规范，指导如何分析项目并产出 Skill。`)
  parts.push(`- \`${args.validateSkillName}\`：Skill 静态校验与修复规范，用于校验产物并定位错误。`)
  parts.push('在动手前，先阅读 `' + args.generateSkillName + '` 的 SKILL.md 了解推荐工作流；遇到不确定的产物结构时再查阅它。')
  parts.push('')
  parts.push('# 输入')
  parts.push(`- 小程序项目根（绝对路径）：\`${args.projectPath}\``)
  parts.push(`- 小程序源码根（含 app.json，绝对路径）：\`${args.miniprogramRoot}\``)
  parts.push(`  - 入口配置：\`${args.miniprogramRoot}/app.json\``)
  parts.push(`  - 页面目录：\`${args.miniprogramRoot}/pages/\``)
  parts.push('- 用 Read/Glob/Grep 按上述绝对路径读取输入项目源码。')
  parts.push('')
  parts.push('# 输出')
  parts.push(`- 工作目录即输出目录：\`${args.outputPath}\``)
  parts.push('- 在工作目录下创建 `<skill-name>/` 子目录，写入 mcp.json / SKILL.md / index.js / apis/ / components/ 等。')
  parts.push('- 写文件用相对工作目录的相对路径（如 `drink-skill/SKILL.md`）。')
  parts.push('')
  if (args.scenario) {
    parts.push('# 业务场景')
    parts.push(args.scenario)
    parts.push('')
  }
  parts.push('# 边界与约束（必须遵守）')
  parts.push('1. 绝不修改输入项目的任何文件——输入项目只读。')
  parts.push('2. 不固定步骤，但目标固定：产物必须能通过 `' + args.validateSkillName + '` 的校验。')
  parts.push('3. 生成后主动调用 `' + args.validateSkillName + '` 校验；若失败，按报错修复并重新校验，直到通过。')
  parts.push('4. 优先在已有产物上增量修改，不要每轮推倒重来。')
  parts.push('5. 不要编造输入项目中不存在的页面、接口或字段；信息不足时基于源码中可确认的内容做最合理推断，并在产物中说明假设。')
  parts.push('6. 关键节点用简洁文字向用户汇报进展（生成了哪个 Skill、有哪些原子接口、校验结果）。')
  return parts.join('\n')
}
