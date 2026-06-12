// ── 云函数扫描器 ──
// 扫描 skills/*/cloudfunctions/*/ 下的云函数，
// 识别 Event / HTTP 类型（通过 cloudbaserc.json 或 index.js 注释），
// 支持聚合到项目根目录 cloudfunctions/

import { existsSync, readFileSync, readdirSync, cpSync, mkdirSync, type Dirent } from 'node:fs'
import { join, basename } from 'node:path'
import type { CloudFunctionInfo, CloudFunctionType } from '../types.js'

/**
 * 扫描项目中所有 Skill 的云函数
 */
export function scanCloudFunctions(projectPath: string): CloudFunctionInfo[] {
  const skillsDir = join(projectPath, 'skills')
  if (!existsSync(skillsDir)) return []

  const skillDirs = readdirSync(skillsDir, { withFileTypes: true }).filter(
    (e: Dirent) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'),
  )

  const results: CloudFunctionInfo[] = []

  for (const skillDir of skillDirs) {
    const cfRoot = join(skillsDir, skillDir.name, 'cloudfunctions')
    if (!existsSync(cfRoot)) continue

    const funcDirs = readdirSync(cfRoot, { withFileTypes: true }).filter(
      (e: Dirent) => e.isDirectory(),
    )

    for (const funcDir of funcDirs) {
      const funcPath = join(cfRoot, funcDir.name)
      const entryJs = join(funcPath, 'index.js')
      const packageJson = join(funcPath, 'package.json')
      const cloudbaserc = join(funcPath, 'cloudbaserc.json')

      // 必须有 index.js 和 package.json
      if (!existsSync(entryJs) || !existsSync(packageJson)) continue

      const funcType = detectFunctionType(funcPath)

      results.push({
        name: funcDir.name,
        skillName: skillDir.name,
        type: funcType,
        sourcePath: funcPath,
        hasCloudbaserc: existsSync(cloudbaserc),
      })
    }
  }

  return results
}

/**
 * 检测云函数类型：Event 或 HTTP
 * 1. 优先检查 cloudbaserc.json 中的 functions[0].type
 * 2. 其次检查 index.js 第一行注释
 */
function detectFunctionType(funcPath: string): CloudFunctionType {
  // 方法 1：cloudbaserc.json
  const cloudbaserc = join(funcPath, 'cloudbaserc.json')
  if (existsSync(cloudbaserc)) {
    try {
      const config = JSON.parse(readFileSync(cloudbaserc, 'utf-8'))
      const funcType = config?.functions?.[0]?.type
      if (funcType) {
        const t = String(funcType).toLowerCase()
        if (t === 'http') return 'http'
      }
    } catch {
      // ignore
    }
  }

  // 方法 2：index.js 第一行注释
  const entryJs = join(funcPath, 'index.js')
  if (existsSync(entryJs)) {
    try {
      const firstLine = readFileSync(entryJs, 'utf-8').split('\n')[0] || ''
      if (firstLine.includes('HTTP 云函数') || firstLine.includes('HTTP云函数')) {
        return 'http'
      }
    } catch {
      // ignore
    }
  }

  return 'event'
}

/**
 * 聚合云函数到目标目录
 */
export function aggregateCloudFunctions(
  projectPath: string,
  funcs: CloudFunctionInfo[],
  targetDir?: string,
): { funcName: string; destPath: string }[] {
  const dest = targetDir || join(projectPath, 'cloudfunctions')
  mkdirSync(dest, { recursive: true })

  const results: { funcName: string; destPath: string }[] = []

  for (const func of funcs) {
    const destFuncPath = join(dest, func.name)
    if (existsSync(destFuncPath)) {
      // 已存在，跳过
      continue
    }
    cpSync(func.sourcePath, destFuncPath, { recursive: true })
    results.push({ funcName: func.name, destPath: destFuncPath })
  }

  return results
}
