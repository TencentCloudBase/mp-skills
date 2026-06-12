// ── validate 命令 ──
// 封装 wxa-skills-validate 的静态校验
// 依赖 wxa-skills-validate（自动检测，缺失时自动下载）

import { existsSync, cpSync, rmSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { log, ok, spinner, warn } from '../lib/utils.js'
import { trackCommand } from '../lib/telemetry.js'

// wxa-skills-validate 在 GitHub 上的位置
const VALIDATE_REPO_URL = 'https://github.com/wechat-miniprogram/ai-mode-skills.git'
const VALIDATE_SKILL_NAME = 'wxa-skills-validate'

// 工具的全局安装目录：~/.mp-skills/skills
const GLOBAL_SKILLS_DIR = join(homedir(), '.mp-skills', 'skills')

// 本地查找的基准目录（依次尝试）：
//   1. 全局安装目录 ~/.mp-skills/skills —— 工具的默认落地处
//   2. 命令执行目录 cwd —— 兼容装在 cwd/skills 的旧布局
//   3. 项目目录 projectPath —— 兼容已安装在项目内的旧布局
const VALIDATE_SCRIPT_SUBPATHS = [
  `skills/${VALIDATE_SKILL_NAME}/scripts/validate.mjs`,
  `miniprogram/skills/${VALIDATE_SKILL_NAME}/scripts/validate.mjs`,
]

export async function validateCommand(projectDir: string): Promise<void> {
  await trackCommand({ command: 'validate' })

  const projectPath = resolve(projectDir)

  // 检查项目目录
  if (!existsSync(projectPath)) {
    warn(`项目目录不存在: ${projectPath}`)
    process.exit(1)
  }

  // 查找 wxa-skills-validate 脚本（先全局目录，再兼容 npm 全局安装），找不到则下载到全局目录
  const validateToolSpinner = spinner(`查找 ${VALIDATE_SKILL_NAME}...`)
  let validateScript = findValidateScript(projectPath)

  if (!validateScript) {
    validateToolSpinner.update(`下载 ${VALIDATE_SKILL_NAME} 到 ${GLOBAL_SKILLS_DIR} ...`)
    const downloaded = await downloadValidateSkill()
    if (!downloaded) {
      validateToolSpinner.error(`自动下载 ${VALIDATE_SKILL_NAME} 失败`)
      log(`  请手动执行: git clone --depth 1 ${VALIDATE_REPO_URL}`)
      log(`  并把 ${VALIDATE_SKILL_NAME}/ 放到 ${GLOBAL_SKILLS_DIR}/ 下`)
      process.exit(1)
    }
    validateScript = downloaded
  }

  validateToolSpinner.success(`找到校验工具: ${validateScript}`)

  // 运行校验
  log(`🔍 校验项目: ${projectPath}`)

  try {
    const result = spawnSync(process.execPath, [validateScript, projectPath], {
      stdio: 'inherit',
      timeout: 120_000,
    })

    if (result.error) {
      warn(`校验异常: ${result.error.message}`)
      process.exit(1)
    }

    if (result.status !== null && result.status !== 0) {
      warn('校验未通过，请修复后重试')
      process.exit(result.status || 1)
    }

    ok('✅ 校验通过')
  } catch (err) {
    warn(`校验异常: ${(err as Error).message}`)
    process.exit(1)
  }
}

/**
 * 查找 wxa-skills-validate 的入口脚本。
 * 基准目录依次为：~/.mp-skills（全局安装处）→ cwd（旧布局）→ projectPath（旧布局）→ npm 全局路径（向后兼容）。
 */
function findValidateScript(projectPath: string): string | null {
  // 1. 检查新的全局目录（~/.mp-skills/）及 cwd、projectPath
  for (const base of validateSearchBases(projectPath)) {
    for (const sub of VALIDATE_SCRIPT_SUBPATHS) {
      const full = join(base, sub)
      if (existsSync(full)) return full
    }
  }

  // 2. 检查 npm 全局安装路径（向后兼容）
  const home = process.env.HOME || homedir()
  const npmCandidates = [
    join(home, '.codebuddy', 'skills', VALIDATE_SKILL_NAME, 'scripts', 'validate.mjs'),
    join(home, '.nvm', 'versions', 'node', 'lib', 'node_modules', VALIDATE_SKILL_NAME, 'scripts', 'validate.mjs'),
    join('/usr/local/lib/node_modules', VALIDATE_SKILL_NAME, 'scripts', 'validate.mjs'),
  ]
  for (const candidate of npmCandidates) {
    if (existsSync(candidate)) return candidate
  }

  return null
}

/** 本地查找基准目录（去重）：全局目录在前，cwd 与 projectPath 兜底兼容旧布局 */
function validateSearchBases(projectPath: string): string[] {
  const globalBase = dirname(GLOBAL_SKILLS_DIR) // ~/.mp-skills（其下的 skills/ 由 SUBPATHS 拼接）
  const cwd = process.cwd()
  const bases = [globalBase, cwd, projectPath]
  return [...new Set(bases)]
}

/**
 * 把 wxa-skills-validate 下载到全局目录 ~/.mp-skills/skills 下。
 * 使用 git clone --depth 1 克隆后提取子目录。
 */
async function downloadValidateSkill(): Promise<string | null> {
  const skillsDir = GLOBAL_SKILLS_DIR
  const targetDir = join(skillsDir, VALIDATE_SKILL_NAME)

  await mkdir(skillsDir, { recursive: true })

  const tempDir = join(skillsDir, `.${VALIDATE_SKILL_NAME}-tmp`)
  try {
    const cloneResult = spawnSync('git', ['clone', '--depth', '1', '--single-branch', VALIDATE_REPO_URL, tempDir], {
      stdio: 'pipe',
    })
    if (cloneResult.status !== 0) {
      warn(`git clone 失败: ${cloneResult.stderr?.toString() || 'unknown error'}`)
      return null
    }

    const srcDir = join(tempDir, VALIDATE_SKILL_NAME)
    if (!existsSync(srcDir)) {
      warn(`克隆仓库中未找到 ${VALIDATE_SKILL_NAME} 目录`)
      return null
    }

    // 复制到全局 skills 目录
    cpSync(srcDir, targetDir, { recursive: true })

    const scriptPath = join(targetDir, 'scripts', 'validate.mjs')
    return existsSync(scriptPath) ? scriptPath : null
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
