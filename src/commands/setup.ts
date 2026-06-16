// ── setup 命令 ──
// 脚本编排器：收集 mp-skills.json 中的 scripts.setup，确认后串行执行。
// 不认知任何平台，CloudBase 逻辑已移入 plugin 子命令。

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import type { MpSkillsJson, SetupRecord } from '../types.js'

interface SetupOptions {
  dryRun?: boolean
  json?: boolean
}

interface SetupTask {
  skill: string
  script: string
  description: string
  cwd: string
}

export async function setupCommand(projectDir: string, opts: SetupOptions): Promise<void> {
  const rawPath = resolve(projectDir)
  const resolved = resolveProjectRoot(rawPath)
  const tasks = collectSetupTasks(resolved)

  if (rawPath !== resolved && !opts.json) {
    console.log(`  [INFO] 从项目根目录运行: ${resolved}`)
  }

  if (tasks.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ tasks: [], message: '未找到任何 setup 脚本' }))
      return
    }
    console.log('')
    console.log('  ═══════════════════════════════════════════')
    console.log('   未找到任何 setup 脚本，无需执行')
    console.log('  ═══════════════════════════════════════════')
    console.log('')
    return
  }

  const prevRecords = readSetupRecords(resolved)

  // 过滤已成功的脚本
  const pending = tasks.filter(
    (t) => !prevRecords.find((r) => r.skill === t.skill && r.script === t.script && r.status === 'done'),
  )

  if (pending.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ tasks: [], message: '所有脚本上次已成功执行，跳过' }))
      return
    }
    console.log('')
    console.log('  ═══════════════════════════════════════════')
    console.log('   所有脚本上次已成功执行，跳过')
    console.log('  ═══════════════════════════════════════════')
    console.log('')
    return
  }

  // dry-run 模式
  if (opts.dryRun) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          tasks: pending.map((t) => ({ skill: t.skill, script: t.script, description: t.description })),
        }),
      )
      return
    }
    console.log('')
    console.log('  以下脚本将被执行（dry-run，不实际运行）：')
    console.log('')
    for (const t of pending) {
      console.log(`  ${t.skill}`)
      console.log(`    ${t.script}`)
      if (t.description) console.log(`    ${t.description}`)
      console.log('')
    }
    return
  }

  if (!opts.json) {
    // 展示确认清单
    console.log('')
    console.log('  ═══════════════════════════════════════════')
    console.log('  扫描到以下 setup 脚本：')
    console.log('')
    for (const t of pending) {
      console.log(`  ${t.skill}`)
      console.log(`    ${t.script}`)
      if (t.description) console.log(`    ${t.description}`)
      console.log('')
    }
    console.log(`  即将依次执行以上 ${pending.length} 个脚本。`)
    console.log('  ═══════════════════════════════════════════')
    console.log('')
  }

  const confirmed = opts.json || (await askConfirm('确认执行？(Y/n) '))
  if (!confirmed) {
    if (opts.json) {
      console.log(JSON.stringify({ cancelled: true }))
      return
    }
    console.log('  已取消')
    return
  }

  // 串行执行
  const results: SetupRecord[] = []
  for (const t of pending) {
    if (!opts.json) {
      console.log('')
      console.log(`  ── ${t.skill} ──`)
    }
    const result = await executeScript(t, resolved)
    results.push(result)
    if (!opts.json) {
      if (result.status === 'done') {
        console.log(`  [OK]  完成`)
      } else {
        console.log(`  [ERR] 退出码 ${result.errorCode ?? '?'} — ${t.script}`)
      }
    }
  }

  // 写入锁文件
  writeSetupRecords(resolved, results)

  if (opts.json) {
    console.log(JSON.stringify({ results }))
    return
  }

  // 汇总
  const success = results.filter((r) => r.status === 'done').length
  const failed = results.filter((r) => r.status === 'failed').length
  console.log('')
  console.log('  ==== 结果 ====')
  console.log(`  成功: ${success}  失败: ${failed}  跳过: ${results.length - success - failed}`)
  console.log('')
  if (failed > 0) {
    console.log('  [ERR] 部分脚本执行失败，请检查后重试。')
  }
}

// ── 扫描 ──

export function readMpSkillsJson(filePath: string): MpSkillsJson | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export function resolveSkillsDir(projectPath: string): string | null {
  // 尝试小程序 root
  try {
    const projectConfigPath = join(projectPath, 'project.config.json')
    if (existsSync(projectConfigPath)) {
      const config = JSON.parse(readFileSync(projectConfigPath, 'utf-8'))
      const mpRoot = config.miniprogramRoot || '.'
      const skillsDir = join(projectPath, mpRoot.replace(/\/$/, ''), 'skills')
      if (existsSync(skillsDir)) return skillsDir
    }
  } catch {
    // 忽略
  }
  // 回退到 projectPath/skills
  const fallback = join(projectPath, 'skills')
  return existsSync(fallback) ? fallback : null
}

export function collectSetupTasks(projectPath: string): SetupTask[] {
  const tasks: SetupTask[] = []

  // 1. 扫描 skills/*/mp-skills.json
  const skillsDir = resolveSkillsDir(projectPath)
  if (skillsDir) {
    const entries = readdirSync(skillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      const configPath = join(skillsDir, entry.name, 'mp-skills.json')
      if (!existsSync(configPath)) continue
      const config = readMpSkillsJson(configPath)
      if (config?.scripts?.setup) {
        tasks.push({
          skill: entry.name,
          script: config.scripts.setup,
          description: config.description || '',
          cwd: join(skillsDir, entry.name),
        })
      }
    }
  }

  // 2. 扫描项目级 mp-skills.json
  const projectConfigPath = join(projectPath, 'mp-skills.json')
  if (existsSync(projectConfigPath)) {
    const config = readMpSkillsJson(projectConfigPath)
    if (config?.scripts?.setup) {
      tasks.push({
        skill: '__project__',
        script: config.scripts.setup,
        description: config.description || '',
        cwd: projectPath,
      })
    }
  }

  // 按 skill 名排序，保证输出稳定
  tasks.sort((a, b) => a.skill.localeCompare(b.skill))
  return tasks
}

// ── 项目根目录检测 ──

export function resolveProjectRoot(startPath: string): string {
  // 如果当前目录已有项目特征文件，直接返回
  if (hasProjectFiles(startPath)) return startPath

  // 向上遍历查找 project.config.json
  let current = startPath
  const root = resolve(current, '/')
  while (current !== root) {
    current = resolve(current, '..')
    if (hasProjectFiles(current)) return current
  }

  // 没找到则返回原始路径
  return startPath
}

function hasProjectFiles(dir: string): boolean {
  return existsSync(join(dir, 'project.config.json')) || existsSync(join(dir, 'skills'))
}

// ── 执行 ──

function executeScript(task: SetupTask, projectPath: string): Promise<SetupRecord> {
  return new Promise((resolveRecord) => {
    const startTime = new Date().toISOString()

    const child = spawn(task.script, [], {
      cwd: task.cwd,
      stdio: ['inherit', 'inherit', 'pipe'],
      shell: true,
      timeout: 300_000,
      env: {
        ...process.env,
        PROJECT_DIR: projectPath,
        SKILL_DIR: task.cwd,
      },
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      process.stderr.write(chunk)
    })

    child.on('close', (code) => {
      resolveRecord({
        script: task.script,
        skill: task.skill,
        status: code === 0 ? 'done' : 'failed',
        executedAt: startTime,
        errorCode: code ?? undefined,
      })
    })

    child.on('error', () => {
      resolveRecord({
        script: task.script,
        skill: task.skill,
        status: 'failed',
        executedAt: startTime,
        errorCode: -1,
      })
    })
  })
}

// ── 确认 ──

function askConfirm(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(prompt)
    process.stdin.once('data', (data) => {
      const input = data.toString().trim().toLowerCase()
      resolve(input === '' || input === 'y' || input === 'yes')
    })
  })
}

// ── 锁文件记录 ──

interface LockData {
  version: number
  skills: unknown[]
  scriptsSetup?: SetupRecord[]
}

export function readSetupRecords(projectPath: string): SetupRecord[] {
  const lockPath = join(projectPath, 'skills-lock.json')
  if (!existsSync(lockPath)) return []
  try {
    const data: LockData = JSON.parse(readFileSync(lockPath, 'utf-8'))
    return data.scriptsSetup || []
  } catch {
    return []
  }
}

export function writeSetupRecords(projectPath: string, records: SetupRecord[]): void {
  const lockPath = join(projectPath, 'skills-lock.json')
  let lock: LockData
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf-8'))
  } catch {
    lock = { version: 2, skills: [] }
  }

  // 合并：新记录覆盖旧记录（同名 skill+script）
  const existing = (lock.scriptsSetup || []).filter(
    (r) => !records.some((nr) => nr.skill === r.skill && nr.script === r.script),
  )
  lock.scriptsSetup = [...existing, ...records]

  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
}
