// test/list.test.ts
// list 命令测试，特别是 --json 输出

import { describe, it, before, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { listCommand } from '../src/commands/list.js'

describe('list --json', () => {
  it('无 Skill 时输出空列表', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'test-'))
    const origCwd = process.cwd
    // mock cwd
    process.cwd = () => dir
    writeFileSync(join(dir, 'project.config.json'), JSON.stringify({ miniprogramRoot: '.' }))
    writeFileSync(join(dir, 'app.json'), JSON.stringify({ pages: ['pages/index/index'] }))

    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: unknown) => logs.push(String(msg))

    await listCommand({ json: true })

    console.log = origLog
    process.cwd = origCwd

    assert.equal(logs.length, 1)
    const json = JSON.parse(logs[0])
    assert.deepEqual(json.installed, [])
  })

  it('有 Skill 时输出名称列表', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'test-'))
    const origCwd = process.cwd
    process.cwd = () => dir
    writeFileSync(join(dir, 'project.config.json'), JSON.stringify({ miniprogramRoot: '.' }))
    writeFileSync(join(dir, 'app.json'), JSON.stringify({ pages: ['pages/index/index'] }))

    // 创建两个 skill
    mkdirSync(join(dir, 'skills', 'skill-a'), { recursive: true })
    writeFileSync(join(dir, 'skills', 'skill-a', 'mcp.json'), JSON.stringify({ apis: [] }))
    mkdirSync(join(dir, 'skills', 'skill-b'), { recursive: true })
    writeFileSync(join(dir, 'skills', 'skill-b', 'mcp.json'), JSON.stringify({ apis: [] }))

    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: unknown) => logs.push(String(msg))

    await listCommand({ json: true })

    console.log = origLog
    process.cwd = origCwd

    const json = JSON.parse(logs[0])
    assert.equal(json.installed.length, 2)
    assert.ok(json.installed.some((s: { name: string }) => s.name === 'skill-a'))
    assert.ok(json.installed.some((s: { name: string }) => s.name === 'skill-b'))
    assert.ok(json.installed.every((s: { path: string }) => s.path.startsWith('skills/')))
  })
})

describe('list 文本输出', () => {
  it('无 Skill 时显示 (无)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'test-'))
    const origCwd = process.cwd
    process.cwd = () => dir
    writeFileSync(join(dir, 'project.config.json'), JSON.stringify({ miniprogramRoot: '.' }))
    writeFileSync(join(dir, 'app.json'), JSON.stringify({ pages: ['pages/index/index'] }))

    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: unknown) => logs.push(String(msg))

    await listCommand({})

    console.log = origLog
    process.cwd = origCwd

    assert.ok(logs.some((l) => l.includes('无')))
  })
})
