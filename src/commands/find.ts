// ── find 命令 ──
// fzf 风格交互式搜索远程 Skill（原生 readline，零依赖）
// 参考 vercel-labs/skills 的 find.ts 实现

import * as readline from 'readline'
import { listRemoteSkills, fetchRemoteFile } from '../lib/git.js'
import pc from 'picocolors'

// ── ANSI 常量 ──

const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'
const CLEAR_DOWN = '\x1b[J'
const MOVE_UP = (n: number) => `\x1b[${n}A`

/** 搜索目标仓库 */
const SEARCH_REPOS = ['TencentCloudBase/awesome-miniprogram-skills']

interface SkillEntry {
  name: string
  repo: string
  description: string
}

interface RemoteSource {
  type: 'github'
  original: string
  repoName: string
  ref: string
}

const DEFAULT_SOURCE: RemoteSource = {
  type: 'github',
  original: SEARCH_REPOS[0]!,
  repoName: SEARCH_REPOS[0]!,
  ref: 'main',
}

// ── 数据源 ──

async function fetchAllSkills(): Promise<SkillEntry[]> {
  const results: SkillEntry[] = []
  for (const repo of SEARCH_REPOS) {
    try {
      const skills = await listRemoteSkills({
        type: 'github',
        original: repo,
        repoName: repo,
        ref: 'main',
      })
      for (const s of skills) {
        results.push({ name: s.name, repo, description: '' })
      }
    } catch {
      // 单个仓库失败继续
    }
  }
  // 按名称排序
  results.sort((a, b) => a.name.localeCompare(b.name))
  return results
}

/**
 * 并行预取所有 Skill 的 mcp.json，提取 description。
 * mcp.json 中顶层有 description 字段，优先取它；
 * 否则取第一个 apis[].description 的第一行作为摘要。
 */
async function fetchDescriptions(skills: SkillEntry[]): Promise<void> {
  const fetchOne = async (skill: SkillEntry) => {
    const source: RemoteSource = { ...DEFAULT_SOURCE, repoName: skill.repo }
    const content = await fetchRemoteFile(source, `skills/${skill.name}/mcp.json`)
    if (!content) return
    try {
      const mcp = JSON.parse(content)
      // 取 mcp 顶层 description 或首个 API 的描述第一行，限制 80 字
      let desc = (mcp.description || '').split('\n')[0].trim()
      if (!desc && Array.isArray(mcp.apis) && mcp.apis[0]?.description) {
        desc = mcp.apis[0].description.split('\n')[0].trim()
      }
      if (desc.length > 80) desc = desc.slice(0, 80) + '...'
      skill.description = desc
    } catch {
      // ignore
    }
  }

  await Promise.all(skills.map(fetchOne))
}

function matchSkill(skill: SkillEntry, query: string): boolean {
  const q = query.toLowerCase()
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q)
  )
}

// ── 非交互模式（有关键词或非 TTY） ──

async function staticSearch(keyword: string): Promise<void> {
  console.log(`搜索 Skill${keyword ? `："${keyword}"` : ''}`)
  console.log('')

  const allSkills = await fetchAllSkills()
  await fetchDescriptions(allSkills)

  const filtered = allSkills.filter((s) => matchSkill(s, keyword))
  const keywordLower = keyword.toLowerCase()

  // 对匹配度排序：name 完全匹配 > name 包含 > desc 包含
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
    console.log(`    ${pc.dim('安装：')}mp-skills add ${r.repo} --skill ${r.name}`)
    console.log('')
  }

  console.log(`共 ${pc.bold(String(filtered.length))} 个结果`)
}

// ── 交互模式（无关键词 + TTY） ──

async function interactiveSearch(): Promise<void> {
  // 预加载所有 Skill
  const spinner = createInlineSpinner()
  spinner.start('正在获取 Skill 列表...')
  let allSkills: SkillEntry[] = []
  try {
    allSkills = await fetchAllSkills()
  } catch {
    allSkills = []
  }

  if (allSkills.length === 0) {
    spinner.stop()
    console.log(`  ${pc.dim('（未能获取 Skill 列表，请检查网络连接）')}`)
    console.log('')
    return
  }

  // 并行预取描述
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
  console.log('')
  console.log(`  ${pc.dim('安装命令：')}`)
  console.log(`  ${pc.cyan(`mp-skills add ${selected.repo} --skill ${selected.name}`)}`)
  console.log('')
}

// ── 自定义搜索提示（原生 readline） ──

async function runSearchPrompt(allSkills: SkillEntry[]): Promise<SkillEntry | null> {
  let results = allSkills.slice(0, 12) // 初始显示前 12 个
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

    // 搜索输入行
    const cursor = pc.bold('_')
    lines.push(`  ${pc.cyan('Search skills:')} ${query}${cursor}`)
    lines.push('')

    // 结果区
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

        lines.push(`  ${arrow} ${name}`)
        // 描述行
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

      // 普通字符输入
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
  if (keyword || !process.stdin.isTTY) {
    return staticSearch(keyword)
  }
  return interactiveSearch()
}
