// CLI 路由入口 — 解析命令并分发给对应的处理器
import { program } from 'commander'
import { createRequire } from 'node:module'
import { setVersion, trackCommand } from './lib/telemetry.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

setVersion(version)

/** 自动为命令添加遥测 */
function track(name: string, fn: (...args: any[]) => Promise<void>) {
  return async (...args: any[]) => {
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

program
  .name('mp-skills')
  .description('CLI for managing WeChat Mini Program AI Skills (wx.modelContext)')
  .version(version)

// ── add — 向已有小程序安装 Skill ──────────────────────────
program
  .command('add <source>')
  .description('Install a Skill from a registry name, GitHub repo, URL, or local path')
  .option('--skill <name>', 'Install a specific Skill from the source')
  .option('--all', 'Install all Skills from the source')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(
    track('add', async (source, opts) => {
      const { addCommand } = await import('./commands/add.js')
      await addCommand(source, opts)
    }),
  )

// ── list — 列出已安装或远程可用的 Skill ─────────────────
program
  .command('list')
  .description('List installed Skills')
  .option('-r, --remote', 'List remotely available Skills from registry')
  .option('--all', 'List both installed and remote')
  .action(
    track('list', async (opts) => {
      const { listCommand } = await import('./commands/list.js')
      await listCommand(opts)
    }),
  )

// ── find — 搜索远程 Skill ────────────────────────────────
program
  .command('find [keyword]')
  .description('Search for Skills in remote repositories')
  .action(
    track('find', async (keyword) => {
      const { findCommand } = await import('./commands/find.js')
      await findCommand(keyword || '')
    }),
  )

// ── remove — 移除已安装的 Skill ──────────────────────────
program
  .command('remove <name>')
  .description('Remove an installed Skill')
  .option('--all', 'Remove all installed Skills')
  .action(
    track('remove', async (name, opts) => {
      const { removeCommand } = await import('./commands/remove.js')
      await removeCommand(name, opts)
    }),
  )

// ── create — 在已有项目中创建一个新的 Skill ───────────────
program
  .command('create [name]')
  .description('Create a new Skill skeleton in the current project')
  .action(
    track('create', async (name) => {
      const { createCommand } = await import('./commands/create.js')
      await createCommand(name)
    }),
  )

// ── new — 创建一个新的小程序项目 ──────────────────────────
program
  .command('new <name>')
  .description('Create a new mini-program project with AI Skill support')
  .action(
    track('new', async (name) => {
      const { newCommand } = await import('./commands/new.js')
      await newCommand(name)
    }),
  )

// ── update — 更新已安装的 Skill ──────────────────────────
program
  .command('update [skills...]')
  .description('Check and update installed Skills')
  .action(
    track('update', async (skills) => {
      const { updateCommand } = await import('./commands/update.js')
      await updateCommand(skills)
    }),
  )

// ── validate / execute / render ── 质检 ──────────────────
program
  .command('validate [project-dir]')
  .description('Run static validation on Skills in the project')
  .action(
    track('validate', async (dir) => {
      const { validateCommand } = await import('./commands/validate.js')
      await validateCommand(dir || '.')
    }),
  )

program
  .command('execute')
  .description('Execute an atomic interface in a Skill')
  .requiredOption('--name <api-name>', 'API name to execute')
  .option('--args <json>', 'Arguments as JSON string')
  .option('--project <path>', 'Project path', '.')
  .action(
    track('execute', async (opts) => {
      const { executeCommand } = await import('./commands/execute.js')
      await executeCommand(opts)
    }),
  )

program
  .command('render')
  .description('Render a Skill component')
  .requiredOption('--name <api-name>', 'API name to render')
  .option('--project <path>', 'Project path', '.')
  .action(
    track('render', async (opts) => {
      const { renderCommand } = await import('./commands/render.js')
      await renderCommand(opts)
    }),
  )
// ── gen — 根据已有小程序项目生成 Skills ──────────────────
program
  .command('gen <project-dir>')
  .description('分析已有小程序项目，调用 opencode 生成符合 wx.modelContext 规范的 Skill 分包')
  .option('--env <envId>', 'CloudBase 环境 ID（透传给下游）', '')
  .requiredOption('--output <dir>', '生成的 Skill 文件输出目录')
  .option('--scenario <desc>', '业务场景描述（如：商品检索、订单管理）')
  .option('--model <name>', '模型名（默认取 OPENAI_MODEL，回退 gpt-4o）')
  .option('--max-turns <n>', 'Agent 最大轮次（默认 30）')
  .action(async (projectDir, opts) => {
    const { genCommand } = await import('./commands/gen.js')
    await genCommand(projectDir, opts)
  })

// ── eval — 对 Skills 项目启动端到端评估 ──────────────────
program
  .command('eval <project-dir>')
  .description('对已有 Skills 项目启动端到端质量评估（需先安装 wxa-skills-eval）')
  .option('--env <envId>', 'CloudBase 环境 ID（BYOK 模式下可省略，仅透传给下游）', '')
  .option('-c, --cases <n>', '生成的测试用例数', '1')
  .option('--skill <name>', '只评估指定 Skill（默认评估全部）')
  .option('--headless', '无界面模式，适合 CI 环境', false)
  .option('--mode <mode>', '评估模式：official（直接调官方 CLI）| agent（自主调官方 CLI）', 'official')
  .option(
    '--provider <name>',
    `LLM 提供方预设（deepseek / glm / kimi / minimax）；预填 baseUrl 与默认 model，仍需配置 OPENAI_API_KEY`,
  )
  .option('--model <name>', '模型名，覆盖 --provider 预设与 OPENAI_MODEL 环境变量')
  .option('--openai-api-key <key>', 'OpenAI 兼容 API Key，覆盖 OPENAI_API_KEY 环境变量')
  .option('--openai-base-url <url>', 'OpenAI 兼容 Base URL，覆盖 --provider 预设与 OPENAI_BASE_URL 环境变量')
  .action(async (projectDir, opts) => {
    const { evalCommand } = await import('./commands/eval.js')
    await evalCommand(projectDir, opts)
  })

// Parse args
program.parse()
