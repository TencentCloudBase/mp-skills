// ── create 命令 ──
// 在已有小程序项目中创建一个新的 Skill 骨架
// 支持交互式确认

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { log, ok, warn } from '../lib/utils.js'
import { SKELETON } from '../lib/templates-data.js'
import * as readline from 'node:readline'

export async function createCommand(name?: string): Promise<void> {
  const projectPath = resolve('.')

  // 读取 miniprogramRoot
  const configPath = join(projectPath, 'project.config.json')
  if (!existsSync(configPath)) {
    warn('当前目录不是小程序项目（未找到 project.config.json）')
    log('请在项目根目录运行')
    return
  }

  let mpRoot = 'miniprogram'
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    mpRoot = (config.miniprogramRoot || 'miniprogram').replace(/\/$/, '')
  } catch {}

  const appJsonPath = join(projectPath, mpRoot, 'app.json')
  if (!existsSync(appJsonPath)) {
    warn(`未找到 ${mpRoot}/app.json`)
    log('请确认项目结构正确')
    return
  }

  // 获取 Skill 名称
  let skillName = name
  if (!skillName && process.stdin.isTTY) {
    skillName = await promptName()
  }
  if (!skillName) {
    warn('未指定 Skill 名称')
    return
  }

  const skillsDir = join(projectPath, mpRoot, 'skills')
  const targetDir = join(skillsDir, skillName)

  if (existsSync(targetDir)) {
    warn(`Skill "${skillName}" 已存在`)
    return
  }

  // 从内联模板数据创建
  mkdirSync(targetDir, { recursive: true })
  for (const [relPath, content] of Object.entries(SKELETON)) {
    const fullPath = join(targetDir, relPath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
  }

  log(`\n* 已创建 Skill: ${skillName}`)
  ok(`${mpRoot}/skills/${skillName}/`)
  ok(`  cloudbaserc.json — 云资源声明（云函数配置 + 数据库集合）`)
  ok(`  mcp.json         — 定义 API 接口`)
  ok(`  SKILL.md         — 编排业务流程`)
  ok(`  index.js         — 注册入口`)
  ok(`  apis/            — 原子接口实现`)
  ok(`  components/      — 原子组件`)

  // 询问是否注入到 app.json（仅当未提供 name 时交互式确认）
  if (!name && process.stdin.isTTY) {
    const inject = await promptConfirm(`是否将 "${skillName}" 注册到 app.json？`)
    if (inject) {
      injectToAppJson(appJsonPath, skillName)
      ok('已注册到 app.json agent.skills')
    }
  }

  log(`\n编辑后可用 npx mp-skills add ./${skillName} 安装到其他项目`)
}

function injectToAppJson(appJsonPath: string, skillName: string) {
  const app = JSON.parse(readFileSync(appJsonPath, 'utf-8'))
  if (!app.agent) app.agent = {}
  if (!Array.isArray(app.agent.skills)) app.agent.skills = []

  const path = `skills/${skillName}`
  if (!app.agent.skills.some((s: any) => s.path === path)) {
    app.agent.skills.push({
      name: skillName.replace(/-skill$/, '').replace(/-tracker$/, ''),
      description: `${skillName} — 请更新 SKILL.md 补充描述`,
      path,
    })
    writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + '\n')
  }
}

function promptName(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question('  Skill 名称 (默认: my-skill): ', (answer) => {
      rl.close()
      resolve(answer.trim() || 'my-skill')
    })
  })
}

function promptConfirm(msg: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`  ${msg} (Y/n): `, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() !== 'n')
    })
  })
}
