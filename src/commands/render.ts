// ── render 命令 ──
// 封装 wxa-skills-validate 的组件渲染
// 依赖 wxa-skills-validate（自动检测，缺失时从全局目录自动下载）

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { log } from '../lib/utils.js'
import { ensureSkill } from '../lib/skill-installer.js'

const VALIDATE_SKILL_NAME = 'wxa-skills-validate'

interface RenderOptions {
  name: string
  project: string
}

export async function renderCommand(opts: RenderOptions): Promise<void> {
  const projectPath = resolve(opts.project)

  if (!existsSync(projectPath)) {
    log(`项目目录不存在: ${projectPath}`)
    return
  }

  // 确保 wxa-skills-validate 就位（全局目录优先，缺失时自动下载）
  const skillDir = await ensureSkill({
    skillName: VALIDATE_SKILL_NAME,
    verifySubpath: join('scripts', 'render.mjs'),
    extraSearchBases: [process.cwd(), projectPath],
  })

  let script = skillDir ? join(skillDir, 'scripts', 'render.mjs') : null

  if (!script) {
    script = findNpmGlobalScript()
  }

  if (!script) {
    log(`未找到 ${VALIDATE_SKILL_NAME}。请检查网络，或手动安装:`)
    log(`  npx mp-skills add wechat-miniprogram/ai-mode-skills --skill ${VALIDATE_SKILL_NAME}`)
    return
  }

  const cmd = `node "${script}" --project "${opts.project}" --name "${opts.name}"`

  log(`* 渲染组件: ${opts.name}`)
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 180_000 })
  } catch {
    /* ignore */
  }
}

/** 兼容旧的 npm 全局安装路径 */
function findNpmGlobalScript(): string | null {
  const home = process.env.HOME || '~'
  const candidates = [
    join(home, '.codebuddy', 'skills', VALIDATE_SKILL_NAME, 'scripts', 'render.mjs'),
    join('/usr/local/lib/node_modules', VALIDATE_SKILL_NAME, 'scripts', 'render.mjs'),
    join(home, '.nvm', 'versions', 'node', 'lib', 'node_modules', VALIDATE_SKILL_NAME, 'scripts', 'render.mjs'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}
