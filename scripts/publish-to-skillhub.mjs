/**
 * 将 skills/ 目录下的 Skill 发布到 SkillHub。
 *
 * 用法：
 *   node scripts/publish-to-skillhub.mjs --skills-dir skills --bump patch
 *   node scripts/publish-to-skillhub.mjs --skills-dir skills --bump patch --publish
 *
 * --publish 时通过 SkillHub API 实际发布，否则只打印发布信息。
 * 需要设置环境变量 SKILLHUB_API_TOKEN 和 SKILLHUB_ORG_ID。
 *
 * 版本号从每个 SKILL.md 的 frontmatter version 字段读取并 bump。
 * 首次发布（404）时自动创建 skill。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { execSync } from 'node:child_process'

const DEFAULT_API_BASE = 'https://api.skillhub.cn'

const args = process.argv.slice(2)
const skillsDir = resolve(args[args.indexOf('--skills-dir') + 1] || 'skills')
const bump = args[args.indexOf('--bump') + 1] || 'patch'
const doPublish = args.includes('--publish')
const apiBase = process.env.SKILLHUB_API_BASE || DEFAULT_API_BASE

if (!existsSync(skillsDir)) {
  console.error(`skills 目录不存在: ${skillsDir}`)
  process.exit(1)
}

// 获取 changelog
let changelog = ''
try {
  changelog = execSync('git log --oneline -5 --format="%s"', { encoding: 'utf-8', cwd: resolve('.') }).trim()
} catch {}

// 收集文件（递归）
function collectFiles(dirPath) {
  const files = []
  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        files.push(fullPath)
      }
    }
  }
  walk(dirPath)
  return files
}

// 解析 SKILL.md frontmatter
function parseFrontmatter(skillMdPath) {
  const content = readFileSync(skillMdPath, 'utf-8')
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return null

  const frontmatter = frontmatterMatch[1]
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
  const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m)
  const versionMatch = frontmatter.match(/^version:\s*'?(.+?)'?\s*$/m)

  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    description: descriptionMatch ? descriptionMatch[1].trim() : '',
    version: versionMatch ? versionMatch[1].trim() : null,
  }
}

// 从版本号做 bump
function bumpVersion(versionStr, bumpType) {
  const match = (versionStr || '0.1.0').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return '1.0.0'
  const parts = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
  if (bumpType === 'major') {
    parts[0]++; parts[1] = 0; parts[2] = 0
  } else if (bumpType === 'minor') {
    parts[1]++; parts[2] = 0
  } else {
    parts[2]++
  }
  return parts.join('.')
}

const SLUG_MAP = {
  'wxa-find-skills': 'wxa-find-skills',
  'wxa-create-ai-miniprogram': 'wxa-create-ai-miniprogram',
  'wxa-create-mp-skill': 'wxa-create-mp-skill',
  'wxa-ai-mode-dev': 'wxa-ai-mode-dev',
}

const DISPLAY_NAMES = {
  'wxa-find-skills': 'Find MP Skills',
  'wxa-create-ai-miniprogram': 'Create AI Miniprogram',
  'wxa-create-mp-skill': 'Create MP Skill',
  'wxa-ai-mode-dev': 'AI Mode Dev Guide',
}

// 扫描 skill 目录
const entries = readdirSync(skillsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  .map((e) => {
    const skillPath = join(skillsDir, e.name)
    const skillMd = join(skillPath, 'SKILL.md')
    if (!existsSync(skillMd)) return null

    const metadata = parseFrontmatter(skillMd)
    if (!metadata) return null

    const slug = SLUG_MAP[e.name] || e.name
    const displayName = DISPLAY_NAMES[e.name] || e.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const skillVersion = bumpVersion(metadata.version, bump)

    return {
      name: e.name,
      slug,
      displayName,
      path: skillPath,
      description: metadata.description,
      version: skillVersion,
      files: collectFiles(skillPath),
    }
  })
  .filter(Boolean)

// 在 SkillHub 上创建 skill（首次发布时）
async function createSkillOnSkillhub(slug, displayName, description) {
  const orgId = process.env.SKILLHUB_ORG_ID
  const token = process.env.SKILLHUB_API_TOKEN
  const url = `${apiBase}/api/v1/orgs/${orgId}/skills`

  const body = JSON.stringify({
    slug,
    displayName,
    summary: description,
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`创建 skill 失败 (${response.status}): ${text}`)
  }

  return response.json()
}

// 发布版本到 SkillHub
async function uploadVersionToSkillhub(skill) {
  const orgId = process.env.SKILLHUB_ORG_ID
  const token = process.env.SKILLHUB_API_TOKEN

  const url = `${apiBase}/api/v1/orgs/${orgId}/skills/${skill.slug}/versions`
  const formData = new FormData()

  const payload = JSON.stringify({
    version: skill.version,
    changelog: changelog || '',
    displayName: skill.displayName,
    summary: skill.description,
    securityScan: false,
  })
  formData.append('payload', payload)

  for (const filePath of skill.files) {
    const relativePath = relative(skill.path, filePath)
    const fileContent = readFileSync(filePath)
    const blob = new Blob([fileContent], { type: 'application/octet-stream' })
    formData.append('files', blob, relativePath)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    })

    const responseText = await response.text()
    let responseJson
    try { responseJson = JSON.parse(responseText) } catch {}

    if (!response.ok) {
      // 409 表示有版本审核中，跳过
      if (response.status === 409) {
        return { status: 'skipped', reason: '版本审核中 / version pending review' }
      }
      const errorMsg = responseJson?.error || responseText || response.statusText
      throw new Error(`SkillHub API 错误 (${response.status}): ${errorMsg}`)
    }

    return { status: 'published', versionId: responseJson?.versionId }
  } finally {
    clearTimeout(timeoutId)
  }
}

// 发布到 SkillHub（自动处理首次创建的 404）
async function publishToSkillhub(skill) {
  try {
    return await uploadVersionToSkillhub(skill)
  } catch (err) {
    // 404 skill not found → 先创建再重试
    if (err.message.includes('(404)')) {
      console.log(`  [INFO] skill 不存在，正在创建...`)
      await createSkillOnSkillhub(skill.slug, skill.displayName, skill.description)
      console.log(`  [INFO] 创建成功，重新发布版本...`)
      return await uploadVersionToSkillhub(skill)
    }
    throw err
  }
}

// 主流程
console.log(`[SkillHub] 发现 ${entries.length} 个 Skill`)
console.log('')

const failures = []
const results = []

for (const skill of entries) {
  console.log(`--- ${skill.name} ---`)
  console.log(`  slug: ${skill.slug}`)
  console.log(`  name: ${skill.displayName}`)
  console.log(`  version: ${skill.version} (bump: ${bump})`)
  console.log(`  files: ${skill.files.length} 个文件`)

  if (!doPublish) {
    console.log(`  [dry-run] 跳过发布（加 --publish 实际执行）`)
    results.push({ name: skill.name, status: 'dry-run', version: skill.version })
    console.log('')
    continue
  }

  try {
    const result = await publishToSkillhub(skill)
    if (result.status === 'published') {
      console.log(`  [OK] 发布成功, versionId: ${result.versionId}`)
    } else if (result.status === 'skipped') {
      console.log(`  [SKIP] ${result.reason}`)
    }
    results.push({ name: skill.name, ...result })
  } catch (err) {
    console.error(`  [ERR] 发布失败: ${err.message}`)
    failures.push({ name: skill.name, error: err.message })
  }
  console.log('')
}

// 汇总
console.log(`[SkillHub] 完成: ${results.length} 个处理`)
for (const r of results) {
  if (r.status === 'published') console.log(`  ✓ ${r.name}: v${r.version} -> versionId=${r.versionId}`)
  else if (r.status === 'skipped') console.log(`  - ${r.name}: ${r.reason}`)
  else console.log(`  - ${r.name}: dry-run (v${r.version})`)
}

if (failures.length > 0) {
  console.error(`\n[SkillHub] ${failures.length} 个失败:`)
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.error}`)
  process.exit(1)
}
