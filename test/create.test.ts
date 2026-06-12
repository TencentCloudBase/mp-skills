// test/create.test.ts
// 创建新 Skill 骨架测试

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCommand } from '../src/commands/create.js'

function createMiniProgramProject(baseDir: string, mpRoot = 'miniprogram') {
  const proj = join(baseDir, 'project')
  mkdirSync(join(proj, mpRoot), { recursive: true })
  writeFileSync(join(proj, mpRoot, 'app.json'), JSON.stringify({ pages: ['pages/index/index'], window: {} }))
  writeFileSync(join(proj, 'project.config.json'), JSON.stringify({ appid: 'test', miniprogramRoot: mpRoot + '/' }))
  return proj
}

function createMiniProgramRootOnly(baseDir: string, mpRoot = 'miniprogram') {
  const proj = join(baseDir, 'root-only')
  mkdirSync(join(proj, mpRoot), { recursive: true })
  writeFileSync(join(proj, mpRoot, 'app.json'), JSON.stringify({ pages: ['pages/index/index'], window: {} }))
  writeFileSync(join(proj, 'project.config.json'), JSON.stringify({ appid: 'test', miniprogramRoot: mpRoot + '/' }))
  return proj
}

describe('createCommand (Skill 骨架创建)', () => {
  describe('在项目内创建 Skill', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
    const projectDir = createMiniProgramRootOnly(tmpDir)

    it('在项目目录下创建成功', async () => {
      const origCwd = process.cwd()
      process.chdir(projectDir)
      try {
        await createCommand('my-greeting')
        // Skill 创建在 miniprogram/skills/ 下
        assert.ok(existsSync(join(projectDir, 'miniprogram', 'skills', 'my-greeting')), 'Skill 目录应存在')
        assert.ok(existsSync(join(projectDir, 'miniprogram', 'skills', 'my-greeting', 'SKILL.md')), 'SKILL.md 应存在')
        assert.ok(existsSync(join(projectDir, 'miniprogram', 'skills', 'my-greeting', 'mcp.json')), 'mcp.json 应存在')
        assert.ok(
          existsSync(join(projectDir, 'miniprogram', 'skills', 'my-greeting', 'apis', 'greet.js')),
          'apis/greet.js 应存在',
        )
      } finally {
        process.chdir(origCwd)
      }
    })

    it('重复创建提示已存在', async () => {
      const origCwd = process.cwd()
      process.chdir(projectDir)
      try {
        await createCommand('my-greeting')
        // 不抛异常，只输出警告
        assert.ok(existsSync(join(projectDir, 'miniprogram', 'skills', 'my-greeting')))
      } finally {
        process.chdir(origCwd)
      }
    })
  })

  describe('缺少项目配置', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))

    it('无 project.config.json 时提示错误', async () => {
      const emptydir = join(tmpDir, 'empty')
      mkdirSync(emptydir, { recursive: true })
      const origCwd = process.cwd()
      process.chdir(emptydir)
      try {
        await createCommand('test-skill')
        // 不抛异常，只输出警告
      } finally {
        process.chdir(origCwd)
      }
    })
  })

  describe('误用 --ai 专用 flag', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
    const projectDir = createMiniProgramRootOnly(tmpDir)

    it('未传 --ai 但传了 --scenario 时拒绝执行，不创建目录', async () => {
      const origCwd = process.cwd()
      process.chdir(projectDir)
      try {
        await createCommand('foo', { scenario: 'bar' })
        // 不抛异常，只警告并 return
        assert.ok(!existsSync(join(projectDir, 'miniprogram', 'skills', 'foo')), '未应创建 Skill 目录')
      } finally {
        process.chdir(origCwd)
      }
    })

    it('未传 --ai 但传了 --query 时同样拒绝', async () => {
      const origCwd = process.cwd()
      process.chdir(projectDir)
      try {
        await createCommand('bar', { query: 'do x' })
        assert.ok(!existsSync(join(projectDir, 'miniprogram', 'skills', 'bar')), '未应创建 Skill 目录')
      } finally {
        process.chdir(origCwd)
      }
    })

    it('显式传 --non-interactive=true 但没有 --ai 时拒绝', async () => {
      const origCwd = process.cwd()
      process.chdir(projectDir)
      try {
        await createCommand('baz', { nonInteractive: true })
        assert.ok(!existsSync(join(projectDir, 'miniprogram', 'skills', 'baz')), '未应创建 Skill 目录')
      } finally {
        process.chdir(origCwd)
      }
    })
  })
})

describe('--ai 路由', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
  const projectDir = createMiniProgramRootOnly(tmpDir)
  const stubFile = join(tmpDir, 'ai-args.json')

  it('给了 name 时 outputPath 指向 <mp>/skills/<name>/', async () => {
    const origCwd = process.cwd()
    const origStub = process.env.MP_SKILLS_AI_GENERATE_STUB
    process.chdir(projectDir)
    process.env.MP_SKILLS_AI_GENERATE_STUB = stubFile
    try {
      await createCommand('foo', { ai: true, query: 'q1', scenario: 's1' })
      const args = JSON.parse(readFileSync(stubFile, 'utf-8'))
      assert.equal(args.name, 'foo')
      assert.equal(args.query, 'q1')
      assert.equal(args.scenario, 's1')
      assert.ok(
        args.outputPath.endsWith('/miniprogram/skills/foo'),
        `outputPath 应指向 <mp>/skills/foo，实际为 ${args.outputPath}`,
      )
      assert.ok(
        args.miniprogramRoot.endsWith('/miniprogram'),
        `miniprogramRoot 应指向 mp，实际为 ${args.miniprogramRoot}`,
      )
    } finally {
      process.chdir(origCwd)
      if (origStub === undefined) delete process.env.MP_SKILLS_AI_GENERATE_STUB
      else process.env.MP_SKILLS_AI_GENERATE_STUB = origStub
    }
  })

  it('未给 name 时 outputPath 指向 <mp>/skills/', async () => {
    const origCwd = process.cwd()
    const origStub = process.env.MP_SKILLS_AI_GENERATE_STUB
    process.chdir(projectDir)
    process.env.MP_SKILLS_AI_GENERATE_STUB = stubFile
    try {
      await createCommand(undefined, { ai: true })
      const args = JSON.parse(readFileSync(stubFile, 'utf-8'))
      assert.equal(args.name, undefined)
      assert.ok(
        args.outputPath.endsWith('/miniprogram/skills'),
        `outputPath 应指向 <mp>/skills，实际为 ${args.outputPath}`,
      )
    } finally {
      process.chdir(origCwd)
      if (origStub === undefined) delete process.env.MP_SKILLS_AI_GENERATE_STUB
      else process.env.MP_SKILLS_AI_GENERATE_STUB = origStub
    }
  })
})
