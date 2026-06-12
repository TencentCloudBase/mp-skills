// ── new 命令 ──
// 创建新的小程序项目，含 AI Skill 支持

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { log, ok, warn } from '../lib/utils.js'
import { showSetupHint } from '../lib/installer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates')

export async function newCommand(name: string): Promise<void> {
  const targetDir = resolve(name)

  if (existsSync(targetDir)) {
    warn(`目录已存在: ${name}`)
    return
  }

  log(`\n📦 创建项目: ${name}`)

  const baseDir = join(TEMPLATES_DIR, 'base')
  if (!existsSync(baseDir)) {
    warn('未找到项目模板')
    return
  }

  // 拷贝基础骨架
  mkdirSync(targetDir, { recursive: true })
  cpSync(baseDir, targetDir, { recursive: true })
  ok('项目骨架已生成')

  // 初始化 git
  try {
    execSync('git init', { cwd: targetDir, stdio: 'ignore' })
    ok('git 仓库已初始化')
  } catch {
    /* ignore */
  }

  log(`\n✅ 项目已创建: ${name}`)
  log(`   cd ${name}`)
  log(`   ⚙️  编辑 project.config.json，将 appid 替换为你的小程序 AppID`)
  log(`   mp-skills add TencentCloudBase/awesome-miniprogram-skills --skill drink-skill`)
  log(`   或查看 docs/SKILL-DEV-GUIDE.md`)
  log(`   或使用微信开发者工具打开本项目`)
  showSetupHint()
}
