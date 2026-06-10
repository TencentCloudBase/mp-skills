// ── 安装器 ──
// 拷贝 Skill，注入 app.json / project.config.json，写入锁文件

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { hashDirectory } from './git.js'
import { addLockEntry } from './lock-file.js'

export interface InstallOptions {
  skillName?: string
  source?: string
}

/**
 * 安装 Skill
 */
export function installSkill(
  skillPath: string,
  projectPath: string,
  opts: InstallOptions = {},
): { skillName: string; targetDir: string } {
  const skillName = opts.skillName || skillPath.split('/').pop() || 'unknown'
  const targetDir = join(projectPath, 'skills', skillName)

  console.log(`\n📦 安装 Skill: ${skillName}`)

  // 1. 拷贝
  if (existsSync(targetDir)) {
    console.log(`   ⚠️  ${skillName} 已存在，覆盖`)
    cpSync(skillPath, targetDir, { recursive: true, force: true })
  } else {
    mkdirSync(targetDir, { recursive: true })
    cpSync(skillPath, targetDir, { recursive: true })
  }
  console.log(`   ✓ skills/${skillName}/`)

  // 2. 更新 app.json — 从 project.config.json 取 miniprogramRoot
  const projectConfigPath = join(projectPath, 'project.config.json')
  const appJsonPath = resolveAppJson(projectPath)
  if (appJsonPath && existsSync(appJsonPath)) {
    injectAppJson(appJsonPath, skillName, skillPath, projectPath)
  } else {
    console.log('   ⚠️  未找到 app.json（已检查 project.config.json 配置）')
  }

  // 3. 更新 project.config.json
  if (existsSync(projectConfigPath)) {
    injectProjectConfig(projectConfigPath)
  }

  // 4. 写入锁文件
  addLockEntry(projectPath, {
    name: skillName,
    source: opts.source || '',
    hash: hashDirectory(targetDir),
  })

  console.log('   ✓ 已记录版本')
  return { skillName, targetDir }
}

/**
 * 注入 app.json
 */
function injectAppJson(appJsonPath: string, skillName: string, skillPath: string, projectPath: string): void {
  const app = JSON.parse(readFileSync(appJsonPath, 'utf-8'))

  if (!app.lazyCodeLoading) app.lazyCodeLoading = 'requiredComponents'
  if (!app.agent) app.agent = {}
  if (!Array.isArray(app.agent.skills)) app.agent.skills = []

  // subPackages — root 相对于 app.json 所在目录
  if (!Array.isArray(app.subPackages)) app.subPackages = []
  const appDir = dirname(appJsonPath)
  const root = relative(appDir, projectPath)

  if (!app.subPackages.some((p: { root: string }) => p.root === root)) {
    app.subPackages.push({
      root,
      name: 'skills',
      pages: [],
      independent: true,
    })
  }

  // 取描述
  const mcpPath = join(skillPath, 'mcp.json')
  let description = skillName
  if (existsSync(mcpPath)) {
    try {
      const mcp = JSON.parse(readFileSync(mcpPath, 'utf-8'))
      description =
        (mcp.apis || [])
          .map((a: { description: string }) => a.description)
          .filter(Boolean)
          .join('、')
          .slice(0, 200) || skillName
    } catch {
      /* ignore */
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = app.agent.skills.find((s: any) => s.path === `skills/${skillName}`)
  if (existing) {
    existing.description = description
  } else {
    app.agent.skills.push({
      name: skillName.replace(/-skill$/, '').replace(/-tracker$/, ''),
      description,
      path: `skills/${skillName}`,
    })
  }

  writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + '\n')
}

/**
 * 注入 project.config.json
 */
function injectProjectConfig(configPath: string): void {
  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  if (!config.packOptions) config.packOptions = {}
  if (!Array.isArray(config.packOptions.include)) config.packOptions.include = []
  if (
    !config.packOptions.include.some(
      (i: { type: string; value: string }) => i.type === 'folder' && i.value === 'skills',
    )
  ) {
    config.packOptions.include.unshift({ type: 'folder', value: 'skills' })
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
}

/**
 * 从 project.config.json 解析 app.json 路径
 * miniprogramRoot 默认值为 "miniprogram/"
 */
function resolveAppJson(projectPath: string): string | null {
  const configPath = join(projectPath, 'project.config.json')
  if (!existsSync(configPath)) return null

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    const root = (config.miniprogramRoot || 'miniprogram').replace(/\/$/, '')
    return join(projectPath, root, 'app.json')
  } catch {
    return null
  }
}
