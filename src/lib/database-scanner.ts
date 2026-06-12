// ── 数据库扫描器 ──
// 扫描 skills/*/cloudbaserc.json 中的 database.collections，合并去重

import { existsSync, readFileSync, readdirSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import { resolveMiniprogramRoot } from './utils.js'

interface MergedCollection {
  name: string
  description: string
  indexes: Array<{ field: string | string[]; unique?: boolean }>
  aclTag?: string
  skills: string[]
}

/**
 * 扫描并合并所有 Skill cloudbaserc.json 中的数据库集合声明
 */
export function scanCollections(projectPath: string): MergedCollection[] {
  const mpRoot = resolveMiniprogramRoot(projectPath)
  const skillsDir = mpRoot ? join(mpRoot, 'skills') : join(projectPath, 'skills')
  if (!existsSync(skillsDir)) return []

  const skillDirs = readdirSync(skillsDir, { withFileTypes: true }).filter(
    (e: Dirent) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'),
  )

  const collectionMap = new Map<string, MergedCollection>()

  for (const skillDir of skillDirs) {
    const cloudbasercPath = join(skillsDir, skillDir.name, 'cloudbaserc.json')
    if (!existsSync(cloudbasercPath)) continue

    try {
      const raw = JSON.parse(readFileSync(cloudbasercPath, 'utf-8'))
      const collections = raw?.database?.collections || []
      if (collections.length === 0) continue

      for (const col of collections) {
        const existing = collectionMap.get(col.name as string)
        if (existing) {
          if (!existing.skills.includes(skillDir.name)) {
            existing.skills.push(skillDir.name)
          }
          for (const idx of col.indexes || []) {
            const field = Array.isArray(idx.field) ? idx.field.join(',') : idx.field
            if (!existing.indexes.some((e) => {
              const ef = Array.isArray(e.field) ? e.field.join(',') : e.field
              return ef === field
            })) {
              existing.indexes.push(idx)
            }
          }
        } else {
          collectionMap.set(col.name as string, {
            name: col.name as string,
            description: col.description || '',
            indexes: col.indexes || [],
            aclTag: col.aclTag,
            skills: [skillDir.name],
          })
        }
      }
    } catch {
      // 忽略解析失败的文件
    }
  }

  return Array.from(collectionMap.values())
}

/**
 * 生成集合创建指引
 */
export function generateCollectionGuides(collections: MergedCollection[]): string[] {
  const lines: string[] = []

  if (collections.length === 0) {
    lines.push('  （无）')
    return lines
  }

  lines.push(`  共 ${collections.length} 个集合：`)
  for (const col of collections) {
    const usedBy = col.skills.join(', ')
    lines.push(`  ${col.name}`)
    lines.push(`    ${col.description || '-'}`)
    lines.push(`    使用方：${usedBy}`)
    if (col.aclTag) {
      lines.push(`    权限：${col.aclTag}`)
    }
    if (col.indexes.length > 0) {
      const idxList = col.indexes.map((i) => {
        const f = Array.isArray(i.field) ? i.field.join(',') : i.field
        return `\`${f}\``
      }).join(', ')
      lines.push(`    索引：${idxList}`)
    }
  }

  lines.push('')
  lines.push('  ⚡ 执行 mp-skills setup --database 自动创建集合、索引和安全规则')
  lines.push('  https://tcb.cloud.tencent.com/dev#/db')

  return lines
}

/**
 * scanSharedCollections 已废弃 — 共享集合已合并到各 Skill 的 cloudbaserc.json 中
 */
export function scanSharedCollections(_projectPath: string): [] {
  return []
}
