// ── 安全工具 ──
// 输入消毒、shell 注入防护

/**
 * 消毒 Git URL，防止 shell 注入
 * 只允许安全字符，移除所有 shell 元字符
 */
export function sanitizeGitUrl(url: string): string {
  // 只允许 URL 安全字符：字母数字 . : / - _ @ ~ % # +
  const safe = url.replace(/[^a-zA-Z0-9.:\/\-_@~%#+]/g, '')
  if (safe !== url) {
    console.warn('  ⚠️  URL 包含不安全字符，已自动清理')
  }
  return safe
}

/**
 * 消毒分支名/引用名
 * Git refs 只允许：字母数字 . / - _ 
 */
export function sanitizeRef(ref: string): string {
  const safe = ref.replace(/[^a-zA-Z0-9.\/\-_]/g, '')
  if (safe !== ref) {
    console.warn('  ⚠️  引用名包含不安全字符，已自动清理')
  }
  return safe || 'main'
}

/**
 * 消毒 Skill 名称，防止路径穿越
 */
export function sanitizeSkillName(name: string): string {
  // 移除以 . 和 / 开头的路径穿越尝试
  const cleaned = name.replace(/^[.\/\\]+/, '').replace(/[.\/\\]+/g, '-')
  return cleaned || 'unknown'
}

/**
 * 验证 URL 是合法的 Git 仓库 URL
 */
export function isValidGitUrl(url: string): boolean {
  // 支持: https://, http://, git@, ssh://
  return /^(https?:\/\/|git@|ssh:\/\/).+/i.test(url)
}
