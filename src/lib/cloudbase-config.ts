// ── cloudbase-config 合并器 ──
// 扫描 skills/*/cloudbaserc.json，
// 合并 functions + database.collections 到项目级 cloudbaserc.json，
// 供 tcb fn deploy 和 manageFunctions MCP 直接使用

import { existsSync, readFileSync, writeFileSync, readdirSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import type { SkillCloudbaserc, ProjectCloudbaserc, SkillFunctionConfig } from '../types.js'
import { resolveMiniprogramRoot } from './utils.js'

// ── 内联类型辅助 ──

interface CollectionEntry {
  name: string
  description: string
  indexes: Array<{ field: string; unique?: boolean }>
}

/**
 * 扫描并合并所有 Skill 的 cloudbaserc.json，生成项目级 cloudbaserc.json
 */
export function mergeSkillCloudbaserc(projectPath: string): ProjectCloudbaserc {
  const mpRoot = resolveMiniprogramRoot(projectPath)
  const skillsDir = mpRoot ? join(mpRoot, 'skills') : join(projectPath, 'skills')

  const funcMap = new Map<string, SkillFunctionConfig>()
  const colMap = new Map<string, CollectionEntry>()

  if (!existsSync(skillsDir)) {
    return { version: '2.0', functions: [] }
  }

  const skillDirs = readdirSync(skillsDir, { withFileTypes: true }).filter(
    (e: Dirent) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'),
  )

  for (const skillDir of skillDirs) {
    const configPath = join(skillsDir, skillDir.name, 'cloudbaserc.json')
    if (!existsSync(configPath)) continue

    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as SkillCloudbaserc

      // 合并 functions（同名函数视为同一个，后面覆盖前面）
      for (const fn of raw.functions || []) {
        funcMap.set(fn.name, fn)
      }

      // 合并 database.collections（同名集合视为同一个）
      for (const col of raw.database?.collections || []) {
        const existing = colMap.get(col.name)
        if (existing) {
          // 合并 indexes（按 field 去重）
          for (const idx of col.indexes || []) {
            if (!existing.indexes.some((e: { field: string; unique?: boolean }) => e.field === idx.field)) {
              if (!existing.indexes) existing.indexes = []
              existing.indexes.push(idx)
            }
          }
        } else {
          colMap.set(col.name, {
            name: col.name,
            description: col.description || '',
            indexes: col.indexes || [],
          })
        }
      }
    } catch {
      // 忽略解析失败的文件
    }
  }

  const result: ProjectCloudbaserc = {
    version: '2.0',
    functions: Array.from(funcMap.values()).map((f) => ({
      name: f.name,
      type: f.type || 'event',
      timeout: f.timeout ?? 30,
      handler: f.handler || 'index.main',
      runtime: f.runtime || 'Nodejs18.15',
      memorySize: f.memorySize ?? 256,
      installDependency: f.installDependency ?? true,
      dir: f.dir || `cloudfunctions/${f.name}`,
      envVariables: f.envVariables || {},
      triggers: f.triggers || [],
      ignore: f.ignore || ['node_modules', '.git'],
    })),
  }

  if (colMap.size > 0) {
    result.database = {
      collections: Array.from(colMap.values()),
    }
  }

  return result
}

/**
 * 将合并后的项目级 cloudbaserc.json 写入到项目根目录
 */
export function writeProjectCloudbaserc(projectPath: string, dryRun: boolean = false): string | null {
  const merged = mergeSkillCloudbaserc(projectPath)

  if (merged.functions.length === 0 && !merged.database) {
    return null
  }

  const destPath = join(projectPath, 'cloudbaserc.json')

  if (dryRun) {
    return JSON.stringify(merged, null, 2)
  }

  writeFileSync(destPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  return destPath
}
