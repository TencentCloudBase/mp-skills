// ── new 命令 ──
// 创建新的小程序项目，含 AI Skill 支持

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { log, ok, warn } from '../lib/utils.js'
import { showSetupHint } from '../lib/installer.js'
import { BASE } from '../lib/templates-data.js'

export async function newCommand(name: string): Promise<void> {
  const targetDir = resolve(name)

  if (existsSync(targetDir)) {
    warn(`目录已存在: ${name}`)
    return
  }

  log(`\n* 创建项目: ${name}`)

  // 从内联模板数据创建
  mkdirSync(targetDir, { recursive: true })
  for (const [relPath, content] of Object.entries(BASE)) {
    const fullPath = join(targetDir, relPath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
  }
  ok('项目骨架已生成')

  // 初始化 git
  try {
    execSync('git init', { cwd: targetDir, stdio: 'ignore' })
    ok('git 仓库已初始化')
  } catch {
    /* ignore */
  }

  log(`\n[OK] 项目已创建: ${name}`)
  log(`   cd ${name}`)
  log(`     编辑 project.config.json，将 appid 替换为你的小程序 AppID`)
  log(`   mp-skills add TencentCloudBase/awesome-miniprogram-skills --skill drink-skill`)
  log(`   或查看 docs/SKILL-DEV-GUIDE.md`)
  log(`   或使用微信开发者工具打开本项目`)
  showSetupHint()
}
