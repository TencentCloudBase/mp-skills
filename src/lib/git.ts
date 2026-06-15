// ── Git 操作 ──
// git clone 方式发现和安装 Skill，优先走 cnb.cool 镜像加速
//
// 原本有 GitHub Trees API 优先路径，但国内网络下 API 基本不可用，
// 且每次都要等 5s 超时 + 输出吓人日志，现已全部走 git clone。
// cloneRepo 内部已有 mirrorUrl（cnb.cool）→ repoUrl（GitHub）两级降级。

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import type { SourceInfo } from '../types.js'
import { sanitizeGitUrl, sanitizeRef } from './sanitize.js'

/**
 * 将路径模式模板编译为正则表达式。
 * 格式：模板中 `<name>` 代表 skill 名称占位符。
 * 示例：
 *   `skills/<name>/mcp.json` → /^skills\/([^/]+)\/mcp\.json$/
 *   `<name>/SKILL.md`        → /^([^/]+)\/SKILL\.md$/
 */
function buildPathPattern(template: string): RegExp {
  const escaped = template.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  const regexStr = '^' + escaped.replace('<name>', '([^/]+)') + '$'
  return new RegExp(regexStr)
}

/** 默认路径模式：skills/<name>/mcp.json */
const DEFAULT_PATH_PATTERN = 'skills/<name>/mcp.json'

/**
 * 通过 git clone 列出远程仓库中的 Skill。
 * 优先走 mirrorUrl（cnb.cool 国内加速），失败则回退到 repoUrl（GitHub）。
 *
 * @param info          仓库源信息（repoName, ref, repoUrl）
 * @param pathPattern   路径模式模板，如 `skills/<name>/mcp.json` 或 `<name>/SKILL.md`
 * @param mirrorUrl     cnb.cool 镜像 git URL，用于国内加速
 * @returns             [{ name, path }]，path 是 skill 目录在仓库内的相对路径
 */
export async function listRemoteSkills(
  info: SourceInfo,
  pathPattern?: string,
  mirrorUrl?: string,
): Promise<Array<{ name: string; path: string }>> {
  const { repoName } = info
  if (!repoName) throw new Error('GitHub repo name required')

  const pattern = pathPattern || DEFAULT_PATH_PATTERN
  const tmpDir = cloneRepo(info.repoUrl!, info.ref, mirrorUrl)
  try {
    return scanLocalSkills(tmpDir, pattern)
  } finally {
    cleanupClone(tmpDir)
  }
}

/** 扫描本地克隆仓库，按路径模式查找 skill */
function scanLocalSkills(repoDir: string, pathPattern: string): Array<{ name: string; path: string }> {
  const marker = getMarkerFile(pathPattern)
  const prefix = getPrefixDir(pathPattern)
  const searchDir = prefix ? join(repoDir, prefix) : repoDir

  // 递归扫描所有子目录，找 marker 文件
  const skills: Array<{ name: string; path: string }> = []

  function walk(dir: string, relativeDir: string): void {
    let found = false
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('_')) continue // 过滤 _shared 等内部目录
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relativeDir ? `${relativeDir}/${entry.name}` : entry.name)
      } else if (entry.name === marker) {
        found = true
      }
    }
    if (found && relativeDir) {
      const name = relativeDir.split('/').pop()!
      skills.push({ name, path: join(prefix || '', relativeDir) })
    }
  }

  if (existsSync(searchDir)) {
    for (const entry of readdirSync(searchDir, { withFileTypes: true })) {
      if (entry.name.startsWith('_')) continue // 过滤 _shared 等内部目录
      if (entry.isDirectory()) {
        walk(join(searchDir, entry.name), entry.name)
      }
    }
  }

  return skills
}

/**
 * 从路径模式中提取 marker 文件名。
 * `skills/<name>/mcp.json` → `mcp.json`
 * `<name>/SKILL.md` → `SKILL.md`
 */
function getMarkerFile(template: string): string {
  const parts = template.split('/')
  return parts[parts.length - 1]!
}

/**
 * 从路径模式中提取前缀目录（name 之前的路径部分）。
 * `skills/<name>/mcp.json` → `skills`
 * `<name>/SKILL.md` → ``
 */
function getPrefixDir(template: string): string {
  const parts = template.split('/')
  // 去掉最后一个（mcp.json）和倒数第二个（<name>）
  const nameIndex = parts.indexOf('<name>')
  if (nameIndex <= 0) return ''
  return parts.slice(0, nameIndex).join('/')
}

/**
 * 计算目录的哈希（用于版本追踪）
 */
export function hashDirectory(dir: string): string {
  const hash = createHash('sha256')

  function walk(d: string): void {
    const entries = readdirSync(d).sort()
    for (const entry of entries) {
      const fullPath = join(d, entry)
      const st = statSync(fullPath)
      if (st.isDirectory()) {
        hash.update(`dir:${entry}`)
        walk(fullPath)
      } else {
        hash.update(`file:${entry}:${st.size}:${st.mtimeMs}`)
      }
    }
  }

  if (existsSync(dir)) walk(dir)
  return hash.digest('hex').slice(0, 16)
}

/**
 * Clone 仓库到临时目录。
 * 优先使用 mirrorUrl（cnb.cool 国内加速），失败则回退到 repoUrl（GitHub）。
 */
export function cloneRepo(repoUrl: string, ref: string = 'main', mirrorUrl?: string): string {
  const safeRef = sanitizeRef(ref)

  const urlsToTry: string[] = []
  if (mirrorUrl) urlsToTry.push(mirrorUrl)
  urlsToTry.push(repoUrl)

  for (const url of urlsToTry) {
    const safeUrl = sanitizeGitUrl(url)
    const tmpDir = join(tmpdir(), 'mp-skills-' + randomUUID().slice(0, 8))
    mkdirSync(tmpDir, { recursive: true })

    try {
      execSync(`git clone --depth 1 --branch "${safeRef}" "${safeUrl}" "${tmpDir}"`, {
        stdio: 'ignore',
        timeout: 120_000,
      })
      return tmpDir
    } catch {
      try {
        execSync(`rm -rf "${tmpDir}"`, { stdio: 'ignore' })
      } catch {}
      if (url === urlsToTry[urlsToTry.length - 1]) {
        throw new Error(`git clone 失败: ${url}`)
      }
      console.log(`    ${url} 失败，回退到下一个源...`)
    }
  }

  throw new Error('git clone 失败: 所有源均不可用')
}

/**
 * 清理克隆目录
 */
export function cleanupClone(dir: string): void {
  if (dir && existsSync(dir)) {
    try {
      execSync(`rm -rf "${dir}"`, { stdio: 'ignore' })
    } catch {
      /* ignore */
    }
  }
}
