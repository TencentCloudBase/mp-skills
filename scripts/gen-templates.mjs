// 生成内联模板数据 src/lib/templates-data.ts
import { readFileSync, readdirSync, writeFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = new URL('..', import.meta.url).pathname

function collectFiles(dir) {
  const result = []
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else result.push(p)
    }
  }
  walk(dir)
  return result.sort()
}

function escape(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
}

const sections = []

// skill-skeleton
const skeletonFiles = collectFiles(join(ROOT, 'templates', 'skill-skeleton'))
const skeletonMap = {}
for (const f of skeletonFiles) {
  const rel = relative(join(ROOT, 'templates', 'skill-skeleton'), f)
  skeletonMap[rel] = readFileSync(f, 'utf-8')
}
sections.push(`export const SKELETON: Record<string, string> = ${JSON.stringify(skeletonMap, null, 2)}`)

// base
const baseFiles = collectFiles(join(ROOT, 'templates', 'base'))
const baseMap = {}
for (const f of baseFiles) {
  const rel = relative(join(ROOT, 'templates', 'base'), f)
  baseMap[rel] = readFileSync(f, 'utf-8')
}
sections.push(`export const BASE: Record<string, string> = ${JSON.stringify(baseMap, null, 2)}`)

const output = `// ── 内联模板数据（由 scripts/gen-templates.mjs 自动生成）──
// 避免 bundled 后模板文件路径解析问题

${sections.join('\n\n')}
`

writeFileSync(join(ROOT, 'src', 'lib', 'templates-data.ts'), output, 'utf-8')
console.log('✅ Generated src/lib/templates-data.ts')
