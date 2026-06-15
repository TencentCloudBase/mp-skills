// ── plugin 命令 ──
// 内置插件入口，目前仅内置 cloudbase。
// 三方插件暂不开放，scripts.setup 中直接写 shell 命令即可。

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { scanCloudFunctions, aggregateCloudFunctions } from '../lib/cloudfunction-scanner.js'
import { writeProjectCloudbaserc, writeSharedConfig } from '../lib/cloudbase-config.js'
import { resolveCloudfunctionRoot, ensureCloudfunctionRoot } from '../lib/utils.js'
import { scanCollections, generateCollectionGuides } from '../lib/database-scanner.js'
import { readDeployedState, updateDeployedState } from '../lib/lock-file.js'
import { ensureLogin, resolveCloudbaseBin } from '../lib/cloudbase.js'
import { fuzzySelect } from '../lib/selector.js'
import CloudBase from '@cloudbase/manager-node'
import type { DeployedState } from '../types.js'

interface PluginOptions {
  name: string
  args: string[]
}

const ALLOWED_PLUGINS = new Set(['cloudbase'])

export async function pluginCommand(cwd: string, opts: PluginOptions): Promise<void> {
  if (!ALLOWED_PLUGINS.has(opts.name)) {
    console.log(`  [ERR] 未知插件 "${opts.name}"，当前仅支持 cloudbase`)
    process.exit(1)
  }

  const sub = opts.args[0]
  switch (sub) {
    case 'setup':
      await cloudbaseSetup(resolve(cwd), opts.args.slice(1))
      break
    case 'doctor':
      await cloudbaseDoctor(resolve(cwd))
      break
    case 'list':
      await cloudbaseList(resolve(cwd))
      break
    default:
      console.log(`  [ERR] 未知子命令 "${sub}"`)
      console.log('  可用: setup, doctor, list')
      process.exit(1)
  }
}

// ── cloudbase plugin 入口 ──

const CLOUD_STEPS = ['1/3', '2/3', '3/3'] as const

async function cloudbaseSetup(projectPath: string, _args: string[]): Promise<void> {
  // 读取或选择环境
  let envId = readEnvIdFromProject(projectPath)
  if (!envId || envId.includes('{{env.')) {
    envId = await interactiveEnvSelect(projectPath)
  }
  if (!envId) {
    console.log('  [ERR] 未选择云开发环境')
    console.log('     可通过 --env-id 参数指定，或设置 ENV_ID 环境变量')
    console.log('')
    return
  }

  writeSharedConfig(projectPath, envId)
  console.log('')

  const funcs = scanCloudFunctions(projectPath)

  if (funcs.length > 0) {
    await runCloudFunctions(projectPath, envId, funcs)
  } else {
    console.log(`[${CLOUD_STEPS[0]}] 云函数`)
    console.log('─'.repeat(40))
    console.log('  （未发现云函数）')
    console.log('')
  }

  const collections = scanCollections(projectPath)
  if (collections.length > 0) {
    await runDatabaseSetup(projectPath, envId, collections)
  } else {
    console.log(`[${CLOUD_STEPS[1]}] 数据库`)
    console.log('─'.repeat(40))
    console.log('  （未发现数据库集合声明）')
    console.log('')
  }

  await runServicesCheck(projectPath)
}

async function runCloudFunctions(projectPath: string, envId: string, funcs: Awaited<ReturnType<typeof scanCloudFunctions>>): Promise<void> {
  console.log(`[${CLOUD_STEPS[0]}] 云函数`)
  console.log('─'.repeat(40))

  for (const f of funcs) {
    const badge = f.type === 'http' ? ' [HTTP]' : ''
    console.log(`  ${f.name}${badge}`)
  }
  console.log(`  共 ${funcs.length} 个云函数`)
  console.log('')

  const cfDest = resolveCloudfunctionRoot(projectPath) || 'cloudfunctions/'

  const selectItems = [
    { value: '__all__', label: '全部云函数', description: `聚合全部 ${funcs.length} 个云函数` },
    ...funcs.map((f) => ({
      value: f.name,
      label: `${f.name}${f.type === 'http' ? ' [HTTP]' : ''}`,
      description: `Skill: ${f.skillName}  类型: ${f.type}`,
    })),
  ]

  const selected = await fuzzySelect(selectItems, { multiSelect: true })
  if (!selected) {
    console.log('  已取消')
    console.log('')
    return
  }

  const selectedNames = selected.split(',').filter(Boolean)
  const toAggregate = selectedNames.includes('__all__') ? funcs : funcs.filter((f) => selectedNames.includes(f.name))

  if (toAggregate.length === 0) {
    console.log('  未选择任何云函数')
    console.log('')
    return
  }

  console.log(`  即将聚合 ${toAggregate.length} 个云函数到 ${cfDest}`)

  const aggregated = aggregateCloudFunctions(projectPath, toAggregate)
  if (aggregated.length > 0) {
    console.log(`  已聚合 ${aggregated.length} 个云函数到 ${cfDest}`)
    if (ensureCloudfunctionRoot(projectPath)) {
      console.log('  已添加 cloudfunctionRoot 配置')
    }
  }

  const mergedPath = writeProjectCloudbaserc(projectPath, false, envId)
  if (mergedPath) {
    console.log(`  已生成项目级 cloudbaserc.json → ${mergedPath}`)
  } else if (toAggregate.length > 0) {
    console.log('  [WARN]  未生成 cloudbaserc.json（缺少 cloudbaserc.json 配置）')
  }

  const events = toAggregate.filter((f) => f.type === 'event')
  const https = toAggregate.filter((f) => f.type === 'http')

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

  updateDeployedIfChanged(projectPath, { cloudfunctions: toAggregate.map((f) => f.name) })
  console.log('')
}

async function runDatabaseSetup(
  projectPath: string,
  envId: string,
  all: Awaited<ReturnType<typeof scanCollections>>,
): Promise<void> {
  console.log(`[${CLOUD_STEPS[1]}] 数据库`)
  console.log('─'.repeat(40))

  const guides = generateCollectionGuides(all)
  for (const line of guides) {
    console.log(`  ${line}`)
  }

  // 登录
  const cred = await ensureLogin()
  if (!cred) {
    console.log('  [ERR] 登录失败，请执行 tcb login 手动登录')
    console.log('')
    return
  }

  // 交互选择
  const selectItems = [
    { value: '__all__', label: '全部集合', description: `创建全部 ${all.length} 个集合` },
    ...all.map((c) => ({
      value: c.name,
      label: c.name,
      description: `${c.description || '-'}（${c.skills.join(', ')}）`,
    })),
  ]

  const selected = await fuzzySelect(selectItems, { multiSelect: true })
  if (!selected) {
    console.log('  已取消')
    return
  }

  const selectedNames = selected.split(',').filter(Boolean)
  const toCreate = selectedNames.includes('__all__') ? all : all.filter((c) => selectedNames.includes(c.name))

  if (toCreate.length === 0) {
    console.log('  未选择任何集合')
    return
  }

  console.log(`  即将创建 ${toCreate.length} 个集合`)

  const app = CloudBase.init({
    secretId: cred.tmpSecretId,
    secretKey: cred.tmpSecretKey,
    token: cred.tmpToken,
    envId: envId,
    region: 'ap-shanghai',
  })

  let created = 0
  let errorCount = 0

  for (const col of toCreate) {
    console.log(`  ${col.name}...`)

    try {
      await app.database.createCollectionIfNotExists(col.name)
      created++
      console.log('    * 集合已就绪')
    } catch (err) {
      const msg = (err as Error).message || String(err)
      if (msg.includes('already exists') || msg.includes('exist')) {
        console.log('    * 集合已存在')
      } else {
        console.log(`    [ERR] 创建失败：${msg}`)
        errorCount++
        continue
      }
    }

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
        console.log('    * 索引已创建')
      } catch (err) {
        const msg = (err as Error).message || String(err)
        console.log(`    [WARN]  索引创建：${msg}`)
      }
    }

    if (col.aclTag) {
      try {
        await app.permission.modifyResourcePermission({
          resourceType: 'collection',
          resource: col.name,
          permission: col.aclTag as any,
        })
        console.log(`    * 安全规则：${col.aclTag}`)
      } catch (err) {
        const msg = (err as Error).message || String(err)
        console.log(`    [WARN]  安全规则配置：${msg}`)
      }
    }
  }

  console.log('')
  if (errorCount > 0) {
    console.log(`  [WARN]  ${errorCount} 个集合创建失败，请查看上面错误信息`)
  } else {
    console.log(`  [OK] 数据库初始化完成（${created}/${toCreate.length}）`)
  }

  updateDeployedIfChanged(projectPath, { collections: all.map((c) => c.name) })
  console.log('')
}

async function runServicesCheck(projectPath: string): Promise<void> {
  console.log(`[${CLOUD_STEPS[2]}] 服务`)
  console.log('─'.repeat(40))

  const funcs = scanCloudFunctions(projectPath)
  const hasHttpFunc = funcs.some((f) => f.type === 'http')
  const hasAISkill = ['text-gen-skill', 'image-gen-skill', 'image-edit-skill'].some((s) =>
    existsSync(`${projectPath}/skills/${s}`),
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

// ── cloudbase doctor ──

async function cloudbaseDoctor(projectPath: string): Promise<void> {
  console.log('cloudbase doctor — 检查 CloudBase 环境状态')
  console.log('')
  // 后续从 src/commands/doctor.ts 迁移 CloudBase 相关检查逻辑
  console.log('  （TODO）')
}

// ── cloudbase list ──

async function cloudbaseList(projectPath: string): Promise<void> {
  const state = readDeployedState(projectPath)
  if (!state) {
    console.log('  未运行过 cloudbase setup，无状态记录')
    return
  }
  console.log('CloudBase 已部署资源：')
  console.log(`  云函数: ${state.cloudfunctions?.join(', ') || '无'}`)
  console.log(`  集合: ${state.collections?.join(', ') || '无'}`)
  console.log(`  服务: ${state.services?.join(', ') || '无'}`)
}

// ── 辅助函数 ──

function updateDeployedIfChanged(projectPath: string, patch: Partial<DeployedState>): void {
  const current = readDeployedState(projectPath) || { cloudfunctions: [], collections: [], services: [] }
  updateDeployedState(projectPath, { ...current, ...patch })
}

function readEnvIdFromProject(projectPath: string): string | null {
  const paths = [resolve(projectPath, 'cloudbaserc.json'), resolve(projectPath, 'miniprogram', 'cloudbaserc.json')]
  for (const p of paths) {
    try {
      const json = JSON.parse(readFileSync(p, 'utf-8'))
      if (json.envId) {
        const resolved = String(json.envId).replace(
          /\{\{env\.(\w+)\}\}/g,
          (_, name) => process.env[name] || `{{env.${name}}}`,
        )
        if (resolved !== json.envId && resolved.includes('{{env.')) {
          console.warn('  [WARN]  环境变量 ENV_ID 未设置，保留插值。可通过 --env-id 参数指定')
        }
        return resolved
      }
    } catch {}
  }
  return null
}


async function interactiveEnvSelect(projectPath: string): Promise<string | null> {
  const cred = await ensureLogin()
  if (!cred) {
    console.log('  [ERR] 登录失败，请执行 tcb login 手动登录')
    return null
  }

  const bin = resolveCloudbaseBin()
  if (!bin) {
    console.log('  [ERR] 未找到 cloudbase CLI，无法获取环境列表')
    return null
  }

  console.log('   获取环境列表...')

  let raw: string
  try {
    raw = spawnSync(bin, ['env', 'list', '--json'], { encoding: 'utf-8', timeout: 15000 }).stdout || ''
  } catch {
    console.log('  [ERR] 获取环境列表失败，请通过 --env-id 参数指定')
    return null
  }

  let data: { envId: string; status: string; createTime: string }[]
  try {
    data = JSON.parse(raw).data || []
  } catch {
    console.log('  [ERR] 解析环境列表失败')
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
    console.log('  [ERR] 未找到可用的云开发环境')
    return null
  }

  const selected = await fuzzySelect(items, { multiSelect: false })
  return selected || null
}
