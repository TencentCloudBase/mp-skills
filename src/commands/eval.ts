// ── eval 命令 ──
// 对已有 Skills 项目启动端到端质量评估
// 依赖 wxa-skills-eval（自动检测，缺失时提示下载）

import { existsSync, cpSync, rmSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { colors, kv, log, ok, spinner, title, warn, resolveMiniprogramRoot } from '../lib/utils.js'
import { trackCommand } from '../lib/telemetry.js'
import { ensureLlmCredentials, applyProviderPreset, type LlmCredentials } from '../lib/llm-credentials.js'
import { upsertEnvVars } from '../lib/env-file.js'
import { resolveOpencodeBin, buildOpencodeConfig, opencodeModelArg, runOpencode } from '../lib/opencode.js'

interface EvalOptions {
  env: string
  cases?: string
  skill?: string
  headless?: boolean
  mode?: string
  provider?: string
  model?: string
  openaiApiKey?: string
  openaiBaseUrl?: string
}

// wxa-skills-eval 在 GitHub 上的位置
const EVAL_REPO_URL = 'https://github.com/wechat-miniprogram/ai-mode-skills.git'
const EVAL_SKILL_NAME = 'wxa-skills-eval'

// 评测工具的全局安装目录：~/.mp-skills/skills
// 它是评测「工具」而非业务 skill，全局安装一次即可复用，不污染 cwd 或被测项目。
const GLOBAL_SKILLS_DIR = join(homedir(), '.mp-skills', 'skills')

// 本地查找的基准目录（依次尝试）：
//   1. 全局安装目录 ~/.mp-skills/skills —— 评测工具的默认落地处
//   2. 命令执行目录 cwd —— 兼容装在 cwd/skills 的旧布局
//   3. 被测项目 projectPath —— 兼容已安装在项目内的旧布局
// 相对各基准目录的候选子路径：
const EVAL_CLI_SUBPATHS = [
  `skills/${EVAL_SKILL_NAME}/cli/index.js`,
  `miniprogram/skills/${EVAL_SKILL_NAME}/cli/index.js`,
]

export async function evalCommand(projectDir: string = '.', opts: EvalOptions): Promise<void> {
  await trackCommand({ command: 'eval' })

  const projectPath = resolve(projectDir)

  // 检查项目目录
  if (!existsSync(projectPath)) {
    warn(`项目目录不存在: ${projectPath}`)
    process.exit(1)
  }

  // 兼容两种布局：app.json 在 miniprogram/ 子目录，或直接在项目根
  const targetPath = resolveMiniprogramRoot(projectPath)
  if (!targetPath) {
    warn('当前目录不是小程序项目（未找到 app.json）')
    log('请提供包含 app.json 的小程序项目路径（支持源码在根目录或 miniprogram/ 子目录）')
    process.exit(1)
  }

  // 查找 wxa-skills-eval 工具（先全局目录，再兼容 cwd/项目内旧布局），找不到则下载到全局目录
  const evalToolSpinner = spinner(`查找 ${EVAL_SKILL_NAME}...`, { enabled: !opts.headless })
  let evalCliPath = findEvalCli(projectPath)
  if (!evalCliPath) {
    evalToolSpinner.update(`下载 ${EVAL_SKILL_NAME} 到 ${GLOBAL_SKILLS_DIR} ...`)
    const downloaded = await downloadEvalSkill()
    if (!downloaded) {
      evalToolSpinner.error(`自动下载 ${EVAL_SKILL_NAME} 失败`)
      log(`  执行: git clone --depth 1 ${EVAL_REPO_URL}，并把 ${EVAL_SKILL_NAME}/ 放到 ${GLOBAL_SKILLS_DIR}/ 下`)
      process.exit(1)
    }
    evalCliPath = downloaded
  }

  evalToolSpinner.success(`找到评估工具: ${evalCliPath}`)

  // 评测工具所在目录（.../skills/wxa-skills-eval），由实际入口反推
  const evalSkillDir = dirname(dirname(evalCliPath))

  // 若指定了 --provider，将对应预设的 baseUrl / defaultModel 注入 process.env；
  // --openai-base-url / --openai-api-key / --model 显式参数优先级更高，最后覆盖。
  applyProviderPreset({
    provider: opts.provider,
    baseUrl: opts.openaiBaseUrl,
    apiKey: opts.openaiApiKey,
    model: opts.model,
  })
  const creds = await ensureLlmCredentials({ defaultModel: 'gpt-4o' })

  // 检查 .env 文件（wxa-skills-eval 需要）
  await ensureEvalEnv(evalSkillDir, opts.env)

  // 将本次解析的 LLM 凭据同步写入 wxa-skills-eval 的 .env，
  // 确保两种模式（official / agent）都以最新配置启动 CLI，
  // 即便 .env 已存在也会就地更新（upsertEnvVars 只覆盖相关键，其他行不动）。
  syncCredsToEvalEnv(evalSkillDir, creds)

  // 设置环境变量：把统一凭据映射到 wxa-skills-eval 的 WXA_SKILL_EVAL_LLM_* 上。
  // process.env 在 wxa-skills-eval 中优先级最高，可覆盖其 .env。
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WXA_SKILL_EVAL_LLM_BASE_URL: creds.baseUrl,
    WXA_SKILL_EVAL_LLM_API_KEY: creds.apiKey,
    WXA_SKILL_EVAL_LLM_MODEL: creds.model,
  }
  // 仅在显式提供 --env 时透传（BYOK 下非必需）
  if (opts.env) {
    env.CLOUDBASE_ENV_ID = opts.env
  }

  const mode = opts.mode === 'agent' ? 'agent' : 'official'

  if (mode === 'agent') {
    await runAgentMode({ evalSkillDir, targetPath, evalCliPath, projectPath, creds, env, opts })
    return
  }

  // ── official 模式：直接 spawn wxa-skills-eval CLI ──
  const args = [evalCliPath, 'run', '-p', projectPath]

  if (opts.cases) {
    args.push('-c', opts.cases)
  }

  if (opts.skill) {
    args.push('--skills', opts.skill)
  }

  if (opts.headless) {
    args.push('--headless')
  }

  title('🚀 启动 Skills 评估（official 模式）...')
  kv('项目路径', projectPath)
  kv('评估 CLI', evalCliPath)
  if (opts.env) kv('TCB 环境', opts.env)
  kv('LLM 端点', creds.baseUrl)
  kv('LLM 模型', creds.model)
  if (opts.skill) kv('评估 Skill', opts.skill)
  if (opts.cases) kv('测试用例数', opts.cases)
  log('')

  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env,
  })

  if (result.error) {
    warn(`启动评估失败: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== null && result.status !== 0) {
    process.exit(result.status)
  }

  title('[OK] 评估流程结束')
  log(colors.dim('  详见上方官方 CLI 输出与 data/runs/ 报告'))
}

/**
 * agent 模式：
 * 利用 opencode 的标准 skill 机制加载 wxa-skills-eval：
 *   - 通过 OPENCODE_CONFIG_CONTENT 的 skills.paths 字段，把 ~/.mp-skills/skills 注册为 skill 根目录
 *   - opencode 启动时自动扫描该目录下每个含 SKILL.md 的子目录（如 wxa-skills-eval/SKILL.md），
 *     按其 frontmatter 中的 name/description 注册为可调用的 skill
 *   - prompt 中只需说明任务并提示「调用名为 wxa-skills-eval 的 skill」即可
 * 不再手动 fetch SKILL.md、不依赖 AGENTS.md。
 */
async function runAgentMode(ctx: {
  evalSkillDir: string
  targetPath: string
  evalCliPath: string
  projectPath: string
  creds: LlmCredentials
  env: NodeJS.ProcessEnv
  opts: EvalOptions
}): Promise<void> {
  const { evalSkillDir, targetPath, evalCliPath, projectPath, creds, env, opts } = ctx

  const opencodeBin = resolveOpencodeBin()
  if (!opencodeBin) {
    warn('未找到 agent 运行时')
    log('请重新安装依赖后重试：')
    log('  npm install -g mp-skills')
    process.exit(1)
  }

  // skill 根目录 = wxa-skills-eval 的父目录（如 ~/.mp-skills/skills），
  // opencode 会扫描该目录下的所有子目录，发现含 SKILL.md 的注册为 skill。
  const skillsRoot = dirname(evalSkillDir)

  const systemPrompt = buildEvalSystemPrompt({ evalSkillName: EVAL_SKILL_NAME })

  const prompt = buildEvalPrompt({
    evalCliPath,
    projectPath,
    cases: opts.cases,
    skill: opts.skill,
    headless: opts.headless,
  })

  title('* 启动 agent 驱动评估...')
  kv('项目路径', projectPath)
  kv('评估 CLI', evalCliPath)
  kv('skill 目录', skillsRoot)
  if (opts.env) kv('TCB 环境', opts.env)
  kv('LLM 端点', creds.baseUrl)
  kv('LLM 模型', creds.model)
  if (opts.skill) kv('评估 Skill', opts.skill)
  if (opts.cases) kv('测试用例数', opts.cases)
  log('')

  // 注入 BYOK provider + skills.paths（让 opencode 发现 wxa-skills-eval）+ 主 agent system prompt
  const childEnv: NodeJS.ProcessEnv = {
    ...env,
    OPENCODE_CONFIG_CONTENT: buildOpencodeConfig(creds, { skillPaths: [skillsRoot], systemPrompt }),
  }

  // --dir 设为评测工具所在目录，便于 opencode 用相对路径调用官方 CLI；
  // 评测目标项目通过绝对路径传入，opencode 可读取 --dir 之外的绝对路径。
  const args = [
    'run',
    prompt,
    '--model',
    opencodeModelArg(creds),
    '--dir',
    evalSkillDir,
    '--format',
    'json',
    '--dangerously-skip-permissions',
    '--print-logs',
  ]

  const exitCode = await runOpencode(opencodeBin, args, childEnv)
  if (exitCode !== 0) {
    warn(`agent 执行失败（退出码 ${exitCode}）`)
    process.exit(exitCode || 1)
  }

  title('[OK] 评估流程结束')
  log(colors.dim('  详见上方 agent 输出与 data/runs/ 报告'))
}

/**
 * 构建注入给主 agent（build）的 system prompt。
 * 使用 tag 标记分区：只规定「角色 / 能力 / 约束」，不固定执行步骤。
 */
function buildEvalSystemPrompt(args: { evalSkillName: string }): string {
  return `你是微信小程序 Skill 评测专家，负责对已安装 Skill 的小程序项目执行端到端质量评估。

<skills>
- \`${args.evalSkillName}\`：Skill 评测规范与 CLI 调用指引。
执行任务前先阅读 \`${args.evalSkillName}\` 的 SKILL.md 了解评测流程与 CLI 用法；实际评测由该 skill 中定义的官方 CLI 完成。
</skills>

<system-reminder>
# 执行要求
1. 先调用 \`${args.evalSkillName}\` skill 获取完整评测规范
2. 用 Bash 工具运行官方 CLI 发起评测
3. 关注 CLI 输出：若报缺依赖/缺配置/缺 DevTools，按 SKILL.md 的排错指引处理后重试
4. 评测完成后，用文字总结：通过了哪些用例、失败用例的缺陷归因、报告产物路径
5. 不要询问用户确认，自主推进
</system-reminder>`
}

/**
 * 组装 agent 的初始任务 prompt。
 * 只含动态参数 + 建议命令，角色与执行约束已在 system prompt 中定义。
 */
function buildEvalPrompt(args: {
  evalCliPath: string
  projectPath: string
  cases?: string
  skill?: string
  headless?: boolean
}): string {
  const { evalCliPath, projectPath, cases, skill, headless } = args
  const caseCount = cases ?? '1'

  const skillScopeLine = skill
    ? `- 仅评测指定 Skill（\`--skills\`）：${skill}`
    : '- 评测全部 Skill（不传 `--skills`）'

  const runModeLine = headless
    ? '- 运行模式：headless（CI，加 `--headless`）'
    : '- 运行模式：默认（启动 Web UI，不要加 `--headless`）'

  const cmd = [
    `node "${evalCliPath}" run -p "${projectPath}"`,
    `-c ${caseCount}`,
    skill ? `--skills ${skill}` : '',
    headless ? '--headless' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return `# 任务：对已安装 Skill 的小程序项目执行端到端评测

<params>
- 官方评测 CLI 入口（绝对路径）：\`${evalCliPath}\`
- 被评测的小程序项目（绝对路径，传给 \`-p\`）：\`${projectPath}\`
- 测试用例数（\`-c\`）：${caseCount}
${skillScopeLine}
${runModeLine}
- LLM 凭据已通过环境变量 \`WXA_SKILL_EVAL_LLM_*\` 注入，无需在命令行重复传入。
</params>

## 建议命令
\`\`\`bash
${cmd}
\`\`\`
`
}

/**
 * 查找 wxa-skills-eval 的入口。
 * 基准目录依次为：~/.mp-skills（全局安装处）→ cwd（旧布局）→ projectPath（旧布局）。
 */
function findEvalCli(projectPath: string): string | null {
  for (const base of evalSearchBases(projectPath)) {
    for (const sub of EVAL_CLI_SUBPATHS) {
      const full = join(base, sub)
      if (existsSync(full)) return full
    }
  }
  return null
}

/** 本地查找基准目录（去重）：全局目录在前，cwd 与 projectPath 兜底兼容旧布局 */
function evalSearchBases(projectPath: string): string[] {
  const globalBase = dirname(GLOBAL_SKILLS_DIR) // ~/.mp-skills（其下的 skills/ 由 SUBPATHS 拼接）
  const cwd = process.cwd()
  const bases = [globalBase, cwd, projectPath]
  return [...new Set(bases)]
}

/**
 * 把 wxa-skills-eval 下载到全局目录 ~/.mp-skills/skills 下。
 * 它是评测「工具」而非被测小程序的业务 skill，全局安装一次即可复用，
 * 不污染 cwd 或被测项目，也不走 mp-skills add（避免误注入 app.json）。
 * 使用 git clone --depth 1 克隆后提取子目录。
 */
async function downloadEvalSkill(): Promise<string | null> {
  const skillsDir = GLOBAL_SKILLS_DIR
  const targetDir = join(skillsDir, EVAL_SKILL_NAME)

  await mkdir(skillsDir, { recursive: true })

  const tempDir = join(skillsDir, `.${EVAL_SKILL_NAME}-tmp`)
  try {
    const cloneResult = spawnSync('git', ['clone', '--depth', '1', '--single-branch', EVAL_REPO_URL, tempDir], {
      stdio: 'pipe',
    })
    if (cloneResult.status !== 0) {
      warn(`git clone 失败: ${cloneResult.stderr?.toString() || 'unknown error'}`)
      return null
    }

    const srcDir = join(tempDir, EVAL_SKILL_NAME)
    if (!existsSync(srcDir)) {
      warn(`克隆仓库中未找到 ${EVAL_SKILL_NAME} 目录`)
      return null
    }

    // 复制到 cwd/skills/wxa-skills-eval/
    cpSync(srcDir, targetDir, { recursive: true })

    const cliPath = join(targetDir, 'cli', 'index.js')
    return existsSync(cliPath) ? cliPath : null
  } catch (err) {
    warn(`下载失败: ${(err as Error).message}`)
    return null
  } finally {
    // 清理临时目录
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  }
}

/**
 * 确保 wxa-skills-eval 的 .env 文件存在。
 * LLM 凭据由 syncCredsToEvalEnv 单独写入，这里只兜底创建骨架文件。
 * envId 为空（BYOK 模式未传 --env）时不写 CLOUDBASE_ENV_ID。
 */
async function ensureEvalEnv(evalSkillDir: string, envId: string): Promise<void> {
  if (!existsSync(evalSkillDir)) return

  const envPath = join(evalSkillDir, '.env')
  if (existsSync(envPath)) return // 已有配置，跳过

  const envExamplePath = join(evalSkillDir, '.env.example')
  let envContent = ''

  if (existsSync(envExamplePath)) {
    envContent = await readFile(envExamplePath, 'utf8')
    // 替换示例值为实际值
    envContent = envContent.replace(/=.*$/gm, (match: string, offset: number) => {
      if (envId && (envContent!.slice(offset).includes('ENV_ID') || match.includes('ENV_ID'))) {
        return `=${envId}`
      }
      return match // 保留其他占位符
    })
  } else {
    // 最小 .env 模板
    envContent = `# wxa-skills-eval 环境配置
${envId ? `# 云开发环境 ID\nCLOUDBASE_ENV_ID=${envId}\n` : ''}
# 微信开发者工具路径（macOS 一般无需填写，工具会自动注册 wechatidecli）
# DEVTOOLS_ENV_APP_PATH=

# LLM 配置（mp-skills eval 会在启动前自动同步 WXA_SKILL_EVAL_LLM_* 到此文件）
# WXA_SKILL_EVAL_LLM_BASE_URL=https://api.openai.com/v1
# WXA_SKILL_EVAL_LLM_API_KEY=sk-xxxx
# WXA_SKILL_EVAL_LLM_MODEL=gpt-4o
`
  }

  await writeFile(envPath, envContent, 'utf8')
  ok(`已创建 ${EVAL_SKILL_NAME}/.env（请按需补充配置）`)
}

/**
 * 把当前解析到的 LLM 凭据同步写入 wxa-skills-eval 的 .env。
 * 确保 eval CLI 读取到最新的大模型配置。
 * upsertEnvVars 只覆盖相关键，其他行（如 CLOUDBASE_ENV_ID、DEVTOOLS_*）保持不变。
 */
function syncCredsToEvalEnv(evalSkillDir: string, creds: LlmCredentials): void {
  if (!existsSync(evalSkillDir)) return
  const envPath = join(evalSkillDir, '.env')
  upsertEnvVars(envPath, {
    WXA_SKILL_EVAL_LLM_BASE_URL: creds.baseUrl,
    WXA_SKILL_EVAL_LLM_API_KEY: creds.apiKey,
    WXA_SKILL_EVAL_LLM_MODEL: creds.model,
  })
}
