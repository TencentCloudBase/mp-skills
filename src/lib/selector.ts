// ── 交互式选择器 ──
// fzf 风格的搜索选择器，支持实时过滤、方向键导航、描述显示

import * as readline from 'node:readline'

const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'
const CLEAR_DOWN = '\x1b[J'
const MOVE_UP = (n: number) => `\x1b[${n}A`
const MOVE_TO_COL = (n: number) => `\x1b[${n}G`

const DIM = '\x1b[38;5;102m'
const TEXT = '\x1b[38;5;145m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'

export interface SelectItem {
  value: string
  label: string
  description?: string
}

/**
 * fzf 风格交互选择器（支持多选）
 * @param items 选项列表（含 label + description）
 * @returns 选中 value 的逗号分隔字符串，取消返回 null
 */
export async function fuzzySelect(items: SelectItem[]): Promise<string | null> {
  if (!process.stdin.isTTY || items.length === 0) {
    return items[0]?.value || null
  }

  process.stdin.setRawMode(true)
  process.stdin.resume()
  readline.emitKeypressEvents(process.stdin)

  let query = ''
  let cursor = 0
  let renderedLines = 0
  const selectedSet = new Set<string>()

  process.stdout.write(HIDE_CURSOR)

  function getFiltered(): SelectItem[] {
    if (!query) return items
    const q = query.toLowerCase()
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q),
    )
  }

  function render(): void {
    if (renderedLines > 0) {
      process.stdout.write(MOVE_UP(renderedLines) + MOVE_TO_COL(1))
    }
    process.stdout.write(CLEAR_DOWN)

    const filtered = getFiltered()
    const lines: string[] = []

    lines.push(`  Search: ${query}_`)
    lines.push('')

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
        const check = selectedSet.has(item.value) ? `\x1b[32m●${RESET}` : ` ${DIM}○${RESET}`
        const arrow = isSelected ? `>` : ` `
        const name = isSelected ? `${CYAN}${item.label}${RESET}` : `${TEXT}${item.label}${RESET}`
        const desc = item.description ? ` ${DIM}${item.description.slice(0, 60)}${RESET}` : ''
        lines.push(` ${arrow}${check} ${name}${desc}`)
      }
    }

    const selCount = selectedSet.size
    lines.push('')
    lines.push(`  ${DIM}type to filter | space toggle | enter (${selCount} selected) | esc cancel${RESET}`)

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
        const selected = [...selectedSet]
        if (selected.length === 0 && filtered[cursor]) {
          // 未选择时，回车选中当前项
          selected.push(filtered[cursor].value)
        }
        resolve(selected.length > 0 ? selected.join(',') : null)
        return
      }

      if (key.name === 'space') {
        const filtered = getFiltered()
        const current = filtered[cursor]
        if (current) {
          if (selectedSet.has(current.value)) {
            selectedSet.delete(current.value)
          } else {
            selectedSet.add(current.value)
          }
          render()
        }
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

      if (key.sequence && !key.ctrl && !key.meta && key.sequence.length === 1) {
        query += key.sequence
        cursor = 0
        render()
      }
    }

    process.stdin.on('keypress', handleKeypress)
  })
}
