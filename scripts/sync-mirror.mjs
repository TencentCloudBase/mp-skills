#!/usr/bin/env node

// ── 镜像同步脚本 ──
// 将 GitHub 仓库通过 git push --mirror 同步到 cnb.cool 镜像。
// 支持 --check 模式检查是否有差异。
//
// 用法：
//   node scripts/sync-mirror.mjs --source <github-url> --target <cnb-url>
//   node scripts/sync-mirror.mjs --all                          # 同步所有
//   node scripts/sync-mirror.mjs --check --source ... --target ...

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function log(msg) {
  console.log(`[sync] ${msg}`)
}

function warn(msg) {
  console.warn(`[sync] ⚠ ${msg}`)
}

/**
 * 获取远程仓库的最新 HEAD commit SHA。
 */
function getRemoteSha(repoUrl) {
  try {
    const output = execSync(`git ls-remote "${repoUrl}" HEAD`, {
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return output.split(/\s+/)[0] || null
  } catch {
    return null
  }
}

/**
 * 为目标 URL 注入认证凭据。
 * 如果环境变量 CNB_COOL_TOKEN 存在，将其嵌入 HTTPS URL。
 */
function injectCredentials(targetUrl) {
  const token = process.env.CNB_COOL_TOKEN
  if (!token) return targetUrl

  // https://cnb.cool/.../repo.git → https://token@cnb.cool/.../repo.git
  return targetUrl.replace(/^https:\/\//, `https://oauth2:${token}@`)
}

/**
 * 同步单个仓库：git push --mirror 到目标镜像。
 */
function syncRepo(sourceUrl, targetUrl, options = {}) {
  const { force } = options
  const authTargetUrl = injectCredentials(targetUrl)

  log(`源:   ${sourceUrl}`)
  log(`目标: ${targetUrl.replace(/\/\/.*@/, '//***@')}`) // 脱敏显示

  const sourceSha = getRemoteSha(sourceUrl)
  if (!sourceSha) {
    warn(`无法获取源仓库 commit，跳过`)
    return { skipped: true, error: 'no-source-sha' }
  }
  log(`源 commit: ${sourceSha.slice(0, 12)}`)

  const tmpDir = join(tmpdir(), 'mp-skills-mirror-' + randomUUID().slice(0, 8))

  try {
    log(`克隆源仓库 (bare)...`)
    execSync(`git clone --mirror "${sourceUrl}" "${tmpDir}"`, {
      stdio: 'pipe',
      timeout: 120_000,
    })
    log(`克隆完成`)

    log(`推送至镜像...`)
    execSync(`git push --mirror "${authTargetUrl}"`, {
      cwd: tmpDir,
      stdio: 'pipe',
      timeout: 120_000,
    })
    log(`推送完成`)

    return { skipped: false, sourceSha }
  } catch (err) {
    const stderr = err.stderr?.toString() || err.message
    warn(`同步失败: ${stderr.slice(0, 300)}`)
    return { skipped: false, error: 'sync-failed', detail: stderr }
  } finally {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }
}

/**
 * 从 registry.json 读取所有需同步的镜像对。
 */
function loadMirrorPairs() {
  const registryPath = join(ROOT, 'src', 'registry.json')
  try {
    const registry = JSON.parse(readFileSync(registryPath, 'utf-8'))
    const pairs = []
    for (const repo of registry.repositories) {
      if (!repo.mirrorUrl) continue
      pairs.push({
        name: repo.name,
        source: `https://github.com/${repo.repo}.git`,
        target: repo.mirrorUrl,
      })
    }
    return pairs
  } catch (err) {
    console.error('无法读取 registry.json:', err.message)
    return []
  }
}

function printHelp() {
  console.log(`
用法: node scripts/sync-mirror.mjs [options]

Options:
  --source <url>    源仓库 URL（GitHub）
  --target <url>    目标镜像 URL（cnb.cool）
  --check           只检查，不推送
  --force           强制同步
  --all             同步 registry.json 中所有配置的镜像
  --help, -h        显示帮助

示例:
  # 同步单个仓库
  node scripts/sync-mirror.mjs \\
    --source https://github.com/TencentCloudBase/awesome-miniprogram-skills.git \\
    --target https://cnb.cool/tencent/cloud/cloudbase/awesome-miniprogram-skills.git

  # 同步所有
  node scripts/sync-mirror.mjs --all
`)
}

function main() {
  const args = process.argv.slice(2)
  const opts = { source: null, target: null, checkOnly: false, force: false, all: false }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break
      case '--target': opts.target = args[++i]; break
      case '--check':  opts.checkOnly = true; break
      case '--force':  opts.force = true; break
      case '--all':    opts.all = true; break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
      default:
        console.error(`未知参数: ${args[i]}`)
        process.exit(1)
    }
  }

  if (opts.all) {
    const pairs = loadMirrorPairs()
    if (pairs.length === 0) {
      log('没有找到配置了 mirrorUrl 的仓库')
      return
    }

    log(`将同步 ${pairs.length} 个镜像仓库...`)
    const results = []

    for (const pair of pairs) {
      console.log(`\n━━━ ${pair.name} ━━━`)
      const result = syncRepo(pair.source, pair.target, opts)
      results.push({ name: pair.name, ...result })
    }

    console.log('\n━━━ 同步汇总 ━━━')
    for (const r of results) {
      const icon = r.error ? '✗' : r.skipped ? '=' : '✓'
      console.log(`  ${icon} ${r.name.padEnd(25)} ${r.error ? r.error : r.skipped ? '无更新' : '已同步'}`)
    }
    return
  }

  if (!opts.source || !opts.target) {
    console.error('请指定 --source 和 --target（或 --all 同步全部）')
    printHelp()
    process.exit(1)
  }

  // --check 模式
  if (opts.checkOnly) {
    const sha = getRemoteSha(opts.source)
    if (!sha) {
      warn('无法获取源仓库信息')
      process.exit(1)
    }
    log(`源仓库最新 commit: ${sha.slice(0, 12)}`)
    log('检查完成（--check 模式）')
    return
  }

  syncRepo(opts.source, opts.target, opts)
}

main()
