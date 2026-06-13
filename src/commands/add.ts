// ── add 命令 ──
// 安装 Skill 到目标项目

import { existsSync, readdirSync, readFileSync, Dirent } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseSource } from '../lib/source-parser.js'
import { cloneRepo, cleanupClone, listRemoteSkills } from '../lib/git.js'
import { installSkill } from '../lib/installer.js'
import { readLock, readDeployedState } from '../lib/lock-file.js'
import { log, warn, ok, title, resolveMiniprogramRoot } from '../lib/utils.js'
import { scanCloudFunctions } from '../lib/cloudfunction-scanner.js'
import { scanCollections, scanSharedCollections } from '../lib/database-scanner.js'
import { trackCommand } from '../lib/telemetry.js'
import { fuzzySelect, SelectItem } from '../lib/selector.js'
import { loadRegistry, lookupRepoConfig, getCloneUrl } from '../lib/registry.js'

interface AddOptions {
  skill?: string
  all?: boolean
  yes?: boolean
}

export async function addCommand(source: string, opts: AddOptions): Promise<void> {
  try {
    const sourceInfo = parseSource(source)

    // 加载注册表，确定数据来源（GitHub / cnb.cool）
    const { registry, source: regSource } = await loadRegistry()
    const mirrorCfg = lookupRepoConfig(registry, sourceInfo.repoName || '')
    const cloneUrl = getCloneUrl(sourceInfo.repoName || '', regSource, sourceInfo.repoUrl, mirrorCfg.mirrorUrl)

    // ── 检测项目 ──
    const projectPath = resolve('.')
    const projectConfigPath = join(projectPath, 'project.config.json')
    if (!existsSync(projectConfigPath)) {
      warn('当前目录不是小程序项目（未找到 project.config.json）')
      log('请在项目根目录运行')
      return
    }

    const mpRoot = resolveMiniprogramRoot(projectPath)
    if (!mpRoot) {
      warn('未找到 app.json')
      log('请确认 project.config.json 的 miniprogramRoot 配置或项目结构')
      return
    }

    // ── 获取 Skill ──
    let skillLocalPath: string
    let tmpDir: string | undefined

    if (sourceInfo.type === 'local') {
      skillLocalPath = sourceInfo.localPath!

      // 读取本地目录下的子目录作为可用 skill 列表
      const entries = readdirSync(skillLocalPath, { withFileTypes: true }).filter(
        (e: Dirent) => e.isDirectory() && existsSync(join(skillLocalPath, e.name, 'mcp.json')),
      )

      if (opts.skill) {
        const match = entries.find((e: Dirent) => e.name === opts.skill)
        if (!match) {
          warn(`未找到 Skill "${opts.skill}"`)
          return
        }
        installSkill(join(skillLocalPath, opts.skill), projectPath, {
          skillName: opts.skill,
          source: sourceInfo.original,
        })
      } else if (opts.all) {
        let count = 0
        for (const entry of entries) {
          installSkill(join(skillLocalPath, entry.name), projectPath, {
            skillName: entry.name,
            source: sourceInfo.original,
          })
          trackCommand({ command: 'add:install', detail: `local:${entry.name}` }).catch(() => {})
          count++
        }
        log(`\n[OK] 已安装 ${count} 个 Skill`)
        trackCommand({ command: 'add:install', detail: `local:${sourceInfo.original}` }).catch(() => {})
        promptSetupIfNeeded(projectPath)
      } else {
        // 只安装了本地路径本身
        const skillName = opts.skill || skillLocalPath.split('/').pop() || 'unknown'
        installSkill(skillLocalPath, projectPath, {
          skillName,
          source: sourceInfo.original,
        })
      }
      log(`\n[OK] 已完成！`)
      trackCommand({ command: 'add:install', detail: `local:${sourceInfo.original}` }).catch(() => {})
      promptSetupIfNeeded(projectPath)
      return
    }

    // 远程获取
    if (!opts.yes) log(`从 ${sourceInfo.repoName || sourceInfo.repoUrl} 获取...`)

    const skills = await listRemoteSkills(sourceInfo, mirrorCfg.pathPattern)

    if (skills.length === 0) {
      warn('未找到 Skill')
      return
    }

    // 指定 Skill
    if (opts.skill) {
      const match = skills.find((s) => s.name === opts.skill)
      if (!match) {
        warn(`未找到 "${opts.skill}"`)
        log('可用 npx mp-skills add <仓库> --all 查看所有可用 Skill')
        return
      }
      // 需要 clone 来获取实际文件
      tmpDir = cloneRepo(cloneUrl, mirrorCfg.ref || sourceInfo.ref)
      skillLocalPath = join(tmpDir, match.path)
      installSkill(skillLocalPath, projectPath, {
        skillName: opts.skill,
        source: sourceInfo.repoName || sourceInfo.repoUrl,
      })
      cleanupClone(tmpDir)
      log(`\n[OK] 安装完成！`)
      trackCommand({ command: 'add:install', detail: `${sourceInfo.repoName}:${opts.skill}` }).catch(() => {})
      promptSetupIfNeeded(projectPath)
      return
    }

    // --all
    if (opts.all) {
      tmpDir = cloneRepo(cloneUrl, mirrorCfg.ref || sourceInfo.ref)
      let count = 0
      for (const s of skills) {
        const sp = join(tmpDir, s.path)
        if (existsSync(sp)) {
          installSkill(sp, projectPath, {
            skillName: s.name,
            source: sourceInfo.repoName || sourceInfo.repoUrl,
          })
          trackCommand({ command: 'add:install', detail: `${sourceInfo.repoName}:${s.name}` }).catch(() => {})
          count++
        }
      }
      cleanupClone(tmpDir)
      log(`\n[OK] 已安装 ${count} 个 Skill`)
      trackCommand({ command: 'add:install', detail: `${sourceInfo.repoName}:all(${count})` }).catch(() => {})
      promptSetupIfNeeded(projectPath)
      return
    }

    // 未指定 → 交互选择
    if (process.stdin.isTTY && skills.length > 1) {
      // 构建 skill path 映射
      const pathMap = new Map<string, string>()
      for (const s of skills) pathMap.set(s.name, s.path)

      // 从 clone 的本地文件读取描述（mcp.json）
      let descMap = new Map<string, string>()
      if (tmpDir) {
        for (const s of skills) {
          try {
            const mcpPath = join(tmpDir, s.path, 'mcp.json')
            if (existsSync(mcpPath)) {
              const mcp = JSON.parse(readFileSync(mcpPath, 'utf-8'))
              const apis = mcp.apis || []
              if (apis.length > 0 && apis[0].description) {
                descMap.set(s.name, apis[0].description.split('\n')[0].slice(0, 80))
              }
            }
          } catch {}
        }
      }

      const selectItems: SelectItem[] = skills.map((s) => ({
        value: s.name,
        label: s.name,
        description: descMap.get(s.name) || '',
      }))

      const selected = await fuzzySelect(selectItems, { multiSelect: true })
      if (!selected) return

      // 处理多选结果
      const selectedNames = selected.split(',')

      tmpDir = cloneRepo(cloneUrl, mirrorCfg.ref || sourceInfo.ref)
      for (const name of selectedNames) {
        const skillPath = pathMap.get(name) || `skills/${name}`
        skillLocalPath = join(tmpDir, skillPath)
        installSkill(skillLocalPath, projectPath, {
          skillName: name,
          source: sourceInfo.repoName || sourceInfo.repoUrl,
        })
      }
      cleanupClone(tmpDir)
      log(`\n[OK] 已安装 ${selectedNames.length} 个 Skill`)
      trackCommand({ command: 'add:install', detail: `${sourceInfo.repoName}:${selected}` }).catch(() => {})
      promptSetupIfNeeded(projectPath)
    } else {
      // 非交互模式 → 打印列表
      title(`发现 ${skills.length} 个 Skill:`)
      for (const s of skills) {
        log(`  ${s.name}`)
      }
      log(`\n安装: npx mp-skills add ${source} --skill <name>`)
      log(`全部: npx mp-skills add ${source} --all`)
    }
  } catch (err) {
    console.error(`[ERR] ${(err as Error).message}`)
    process.exit(1)
  }
}

/**
 * 检测是否有未部署的云开发依赖，提示运行 setup
 */
function promptSetupIfNeeded(projectPath: string): void {
  const deployed = readDeployedState(projectPath)
  const funcs = scanCloudFunctions(projectPath)
  const collections = scanCollections(projectPath)
  const shared = scanSharedCollections(projectPath)

  const missingFuncs = funcs.filter((f) => !deployed?.cloudfunctions?.includes(f.name))
  const allColNames = new Set<string>()
  for (const c of collections) allColNames.add(c.name)
  for (const c of shared as any) allColNames.add(c.name)
  const missingCols = Array.from(allColNames).filter((c) => !deployed?.collections?.includes(c))

  if (missingFuncs.length > 0 || missingCols.length > 0) {
    console.log(`\n发现新的云开发依赖，建议运行：`)
    console.log(`  mp-skills setup`)
  }
}
