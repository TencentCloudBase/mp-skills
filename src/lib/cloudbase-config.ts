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
  indexes: Array<{ field: string | string[]; unique?: boolean }>
}

/**
 * 从 project.config.json 获取 cloudfunctionRoot 的相对路径，
 * 用于计算合并后每个云函数的 dir 字段。
 * 没有配置时默认 fallback 为 "cloudfunctions/"。
 */
function resolveFunctionDirBase(projectPath: string): string {
  const configPath = join(projectPath, 'project.config.json')
  if (!existsSync(configPath)) return 'cloudfunctions'
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    if (typeof config?.cloudfunctionRoot === 'string' && config.cloudfunctionRoot) {
      return config.cloudfunctionRoot.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')
    }
  } catch {
    // 忽略
  }
  return 'cloudfunctions'
}

/**
 * 扫描并合并所有 Skill 的 cloudbaserc.json，生成项目级 cloudbaserc.json
 */
export function mergeSkillCloudbaserc(projectPath: string): ProjectCloudbaserc {
  const mpRoot = resolveMiniprogramRoot(projectPath)
  const skillsDir = mpRoot ? join(mpRoot, 'skills') : join(projectPath, 'skills')
  const funcDirBase = resolveFunctionDirBase(projectPath)

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
          // 合并 indexes（按 field 去重，支持 string 和 string[]）
          const existingFields = new Set(existing.indexes.map(i => JSON.stringify(i.field)))
          for (const idx of col.indexes || []) {
            if (!existingFields.has(JSON.stringify(idx.field))) {
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
    envId: '{{env.ENV_ID}}',
    functions: Array.from(funcMap.values()).map((f) => {
      const isHttp = (f.type || 'event').toLowerCase() === 'http'
      const fn: Record<string, unknown> = {
        name: f.name,
        timeout: f.timeout ?? 30,
        handler: f.handler || 'index.main',
        runtime: f.runtime || 'Nodejs18.15',
        memorySize: f.memorySize ?? 256,
        installDependency: f.installDependency ?? true,
        dir: `${funcDirBase}/${f.name}`,
        envVariables: f.envVariables || {},
        triggers: f.triggers || [],
        ignore: f.ignore || ['node_modules', '.git'],
      }
      // Event 函数不传 type（CLI 默认），HTTP 函数传 "HTTP"
      if (isHttp) fn.type = 'HTTP'
      return fn as Required<SkillFunctionConfig>
    }),
  }

  if (colMap.size > 0) {
    result.database = {
      collections: Array.from(colMap.values()),
    }
  }

  return result
}

/**
 * 解析字符串中的 {{env.XXX}} 插值为环境变量值。
 * 未设环境变量时保留原样并打印警告。
 */
function resolveEnvVars(value: string): string {
  return value.replace(/\{\{env\.(\w+)\}\}/g, (_, name) => {
    const envVal = process.env[name]
    if (envVal) return envVal
    console.warn(`  ⚠️  环境变量 ${name} 未设置，保留插值 {{env.${name}}}，tcb CLI 可运行时解析`)
    return `{{env.${name}}}`
  })
}

/**
 * 将合并后的项目级 cloudbaserc.json 写入到项目根目录。
 * 自动解析 {{env.XXX}} 插值为实际环境变量值，
 * 确保 tcb CLI 和直接 MCP 调用都能获得正确的环境 ID。
 *
 * @param envIdOverride 已解析的环境 ID（如已由 setup 交互选择），
 *                      提供时跳过 {{env.ENV_ID}} 插值
 */
export function writeProjectCloudbaserc(projectPath: string, dryRun: boolean = false, envIdOverride?: string): string | null {
  const merged = mergeSkillCloudbaserc(projectPath)

  if (merged.functions.length === 0 && !merged.database) {
    return null
  }

  merged.envId = envIdOverride || (merged.envId ? resolveEnvVars(merged.envId) : undefined)

  const destPath = join(projectPath, 'cloudbaserc.json')
  const content = JSON.stringify(merged, null, 2) + '\n'

  if (dryRun) {
    return content
  }

  writeFileSync(destPath, content, 'utf-8')
  return destPath
}
