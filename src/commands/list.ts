// ── list 命令 ──
// 列出已安装 Skill

import { existsSync, readdirSync, Dirent } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveMiniprogramRoot } from '../lib/utils.js'

interface ListOptions {
  remote?: boolean
  all?: boolean
  json?: boolean
}

export async function listCommand(opts: ListOptions): Promise<void> {
  const projectPath = resolve('.')
  const mpRoot = resolveMiniprogramRoot(projectPath)
  const skillsDir = mpRoot ? join(mpRoot, 'skills') : null

  const localSkills: { name: string; path: string }[] = []
  if (skillsDir && existsSync(skillsDir)) {
    const entries = readdirSync(skillsDir, { withFileTypes: true }).filter(
      (e: Dirent) => e.isDirectory() && existsSync(join(skillsDir, e.name, 'mcp.json')),
    )
    for (const entry of entries) {
      localSkills.push({ name: entry.name, path: `skills/${entry.name}` })
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ installed: localSkills }))
    return
  }

  if (!opts.remote || opts.all) {
    console.log('已安装的 Skill：')
    if (localSkills.length === 0) {
      console.log('  （无）')
    }
    for (const s of localSkills) {
      console.log(`  ${s.name}`)
    }
  }

  if (opts.remote || opts.all) {
    console.log('')
    console.log('远程安装：')
    console.log('  npx mp-skills add TencentCloudBase/awesome-miniprogram-skills')
  }
}
