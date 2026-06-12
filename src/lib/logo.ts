// ── CLI ASCII Logo ──
// 类似 vercel-labs/skills 的风格，每个命令顶部显示 Logo

const RESET = '\x1b[0m'

// 256-color 灰色渐变（深色/浅色终端均可见）
const GRAYS = [
  '\x1b[38;5;250m',
  '\x1b[38;5;247m',
  '\x1b[38;5;244m',
  '\x1b[38;5;241m',
  '\x1b[38;5;238m',
  '\x1b[38;5;236m',
  '\x1b[38;5;234m',
  '\x1b[38;5;233m',
]

export const LOGO_LINES = [
  '██     ██ ████████           ██████  ██    ██ ████ ██       ██        ██████  ',
  '███   ███ ██     ██         ██    ██ ██   ██   ██  ██       ██       ██    ██ ',
  '████ ████ ██     ██         ██       ██  ██    ██  ██       ██       ██       ',
  '██ ███ ██ ████████  ███████  ██████  █████     ██  ██       ██        ██████  ',
  '██     ██ ██                      ██ ██  ██    ██  ██       ██             ██ ',
  '██     ██ ██                ██    ██ ██   ██   ██  ██       ██       ██    ██ ',
  '██     ██ ██                 ██████  ██    ██ ████ ████████ ████████  ██████  ',
]

export function showLogo(): void {
  console.log()
  LOGO_LINES.forEach((line, i) => {
    console.log(`  ${GRAYS[i]}${line}${RESET}`)
  })
  console.log()
}

/** 返回 Logo 字符串（用于 commander addHelpText） */
export function getLogoLines(): string[] {
  return ['', ...LOGO_LINES.map((line, i) => `  ${GRAYS[i]}${line}${RESET}`), '']
}
