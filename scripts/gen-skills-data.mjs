// 生成内联 skill 数据 src/lib/skills-data.ts
// 从官方仓库 wechat-miniprogram/ai-mode-skills 下载 3 个工具型 skill，
// 打包为 Record<string, string>，运行时直接写入 ~/.mp-skills/skills/，无需 git clone。
//
// 用法：node scripts/gen-skills-data.mjs
// 在 build.mjs 的 gen-templates 之后调用。
//
// 克隆优先使用 cnb.cool 镜像（国内加速），失败则回退到 GitHub。
// 即使全部失败也会生成一个包含空 Record 的合法文件，
// 保证 esbuild 打包不会因缺少依赖而崩溃。运行时代码会自动降级到 git clone。

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const ROOT = new URL('..', import.meta.url).pathname

// 官方 skill 仓库（mirror 优先）
const SKILLS_REPO_URL = 'https://github.com/wechat-miniprogram/ai-mode-skills.git'
const SKILLS_MIRROR_URL = '' // 暂无可用的 cnb.cool 镜像，直接走 GitHub
const SKILLS_REPO_REF = 'master'

// 需要打包的 skill 名称列表
const SKILL_NAMES = ['wxa-skills-validate', 'wxa-skills-generate', 'wxa-skills-eval']

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

// ── 最终写文件（无论在哪个分支结束，都会执行）──
function writeOutput(skillData) {
  const output = `// ── 内联官方 skill 数据（由 scripts/gen-skills-data.mjs 自动生成）──
// 包含 wxa-skills-validate / wxa-skills-generate / wxa-skills-eval
// 避免运行时从 GitHub git clone，实现 ALL IN ONE

export const SKILLS_DATA: Record<string, string> = ${JSON.stringify(skillData)}
`

  writeFileSync(join(ROOT, 'src', 'lib', 'skills-data.ts'), output, 'utf-8')
  const count = Object.keys(skillData).length
  console.log(`* 已生成 src/lib/skills-data.ts (${count} 个文件)`)
}

// ── 步骤 1：克隆仓库到临时目录（mirror 优先，GitHub 回退）──
const tempDir = join(tmpdir(), 'mp-skills-gen-' + randomUUID().slice(0, 8))

let cloneOk = false
const cloneUrls = SKILLS_MIRROR_URL ? [SKILLS_MIRROR_URL, SKILLS_REPO_URL] : [SKILLS_REPO_URL]
for (const url of cloneUrls) {
  console.log(`* 克隆 ${url} ...`)
  try {
    execSync(`git clone --depth 1 --branch "${SKILLS_REPO_REF}" "${url}" "${tempDir}"`, {
      stdio: 'pipe',
      timeout: 60_000,
    })
    cloneOk = true
    break
  } catch (err) {
    const msg = err.stderr?.toString() || err.message
    console.warn(`  ! 克隆失败: ${msg}`)
  }
}

if (!cloneOk) {
  console.warn('  ! 所有源均克隆失败，将生成空的 skills-data.ts，运行时回退到 git clone')
  writeOutput({})
  process.exit(0) // 正常退出，不阻塞 build
}

// ── 步骤 2：读取所有 skill 文件 ──
const skillData = {}

for (const skillName of SKILL_NAMES) {
  const skillDir = join(tempDir, skillName)
  if (!existsSync(skillDir)) {
    console.warn(`  ! 仓库中未找到 ${skillName}，跳过`)
    continue
  }

  const files = collectFiles(skillDir)
  for (const filePath of files) {
    const relPath = skillName + '/' + filePath.slice(skillDir.length + 1)
    try {
      skillData[relPath] = readFileSync(filePath, 'utf-8')
    } catch {
      skillData[relPath] = '' // 二进制文件跳过
    }
  }
  console.log(`  * ${skillName}: ${files.length} 个文件`)
}

// ── 步骤 3：清理临时目录 ──
try {
  execSync(`rm -rf "${tempDir}"`, { stdio: 'ignore' })
} catch {}

// ── 步骤 4：生成 TypeScript 数据文件 ──
writeOutput(skillData)
