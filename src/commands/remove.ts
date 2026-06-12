// ── remove 命令 ──
// 移除已安装的 Skill

import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { removeLockEntry } from '../lib/lock-file.js'

interface RemoveOptions {
  all?: boolean
  yes?: boolean
}

export async function removeCommand(name: string, opts: RemoveOptions): Promise<void> {
  const projectPath = resolve('.')
  const mpRoot = resolveMpRoot(projectPath)
  const skillsDir = join(projectPath, mpRoot, 'skills')
  const appJsonPath = join(projectPath, mpRoot, 'app.json')

  // ── 二次确认 ──
  if (!opts.yes) {
    const target = opts.all ? '全部 Skill' : name
    const confirmed = await confirm(`确认移除 ${target}？`)
    if (!confirmed) {
      console.log('已取消。')
      return
    }
  }

  if (opts.all) {
    if (existsSync(skillsDir)) {
      rmSync(skillsDir, { recursive: true, force: true })
    }
    cleanupAppJson(appJsonPath)
    console.log('ok  已移除全部 Skill')
    return
  }

  const targetDir = join(skillsDir, name)
  if (!existsSync(targetDir)) {
    console.log(`未找到 Skill "${name}"`)
    return
  }

  rmSync(targetDir, { recursive: true })
  removeLockEntry(projectPath, name)

  // 从 app.json 移除，并在清空时清理残留字段
  cleanupAppJson(appJsonPath, name)

  console.log(`ok  已移除 ${name}`)
}

/**
 * 从 app.json 移除 Skill 注册，并在 skills 为空时清理 agent 和 subPackages 中的残留
 */
function cleanupAppJson(appJsonPath: string, skillName?: string): void {
  if (!existsSync(appJsonPath)) return

  const app = JSON.parse(readFileSync(appJsonPath, 'utf-8'))

  // 移除指定 Skill 或全部
  if (app.agent?.skills) {
    if (skillName) {
      app.agent.skills = app.agent.skills.filter(
        (s: { path: string }) => s.path !== `skills/${skillName}`,
      )
    } else {
      app.agent.skills = []
    }

    // skills 为空 → 删除 agent.skills 字段
    if (app.agent.skills.length === 0) {
      delete app.agent.skills
      // agent 只剩空对象 → 删除 agent
      if (Object.keys(app.agent).length === 0) {
        delete app.agent
      }
    }
  }

  // subPackages 中 skills 入口 → 无 Skill 时移除
  if (app.subPackages) {
    app.subPackages = app.subPackages.filter(
      (p: { root: string; name: string }) => p.name !== 'skills',
    )
    if (app.subPackages.length === 0) {
      delete app.subPackages
    }
  }

  writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + '\n')
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true

  try {
    const { default: Enquirer } = await import('enquirer')
    const { answer }: { answer: boolean } = await Enquirer.prompt({
      type: 'confirm',
      name: 'answer',
      message: question,
      initial: false,
    })
    return answer
  } catch {
    return true
  }
}

function resolveMpRoot(projectPath: string): string {
  const configPath = join(projectPath, 'project.config.json')
  if (!existsSync(configPath)) return 'miniprogram'
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return (config.miniprogramRoot || 'miniprogram').replace(/\/$/, '')
  } catch {
    return 'miniprogram'
  }
}
