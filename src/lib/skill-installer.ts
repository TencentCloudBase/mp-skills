// ── 共享 skill 安装器 ──
// 把官方 skill（wxa-skills-generate / wxa-skills-validate / wxa-skills-eval）
// 按需从 GitHub 下载到全局目录 ~/.mp-skills/skills 下，供 gen / eval / validate 复用。
//
// 这些是「工具型」skill，全局安装一次即可复用，不污染 cwd 或被测项目，
// 也不走 mp-skills add（避免误注入 app.json）。

import { existsSync, cpSync, rmSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { spinner, warn, resolveMiniprogramRoot } from './utils.js'

// 官方 skill 仓库
export const SKILLS_REPO_URL = 'https://github.com/wechat-miniprogram/ai-mode-skills.git'

// 工具型 skill 的全局安装目录：~/.mp-skills/skills
export const GLOBAL_SKILLS_DIR = join(homedir(), '.mp-skills', 'skills')

/** 全局 skills 根目录（opencode skills.paths 会扫描该目录下每个子目录的 SKILL.md） */
export function globalSkillsRoot(): string {
  return GLOBAL_SKILLS_DIR
}

export interface EnsureSkillOptions {
  /** skill 名（即仓库内子目录名 & 全局安装目录名），如 'wxa-skills-generate' */
  skillName: string
  /** 用于确认安装完整性的相对子路径，如 'SKILL.md'、'cli/index.js'、'scripts/validate.mjs' */
  verifySubpath: string
  /** 额外的本地查找基准目录（如 cwd、项目目录），用于兼容旧布局 */
  extraSearchBases?: string[]
  /** 是否启用 spinner 动画（默认 true） */
  spinnerEnabled?: boolean
}

/**
 * 确保某个官方 skill 已安装，返回其安装目录的绝对路径（找不到且下载失败时返回 null）。
 *
 * 查找顺序：
 *   1. 全局目录 ~/.mp-skills/skills/<skillName>
 *   2. 额外基准目录下的 skills/<skillName> 与 miniprogram/skills/<skillName>（兼容旧布局）
 *   3. 以上都没有 → git clone 下载到全局目录
 */
export async function ensureSkill(opts: EnsureSkillOptions): Promise<string | null> {
  const { skillName, verifySubpath } = opts
  const enabled = opts.spinnerEnabled ?? true

  const sp = spinner(`查找 ${skillName}...`, { enabled })

  const found = findSkillDir(skillName, verifySubpath, opts.extraSearchBases ?? [])
  if (found) {
    sp.success(`找到 ${skillName}: ${found}`)
    return found
  }

  sp.update(`下载 ${skillName} 到 ${GLOBAL_SKILLS_DIR} ...`)
  const downloaded = await downloadSkill(skillName, verifySubpath)
  if (!downloaded) {
    sp.error(`自动下载 ${skillName} 失败`)
    return null
  }
  sp.success(`已安装 ${skillName}: ${downloaded}`)
  return downloaded
}

/** 在全局目录及额外基准目录中查找 skill 安装目录 */
export function findSkillDir(skillName: string, verifySubpath: string, extraBases: string[]): string | null {
  const candidates: string[] = [join(GLOBAL_SKILLS_DIR, skillName)]
  for (const base of extraBases) {
    // 兼容 base 直接是 mpRoot 的旧调用
    candidates.push(join(base, 'skills', skillName))
    // 通过 project.config.json 解析的 mpRoot（自动支持任意 miniprogramRoot 取值）
    const mpRoot = resolveMiniprogramRoot(base)
    if (mpRoot) candidates.push(join(mpRoot, 'skills', skillName))
  }
  for (const dir of [...new Set(candidates)]) {
    if (existsSync(join(dir, verifySubpath))) return dir
  }
  return null
}

/**
 * 把指定 skill 从官方仓库下载到全局目录 ~/.mp-skills/skills/<skillName>。
 * 使用 git clone --depth 1 克隆后提取子目录。
 */
async function downloadSkill(skillName: string, verifySubpath: string): Promise<string | null> {
  const targetDir = join(GLOBAL_SKILLS_DIR, skillName)
  await mkdir(GLOBAL_SKILLS_DIR, { recursive: true })

  const tempDir = join(GLOBAL_SKILLS_DIR, `.${skillName}-tmp`)
  try {
    const cloneResult = spawnSync('git', ['clone', '--depth', '1', '--single-branch', SKILLS_REPO_URL, tempDir], {
      stdio: 'pipe',
    })
    if (cloneResult.status !== 0) {
      warn(`git clone 失败: ${cloneResult.stderr?.toString() || 'unknown error'}`)
      return null
    }

    const srcDir = join(tempDir, skillName)
    if (!existsSync(srcDir)) {
      warn(`克隆仓库中未找到 ${skillName} 目录`)
      return null
    }

    cpSync(srcDir, targetDir, { recursive: true })
    return existsSync(join(targetDir, verifySubpath)) ? targetDir : null
  } catch (err) {
    warn(`下载失败: ${(err as Error).message}`)
    return null
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  }
}
