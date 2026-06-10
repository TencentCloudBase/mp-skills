// ── 交互式选择器 ──
// fzf 风格的搜索选择器，支持实时过滤、方向键导航
// 参考 vercel-labs/skills 的交互模式，独立实现

import * as readline from 'node:readline'

// ANSI 控制
const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'
const CLEAR_DOWN = '\x1b[J'
const MOVE_UP = (n: number) => `\x1b[${n}A`
const MOVE_TO_COL = (n: number) => `\x1b[${n}G`

/**
 * fzf 风格的交互选择器
 * @param items 选项列表
 * @returns 选中的值，取消返回 null
 */
export async function fuzzySelect(items: string[]): Promise<string | null> {
  if (!process.stdin.isTTY || items.length === 0) {
    return items[0] || null
  }

  // 启用原始模式
  process.stdin.setRawMode(true)
  process.stdin.resume()
  readline.emitKeypressEvents(process.stdin)

  let query = ''
  let cursor = 0
  let renderedLines = 0

  process.stdout.write(HIDE_CURSOR)

  function getFiltered(): string[] {
    if (!query) return items
    const q = query.toLowerCase()
    return items.filter((item) => item.toLowerCase().includes(q))
  }

  function render(): void {
    // 清空上次输出
    if (renderedLines > 0) {
      process.stdout.write(MOVE_UP(renderedLines) + MOVE_TO_COL(1))
    }
    process.stdout.write(CLEAR_DOWN)

    const filtered = getFiltered()
    const lines: string[] = []

    // 搜索输入行
    lines.push(`  Search: ${query}_`)
    lines.push('')

    // 结果列表（最多显示 6 项）
    if (filtered.length === 0) {
      lines.push('  No matches')
    } else {
      const maxVisible = 6
      const start = Math.max(0, Math.min(cursor - 2, filtered.length - maxVisible))
      const visible = filtered.slice(start, start + maxVisible)
      const actualCursor = cursor - start

      for (let i = 0; i < visible.length; i++) {
        const item = visible[i]
        const isSelected = i === actualCursor
        const prefix = isSelected ? ' >' : '  '
        const style = isSelected ? `\x1b[36m${item}\x1b[0m` : `\x1b[38;5;145m${item}\x1b[0m`
        lines.push(`${prefix} ${style}`)
      }
    }

    lines.push('')
    lines.push('  \x1b[38;5;102mtype to filter | up/down navigate | enter select | esc cancel\x1b[0m')

    for (const line of lines) {
      process.stdout.write(line + '\n')
    }
    renderedLines = lines.length
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
        const filtered = getFiltered()
        resolve(filtered[cursor] || null)
        return
      }

      if (key.name === 'up') {
        const filtered = getFiltered()
        cursor = Math.max(0, cursor - 1)
        render()
        return
      }

      if (key.name === 'down') {
        const filtered = getFiltered()
        cursor = Math.min(filtered.length - 1, cursor + 1)
        render()
        return
      }

      if (key.name === 'backspace') {
        if (query.length > 0) {
          query = query.slice(0, -1)
          cursor = 0
          render()
        }
        return
      }

      // 常规字符输入
      if (key.sequence && !key.ctrl && !key.meta && key.sequence.length === 1) {
        query += key.sequence
        cursor = 0
        render()
      }
    }

    process.stdin.on('keypress', handleKeypress)
  })
}
