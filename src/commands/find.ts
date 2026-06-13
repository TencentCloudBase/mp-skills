// ── find 命令 ──
// fzf 风格交互式搜索远程业务 Skill（原生 readline，零依赖）
// 从 cnb.cool 注册表查询 → 内联数据兜底
// 参考 vercel-labs/skills 的 find.ts 实现

import * as readline from 'readline'
import { fetchRemoteFile } from '../lib/git.js'
import pc from 'picocolors'

// ── ANSI 常量 ──

const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'
const CLEAR_DOWN = '\x1b[J'
const MOVE_UP = (n: number) => `\x1b[${n}A`

interface SkillEntry {
  name: string
  repo: string
  description: string
}

interface RegistryRepo {
  name: string
  repo: string
  ref: string
  pathPattern?: string
  skills: Array<{ name: string; description: string }>
}

interface Registry {
  registryUrl?: string
  repositories: RegistryRepo[]
}

// ── 内联注册表（esbuild 打包后路径不可靠，直接内联）──

const DEFAULT_REGISTRY: Registry = {
  registryUrl: 'https://cnb.cool/tencent/cloud/cloudbase/awesome-miniprogram-skills/-/raw/main/registry.json',
  repositories: [
    {
      name: 'awesome-miniprogram',
      repo: 'TencentCloudBase/awesome-miniprogram-skills',
      ref: 'feat/skill-market',
      pathPattern: 'skills/<name>/mcp.json',
      skills: [
        { name: 'drink-skill', description: '咖啡点单：推荐饮品、搜索、选规格、填地址、下单支付' },
        { name: 'order-skill', description: '外卖点餐：搜索餐厅、浏览菜单、下单、查看配送状态' },
        { name: 'hospital-skill', description: '医院挂号：搜索医院科室、查看可挂号时段、预约挂号' },
        { name: 'taxi-skill', description: '出行打车：预估行程价格、呼叫出租车、查看行程状态' },
        { name: 'travel-skill', description: '旅行规划：搜索目的地、规划行程、查询天气、获取贴士' },
        { name: 'shopping-skill', description: '潮玩购物：搜索商品、查看详情、查询门店库存、下单' },
        { name: 'bill-skill', description: '生活缴费：查询待缴账单、缴费支付、查看缴费历史' },
        { name: 'party-skill', description: '聚会安排：创建聚会活动、获取场所推荐、邀请好友' },
        { name: 'queue-skill', description: '排队取号：搜索门店、线上取号、查看排队进度' },
        { name: 'todolist-skill', description: '简单待办：查看待办、添加、标记完成' },
        { name: 'water-tracker', description: '喝水记录：记录每日饮水量、查看饮水历史' },
        { name: 'payment-skill', description: '微信支付：创建支付订单、调起支付、查询支付状态' },
      ],
    },
    {
      name: 'ai-mode-demo',
      repo: 'wechat-miniprogram/ai-mode-demo',
      ref: 'master',
      skills: [{ name: 'drink-skill', description: '咖啡点单：推荐饮品、搜索、选规格、填地址、下单支付' }],
    },
  ],
}

/** 加载注册表：cnb.cool 远程优先 → 内联兜底 */
async function loadRegistry(): Promise<{ registry: Registry; fromRemote: boolean }> {
  const remoteUrl = DEFAULT_REGISTRY.registryUrl
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
      // fall through
    }
  }
  return { registry: DEFAULT_REGISTRY, fromRemote: false }
}

// ── 数据源 ──

async function fetchAllSkills(registry: Registry): Promise<SkillEntry[]> {
  const results: SkillEntry[] = []

  for (const repo of registry.repositories) {
    try {
      if (repo.skills && repo.skills.length > 0) {
        for (const s of repo.skills) {
          results.push({
            name: s.name,
            repo: repo.repo,
            description: s.description || '',
          })
        }
      } else {
        const sourceInfo = { type: 'github' as const, original: repo.repo, repoName: repo.repo, ref: repo.ref }
        const { listRemoteSkills } = await import('../lib/git.js')
        const skills = await listRemoteSkills(sourceInfo, repo.pathPattern)
        for (const s of skills) {
          results.push({ name: s.name, repo: repo.repo, description: '' })
        }
      }
    } catch {
      // 单个仓库失败继续
    }
  }

  results.sort((a, b) => a.name.localeCompare(b.name))
  const seen = new Set<string>()
  return results.filter((s) => {
    if (seen.has(s.name)) return false
    seen.add(s.name)
    return true
  })
}

/** 并行预取描述（从 GitHub raw 读 mcp.json） */
async function fetchDescriptions(skills: SkillEntry[]): Promise<void> {
  const fetchOne = async (skill: SkillEntry) => {
    if (skill.description) return
    const mcpPath = `skills/${skill.name}/mcp.json`
    const sourceInfo = { type: 'github' as const, original: skill.repo, repoName: skill.repo, ref: '' }
    const content = await fetchRemoteFile(sourceInfo, mcpPath)
    if (!content) return
    try {
      const mcp = JSON.parse(content)
      let desc = (mcp.description || '').split('\n')[0].trim()
      if (!desc && Array.isArray(mcp.apis) && mcp.apis[0]?.description) {
        desc = mcp.apis[0].description.split('\n')[0].trim()
      }
      if (desc) {
        skill.description = desc.length > 80 ? desc.slice(0, 80) + '...' : desc
      }
    } catch {
      // ignore
    }
  }
  await Promise.all(skills.map(fetchOne))
}

function matchSkill(skill: SkillEntry, query: string): boolean {
  const q = query.toLowerCase()
  return skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q)
}

// ── 非交互模式 ──

async function staticSearch(keyword: string, registry: Registry): Promise<void> {
  console.log(`搜索 Skill${keyword ? `："${keyword}"` : ''}`)
  console.log('')

  const allSkills = await fetchAllSkills(registry)
  await fetchDescriptions(allSkills)

  const filtered = allSkills.filter((s) => matchSkill(s, keyword))
  const keywordLower = keyword.toLowerCase()

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
    console.log(`    ${pc.dim('安装：')}npx mp-skills add ${r.repo} --skill ${r.name}`)
    console.log('')
  }

  console.log(`共 ${pc.bold(String(filtered.length))} 个结果`)
}

// ── 交互模式 ──

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
  console.log('')
  console.log(`  ${pc.dim('安装命令：')}`)
  console.log(`  ${pc.cyan(`npx mp-skills add ${selected.repo} --skill ${selected.name}`)}`)
  console.log('')
}

// ── 搜索提示 ──

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

        lines.push(`  ${arrow} ${name}`)
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

// ── 内联 spinner ──

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
