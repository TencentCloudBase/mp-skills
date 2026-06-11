// ── add 命令 ──
// 安装 Skill 到目标项目

import { existsSync, readdirSync, readFileSync, Dirent } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseSource } from '../lib/source-parser.js'
import { cloneRepo, cleanupClone, listRemoteSkills } from '../lib/git.js'
import { installSkill } from '../lib/installer.js'
import { readLock } from '../lib/lock-file.js'
import { log, warn, ok, title } from '../lib/utils.js'
import { trackCommand } from '../lib/telemetry.js'
import { fuzzySelect, SelectItem } from '../lib/selector.js'

interface AddOptions {
  skill?: string
  all?: boolean
  yes?: boolean
}

export async function addCommand(source: string, opts: AddOptions): Promise<void> {
  try {
    const sourceInfo = parseSource(source)

    // ── 检测项目 ──
    const projectPath = resolve('.')
    const projectConfigPath = join(projectPath, 'project.config.json')
    if (!existsSync(projectConfigPath)) {
      warn('当前目录不是小程序项目（未找到 project.config.json）')
      log('请在项目根目录运行')
      return
    }

    // 读取 miniprogramRoot，默认 miniprogram/
    let miniprogramRoot = 'miniprogram'
    try {
      const config = JSON.parse(readFileSync(projectConfigPath, 'utf-8'))
      if (config.miniprogramRoot) {
        miniprogramRoot = config.miniprogramRoot.replace(/\/$/, '')
      }
    } catch {}

    const appJsonPath = join(projectPath, miniprogramRoot, 'app.json')
    if (!existsSync(appJsonPath)) {
      warn(`未找到 ${miniprogramRoot}/app.json`)
      log('请确认项目结构正确')
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
          count++
        }
        log(`\n✅ 已安装 ${count} 个 Skill`)
      } else {
        // 只安装了本地路径本身
        const skillName = opts.skill || skillLocalPath.split('/').pop() || 'unknown'
        installSkill(skillLocalPath, projectPath, {
          skillName,
          source: sourceInfo.original,
        })
      }
      log(`\n✅ 已完成！`)
      return
    }

    // 远程获取
    if (!opts.yes) log(`从 ${sourceInfo.repoName || sourceInfo.repoUrl} 获取...`)

    const skills = await listRemoteSkills(sourceInfo)

    if (skills.length === 0) {
      warn('未找到 Skill')
      return
    }

    // 指定 Skill
    if (opts.skill) {
      const match = skills.find((s) => s.name === opts.skill)
      if (!match) {
        warn(`未找到 "${opts.skill}"`)
        log(`可用: ${skills.map((s) => s.name).join(', ')}`)
        return
      }
      // 需要 clone 来获取实际文件
      tmpDir = cloneRepo(sourceInfo.repoUrl!, sourceInfo.ref)
      skillLocalPath = join(tmpDir, 'skills', opts.skill)
      installSkill(skillLocalPath, projectPath, {
        skillName: opts.skill,
        source: sourceInfo.repoName || sourceInfo.repoUrl,
      })
      cleanupClone(tmpDir)
      log(`\n✅ 安装完成！`)
      return
    }

    // --all
    if (opts.all) {
      tmpDir = cloneRepo(sourceInfo.repoUrl!, sourceInfo.ref)
      let count = 0
      for (const s of skills) {
        const sp = join(tmpDir, 'skills', s.name)
        if (existsSync(sp)) {
          installSkill(sp, projectPath, {
            skillName: s.name,
            source: sourceInfo.repoName || sourceInfo.repoUrl,
          })
          count++
        }
      }
      cleanupClone(tmpDir)
      log(`\n✅ 已安装 ${count} 个 Skill`)
      return
    }

    // 未指定 → 交互选择
    if (process.stdin.isTTY && skills.length > 1) {
      // 尝试从注册表获取描述
      const registryUrl = 'https://raw.githubusercontent.com/TencentCloudBase/mp-skills/main/src/registry.json'
      let descMap = new Map<string, string>()
      try {
        const res = await fetch(registryUrl, {
          headers: { 'User-Agent': 'mp-skills-cli', Accept: 'application/vnd.github.v3.raw' },
        })
        if (res.ok) {
          const reg = await res.json()
          for (const repo of reg.repositories || []) {
            for (const s of repo.skills || []) {
              descMap.set(s.name, s.description)
            }
          }
        }
      } catch {}

      const selectItems: SelectItem[] = skills.map((s) => ({
        value: s.name,
        label: s.name,
        description: descMap.get(s.name) || '',
      }))

      const selected = await fuzzySelect(selectItems)
      if (!selected) return

      // 处理多选结果
      const selectedNames = selected.split(',')

      tmpDir = cloneRepo(sourceInfo.repoUrl!, sourceInfo.ref)
      for (const name of selectedNames) {
        skillLocalPath = join(tmpDir, 'skills', name)
        installSkill(skillLocalPath, projectPath, {
          skillName: name,
          source: sourceInfo.repoName || sourceInfo.repoUrl,
        })
      }
      cleanupClone(tmpDir)
      log(`\n✅ 已安装 ${selectedNames.length} 个 Skill`)
    } else {
      // 非交互模式 → 打印列表
      title(`发现 ${skills.length} 个 Skill:`)
      for (const s of skills) {
        log(`  ${s.name}`)
      }
      log(`\n安装: mp-skills add ${source} --skill <name>`)
      log(`全部: mp-skills add ${source} --all`)
    }
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`)
    process.exit(1)
  }
}
