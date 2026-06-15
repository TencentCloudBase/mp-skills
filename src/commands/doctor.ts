// ── doctor 命令 ──
// 健康检查：实际调 CloudBase API 检测联通性

import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { scanCloudFunctions } from '../lib/cloudfunction-scanner.js'
import { scanCollections, scanSharedCollections } from '../lib/database-scanner.js'
import { readDeployedState } from '../lib/lock-file.js'
import { resolveCloudbaseBin } from '../lib/cloudbase.js'

export async function doctorCommand(projectDir: string): Promise<void> {
  const projectPath = resolve(projectDir)

  const bin = resolveCloudbaseBin()
  if (!bin) {
    console.log('未检测到 CloudBase CLI，部分检查将跳过。')
    console.log('安装：npm i -g @cloudbase/cli')
    console.log('')
  }

  const funcs = scanCloudFunctions(projectPath)
  const collections = scanCollections(projectPath)
  const shared = scanSharedCollections(projectPath)
  const allCollections = new Map<string, string>()
  for (const c of collections) allCollections.set(c.name, c.skills.join(', '))
  for (const c of shared as any) {
    if (!allCollections.has(c.name)) allCollections.set(c.name, c.skills.join(', '))
  }

  const deployed = readDeployedState(projectPath)

  // ── 云函数 ──
  console.log('云函数联通性')
  console.log('─'.repeat(40))

  if (funcs.length === 0) {
    console.log('  （未声明云函数）')
  } else if (!bin) {
    console.log('  （跳过，未安装 CLI）')
  } else {
    const result = spawnSync(bin, ['fn', 'list', '--json'], { encoding: 'utf8' })
    const deployedNames = new Set<string>()

    if (result.status === 0) {
      try {
        const out = result.stdout || ''
        const start = out.indexOf('{')
        if (start >= 0) {
          const json = JSON.parse(out.slice(start))
          const functions = json?.data?.Functions || []
          for (const fn of functions) {
            if (fn?.FunctionName) deployedNames.add(fn.FunctionName)
          }
        }
      } catch {
        // ignore
      }
    }

    for (const f of funcs) {
      if (f.type === 'http') {
        console.log(`  --   ${f.name} [HTTP，请检查 HTTP 访问服务]`)
      } else if (deployedNames.has(f.name)) {
        console.log(`  ok   ${f.name}`)
      } else {
        console.log(`  --   ${f.name}（未部署）`)
      }
    }
  }
  console.log('')

  // ── 数据库 ──
  console.log('数据库集合')
  console.log('─'.repeat(40))

  if (allCollections.size === 0) {
    console.log('  （未声明集合）')
  } else {
    for (const [name, skills] of allCollections) {
      const isDeployed = deployed?.collections?.includes(name)
      const tag = isDeployed ? 'ok' : '--'
      const detail = isDeployed ? '' : '（未创建）'
      console.log(`  ${tag}   ${name}  [${skills}]${detail}`)
    }
  }
  console.log('')

  // ── 服务 ──
  console.log('服务')
  console.log('─'.repeat(40))
  if (deployed?.services && deployed.services.length > 0) {
    for (const s of deployed.services) {
      console.log(`  ok   ${s}`)
    }
  } else {
    console.log('  （无记录）')
  }
  console.log('')

  // ── 汇总 ──
  const deployedFuncs = deployed?.cloudfunctions || []
  const missingFuncs = funcs.filter((f) => !deployedFuncs.includes(f.name))
  const missingCols = Array.from(allCollections.keys()).filter((c) => !deployed?.collections?.includes(c))

  const issues = missingFuncs.length + missingCols.length
  if (issues > 0) {
    console.log(`发现 ${issues} 个问题，运行 mp-skills setup 修复。`)
  } else {
    console.log('一切正常。')
  }
}
