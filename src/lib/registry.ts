// ── 注册表加载 ──
// 统一的 registry 加载逻辑，供 find/add 共享。
//
// 加载顺序：
//   1. GitHub raw（远程最新，从 awesome-miniprogram-skills 仓库获取）
//   2. cnb.cool raw（国内加速，从 mirrorUrl 推导 URL）
//   3. 本地文件（npm 包内兜底）
//
// 从哪个源加载成功，add 的 cloneRepo 就使用对应的 mirrorUrl。

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface RegistryRepo {
  name: string
  repo: string
  ref: string
  pathPattern?: string
  mirrorUrl?: string
  skills?: Array<{ name: string; description: string }>
}

export interface Registry {
  registryUrl?: string
  repositories: RegistryRepo[]
}

// ── 本地文件路径 ──
const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCAL_PATH = join(__dirname, '..', 'src', 'registry.json')

function loadLocal(): Registry | null {
  try {
    if (existsSync(LOCAL_PATH)) {
      return JSON.parse(readFileSync(LOCAL_PATH, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * 从 mirrorUrl 推导 cnb.cool 的 raw 文件 URL。
 * mirrorUrl: https://cnb.cool/.../repo.git
 * raw URL:   https://cnb.cool/.../repo/-/git/raw/{ref}/filepath
 */
function cnbRawUrl(mirrorUrl: string, _ref: string, filePath: string): string {
  // cnb.cool 同步始终推送到默认分支（main），忽略源 ref
  const base = mirrorUrl.replace(/\.git$/, '')
  return `${base}/-/git/raw/main/${filePath}`
}

/**
 * 加载注册表。
 * 返回 { registry, source }
 * source: 'github' | 'cnb' | 'local'
 */
export async function loadRegistry(): Promise<{ registry: Registry; source: string }> {
  const local = loadLocal()
  const repo = local?.repositories?.[0]
  const repoName = repo?.repo
  const ref = repo?.ref || 'main'

  // ── 1. GitHub raw ──
  if (repoName) {
    const githubUrl = `https://raw.githubusercontent.com/${repoName}/${ref}/registry.json`
    try {
      const res = await fetch(githubUrl, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const remote: Registry = await res.json()
        if (remote.repositories?.length) {
          return { registry: remote, source: 'github' }
        }
      }
    } catch {
      // fall through
    }
  }

  // ── 2. cnb.cool raw（从第一个有 mirrorUrl 的仓库推导） ──
  for (const r of local?.repositories || []) {
    if (!r.mirrorUrl) continue
    const url = cnbRawUrl(r.mirrorUrl, r.ref || 'main', 'registry.json')
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const remote: Registry = await res.json()
        if (remote.repositories?.length) {
          return { registry: remote, source: 'cnb' }
        }
      }
    } catch {
      continue
    }
  }

  // ── 3. 本地兜底 ──
  if (local) {
    return { registry: local, source: 'local' }
  }

  return { registry: { repositories: [] }, source: 'local' }
}

/**
 * 从加载好的 registry 中查找指定 repo 的配置。
 * source 决定优先走 mirror 还是 GitHub。
 */
export function lookupRepoConfig(
  registry: Registry,
  repoName: string,
  source: string = 'local',
): { mirrorUrl?: string; ref?: string; pathPattern?: string } {
  const entry = registry.repositories.find((r) => r.repo === repoName || r.name === repoName)
  if (!entry) return {}
  // source 为 cnb 时强制走 mirror，否则返回 mirrorUrl 但由调用方决定是否使用
  return { mirrorUrl: entry.mirrorUrl, ref: entry.ref, pathPattern: entry.pathPattern }
}

/**
 * 根据 source 获取克隆 URL：cnb 来源走 mirror，否则走 GitHub。
 */
export function getCloneUrl(repoName: string, source: string, repoUrl?: string, mirrorUrl?: string): string {
  if (source === 'cnb' && mirrorUrl) return mirrorUrl
  return repoUrl || `https://github.com/${repoName}.git`
}

/**
 * 根据 source 获取 skill 描述的 raw 访问 URL。
 */
export function getRawUrl(repoName: string, ref: string, filePath: string, source: string, mirrorUrl?: string): string {
  if (source === 'cnb' && mirrorUrl) {
    const base = mirrorUrl.replace(/\.git$/, '')
    return `${base}/-/git/raw/${ref}/${filePath}`
  }
  return `https://raw.githubusercontent.com/${repoName}/${ref}/${filePath}`
}
