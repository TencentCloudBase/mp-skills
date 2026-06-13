// CLI 路由入口 — 解析命令并分发给对应的处理器
import { program } from 'commander'
import { createRequire } from 'node:module'
import { setVersion, trackCommand } from './lib/telemetry.js'
import { ENV } from './lib/llm-credentials.js'
import { showLogo, getLogoLines } from './lib/logo.js'
import { ensureSkill, findSkillDir, GLOBAL_SKILLS_DIR } from './lib/skill-installer.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

setVersion(version)

/** 每个命令前显示 Logo */
function withLogo<T extends (...args: any[]) => Promise<void>>(fn: T): T {
  return (async (...args: any[]) => {
    showLogo()
    await fn(...args)
  }) as T
}

/** 自动为命令添加遥测 + Logo */
function track(name: string, fn: (...args: any[]) => Promise<void>) {
  return async (...args: any[]) => {
    showLogo()
    const start = Date.now()
    try {
      await fn(...args)
      trackCommand({ command: name, success: true, duration: Date.now() - start }).catch(() => {})
    } catch (err) {
      trackCommand({
        command: name,
        success: false,
        error: (err as Error).message,
        duration: Date.now() - start,
      }).catch(() => {})
      throw err
    }
  }
}

program.name('mp-skills').description('微信小程序 AI Skills 管理工具').version(version)

// ── 工具型 Skill 定义 ──
const TOOL_SKILLS = [
  { name: 'wxa-skills-generate', verify: 'SKILL.md', desc: 'AI 辅助生成 Skill 代码' },
  { name: 'wxa-skills-validate', verify: 'scripts/validate.mjs', desc: 'Skill 静态校验 + 编译 + 执行 + 渲染' },
  { name: 'wxa-skills-eval', verify: 'cli/index.js', desc: '端到端质量评估' },
]

// Logo 在 help 顶部也显示
program.addHelpText('beforeAll', getLogoLines().join('\n'))

// help 底部显示工具型 Skill 路径
const skillPathLines = TOOL_SKILLS.map((s) => {
  const dir = findSkillDir(s.name, 'SKILL.md', [])
  const path = dir ? dir + '/SKILL.md' : GLOBAL_SKILLS_DIR + '/' + s.name + '/SKILL.md (未安装)'
  return `  ${s.name}: ${path}  ${s.desc}`
})
program.addHelpText('afterAll', '\n工具型 Skill 路径（供 AI 模型引用）:\n' + skillPathLines.join('\n'))

// ── 启动时确保工具型 Skill 就位并打印路径 ──
let _skillsEnsured = false
program.hook('preAction', async () => {
  if (_skillsEnsured) return
  _skillsEnsured = true
  for (const s of TOOL_SKILLS) {
    const dir = await ensureSkill({ skillName: s.name, verifySubpath: s.verify, spinnerEnabled: false })
    if (dir) {
      console.log(`  ${s.name}: ${dir}`)
    }
  }
})

// ── add — 安装 Skill ─────────────────────────────────
program
  .command('add <source>')
  .description('从注册表、GitHub 仓库、URL 或本地路径安装 Skill')
  .option('-s, --skill <name>', '安装指定的 Skill')
  .option('--all', '安装所有 Skill')
  .option('-y, --yes', '跳过确认提示')
  .action(
    track('add', async (source, opts) => {
      const { addCommand } = await import('./commands/add.js')
      await addCommand(source, opts)
    }),
  )

// ── list — 列出 Skill ────────────────────────────────
program
  .command('list')
  .description('列出已安装的 Skill')
  .option('-r, --remote', '列出远程可用的 Skill')
  .option('--all', '同时列出已安装和远程')
  .action(
    track('list', async (opts) => {
      const { listCommand } = await import('./commands/list.js')
      await listCommand(opts)
    }),
  )

// ── find — 搜索 Skill ────────────────────────────────
program
  .command('find [keyword]')
  .description('搜索远程仓库中的 Skill')
  .action(
    track('find', async (keyword) => {
      const { findCommand } = await import('./commands/find.js')
      await findCommand(keyword || '')
    }),
  )

// ── remove — 移除 Skill ──────────────────────────────
program
  .command('remove <name>')
  .description('移除已安装的 Skill')
  .option('--all', '移除全部 Skill')
  .option('-y, --yes', '跳过确认')
  .action(
    track('remove', async (name, opts) => {
      const { removeCommand } = await import('./commands/remove.js')
      await removeCommand(name, opts)
    }),
  )

// ── create — 创建新 Skill ────────────────────────────
program
  .command('create [name]')
  .description('在项目中创建新的 Skill 骨架（默认走模板，--mode agent 进入大模型辅助生成）')
  .option('-p, --project <path>', '项目目录', '.')
  .option('--mode <mode>', '运行模式：template（默认，走模板）| agent（大模型辅助生成）', 'template')
  .option('-s, --scenario <desc>', '[agent] 业务场景描述（如：商品检索、订单管理）')
  .option('-q, --query <text>', '[agent] 本轮诉求；在已有产物上迭代时尤其有用')
  .option('--provider <name>', '[agent] LLM 提供方预设（deepseek / glm / kimi / minimax）')
  .option('-m, --model <name>', '[agent] 模型名')
  .option('-e, --env <envId>', '[agent] CloudBase 环境 ID')
  .option('--non-interactive', '[agent] 非交互模式：一次性跑完，适合脚本 / CI', false)
  .action(async (name, opts) => {
    showLogo()
    const mode = opts.mode === 'agent' ? 'agent' : 'template'
    const cmdName = `create:${mode}`
    const start = Date.now()
    try {
      const { createCommand } = await import('./commands/create.js')
      await createCommand(name, opts)
      trackCommand({ command: cmdName, success: true, duration: Date.now() - start }).catch(() => {})
    } catch (err) {
      trackCommand({
        command: cmdName,
        success: false,
        error: (err as Error).message,
        duration: Date.now() - start,
      }).catch(() => {})
      throw err
    }
  })

// ── new — 创建新项目 ─────────────────────────────────
program
  .command('new <name>')
  .description('创建带 AI Skill 支持的小程序项目')
  .action(
    track('new', async (name) => {
      const { newCommand } = await import('./commands/new.js')
      await newCommand(name)
    }),
  )

// ── update — 更新 Skill ─────────────────────────────
program
  .command('update [skills...]')
  .description('检查并更新已安装的 Skill')
  .action(
    track('update', async (skills) => {
      const { updateCommand } = await import('./commands/update.js')
      await updateCommand(skills)
    }),
  )

// ── validate / execute / render ── 校验 ─────────────
program
  .command('validate [project-dir]')
  .description('对项目中 Skills 进行静态校验')
  .action(
    track('validate', async (dir) => {
      const { validateCommand } = await import('./commands/validate.js')
      await validateCommand(dir || '.')
    }),
  )

program
  .command('execute')
  .description('执行 Skill 的原子接口')
  .requiredOption('-n, --name <api-name>', '接口名称')
  .option('-a, --args <json>', 'JSON 格式参数')
  .option('-p, --project <path>', '项目路径', '.')
  .action(
    track('execute', async (opts) => {
      const { executeCommand } = await import('./commands/execute.js')
      await executeCommand(opts)
    }),
  )

program
  .command('render')
  .description('渲染 Skill 组件')
  .requiredOption('-n, --name <api-name>', '接口名称')
  .option('-p, --project <path>', '项目路径', '.')
  .action(
    track('render', async (opts) => {
      const { renderCommand } = await import('./commands/render.js')
      await renderCommand(opts)
    }),
  )
// ── setup — 一站式环境搭建 ─────────────────────────
program
  .command('setup [project-dir]')
  .description('一站式环境搭建：聚合云函数、创建数据库集合、检查服务')
  .option('-f, --cloud-functions', '仅处理云函数')
  .option('-d, --database', '仅处理数据库')
  .option('-s, --services', '仅检查服务')
  .option('--dry-run', '预览，不实际执行')
  .option('--env-id <id>', '云开发环境 ID（未指定则从项目配置读取）')
  .action(
    track('setup', async (dir, opts) => {
      const { setupCommand } = await import('./commands/setup.js')
      await setupCommand(dir || '.', opts)
    }),
  )

// ── status — 查看项目状态 ─────────────────────────
program
  .command('status [project-dir]')
  .description('查看云函数、数据库、服务的状态差异')
  .action(
    track('status', async (dir) => {
      const { statusCommand } = await import('./commands/status.js')
      await statusCommand(dir || '.')
    }),
  )

// ── doctor — 健康检查 ─────────────────────────────
program
  .command('doctor [project-dir]')
  .description('健康检查：检测云函数联通性、数据库集合、服务配置')
  .action(
    track('doctor', async (dir) => {
      const { doctorCommand } = await import('./commands/doctor.js')
      await doctorCommand(dir || '.')
    }),
  )

// ── eval — 对 Skills 项目启动端到端评估 ──────────────────
program
  .command('eval')
  .description('对已有 Skills 项目启动端到端质量评估')
  .option('-p, --project <path>', '项目目录', '.')
  .option('-e, --env <envId>', 'CloudBase 环境 ID（BYOK 模式下可省略，仅透传给下游）', '')
  .option('-c, --cases <n>', '生成的测试用例数', '1')
  .option('-s, --skill <name>', '只评估指定 Skill（默认评估全部）')
  .option('--headless', '无界面模式，适合 CI 环境', false)
  .option('--mode <mode>', '评估模式：official（直接调官方 CLI）| agent（自主调官方 CLI）', 'official')
  .option(
    '--provider <name>',
    `LLM 提供方预设（deepseek / glm / kimi / minimax）；预填 baseUrl 与默认 model，仍需配置 ${ENV.API_KEY}`,
  )
  .option('-m, --model <name>', `模型名，覆盖 --provider 预设与 ${ENV.MODEL} 环境变量`)
  .option('--openai-api-key <key>', 'OpenAI 兼容 API Key，覆盖对应环境变量')
  .option('--openai-base-url <url>', 'OpenAI 兼容 Base URL，覆盖 --provider 预设与对应环境变量')
  .action(async (opts) => {
    showLogo()
    const { evalCommand } = await import('./commands/eval.js')
    await evalCommand(opts.project, opts)
  })

// Parse args
program.parse()
