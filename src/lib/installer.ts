// ── 安装器 ──
// 拷贝 Skill，注入 app.json / project.config.json，写入锁文件

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { hashDirectory } from './git.js'
import { addLockEntry } from './lock-file.js'
import { resolveMiniprogramRoot } from './utils.js'

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
  const mpRoot = resolveMiniprogramRoot(projectPath)
  if (!mpRoot) {
    throw new Error('未找到 app.json，请确认 project.config.json 的 miniprogramRoot 配置或项目结构')
  }

  const relRoot = relative(projectPath, mpRoot) || '.'
  const displayPrefix = relRoot === '.' ? 'skills' : `${relRoot}/skills`
  const targetDir = join(mpRoot, 'skills', skillName)

  console.log(`\n* 安装 Skill: ${skillName}`)

  // 1. 拷贝
  if (existsSync(targetDir)) {
    console.log(`   [WARN]  ${skillName} 已存在，覆盖`)
    cpSync(skillPath, targetDir, { recursive: true, force: true })
  } else {
    mkdirSync(targetDir, { recursive: true })
    cpSync(skillPath, targetDir, { recursive: true })
  }
  console.log(`   * ${displayPrefix}/${skillName}/`)

  // 1.5 安装共享代码
  const sourceSharedDir = resolve(skillPath, '..', '_shared', 'mp-skills-shared')
  if (existsSync(sourceSharedDir)) {
    const sharedTarget = join(mpRoot, 'skills', '_shared', 'mp-skills-shared')
    mkdirSync(sharedTarget, { recursive: true })
    cpSync(sourceSharedDir, sharedTarget, { recursive: true, force: true })
    console.log(`   * ${displayPrefix}/_shared/mp-skills-shared/`)
  }

  // 2. 更新 app.json
  const appJsonPath = join(mpRoot, 'app.json')
  injectAppJson(appJsonPath, skillName, skillPath)

  // 3. 更新 project.config.json
  const projectConfigPath = join(projectPath, 'project.config.json')
  if (existsSync(projectConfigPath)) {
    injectProjectConfig(projectConfigPath)
  }

  // 4. 写入锁文件
  addLockEntry(projectPath, {
    name: skillName,
    source: opts.source || '',
    hash: hashDirectory(targetDir),
  })

  console.log('   * 已记录版本')
  _setupHintShown = false // 重置标记，让下次 install 重新提示
  return { skillName, targetDir }
}

// ── 安装完成提示 ──
// 确保 setup 提示在批量安装中只出现一次

let _setupHintShown = false

export function showSetupHint(projectName?: string): void {
  if (_setupHintShown) return
  _setupHintShown = true
  console.log('')
  console.log('  ═══════════════════════════════════════════')
  if (projectName) {
    console.log(`    cd ${projectName}`)
  }
  console.log('  * 下一步：执行 npx mp-skills setup')
  console.log('     聚合云函数、生成项目级 cloudbaserc.json、初始化数据库')
  console.log('  ═══════════════════════════════════════════')
}

/**
 * 注入 app.json
 */
function injectAppJson(appJsonPath: string, skillName: string, skillPath: string): void {
  const app = JSON.parse(readFileSync(appJsonPath, 'utf-8'))

  if (!app.lazyCodeLoading) app.lazyCodeLoading = 'requiredComponents'
  if (!app.agent) app.agent = {}
  if (!Array.isArray(app.agent.skills)) app.agent.skills = []

  // subPackages — skills 目录与 app.json 在同一 miniprogramRoot 下
  if (!Array.isArray(app.subPackages)) app.subPackages = []
  if (!app.subPackages.some((p: { root: string }) => p.root === 'skills')) {
    app.subPackages.push({
      root: 'skills',
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
