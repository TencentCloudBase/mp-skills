// ── 注册表加载 ──
// 统一的 registry 加载逻辑，供 find/add 共享。
//
// 加载顺序：
//   1. GitHub raw（远程最新）
//   2. cnb.cool raw（国内加速）
//   3. 本地文件（npm 包内兜底）
//
// 从哪个源加载成功，后续就使用该源的 mirrorUrl。

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
// esbuild 打包后 __dirname ≈ dist/，registry.json 在 src/
const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCAL_PATH = join(__dirname, '..', 'src', 'registry.json')

/** 读取本地 registry.json */
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
 * 加载注册表。
 * 返回 { registry, source }
 * source: 'github' | 'cnb' | 'local'
 */
export async function loadRegistry(): Promise<{ registry: Registry; source: string }> {
  const local = loadLocal()
  const repo = local?.repositories?.[0]
  const repoName = repo?.repo
  const ref = repo?.ref || 'main'

  // ── 1. 尝试从 GitHub raw 加载 ──
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

  // ── 2. 尝试从 cnb.cool raw 加载 ──
  if (local?.registryUrl) {
    try {
      const res = await fetch(local.registryUrl, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const remote: Registry = await res.json()
        if (remote.repositories?.length) {
          return { registry: remote, source: 'cnb' }
        }
      }
    } catch {
      // fall through
    }
  }

  // ── 3. 本地兜底 ──
  if (local) {
    return { registry: local, source: 'local' }
  }

  return { registry: { repositories: [] }, source: 'local' }
}

/**
 * 从加载好的 registry 中查找指定 repo 的镜像配置。
 */
export function lookupRepoConfig(
  registry: Registry,
  repoName: string,
): { mirrorUrl?: string; ref?: string; pathPattern?: string } {
  const entry = registry.repositories.find((r) => r.repo === repoName || r.name === repoName)
  if (!entry) return {}
  return { mirrorUrl: entry.mirrorUrl, ref: entry.ref, pathPattern: entry.pathPattern }
}
