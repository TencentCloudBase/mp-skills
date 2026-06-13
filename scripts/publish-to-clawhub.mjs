/**
 * 生成 ClawHub 发布清单
 * 扫描 skills/ 目录下的 SKILL.md 文件，生成发布清单供 clawhub CLI 消费。
 *
 * 用法：
 *   node scripts/publish-to-clawhub.mjs --skills-dir skills --output manifest.json
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const skillsDir = resolve(args[args.indexOf('--skills-dir') + 1] || 'skills')
const outputPath = resolve(args[args.indexOf('--output') + 1] || '.clawhub-manifest.json')

if (!existsSync(skillsDir)) {
  console.error(`skills 目录不存在: ${skillsDir}`)
  process.exit(1)
}

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

    return { name, description, path: skillPath }
  })
  .filter(Boolean)

const manifest = {
  version: 1,
  skills: entries,
  updatedAt: new Date().toISOString(),
}

writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8')
console.log(`[OK] 已生成发布清单: ${outputPath}`)
console.log(`     包含 ${entries.length} 个 Skill: ${entries.map((e) => e.name).join(', ')}`)
