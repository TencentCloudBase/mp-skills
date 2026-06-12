// ── setup 命令 ──
// 一站式环境搭建：聚合云函数 + 数据库集合 + 服务检查

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { scanCloudFunctions, aggregateCloudFunctions } from '../lib/cloudfunction-scanner.js'
import { resolveCloudfunctionRoot, ensureCloudfunctionRoot } from '../lib/utils.js'
import { scanCollections, scanSharedCollections, generateCollectionGuides } from '../lib/database-scanner.js'
import { readDeployedState, updateDeployedState } from '../lib/lock-file.js'
import type { DeployedState, CloudFunctionInfo } from '../types.js'

interface SetupOptions {
  cloudfunctions?: boolean
  database?: boolean
  services?: boolean
  dryRun?: boolean
}

export async function setupCommand(projectDir: string, opts: SetupOptions): Promise<void> {
  const projectPath = resolve(projectDir)
  const runAll = !opts.cloudfunctions && !opts.database && !opts.services

  console.log('mp-skills setup')
  console.log('')

  if (runAll || opts.cloudfunctions) {
    const steps = runAll ? '1/3' : '1/1'
    await setupCloudFunctions(projectPath, opts.dryRun || false, steps)
  }

  if (runAll || opts.database) {
    const steps = runAll ? '2/3' : '1/1'
    await setupDatabase(projectPath, opts.dryRun || false, steps)
  }

  if (runAll || opts.services) {
    const steps = runAll ? '3/3' : '1/1'
    await setupServices(projectPath, steps)
  }

  console.log('')
}

async function setupCloudFunctions(projectPath: string, dryRun: boolean, step: string): Promise<void> {
  console.log(`[${step}] 云函数`)
  console.log('─'.repeat(40))

  const funcs = scanCloudFunctions(projectPath)

  if (funcs.length === 0) {
    console.log('  （未发现云函数）')
    console.log('')
    return
  }

  for (const f of funcs) {
    const badge = f.type === 'http' ? ' [HTTP]' : ''
    console.log(`  ${f.name}${badge}`)
  }
  console.log(`  共 ${funcs.length} 个云函数`)
  console.log('')

  const cfDest = resolveCloudfunctionRoot(projectPath) || 'cloudfunctions/'

  if (dryRun) {
    console.log(`  [dry-run] 将聚合到 ${cfDest}`)
    console.log('')
    return
  }

  const aggregated = aggregateCloudFunctions(projectPath, funcs)
  if (aggregated.length > 0) {
    console.log(`  已聚合 ${aggregated.length} 个云函数到 ${cfDest}`)
    // 确保 project.config.json 有 cloudfunctionRoot，IDE 才能识别
    if (ensureCloudfunctionRoot(projectPath)) {
      console.log(`  已添加 cloudfunctionRoot 配置`)
    }
  }

  const events = funcs.filter((f) => f.type === 'event')
  const https = funcs.filter((f) => f.type === 'http')

  if (events.length > 0) {
    console.log('')
    console.log(`  Event 云函数（${events.length} 个）：`)
    console.log(`    目录：${cfDest}`)
    for (const f of events) {
      console.log(`      ${f.name}/`)
    }
    console.log('')
    console.log('    方式一：微信开发者工具')
    console.log(`            在 ${cfDest} 目录下右键 → 创建并部署（云端安装依赖）`)
    console.log('    方式二：CloudBase CLI：')
    for (const f of events) {
      console.log(`      tcb fn deploy ${f.name} --yes`)
    }
    console.log('    方式三：CloudBase MCP（manageFunctions）')
  }

  if (https.length > 0) {
    console.log('')
    console.log(`  HTTP 云函数（${https.length} 个）：无法在开发者工具中部署`)
    console.log('    部署命令：')
    for (const f of https) {
      console.log(`      tcb fn deploy ${f.name} --httpFn --yes`)
    }
    console.log('')
    console.log('    部署后需开启 HTTP 访问服务：')
    console.log('      https://tcb.cloud.tencent.com/dev#/gateway')
  }

  updateDeployedIfChanged(projectPath, { cloudfunctions: funcs.map((f) => f.name) })
  console.log('')
}

async function setupDatabase(projectPath: string, dryRun: boolean, step: string): Promise<void> {
  console.log(`[${step}] 数据库`)
  console.log('─'.repeat(40))

  const collections = scanCollections(projectPath)
  const shared = scanSharedCollections(projectPath)

  const all = new Map<string, (typeof collections)[0]>()
  for (const c of collections) all.set(c.name, c)
  for (const c of shared) {
    if (!all.has(c.name)) all.set(c.name, { ...c, skills: [...c.skills] })
  }

  if (all.size === 0) {
    console.log('  （未发现数据库集合声明）')
    console.log('')
    return
  }

  const guides = generateCollectionGuides(Array.from(all.values()))
  for (const line of guides) {
    console.log(`  ${line}`)
  }

  if (dryRun) {
    console.log(`  [dry-run] 将创建 ${all.size} 个集合`)
    console.log('')
    return
  }

  console.log(`  共 ${all.size} 个集合`)
  console.log('')
  console.log('  创建集合：')
  console.log('    https://tcb.cloud.tencent.com/dev#/db')
  console.log('')
  console.log('  推荐安全规则：')
  console.log('    auth.openid == doc._openid')

  updateDeployedIfChanged(projectPath, { collections: Array.from(all.keys()) })
  console.log('')
}

async function setupServices(projectPath: string, step: string): Promise<void> {
  console.log(`[${step}] 服务`)
  console.log('─'.repeat(40))

  const funcs = scanCloudFunctions(projectPath)
  const hasHttpFunc = funcs.some((f) => f.type === 'http')
  const hasAISkill = ['text-gen-skill', 'image-gen-skill', 'image-edit-skill'].some(
    (s) => existsSync(`${projectPath}/skills/${s}`),
  )

  let found = false

  if (hasHttpFunc) {
    console.log('  HTTP 访问服务')
    console.log('    涉及：pay-common')
    console.log('    https://tcb.cloud.tencent.com/dev#/gateway')
    found = true
  }

  if (hasAISkill) {
    console.log('  AI 模型')
    console.log('    涉及：text-gen-skill, image-gen-skill, image-edit-skill')
    console.log('    请在控制台开启所需模型：https://tcb.cloud.tencent.com/dev#/ai')
    console.log('    需购买 Token 资源包（hy3-preview 有免费额度）')
    found = true
  }

  if (!found) {
    console.log('  （无需额外配置）')
  }

  const services: string[] = []
  if (hasHttpFunc) services.push('http-service')
  if (hasAISkill) services.push('ai-model')

  if (services.length > 0) {
    updateDeployedIfChanged(projectPath, { services })
  }

  console.log('')
}

function updateDeployedIfChanged(
  projectPath: string,
  patch: Partial<DeployedState>,
): void {
  const current = readDeployedState(projectPath) || { cloudfunctions: [], collections: [], services: [] }
  const merged: DeployedState = {
    cloudfunctions: patch.cloudfunctions || current.cloudfunctions,
    collections: patch.collections || current.collections,
    services: patch.services || current.services,
  }
  updateDeployedState(projectPath, merged)
}
