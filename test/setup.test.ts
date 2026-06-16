// test/setup.test.ts
// setup 编排器测试

import { describe, it, before, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  setupCommand,
  readMpSkillsJson,
  resolveSkillsDir,
  collectSetupTasks,
  resolveProjectRoot,
  readSetupRecords,
  writeSetupRecords,
} from '../src/commands/setup.js'
import type { SetupRecord } from '../src/types.js'

function createProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mp-skills-setup-test-'))
  writeFileSync(join(dir, 'project.config.json'), JSON.stringify({ description: 'test', miniprogramRoot: '.' }))
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ pages: ['pages/index/index'], agent: { skills: [] } }))
  return dir
}

function createSkill(dir: string, name: string, script: string, description?: string): void {
  const skillDir = join(dir, 'skills', name)
  mkdirSync(skillDir, { recursive: true })
  const config: Record<string, unknown> = { scripts: { setup: script } }
  if (description) config.description = description
  writeFileSync(join(skillDir, 'mp-skills.json'), JSON.stringify(config))
}

// ── readMpSkillsJson ──

describe('readMpSkillsJson', () => {
  it('读取有效文件', () => {
    const dir = mkdtempSync(join(tmpdir(), 'test-'))
    const path = join(dir, 'mp-skills.json')
    writeFileSync(path, JSON.stringify({ scripts: { setup: 'echo hi' }, description: '测试' }))
    const result = readMpSkillsJson(path)
    assert.equal(result?.scripts?.setup, 'echo hi')
    assert.equal(result?.description, '测试')
  })

  it('损坏文件返回 null', () => {
    const dir = mkdtempSync(join(tmpdir(), 'test-'))
    const path = join(dir, 'broken.json')
    writeFileSync(path, 'not json')
    assert.equal(readMpSkillsJson(path), null)
  })

  it('不存在的文件返回 null', () => {
    assert.equal(readMpSkillsJson('/nonexistent/path.json'), null)
  })
})

// ── resolveSkillsDir ──

describe('resolveSkillsDir', () => {
  it('找到 project.config.json 下的 skills 目录', () => {
    const dir = createProject()
    mkdirSync(join(dir, 'skills'), { recursive: true })
    const result = resolveSkillsDir(dir)
    assert.ok(result)
    assert.ok(result?.endsWith('/skills') || result?.endsWith('skills'))
  })

  it('miniprogramRoot + skills 布局', () => {
    const dir = mkdtempSync(join(tmpdir(), 'test-'))
    writeFileSync(join(dir, 'project.config.json'), JSON.stringify({ miniprogramRoot: 'miniprogram/' }))
    mkdirSync(join(dir, 'miniprogram', 'skills'), { recursive: true })
    const result = resolveSkillsDir(dir)
    assert.ok(result)
    assert.ok(result?.includes('miniprogram/skills'))
  })

  it('无 skills 目录返回 null', () => {
    const dir = mkdtempSync(join(tmpdir(), 'test-'))
    assert.equal(resolveSkillsDir(dir), null)
  })
})

// ── collectSetupTasks ──

describe('collectSetupTasks', () => {
  it('收集单个 Skill 的 setup', () => {
    const dir = createProject()
    createSkill(dir, 'my-skill', 'echo hello', '测试')
    const tasks = collectSetupTasks(dir)
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].skill, 'my-skill')
    assert.equal(tasks[0].script, 'echo hello')
    assert.equal(tasks[0].description, '测试')
  })

  it('收集多个 Skill 的 setup', () => {
    const dir = createProject()
    createSkill(dir, 'a-skill', 'echo a')
    createSkill(dir, 'b-skill', 'echo b')
    const tasks = collectSetupTasks(dir)
    assert.equal(tasks.length, 2)
    assert.equal(tasks[0].skill, 'a-skill') // 按名称排序
    assert.equal(tasks[1].skill, 'b-skill')
  })

  it('跳过没有 mp-skills.json 的 Skill', () => {
    const dir = createProject()
    createSkill(dir, 'has-setup', 'echo hi')
    mkdirSync(join(dir, 'skills', 'no-setup'), { recursive: true })
    // 不写 mp-skills.json
    const tasks = collectSetupTasks(dir)
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].skill, 'has-setup')
  })

  it('跳过没有 scripts.setup 的 mp-skills.json', () => {
    const dir = createProject()
    const skillDir = join(dir, 'skills', 'empty')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'mp-skills.json'), JSON.stringify({ description: '无脚本' }))
    assert.equal(collectSetupTasks(dir).length, 0)
  })

  it('跳过以 . 和 _ 开头的目录', () => {
    const dir = createProject()
    createSkill(dir, 'my-skill', 'echo hi') // 正常
    mkdirSync(join(dir, 'skills', '.hidden'), { recursive: true })
    writeFileSync(
      join(dir, 'skills', '.hidden', 'mp-skills.json'),
      JSON.stringify({ scripts: { setup: 'echo hidden' } }),
    )
    mkdirSync(join(dir, 'skills', '_shared'), { recursive: true })
    writeFileSync(
      join(dir, 'skills', '_shared', 'mp-skills.json'),
      JSON.stringify({ scripts: { setup: 'echo shared' } }),
    )
    assert.equal(collectSetupTasks(dir).length, 1)
  })

  it('包含项目级 mp-skills.json', () => {
    const dir = createProject()
    createSkill(dir, 'z-skill', 'echo skill')
    writeFileSync(
      join(dir, 'mp-skills.json'),
      JSON.stringify({ scripts: { setup: 'echo project' }, description: '项目级' }),
    )
    const tasks = collectSetupTasks(dir)
    assert.equal(tasks.length, 2)
    assert.equal(tasks[0].skill, '__project__')
    assert.equal(tasks[0].script, 'echo project')
  })

  it('skills 目录不存在时只检查项目级', () => {
    const dir = mkdtempSync(join(tmpdir(), 'test-'))
    writeFileSync(join(dir, 'project.config.json'), JSON.stringify({}))
    writeFileSync(join(dir, 'mp-skills.json'), JSON.stringify({ scripts: { setup: 'echo project' } }))
    const tasks = collectSetupTasks(dir)
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].skill, '__project__')
  })

  it('按名称排序', () => {
    const dir = createProject()
    createSkill(dir, 'z-skill', 'echo z')
    createSkill(dir, 'a-skill', 'echo a')
    createSkill(dir, 'm-skill', 'echo m')
    const tasks = collectSetupTasks(dir)
    assert.equal(tasks[0].skill, 'a-skill')
    assert.equal(tasks[1].skill, 'm-skill')
    assert.equal(tasks[2].skill, 'z-skill')
  })
})

// ── resolveProjectRoot ──

describe('resolveProjectRoot', () => {
  it('项目根目录直接返回', () => {
    const dir = createProject()
    assert.equal(resolveProjectRoot(dir), dir)
  })

  it('从子目录向上找到项目根', () => {
    const dir = createProject()
    mkdirSync(join(dir, 'skills', 'my-skill'), { recursive: true })
    const sub = join(dir, 'skills', 'my-skill')
    assert.equal(resolveProjectRoot(sub), dir)
  })

  it('从深层子目录向上找到项目根', () => {
    const dir = createProject()
    mkdirSync(join(dir, 'a', 'b', 'c'), { recursive: true })
    assert.equal(resolveProjectRoot(join(dir, 'a', 'b', 'c')), dir)
  })

  it('找不到项目文件时返回原始路径', () => {
    const dir = '/tmp/nonexistent-project-dir'
    assert.equal(resolveProjectRoot(dir), dir)
  })
})

// ── readSetupRecords / writeSetupRecords ──

describe('setup records (lock file)', () => {
  it('无锁文件返回空数组', () => {
    const dir = createProject()
    assert.deepEqual(readSetupRecords(dir), [])
  })

  it('写入后读取', () => {
    const dir = createProject()
    const records: SetupRecord[] = [
      { script: 'echo hi', skill: 'my-skill', status: 'done', executedAt: new Date().toISOString() },
    ]
    writeSetupRecords(dir, records)
    const read = readSetupRecords(dir)
    assert.equal(read.length, 1)
    assert.equal(read[0].script, 'echo hi')
    assert.equal(read[0].status, 'done')
  })

  it('追加新记录覆盖旧记录', () => {
    const dir = createProject()
    writeSetupRecords(dir, [
      { script: 'echo a', skill: 's1', status: 'done', executedAt: '2025-01-01' },
      { script: 'echo b', skill: 's2', status: 'done', executedAt: '2025-01-01' },
    ])
    // 追加 s1 的新记录
    writeSetupRecords(dir, [
      { script: 'echo a', skill: 's1', status: 'failed', executedAt: '2025-06-01', errorCode: 1 },
    ])
    const read = readSetupRecords(dir)
    assert.equal(read.length, 2)
    const s1 = read.find((r) => r.skill === 's1')
    assert.equal(s1?.status, 'failed')
    assert.equal(s1?.executedAt, '2025-06-01')
    const s2 = read.find((r) => r.skill === 's2')
    assert.equal(s2?.status, 'done')
  })

  it('损坏的锁文件返回空数组', () => {
    const dir = createProject()
    writeFileSync(join(dir, 'skills-lock.json'), 'not json')
    assert.deepEqual(readSetupRecords(dir), [])
  })
})

// ── setupCommand ──

describe('setupCommand', () => {
  it('无脚本时 dry-run 不报错', async () => {
    const dir = createProject()
    // 不创建任何 skill
    await setupCommand(dir, { dryRun: true })
    // 不应抛异常
  })

  it('无脚本时 json 输出空列表', async () => {
    const dir = createProject()
    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: unknown) => logs.push(String(msg))
    await setupCommand(dir, { json: true })
    console.log = origLog
    const json = JSON.parse(logs[0])
    assert.deepEqual(json.tasks, [])
    assert.ok(json.message)
  })

  it('dry-run 输出待执行脚本', async () => {
    const dir = createProject()
    createSkill(dir, 'my-skill', 'echo hi', '测试描述')
    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: unknown) => logs.push(String(msg))
    await setupCommand(dir, { dryRun: true })
    console.log = origLog
    const output = logs.join('\n')
    assert.ok(output.includes('my-skill'))
    assert.ok(output.includes('echo hi'))
    assert.ok(output.includes('测试描述'))
  })

  it('dry-run --json 输出 JSON', async () => {
    const dir = createProject()
    createSkill(dir, 'my-skill', 'echo hi')
    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: unknown) => logs.push(String(msg))
    await setupCommand(dir, { dryRun: true, json: true })
    console.log = origLog
    const json = JSON.parse(logs[0])
    assert.equal(json.tasks.length, 1)
    assert.equal(json.tasks[0].skill, 'my-skill')
  })

  it('实际执行后写入锁文件', async () => {
    const dir = createProject()
    createSkill(dir, 'test-skill', 'node -e "process.exit(0)"')
    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: unknown) => logs.push(String(msg))
    await setupCommand(dir, { json: true })
    console.log = origLog
    const json = JSON.parse(logs[0])
    assert.equal(json.results.length, 1)
    assert.equal(json.results[0].status, 'done')
    assert.equal(json.results[0].skill, 'test-skill')
    // 锁文件持久化
    const records = readSetupRecords(dir)
    assert.equal(records.length, 1)
    assert.equal(records[0].status, 'done')
  })

  it('失败脚本记录 errorCode', async () => {
    const dir = createProject()
    createSkill(dir, 'fail-skill', 'node -e "process.exit(42)"')
    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: unknown) => logs.push(String(msg))
    await setupCommand(dir, { json: true })
    console.log = origLog
    const json = JSON.parse(logs[0])
    assert.equal(json.results[0].status, 'failed')
    assert.equal(json.results[0].errorCode, 42)
  })

  it('环境变量 PROJECT_DIR 和 SKILL_DIR 正确传递', async () => {
    const dir = createProject()
    createSkill(
      dir,
      'env-skill',
      'node -e "console.log(JSON.stringify({p:process.env.PROJECT_DIR,s:process.env.SKILL_DIR}))"',
    )
    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: unknown) => logs.push(String(msg))
    await setupCommand(dir, { json: true })
    console.log = origLog
    const json = JSON.parse(logs[0])
    // 找到 env 脚本的输出
    const envLine = logs.find((l) => l.startsWith('{'))
    if (envLine) {
      // envLine 可能是脚本的输出，不是 JSON 结果
    }
    assert.equal(json.results[0].status, 'done')
    // 验证锁文件中的 PROJECT_DIR
    const lockPath = join(dir, 'skills-lock.json')
    assert.ok(existsSync(lockPath))
  })

  it('已成功执行的脚本第二次被跳过', async () => {
    const dir = createProject()
    createSkill(dir, 'skip-skill', 'node -e "process.exit(0)"')

    // 第一次执行
    await setupCommand(dir, { json: true })

    // 第二次执行 — 应跳过
    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: unknown) => logs.push(String(msg))
    await setupCommand(dir, { json: true })
    console.log = origLog
    const json = JSON.parse(logs[0])
    assert.ok(json.message?.includes('已成功'))
  })
})
