/**
 * 将 skills/ 目录下的 Skill 发布到 ClawHub。
 *
 * 用法：
 *   node scripts/publish-to-clawhub.mjs --skills-dir skills --bump patch
 *   node scripts/publish-to-clawhub.mjs --skills-dir skills --bump patch --publish
 *
 * --publish 时调用 clawhub CLI 实际发布，否则只打印发布信息。
 *
 * clawhub CLI 新命令格式（参考 CloudBase-MCP）：
 *   clawhub skill publish <path> --slug <slug> --changelog <text> --tags <tags>
 *
 * name 和 version 由 CLI 自动从 SKILL.md frontmatter 读取。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const args = process.argv.slice(2)
const skillsDir = resolve(args[args.indexOf('--skills-dir') + 1] || 'skills')
const bump = args[args.indexOf('--bump') + 1] || 'patch'
const doPublish = args.includes('--publish')

if (!existsSync(skillsDir)) {
  console.error(`skills 目录不存在: ${skillsDir}`)
  process.exit(1)
}

// 获取 changelog（最近 git 提交）
let changelog = ''
try {
  changelog = execSync('git log --oneline -5 --format="%s"', { encoding: 'utf-8', cwd: resolve('.') }).trim()
} catch {}

// 标准化 changelog：去重、去空、| 连接（参考 CloudBase-MCP 的 normalizeClawhubChangelog）
function normalizeChangelog(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ')
}

const normalizedChangelog = normalizeChangelog(changelog)

// 扫描 skill 目录
const entries = readdirSync(skillsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  .map((e) => {
    const skillPath = join(skillsDir, e.name)
    const skillMd = join(skillPath, 'SKILL.md')
    if (!existsSync(skillMd)) return null
    return { name: e.name, path: skillPath }
  })
  .filter(Boolean)

// 输出发布信息
console.log(`[ClawHub] 发现 ${entries.length} 个 Skill`)
console.log('')

const failures = []

for (const skill of entries) {
  const slug = skill.name

  console.log(`--- ${skill.name} ---`)
  console.log(`  slug: ${slug}`)
  console.log(`  path: ${skill.path}`)

  if (doPublish) {
    const args = [
      'skill',
      'publish',
      skill.path,
      '--slug', slug,
    ]

    if (normalizedChangelog) {
      args.push('--changelog', normalizedChangelog)
    }

    args.push('--tags', 'latest')

    const cmdStr = `clawhub ${args.join(' ')}`
    console.log(`  运行: ${cmdStr}`)

    try {
      execSync('clawhub', args, { stdio: 'inherit', timeout: 60000 })
      console.log(`  [OK] 发布成功`)
    } catch (err) {
      console.error(`  [ERR] 发布失败: ${err.message}`)
      failures.push({ name: skill.name, error: err.message })
    }
  } else {
    console.log(`  [dry-run] 跳过发布（加 --publish 实际执行）`)
    console.log(`  预期命令: clawhub skill publish ${skill.path} --slug ${slug} --changelog "${normalizedChangelog}" --tags latest`)
  }
  console.log('')
}

if (failures.length > 0) {
  console.error(`\n[ClawHub] ${failures.length} 个失败:`)
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.error}`)
  process.exit(1)
} else {
  console.log(`[ClawHub] 完成`)
}
