// ── find 命令 ──
// fzf 风格交互式搜索远程 Skill（原生 readline，零依赖）
// 从 registry 多源搜索（cnb.cool 远程 JSON → 本地 fallback）
// 参考 vercel-labs/skills 的 find.ts 实现

import * as readline from 'readline'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listRemoteSkills, fetchRemoteFile } from '../lib/git.js'
import pc from 'picocolors'

// ── ANSI 常量 ──

const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'
const CLEAR_DOWN = '\x1b[J'
const MOVE_UP = (n: number) => `\x1b[${n}A`

interface SkillEntry {
  name: string
  repo: string // 仓库名，用于 install 命令提示
  description: string
  sourceLabel: string // 来源标签，显示用
}

interface RegistryRepo {
  name: string
  repo: string
  ref: string
  pathPattern?: string
  mirrorUrl?: string
  skills: Array<{ name: string; description: string }>
}

interface Registry {
  registryUrl?: string
  repositories: RegistryRepo[]
}

// ── 加载注册表 ──

const LOCAL_REGISTRY_PATH = join(fileURLToPath(new URL('..', import.meta.url)), 'registry.json')

/** 读取本地 registry.json */
function loadLocalRegistry(): Registry {
  try {
    return JSON.parse(readFileSync(LOCAL_REGISTRY_PATH, 'utf-8'))
  } catch {
    return { repositories: [] }
  }
}

/** 从 cnb.cool 拉远程 registry.json，失败则读本地 */
async function loadRegistry(): Promise<{ registry: Registry; fromRemote: boolean }> {
  const local = loadLocalRegistry()
  const remoteUrl = local.registryUrl

  if (remoteUrl) {
    try {
      const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const remote: Registry = await res.json()
        if (remote.repositories?.length) {
          return { registry: remote, fromRemote: true }
        }
      }
    } catch {
      // fall through to local
    }
  }

  return { registry: local, fromRemote: false }
}

// ── 数据源 ──

async function fetchAllSkills(registry: Registry): Promise<SkillEntry[]> {
  const results: SkillEntry[] = []

  for (const repo of registry.repositories) {
    try {
      if (repo.skills && repo.skills.length > 0) {
        // 显式声明的 skill，直接使用
        for (const s of repo.skills) {
          results.push({
            name: s.name,
            repo: repo.repo,
            description: s.description || '',
            sourceLabel: repo.name,
          })
        }
      } else {
        // 未声明 → 通过 API 动态发现
        const sourceInfo = { type: 'github' as const, original: repo.repo, repoName: repo.repo, ref: repo.ref }
        const skills = await listRemoteSkills(sourceInfo, repo.pathPattern, repo.mirrorUrl)
        for (const s of skills) {
          results.push({
            name: s.name,
            repo: repo.repo,
            description: '',
            sourceLabel: repo.name,
          })
        }
      }
    } catch {
      // 单个仓库失败继续
    }
  }

  // 按名称排序
  results.sort((a, b) => a.name.localeCompare(b.name))
  // 去重（同名的保留第一个）
  const seen = new Set<string>()
  return results.filter((s) => {
    if (seen.has(s.name)) return false
    seen.add(s.name)
    return true
  })
}

/**
 * 并行预取所有 Skill 的描述。
 * 根据仓库结构适配不同路径（mcp.json 或 SKILL.md）。
 */
async function fetchDescriptions(skills: SkillEntry[]): Promise<void> {
  const fetchOne = async (skill: SkillEntry) => {
    // 已有描述的直接跳过
    if (skill.description) return

    // 尝试 mcp.json（awesome-miniprogram 结构）
    const mcpPath = `skills/${skill.name}/mcp.json`
    const sourceInfo = { type: 'github' as const, original: skill.repo, repoName: skill.repo, ref: '' }
    const mcpContent = await fetchRemoteFile(sourceInfo, mcpPath)
    if (mcpContent) {
      try {
        const mcp = JSON.parse(mcpContent)
        let desc = (mcp.description || '').split('\n')[0].trim()
        if (!desc && Array.isArray(mcp.apis) && mcp.apis[0]?.description) {
          desc = mcp.apis[0].description.split('\n')[0].trim()
        }
        if (desc) {
          skill.description = desc.length > 80 ? desc.slice(0, 80) + '...' : desc
          return
        }
      } catch {
        /* ignore */
      }
    }

    // 尝试 SKILL.md（ai-mode-official 结构）
    const skillMdPath = `${skill.name}/SKILL.md`
    const mdContent = await fetchRemoteFile(sourceInfo, skillMdPath)
    if (mdContent) {
      // 从 frontmatter 中提取 description
      const descMatch = mdContent.match(/^---\n[\s\S]*?\ndescription:\s*(.+)\n[\s\S]*?\n---/)
      if (descMatch) {
        skill.description =
          descMatch[1]!.trim().length > 80 ? descMatch[1]!.trim().slice(0, 80) + '...' : descMatch[1]!.trim()
      }
    }
  }

  await Promise.all(skills.map(fetchOne))
}

function matchSkill(skill: SkillEntry, query: string): boolean {
  const q = query.toLowerCase()
  return skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q)
}

// ── 非交互模式（有关键词或非 TTY） ──

async function staticSearch(keyword: string, registry: Registry): Promise<void> {
  console.log(`搜索 Skill${keyword ? `："${keyword}"` : ''}`)
  console.log('')

  const allSkills = await fetchAllSkills(registry)
  await fetchDescriptions(allSkills)

  const filtered = allSkills.filter((s) => matchSkill(s, keyword))
  const keywordLower = keyword.toLowerCase()

  // 对匹配度排序
  filtered.sort((a, b) => {
    const aName = a.name.toLowerCase()
    const bName = b.name.toLowerCase()
    const aExact = aName === keywordLower ? 0 : 1
    const bExact = bName === keywordLower ? 0 : 1
    if (aExact !== bExact) return aExact - bExact
    const aStarts = aName.startsWith(keywordLower) ? 0 : 1
    const bStarts = bName.startsWith(keywordLower) ? 0 : 1
    return aStarts - bStarts
  })

  if (filtered.length === 0) {
    console.log(`  ${pc.dim('（未找到匹配的 Skill）')}`)
    console.log('')
    return
  }

  for (const r of filtered) {
    console.log(`  ${pc.bold(r.name)}`)
    if (r.description) {
      console.log(`    ${pc.dim(r.description)}`)
    }
    if (r.sourceLabel) {
      console.log(`    ${pc.dim('来源：')}${r.sourceLabel}`)
    }
    console.log(`    ${pc.dim('安装：')}npx mp-skills add ${r.repo} --skill ${r.name}`)
    console.log('')
  }

  console.log(`共 ${pc.bold(String(filtered.length))} 个结果`)
}

// ── 交互模式（无关键词 + TTY） ──

async function interactiveSearch(registry: Registry): Promise<void> {
  const spinner = createInlineSpinner()
  spinner.start('正在获取 Skill 列表...')
  let allSkills: SkillEntry[] = []
  try {
    allSkills = await fetchAllSkills(registry)
  } catch {
    allSkills = []
  }

  if (allSkills.length === 0) {
    spinner.stop()
    console.log(`  ${pc.dim('（未能获取 Skill 列表，请检查网络连接）')}`)
    console.log('')
    return
  }

  spinner.update('正在获取 Skill 描述...')
  await fetchDescriptions(allSkills)
  spinner.stop()

  const selected = await runSearchPrompt(allSkills)

  if (!selected) {
    console.log(`${pc.dim('已取消')}`)
    console.log('')
    return
  }

  console.log('')
  console.log(`  ${pc.bold(selected.name)}`)
  if (selected.description) {
    console.log(`  ${pc.dim(selected.description)}`)
  }
  if (selected.sourceLabel) {
    console.log(`  ${pc.dim('来源：')}${selected.sourceLabel}`)
  }
  console.log('')
  console.log(`  ${pc.dim('安装命令：')}`)
  console.log(`  ${pc.cyan(`npx mp-skills add ${selected.repo} --skill ${selected.name}`)}`)
  console.log('')
}

// ── 自定义搜索提示（原生 readline） ──

async function runSearchPrompt(allSkills: SkillEntry[]): Promise<SkillEntry | null> {
  let results = allSkills.slice(0, 12)
  let selectedIndex = 0
  let query = ''
  let lastRenderedLines = 0

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
  readline.emitKeypressEvents(process.stdin)
  process.stdin.resume()
  process.stdout.write(HIDE_CURSOR)

  function render(): void {
    if (lastRenderedLines > 0) {
      process.stdout.write(MOVE_UP(lastRenderedLines))
    }
    process.stdout.write(CLEAR_DOWN)

    const lines: string[] = []

    const cursor = pc.bold('_')
    lines.push(`  ${pc.cyan('Search skills:')} ${query}${cursor}`)
    lines.push('')

    if (results.length === 0) {
      lines.push(`  ${pc.dim('（无匹配结果）')}`)
    } else {
      const maxVisible = 8
      const visible = results.slice(0, maxVisible)

      for (let i = 0; i < visible.length; i++) {
        const skill = visible[i]!
        const isSelected = i === selectedIndex
        const arrow = isSelected ? pc.cyan('>') : ' '
        const name = isSelected ? pc.bold(pc.cyan(skill.name)) : pc.white(skill.name)
        const label = skill.sourceLabel ? ` ${pc.dim('[' + skill.sourceLabel + ']')}` : ''

        lines.push(`  ${arrow} ${name}${label}`)
        if (skill.description) {
          const descColor = isSelected ? pc.cyan : pc.dim
          lines.push(`    ${descColor(skill.description)}`)
        }
      }
    }

    lines.push('')
    lines.push(`  ${pc.dim('↑↓ 导航  Enter 选择  Esc 取消  输入关键词搜索')}`)

    for (const line of lines) {
      process.stdout.write(line + '\n')
    }

    lastRenderedLines = lines.length
  }

  function filterSkills(q: string): void {
    if (!q) {
      results = allSkills.slice(0, 12)
    } else {
      results = allSkills.filter((s) => matchSkill(s, q))
    }
    selectedIndex = 0
  }

  render()

  return new Promise((resolve) => {
    function cleanup(): void {
      process.stdin.removeListener('keypress', handleKeypress)
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      process.stdout.write(SHOW_CURSOR)
      process.stdin.pause()
    }

    function handleKeypress(_ch: string | undefined, key: readline.Key): void {
      if (!key) return

      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup()
        resolve(null)
        return
      }

      if (key.name === 'return') {
        cleanup()
        resolve(results[selectedIndex] || null)
        return
      }

      if (key.name === 'up') {
        selectedIndex = Math.max(0, selectedIndex - 1)
        render()
        return
      }

      if (key.name === 'down') {
        selectedIndex = Math.min(Math.max(0, results.length - 1), selectedIndex + 1)
        render()
        return
      }

      if (key.name === 'backspace') {
        if (query.length > 0) {
          query = query.slice(0, -1)
          filterSkills(query)
          render()
        }
        return
      }

      if (key.sequence && !key.ctrl && !key.meta && key.sequence.length === 1) {
        const char = key.sequence
        if (char >= ' ' && char <= '~') {
          query += char
          filterSkills(query)
          render()
        }
      }
    }

    process.stdin.on('keypress', handleKeypress)
  })
}

// ── 内联 spinner 工具 ──

function createInlineSpinner() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  let timer: ReturnType<typeof setInterval> | null = null
  return {
    start(text: string): void {
      process.stdout.write(`  ${pc.dim(text)}`)
      timer = setInterval(() => {
        process.stdout.write(`\r  ${pc.dim(frames[i++ % frames.length]! + ' ' + text)}`)
      }, 80)
    },
    update(text: string): void {
      if (timer) {
        process.stdout.write(`\r  ${pc.dim(frames[i++ % frames.length]! + ' ' + text)}`)
      }
    },
    stop(): void {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      process.stdout.write('\r' + ' '.repeat(60) + '\r')
    },
  }
}

// ── 入口 ──

export async function findCommand(keyword: string): Promise<void> {
  const { registry, fromRemote } = await loadRegistry()

  if (fromRemote) {
    console.log(`  ${pc.dim('（已加载远程注册表）')}`)
  }

  if (keyword || !process.stdin.isTTY) {
    return staticSearch(keyword, registry)
  }
  return interactiveSearch(registry)
}
