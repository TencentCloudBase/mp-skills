// ── create 命令 ──
// 在已有小程序项目中创建一个新的 Skill 骨架。
// 默认走模板复制（templates/skill-skeleton/）；显式 --mode agent 时走大模型辅助生成。

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { log, ok, warn, resolveMiniprogramRoot } from '../lib/utils.js'
import * as readline from 'node:readline'
import { SKELETON } from '../lib/templates-data.js'

export interface CreateOptions {
  /** 项目目录 */
  project?: string
  /** 运行模式：template（默认）| agent */
  mode?: string
  /** [agent] 业务场景描述 */
  scenario?: string
  /** [agent] 本轮诉求 / 迭代提示 */
  query?: string
  /** [agent] LLM 提供方预设 */
  provider?: string
  /** [agent] 模型名 */
  model?: string
  /** [agent] CloudBase 环境 ID */
  env?: string
  /** [agent] 一次性跑完（CI 兜底） */
  nonInteractive?: boolean
  /** 强制重新提取内置工具 Skill */
  reinstallTools?: boolean
}

const AGENT_ONLY_FLAGS: Array<{ key: keyof CreateOptions; label: string }> = [
  { key: 'scenario', label: '--scenario' },
  { key: 'query', label: '--query' },
  { key: 'provider', label: '--provider' },
  { key: 'model', label: '--model' },
  { key: 'env', label: '--env' },
  { key: 'nonInteractive', label: '--non-interactive' },
]

export async function createCommand(name: string | undefined, opts: CreateOptions = {}): Promise<void> {
  let isAgent = opts.mode === 'agent'
  const projectPath = resolve(opts.project || '.')

  // 1. 校验小程序项目结构（两个模式共享）
  const configPath = join(projectPath, 'project.config.json')
  if (!existsSync(configPath)) {
    warn('当前目录不是小程序项目（未找到 project.config.json）')
    log('请在项目根目录运行')
    return
  }
  const mpRoot = resolveMiniprogramRoot(projectPath)
  if (!mpRoot) {
    warn('未找到 app.json')
    log('请确认项目结构正确')
    return
  }

  // 2. 校验 agent 专用 flag 必须配合 --mode agent 使用
  if (!isAgent) {
    const misused = AGENT_ONLY_FLAGS.filter((f) => opts[f.key] !== undefined && opts[f.key] !== false)
    if (misused.length > 0) {
      const labels = misused.map((f) => f.label).join('、')
      warn(`${labels} 仅在 --mode agent 下有效`)
      return
    }
  }

  // 3. 交互式选择模式（未显式指定 --ai 时询问）
  if (opts.mode === undefined && process.stdin.isTTY) {
    opts.mode = (await promptSelectAiMode()) ? 'agent' : 'template'
  }

  // 3. 路由
  if (opts.mode === 'agent') {
    await callAiMode(name, projectPath, mpRoot, opts)
  } else {
    await callTemplateMode(name, projectPath, mpRoot)
  }
}

// ── 模板模式 ──────────────────────────────────────────
async function callTemplateMode(name: string | undefined, projectPath: string, mpRoot: string): Promise<void> {
  // 获取 Skill 名称
  let skillName = name
  if (!skillName && process.stdin.isTTY) {
    skillName = await promptName()
  }
  if (!skillName) {
    warn('未指定 Skill 名称')
    return
  }

  const skillsDir = join(mpRoot, 'skills')
  const targetDir = join(skillsDir, skillName)

  if (existsSync(targetDir)) {
    warn(`Skill "${skillName}" 已存在`)
    return
  }

  const files = Object.entries(SKELETON)
  for (const [name, content] of files) {
    const fp = join(targetDir, name)
    mkdirSync(dirname(fp), { recursive: true })
    writeFileSync(fp, content)
  }

  const mpRel = relative(projectPath, mpRoot) || '.'
  log(`\n📦 已创建 Skill: ${skillName}`)
  ok(`${mpRel}/skills/${skillName}/`)
  ok(`  cloudbaserc.json — 云资源声明（云函数配置 + 数据库集合）`)
  ok(`  mcp.json         — 定义 API 接口`)
  ok(`  SKILL.md         — 编排业务流程`)
  ok(`  index.js         — 注册入口`)
  ok(`  apis/            — 原子接口实现`)
  ok(`  components/      — 原子组件`)

  // 注册到 app.json：显式传 name 时自动注入（跟 add 保持一致），未传时交互式确认
  if (name) {
    injectToAppJson(join(mpRoot, 'app.json'), skillName)
    ok('已自动注册到 app.json agent.skills')
  } else if (process.stdin.isTTY) {
    const inject = await promptConfirm(`是否将 "${skillName}" 注册到 app.json？`)
    if (inject) {
      injectToAppJson(join(mpRoot, 'app.json'), skillName)
      ok('已注册到 app.json agent.skills')
    }
  }

  log(`\n编辑后可用 mp-skills add ./${skillName} 安装到其他项目`)
}

// ── AI 模式 ──────────────────────────────────────────
async function callAiMode(
  name: string | undefined,
  projectPath: string,
  mpRoot: string,
  opts: CreateOptions,
): Promise<void> {
  // 计算工作目录：给了 name → <mp>/skills/<name>/，否则 → <mp>/skills/
  const skillsDir = join(mpRoot, 'skills')
  const outputPath = name ? join(skillsDir, name) : skillsDir

  const args = {
    projectPath,
    miniprogramRoot: mpRoot,
    outputPath,
    name,
    env: opts.env,
    scenario: opts.scenario,
    provider: opts.provider,
    model: opts.model,
    query: opts.query,
    nonInteractive: opts.nonInteractive,
    reinstallTools: opts.reinstallTools,
  }

  // 测试桩：写入参数到文件后直接返回，不真调 LLM
  const stubPath = process.env.MP_SKILLS_AI_GENERATE_STUB
  if (stubPath) {
    writeFileSync(stubPath, JSON.stringify(args, null, 2))
  } else {
    const { runAiGenerate } = await import('../lib/ai-generate.js')
    await runAiGenerate(args)
  }

  // 注册到 app.json：显式传 name 时自动注入，未传时 agent 自决则跳过
  if (name) {
    injectToAppJson(join(mpRoot, 'app.json'), name)
    ok('已自动注册到 app.json agent.skills')
  }
}

// ── 共用工具 ──────────────────────────────────────────
function injectToAppJson(appJsonPath: string, skillName: string) {
  const app = JSON.parse(readFileSync(appJsonPath, 'utf-8'))
  if (!app.agent) app.agent = {}
  if (!Array.isArray(app.agent.skills)) app.agent.skills = []

  const path = `skills/${skillName}`
  if (!app.agent.skills.some((s: any) => s.path === path)) {
    app.agent.skills.push({
      name: skillName.replace(/-skill$/, '').replace(/-tracker$/, ''),
      description: `${skillName} — 请更新 SKILL.md 补充描述`,
      path,
    })
    writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + '\n')
  }
}

function promptSelectAiMode(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question('  使用 AI 模式创建 (可自定义业务场景)? (y/N): ', (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y')
    })
  })
}

function promptName(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question('  Skill 名称 (默认: my-skill): ', (answer) => {
      rl.close()
      resolve(answer.trim() || 'my-skill')
    })
  })
}

function promptConfirm(msg: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`  ${msg} (Y/n): `, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() !== 'n')
    })
  })
}
