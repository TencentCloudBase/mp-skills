// ── list 命令 ──
// 列出已安装 Skill

import { existsSync, readdirSync, Dirent } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveMiniprogramRoot } from '../lib/utils.js'

interface ListOptions {
  remote?: boolean
  all?: boolean
}

export async function listCommand(opts: ListOptions): Promise<void> {
  const projectPath = resolve('.')
  const mpRoot = resolveMiniprogramRoot(projectPath)

  if (!opts.remote || opts.all) {
    console.log('已安装的 Skill：')
    const skillsDir = mpRoot ? join(mpRoot, 'skills') : null
    if (skillsDir && existsSync(skillsDir)) {
      const entries = readdirSync(skillsDir, { withFileTypes: true }).filter(
        (e: Dirent) => e.isDirectory() && existsSync(join(skillsDir, e.name, 'mcp.json')),
      )
      if (entries.length === 0) {
        console.log('  （无）')
      }
      for (const entry of entries) {
        console.log(`  ${entry.name}`)
      }
    } else {
      console.log('  （无）')
    }
  }

  if (opts.remote || opts.all) {
    console.log('')
    console.log('远程安装：')
    console.log('  npx mp-skills add TencentCloudBase/awesome-miniprogram-skills')
  }
}
