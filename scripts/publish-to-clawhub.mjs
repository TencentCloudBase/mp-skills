/**
 * 生成 ClawHub 发布信息并发布 Skill。
 *
 * 用法：
 *   node scripts/publish-to-clawhub.mjs --skills-dir skills --bump patch
 *   node scripts/publish-to-clawhub.mjs --skills-dir skills --bump patch --publish
 *
 * --publish 时调用 clawhub CLI 实际发布，否则只打印发布信息。
 * clawhub publish 参数：<path> --slug <slug> --name <name> --version <version> --changelog <text> --tags latest
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

// 获取当前版本号（从 skills-lock.json 或 package.json）
let currentVersion = '0.1.0'
const pkgPath = join(resolve('.'), 'package.json')
if (existsSync(pkgPath)) {
  try {
    currentVersion = JSON.parse(readFileSync(pkgPath, 'utf-8')).version || '0.1.0'
  } catch {}
}

// 计算新版本
const parts = currentVersion.split('.').map(Number)
if (bump === 'major') {
  parts[0]++
  parts[1] = 0
  parts[2] = 0
} else if (bump === 'minor') {
  parts[1]++
  parts[2] = 0
} else {
  parts[2]++
}
const newVersion = parts.join('.')

// 获取 changelog（最近 git 提交）
let changelog = ''
try {
  changelog = execSync('git log --oneline -5 --format="%s"', { encoding: 'utf-8', cwd: resolve('.') }).trim()
} catch {}

// 扫描 skill 目录
const entries = readdirSync(skillsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  .map((e) => {
    const skillPath = join(skillsDir, e.name)
    const skillMd = join(skillPath, 'SKILL.md')
    if (!existsSync(skillMd)) return null

    const content = readFileSync(skillMd, 'utf-8')
    const name = e.name

    // 从 YAML frontmatter 提取 description
    const descMatch = content.match(/^description:\s*(.+)$/m)
    const description = descMatch ? descMatch[1].trim() : ''

    // 提取版本（从 frontmatter 或默认）
    const verMatch = content.match(/^version:\s*'?(.+?)'?\s*$/m)
    const skillVersion = verMatch ? verMatch[1].trim() : newVersion

    return { name, description, path: skillPath, version: skillVersion }
  })
  .filter(Boolean)

// 输出发布信息
console.log(`[INFO] 当前版本: ${currentVersion} → ${newVersion} (${bump})`)
console.log(`[INFO] 发现 ${entries.length} 个 Skill`)
console.log('')

for (const skill of entries) {
  const slug = skill.name
  const displayName = skill.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  console.log(`--- ${skill.name} ---`)
  console.log(`  slug: ${slug}`)
  console.log(`  name: ${displayName}`)
  console.log(`  version: ${skill.version}`)
  console.log(`  path: ${skill.path}`)

  if (doPublish) {
    const cmd = [
      'clawhub publish',
      `"${skill.path}"`,
      `--slug "${slug}"`,
      `--name "${displayName}"`,
      `--version "${skill.version}"`,
      `--owner "TencentCloudBase"`,
    ]

    if (changelog) {
      cmd.push(`--changelog "${changelog.split('\n')[0]}"`)
    }

    const fullCmd = cmd.join(' ')
    console.log(`  运行: ${fullCmd}`)

    try {
      execSync(fullCmd, { stdio: 'inherit', timeout: 60000 })
      console.log(`  [OK] 发布成功`)
    } catch (err) {
      console.error(`  [ERR] 发布失败: ${err.message}`)
    }
  } else {
    console.log(`  [dry-run] 跳过发布（加 --publish 实际执行）`)
  }
  console.log('')
}
