// ── setup 命令 ──
// 一站式环境搭建：聚合云函数 + 数据库集合 + 服务检查

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import CloudBase from '@cloudbase/manager-node'
import { scanCloudFunctions, aggregateCloudFunctions } from '../lib/cloudfunction-scanner.js'
import { writeProjectCloudbaserc } from '../lib/cloudbase-config.js'
import { resolveCloudfunctionRoot, ensureCloudfunctionRoot } from '../lib/utils.js'
import { scanCollections, generateCollectionGuides } from '../lib/database-scanner.js'
import { readDeployedState, updateDeployedState } from '../lib/lock-file.js'
import { ensureLogin } from '../lib/cloudbase.js'
import { fuzzySelect } from '../lib/selector.js'
import type { DeployedState } from '../types.js'

interface SetupOptions {
  cloudFunctions?: boolean
  database?: boolean
  services?: boolean
  dryRun?: boolean
  envId?: string
}

export async function setupCommand(projectDir: string, opts: SetupOptions): Promise<void> {
  const projectPath = resolve(projectDir)
  const runAll = !opts.cloudFunctions && !opts.database && !opts.services

  console.log('mp-skills setup')
  console.log('')

  if (runAll || opts.cloudFunctions) {
    const steps = runAll ? '1/3' : '1/1'
    await setupCloudFunctions(projectPath, opts.dryRun || false, steps)
  }

  if (runAll || opts.database) {
    const steps = runAll ? '2/3' : '1/1'
    await setupDatabase(projectPath, opts.dryRun || false, opts.envId, steps)
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
    if (ensureCloudfunctionRoot(projectPath)) {
      console.log(`  已添加 cloudfunctionRoot 配置`)
    }
  }

  const mergedPath = writeProjectCloudbaserc(projectPath)
  if (mergedPath) {
    console.log(`  已生成项目级 cloudbaserc.json → ${mergedPath}`)
  } else if (funcs.length > 0) {
    console.log(`  ⚠️  未生成 cloudbaserc.json（缺少 cloudbaserc.json 配置）`)
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
    for (const f of events) {
      console.log(`            ${cfDest}${f.name}/ 右键 → 创建并部署（云端安装依赖）`)
    }
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

async function setupDatabase(projectPath: string, dryRun: boolean, envId: string | undefined, step: string): Promise<void> {
  console.log(`[${step}] 数据库`)
  console.log('─'.repeat(40))

  const all = scanCollections(projectPath)

  if (all.length === 0) {
    console.log('  （未发现数据库集合声明）')
    console.log('')
    return
  }

  const guides = generateCollectionGuides(all)
  for (const line of guides) {
    console.log(`  ${line}`)
  }

  if (dryRun) {
    console.log(`  [dry-run] 将创建 ${all.length} 个集合`)
    console.log('')
    return
  }

  // ── 获取环境 ID ──
  let targetEnvId = envId || readEnvIdFromProject(projectPath)

  // 未解析到有效 envId 时，交互式选择环境
  if (!targetEnvId || targetEnvId.includes('{{env.')) {
    targetEnvId = await interactiveEnvSelect(projectPath)
  }
  if (!targetEnvId) {
    console.log('  ❌ 未选择云开发环境')
    console.log('     可通过 --env-id 参数指定，或设置 ENV_ID 环境变量')
    console.log('')
    return
  }

  // ── 确保登录 ──
  const cred = ensureLogin()
  if (!cred) {
    console.log('  ❌ 登录失败，请执行 tcb login 手动登录')
    console.log('')
    return
  }

  const app = CloudBase.init({
    secretId: cred.tmpSecretId,
    secretKey: cred.tmpSecretKey,
    token: cred.tmpToken,
    envId: targetEnvId,
    region: 'ap-shanghai',
  })

  let created = 0
  let errorCount = 0

  for (const col of all) {
    console.log(`  ${col.name}...`)

    // 1. 创建集合
    try {
      await app.database.createCollectionIfNotExists(col.name)
      created++
      console.log(`    ✓ 集合已就绪`)
    } catch (err) {
      const msg = (err as Error).message || String(err)
      if (msg.includes('already exists') || msg.includes('exist')) {
        console.log(`    ✓ 集合已存在`)
      } else {
        console.log(`    ❌ 创建失败：${msg}`)
        errorCount++
        continue
      }
    }

    // 2. 创建索引
    if (col.indexes.length > 0) {
      try {
        const createIndexes = col.indexes.map((idx, i) => ({
          IndexName: `idx_${Array.isArray(idx.field) ? idx.field.join('_') : idx.field}_${i}`,
          MgoKeySchema: {
            MgoIndexKeys: (Array.isArray(idx.field) ? idx.field : [idx.field]).map((f) => ({
              Name: f,
              Direction: '1',
            })),
            MgoIsUnique: idx.unique || false,
          },
        }))

        await app.database.updateCollection(col.name, { CreateIndexes: createIndexes })
        console.log(`    ✓ 索引已创建`)
      } catch (err) {
        const msg = (err as Error).message || String(err)
        console.log(`    ⚠️  索引创建：${msg}`)
      }
    }

    // 3. 安全规则
    if (col.aclTag) {
      try {
        await app.permission.modifyResourcePermission({
          resourceType: 'collection',
          resource: col.name,
          permission: col.aclTag as any,
        })
        console.log(`    ✓ 安全规则：${col.aclTag}`)
      } catch (err) {
        const msg = (err as Error).message || String(err)
        console.log(`    ⚠️  安全规则配置：${msg}`)
      }
    }
  }

  console.log('')
  if (errorCount > 0) {
    console.log(`  ⚠️  ${errorCount} 个集合创建失败，请查看上面错误信息`)
  } else {
    console.log(`  ✅ 数据库初始化完成（${created}/${all.length}）`)
  }

  updateDeployedIfChanged(projectPath, { collections: all.map((c) => c.name) })
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

/**
 * 从项目级 cloudbaserc.json 或 project.config.json 尝试读取环境 ID
 */
function readEnvIdFromProject(projectPath: string): string | null {
  // 尝试项目级 cloudbaserc.json
  const paths = [
    resolve(projectPath, 'cloudbaserc.json'),
    resolve(projectPath, 'miniprogram', 'cloudbaserc.json'),
  ]
  for (const p of paths) {
    try {
      const json = JSON.parse(readFileSync(p, 'utf-8'))
      if (json.envId) {
        // 解析 {{env.XXX}} 插值
        const resolved = String(json.envId).replace(/\{\{env\.(\w+)\}\}/g, (_, name) => process.env[name] || `{{env.${name}}}`)
        if (resolved !== json.envId && resolved.includes('{{env.')) {
          console.warn('  ⚠️  环境变量 ENV_ID 未设置，保留插值。可通过 --env-id 参数指定')
        }
        return resolved
      }
    } catch {}
  }
  return null
}

/**
 * 交互式选择云开发环境
 * 调用 tcb env list --json 获取环境列表，用 fuzzySelect 选择
 */
async function interactiveEnvSelect(projectPath: string): Promise<string | null> {
  // 确保登录
  const cred = ensureLogin()
  if (!cred) {
    console.log('  ❌ 登录失败，请执行 tcb login 手动登录')
    return null
  }

  console.log('  🔍 获取环境列表...')

  let raw: string
  try {
    raw = execSync('tcb env list --json', { encoding: 'utf-8', timeout: 15000 })
  } catch {
    console.log('  ❌ 获取环境列表失败，请通过 --env-id 参数指定')
    return null
  }

  let data: { envId: string; status: string; createTime: string }[]
  try {
    data = JSON.parse(raw).data || []
  } catch {
    console.log('  ❌ 解析环境列表失败')
    return null
  }

  const items = data
    .filter((e) => e.status === 'NORMAL')
    .map((e) => ({
      value: e.envId,
      label: e.envId,
      description: `状态: ${e.status}  创建: ${e.createTime}`,
    }))

  if (items.length === 0) {
    console.log('  ❌ 未找到可用的云开发环境')
    return null
  }

  const selected = await fuzzySelect(items)
  return selected && selected.includes(',') ? selected.split(',')[0] : selected || null
}
