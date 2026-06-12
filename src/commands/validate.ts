// ── validate 命令 ──
// 封装 wxa-skills-validate 的静态校验
// 依赖 wxa-skills-validate（自动检测，缺失时从全局目录自动下载）

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { log, ok, warn } from '../lib/utils.js'
import { trackCommand } from '../lib/telemetry.js'
import { ensureSkill } from '../lib/skill-installer.js'

const VALIDATE_SKILL_NAME = 'wxa-skills-validate'

export async function validateCommand(projectDir: string): Promise<void> {
  await trackCommand({ command: 'validate' })

  const projectPath = resolve(projectDir)

  if (!existsSync(projectPath)) {
    warn(`项目目录不存在: ${projectPath}`)
    process.exit(1)
  }

  // 确保 wxa-skills-validate 就位（全局目录优先，缺失时自动下载）
  const skillDir = await ensureSkill({
    skillName: VALIDATE_SKILL_NAME,
    verifySubpath: join('scripts', 'validate.mjs'),
    extraSearchBases: [process.cwd(), projectPath],
  })

  let validateScript = skillDir ? join(skillDir, 'scripts', 'validate.mjs') : null

  // 兼容旧的 npm 全局安装路径
  if (!validateScript) {
    validateScript = findNpmGlobalScript()
  }

  if (!validateScript) {
    warn(`无法获取 ${VALIDATE_SKILL_NAME}`)
    log(`  请检查网络，或手动安装：`)
    log(`  npx mp-skills add wechat-miniprogram/ai-mode-skills --skill ${VALIDATE_SKILL_NAME}`)
    process.exit(1)
  }

  // 运行校验
  log(` 校验项目: ${projectPath}`)

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

    ok('[OK] 校验通过')
  } catch (err) {
    warn(`校验异常: ${(err as Error).message}`)
    process.exit(1)
  }
}

/** 兼容旧的 npm 全局安装路径 */
function findNpmGlobalScript(): string | null {
  const home = process.env.HOME || homedir()
  const candidates = [
    join(home, '.codebuddy', 'skills', VALIDATE_SKILL_NAME, 'scripts', 'validate.mjs'),
    join(home, '.nvm', 'versions', 'node', 'lib', 'node_modules', VALIDATE_SKILL_NAME, 'scripts', 'validate.mjs'),
    join('/usr/local/lib/node_modules', VALIDATE_SKILL_NAME, 'scripts', 'validate.mjs'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

