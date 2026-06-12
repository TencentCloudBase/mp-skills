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
  log(`   npx mp-skills add TencentCloudBase/awesome-miniprogram-skills --skill <skill-name>`)
  log(`   或查看 docs/SKILL-DEV-GUIDE.md`)

  // 输出微信开发者工具打开命令（自动识别系统）
  const devtoolsPath = resolveDevtoolsCli()
  if (devtoolsPath) {
    log(`   ${devtoolsPath} open --project ${resolve(name)}`)
  } else {
    log(`   用微信开发者工具打开 ${resolve(name)}`)
  }
  showSetupHint(name)
}

/**
 * 自动检测微信开发者工具 CLI 路径
 */
function resolveDevtoolsCli(): string | null {
  // 环境变量优先
  const envCli = process.env.WECHAT_DEVTOOLS_CLI || process.env.WXA_CLI
  if (envCli) return envCli

  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
      'C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat',
    ]
    for (const p of candidates) {
      if (existsSync(p)) return `"${p}"`
    }
  } else {
    const candidates = [
      '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
      `${process.env.HOME}/Applications/wechatwebdevtools.app/Contents/MacOS/cli`,
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
  }

  // 尝试系统命令
  try {
    execSync('wechatidecli --version', { stdio: 'ignore' })
    return 'wechatidecli'
  } catch {
    return null
  }
}
