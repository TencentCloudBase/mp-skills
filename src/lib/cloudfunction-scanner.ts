// ── 云函数扫描器 ──
// 扫描 skills/*/cloudfunctions/*/ 下的云函数，
// 从 Skill 级 cloudbaserc.json 读取 type / timeout / handler 等配置，
// 支持聚合到项目根目录 cloudfunctions/

import { existsSync, readFileSync, readdirSync, cpSync, mkdirSync, type Dirent } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import type { CloudFunctionInfo, CloudFunctionType, SkillCloudbaserc } from '../types.js'
import { resolveMiniprogramRoot, resolveCloudfunctionRoot } from './utils.js'

/**
 * 扫描项目中所有 Skill 的云函数。
 * 优先从 Skill 级 cloudbaserc.json（skills/<skill>/cloudbaserc.json）读取配置，
 * 回退到检测云函数目录内的 index.js。
 */
export function scanCloudFunctions(projectPath: string): CloudFunctionInfo[] {
  const mpRoot = resolveMiniprogramRoot(projectPath)
  const skillsDir = mpRoot ? join(mpRoot, 'skills') : join(projectPath, 'skills')
  if (!existsSync(skillsDir)) return []

  const skillDirs = readdirSync(skillsDir, { withFileTypes: true }).filter(
    (e: Dirent) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'),
  )

  const results: CloudFunctionInfo[] = []

  for (const skillDir of skillDirs) {
    const skillName = skillDir.name
    const cfRoot = join(skillsDir, skillName, 'cloudfunctions')
    if (!existsSync(cfRoot)) continue

    // 读取 Skill 级 cloudbaserc.json
    const skillCloudbasercPath = join(skillsDir, skillName, 'cloudbaserc.json')
    const skillFunctions = loadSkillCloudbasercFunctions(skillCloudbasercPath)

    const funcDirs = readdirSync(cfRoot, { withFileTypes: true }).filter(
      (e: Dirent) => e.isDirectory(),
    )

    for (const funcDir of funcDirs) {
      const funcPath = join(cfRoot, funcDir.name)
      const entryJs = join(funcPath, 'index.js')
      const packageJson = join(funcPath, 'package.json')

      // 必须有 index.js 和 package.json
      if (!existsSync(entryJs) || !existsSync(packageJson)) continue

      const funcName = funcDir.name
      const matched = skillFunctions?.find((f) => f.name === funcName)

      // 从 Skill 级 cloudbaserc 读取配置，回退到 index.js 注释检测 type
      const funcType: CloudFunctionType =
        matched?.type === 'http' ? 'http' : detectFunctionTypeByEntry(entryJs)

      results.push({
        name: funcName,
        skillName,
        type: funcType,
        sourcePath: funcPath,
        hasCloudbaserc: !!matched,
        timeout: matched?.timeout,
        handler: matched?.handler,
        runtime: matched?.runtime,
        memorySize: matched?.memorySize,
        installDependency: matched?.installDependency,
        dir: matched?.dir,
        envVariables: matched?.envVariables,
      })
    }
  }

  return results
}

interface SkillFuncEntry {
  name: string
  type?: string
  timeout?: number
  handler?: string
  runtime?: string
  memorySize?: number
  installDependency?: boolean
  dir?: string
  envVariables?: Record<string, string>
}

/**
 * 加载 Skill 级 cloudbaserc.json 中的 functions 列表
 */
function loadSkillCloudbasercFunctions(skillCloudbasercPath: string): SkillFuncEntry[] {
  if (!existsSync(skillCloudbasercPath)) return []
  try {
    const config = JSON.parse(readFileSync(skillCloudbasercPath, 'utf-8')) as SkillCloudbaserc
    return (config.functions || []).map((f) => ({
      name: f.name,
      type: f.type,
      timeout: f.timeout,
      handler: f.handler,
      runtime: f.runtime,
      memorySize: f.memorySize,
      installDependency: f.installDependency,
      dir: f.dir,
      envVariables: f.envVariables,
    }))
  } catch {
    return []
  }
}

/**
 * 回退方式：通过 index.js 第一行注释检测函数类型
 */
function detectFunctionTypeByEntry(entryJs: string): CloudFunctionType {
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
  const dest = targetDir || resolveCloudfunctionRoot(projectPath) || join(projectPath, 'cloudfunctions')
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
