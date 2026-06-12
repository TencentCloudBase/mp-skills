// ── find 命令 ──
// 搜索远程仓库中的 Skill（通过 GitHub API 直接扫描 skills/*/mcp.json）

import { parseSource } from '../lib/source-parser.js'
import { listRemoteSkills, fetchRemoteFile } from '../lib/git.js'

import pc from 'picocolors'

/** 搜索目标仓库 */
const SEARCH_REPOS = [
  'TencentCloudBase/awesome-miniprogram-skills',
]

interface SkillEntry {
  name: string
  description: string
  repo: string
}

export async function findCommand(keyword: string): Promise<void> {
  const keywordLower = keyword.toLowerCase()

  console.log('搜索 Skill' + (keyword ? `："${keyword}"` : ''))
  console.log('')

  const results: SkillEntry[] = []

  for (const repo of SEARCH_REPOS) {
    try {
      const skills = await listRemoteSkills({
        type: 'github',
        original: repo,
        repoName: repo,
        ref: 'main',
      })

      for (const skill of skills) {
        if (
          keyword &&
          !skill.name.toLowerCase().includes(keywordLower)
        ) {
          continue
        }

        // 尝试从 mcp.json 读取描述
        let description = ''
        const mcpContent = await fetchRemoteFile(
          {
            type: 'github',
            original: repo,
            repoName: repo,
            ref: 'main',
          },
          `skills/${skill.name}/mcp.json`,
        )
        if (mcpContent) {
          try {
            const mcp = JSON.parse(mcpContent)
            // 取第一个 API 的描述作为摘要
            const apis = mcp.apis || []
            if (apis.length > 0 && apis[0].description) {
              // 取第一行
              description = apis[0].description.split('\n')[0].slice(0, 80)
            }
          } catch {
            // ignore
          }
        }

        results.push({ name: skill.name, description, repo })
      }
    } catch {
      // 单个仓库失败继续下一个
    }
  }

  // 关键词也匹配描述
  const filtered = keyword
    ? results.filter(
        (r) =>
          r.name.toLowerCase().includes(keywordLower) ||
          r.description.toLowerCase().includes(keywordLower),
      )
    : results

  for (const r of filtered) {
    console.log(`  ${pc.bold(r.name)}`)
    if (r.description) {
      console.log(`    ${r.description}`)
    }
    console.log(`    -> mp-skills add ${r.repo} --skill ${r.name}`)
    console.log('')
  }

  console.log(`共 ${filtered.length} 个结果`)
}
