// ── status 命令 ──
// 读锁文件，与 Skill 声明对比，输出差异表

import { resolve } from 'node:path'
import { scanCloudFunctions } from '../lib/cloudfunction-scanner.js'
import { scanCollections, scanSharedCollections } from '../lib/database-scanner.js'
import { readDeployedState } from '../lib/lock-file.js'

export async function statusCommand(projectDir: string): Promise<void> {
  const projectPath = resolve(projectDir)

  const declaredFuncs = scanCloudFunctions(projectPath)
  const declaredCollections = scanCollections(projectPath)
  const sharedCollections = scanSharedCollections(projectPath)
  const allCollections = new Map<string, { name: string; skills: string[] }>()
  for (const c of declaredCollections) allCollections.set(c.name, { name: c.name, skills: c.skills })
  for (const c of sharedCollections) allCollections.set(c.name, { name: c.name, skills: c.skills })

  const deployed = readDeployedState(projectPath) || { cloudfunctions: [], collections: [], services: [] }

  // ── 云函数 ──
  const deployedFuncSet = new Set(deployed.cloudfunctions)
  const funcOk = declaredFuncs.filter((f) => deployedFuncSet.has(f.name))
  const funcMissing = declaredFuncs.filter((f) => !deployedFuncSet.has(f.name))

  console.log('云函数')
  console.log('─'.repeat(40))
  for (const f of funcOk) {
    console.log(`  ok   ${f.name}`)
  }
  for (const f of funcMissing) {
    const badge = f.type === 'http' ? ' [HTTP，需 CLI 部署]' : ''
    console.log(`  --   ${f.name}${badge}`)
  }
  if (declaredFuncs.length === 0) {
    console.log('  （无）')
  }
  console.log(`  已部署 ${funcOk.length} 个，待处理 ${funcMissing.length} 个`)
  console.log('')

  // ── 数据库 ──
  const deployedColSet = new Set(deployed.collections)
  const colOk = Array.from(allCollections.values()).filter((c) => deployedColSet.has(c.name))
  const colMissing = Array.from(allCollections.values()).filter((c) => !deployedColSet.has(c.name))

  console.log('数据库')
  console.log('─'.repeat(40))
  for (const c of colOk) {
    console.log(`  ok   ${c.name}`)
  }
  for (const c of colMissing) {
    console.log(`  --   ${c.name}  [${c.skills.join(', ')}]`)
  }
  if (allCollections.size === 0) {
    console.log('  （无）')
  }
  console.log(`  已创建 ${colOk.length} 个，待处理 ${colMissing.length} 个`)
  console.log('')

  // ── 服务 ──
  console.log('服务')
  console.log('─'.repeat(40))
  const serviceSet = new Set(deployed.services)
  if (serviceSet.has('http-service')) {
    console.log('  ok   HTTP 访问服务')
  }
  if (serviceSet.has('ai-model')) {
    console.log('  ok   AI 模型')
  }
  if (deployed.services.length === 0) {
    console.log('  （无记录）')
  }
  console.log('')

  // ── 总体建议 ──
  if (funcMissing.length > 0 || colMissing.length > 0) {
    console.log('运行 mp-skills setup 处理待办项。')
  } else {
    console.log('状态正常。')
  }
}
