// ── 数据库扫描器 ──
// 扫描 skills/*/database/collections.json，合并去重，
// 输出集合与indexes创建命令

import { existsSync, readFileSync, readdirSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import type { CollectionInfo, CollectionDeclaration } from '../types.js'
import { resolveMiniprogramRoot } from './utils.js'

/**
 * 扫描并合并所有 Skill 的数据库集合声明
 */
export function scanCollections(projectPath: string): CollectionInfo[] {
  const mpRoot = resolveMiniprogramRoot(projectPath)
  const skillsDir = mpRoot ? join(mpRoot, 'skills') : join(projectPath, 'skills')
  if (!existsSync(skillsDir)) return []

  const skillDirs = readdirSync(skillsDir, { withFileTypes: true }).filter(
    (e: Dirent) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'),
  )

  const collectionMap = new Map<string, CollectionInfo>()

  for (const skillDir of skillDirs) {
    const collectionsPath = join(skillsDir, skillDir.name, 'database', 'collections.json')
    if (!existsSync(collectionsPath)) continue

    try {
      const raw = JSON.parse(readFileSync(collectionsPath, 'utf-8'))
      const declarations: CollectionDeclaration[] = raw.collections || []

      for (const decl of declarations) {
        const existing = collectionMap.get(decl.name)
        if (existing) {
          // 合并：追加 skill 引用，合并indexes（去重）
          if (!existing.skills.includes(skillDir.name)) {
            existing.skills.push(skillDir.name)
          }
          for (const idx of decl.indexes || []) {
            if (!existing.indexes.some((e) => e.name === idx.name)) {
              existing.indexes.push(idx)
            }
          }
        } else {
          collectionMap.set(decl.name, {
            name: decl.name,
            description: decl.description || '',
            indexes: decl.indexes || [],
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
export function generateCollectionGuides(collections: CollectionInfo[]): string[] {
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
    if (col.indexes.length > 0) {
      const idxList = col.indexes.map((i) => `\`${i.field}\``).join(', ')
      lines.push(`    索引：${idxList}`)
    }
  }

  lines.push('')
  lines.push('  推荐安全规则：')
  lines.push('    auth.openid == doc._openid')
  lines.push('    https://tcb.cloud.tencent.com/dev#/db')

  return lines
}

/**
 * 从 _shared 目录读取共享集合声明
 */
export function scanSharedCollections(projectPath: string): CollectionInfo[] {
  const mpRoot = resolveMiniprogramRoot(projectPath)
  const skillsParent = mpRoot || projectPath
  const sharedPath = join(skillsParent, 'skills', '_shared', 'database', 'collections.json')
  if (!existsSync(sharedPath)) return []

  try {
    const raw = JSON.parse(readFileSync(sharedPath, 'utf-8'))
    const declarations: CollectionDeclaration[] = raw.collections || []
    return declarations.map((decl) => ({
      name: decl.name,
      description: decl.description || '',
      indexes: decl.indexes || [],
      skills: ['_shared'],
    }))
  } catch {
    return []
  }
}
