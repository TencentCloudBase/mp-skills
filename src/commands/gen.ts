// ── gen 命令 ──
// 使用 opencode（OpenAI 兼容协议）启动一个 coding agent，
// 让它按 wxa-skills-generate 的工作流读源码、写 Skill 文件。
//
// 鉴权：统一 BYOK——只需一套 OpenAI 兼容凭据（OPENAI_BASE_URL/_API_KEY/_MODEL）。
// 通过 OPENCODE_CONFIG_CONTENT 注入一个名为 byok 的 OpenAI 兼容 provider。

import { existsSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { colors, kv, log, spinner, title, warn, resolveMiniprogramRoot } from '../lib/utils.js'
import { trackCommand } from '../lib/telemetry.js'
import { ensureLlmCredentials } from '../lib/llm-credentials.js'
import {
  resolveOpencodeBin,
  buildOpencodeConfig,
  opencodeModelArg,
  runOpencode,
  fetchSkillMd,
} from '../lib/opencode.js'

// wxa-skills-generate SKILL.md 的 GitHub raw URL（作为系统提示）
const GENERATE_SKILL_RAW_URL =
  'https://raw.githubusercontent.com/wechat-miniprogram/ai-mode-skills/master/wxa-skills-generate/SKILL.md'

// 本地候选路径：用户通过 mp-skills add 安装后会出现在这些位置
const GENERATE_LOCAL_CANDIDATES = [
  'skills/wxa-skills-generate/SKILL.md',
  'miniprogram/skills/wxa-skills-generate/SKILL.md',
]

interface GenOptions {
  env: string
  output: string
  scenario?: string
  model?: string
  maxTurns?: string
}

export async function genCommand(projectDir: string, opts: GenOptions): Promise<void> {
  await trackCommand({ command: 'gen' })

  const projectPath = resolve(projectDir)
  const outputPath = resolve(opts.output)

  // 检查项目目录
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

  // 准备输出目录（agent 的工作目录）
  mkdirSync(outputPath, { recursive: true })

  const promptSpinner = spinner('获取 wxa-skills-generate 工作流提示词...')
  const generatePrompt = await fetchSkillMd(
    GENERATE_SKILL_RAW_URL,
    GENERATE_LOCAL_CANDIDATES.map((c) => join(projectPath, c)),
  )
  if (!generatePrompt) {
    promptSpinner.error('无法获取 wxa-skills-generate 的 SKILL.md')
    log('请检查网络连接，或手动安装：')
    log('  mp-skills add wechat-miniprogram/ai-mode-skills --skill wxa-skills-generate')
    process.exit(1)
  }
  promptSpinner.success('已加载 wxa-skills-generate 工作流提示词')

  const prompt = buildPrompt({
    systemPrompt: generatePrompt,
    projectPath,
    miniprogramRoot,
    outputPath,
    scenario: opts.scenario,
  })

  title('🤖 启动 opencode 生成 Skill...')
  kv('项目源码', projectPath)
  kv('输出目录', outputPath)
  if (opts.env) kv('TCB 环境', opts.env)
  kv('模型', creds.model)
  kv('端点', creds.baseUrl)
  log('')

  // 注入 OpenAI 兼容 provider
  const configContent = buildOpencodeConfig(creds)

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCODE_CONFIG_CONTENT: configContent,
  }
  // 仅在显式提供 --env 时透传（BYOK 下非必需）
  if (opts.env) {
    childEnv.CLOUDBASE_ENV_ID = opts.env
  }

  const args = [
    'run',
    prompt,
    '--model',
    opencodeModelArg(creds),
    '--dir',
    outputPath,
    '--format',
    'json',
    '--dangerously-skip-permissions',
  ]

  const exitCode = await runOpencode(opencodeBin, args, childEnv)
  if (exitCode !== 0) {
    warn(`opencode 执行失败（退出码 ${exitCode}）`)
    process.exit(exitCode || 1)
  }

  title('✅ Skill 生成完成')
  kv('输出目录', outputPath)
  title('下一步:')
  log(colors.dim(`  cd ${projectPath}`))
  log(colors.dim('  mp-skills validate    # 静态校验'))
  log(colors.dim('  mp-skills eval .      # 端到端评估'))
}

/**
 * 组装发给 opencode 的完整 prompt：
 * 把 wxa-skills-generate SKILL.md 作为系统提示前置，再附上任务说明。
 * （opencode run 没有 system-prompt 参数，故拼接进 prompt）
 */
function buildPrompt(args: {
  systemPrompt: string
  projectPath: string
  miniprogramRoot: string
  outputPath: string
  scenario?: string
}): string {
  const parts: string[] = []
  parts.push('你是一个遵循以下工作流的小程序 Skill 生成专家。')
  parts.push('────────── 工作流规范（wxa-skills-generate SKILL.md）──────────')
  parts.push(args.systemPrompt)
  parts.push('────────── 工作流规范结束 ──────────')
  parts.push('')
  parts.push('# 任务：将小程序项目重构为符合 wx.modelContext 规范的 Skill 分包')
  parts.push('')
  parts.push('## 输入')
  parts.push(`- 小程序项目根（绝对路径）：\`${args.projectPath}\``)
  parts.push(`- 小程序源码根（包含 app.json，绝对路径）：\`${args.miniprogramRoot}\``)
  parts.push(`  - 入口配置：\`${args.miniprogramRoot}/app.json\``)
  parts.push(`  - 页面目录：\`${args.miniprogramRoot}/pages/\``)
  parts.push('- 用 Read/Glob/Grep 工具按上述绝对路径读取输入项目源码。')
  parts.push('')
  parts.push('## 输出')
  parts.push(`- 你的工作目录（--dir）就是输出目录：\`${args.outputPath}\``)
  parts.push('- 在工作目录下创建 `<skill-name>/` 子目录，写入 mcp.json / SKILL.md / index.js / apis/ / components/ 等')
  parts.push('- 写文件时使用相对工作目录的相对路径（如 `drink-skill/SKILL.md`）')
  parts.push('- 绝对不要修改输入项目的任何文件')
  parts.push('')
  if (args.scenario) {
    parts.push('## 业务场景')
    parts.push(args.scenario)
    parts.push('')
  }
  parts.push('## 执行要求')
  parts.push('1. 使用 Read/Glob/Grep 工具系统地阅读输入项目的源码（app.json、页面、云函数）')
  parts.push('2. 严格遵循上面的 wxa-skills-generate 6 阶段工作流')
  parts.push('3. 用 Write 工具把生成的所有文件写到工作目录下')
  parts.push('4. 完成后用文字总结：生成了哪个 Skill、有哪些原子接口、需要在 app.json 中合并哪些片段')
  parts.push('5. 不要询问用户确认，按场景描述自主推进；信息不足时按你能找到的最合理方案产出')
  return parts.join('\n')
}
