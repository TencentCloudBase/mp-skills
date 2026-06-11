// test/installer.test.ts
// 安装器测试 — 覆盖标准结构 / 自定义根路径 / 各种边界

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdirSync, writeFileSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installSkill } from '../src/lib/installer.js'
import { readLock } from '../src/lib/lock-file.js'

function createFixture(mpRoot = 'miniprogram') {
  const tmp = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
  const proj = join(tmp, 'project')
  mkdirSync(join(proj, mpRoot), { recursive: true })
  writeFileSync(join(proj, mpRoot, 'app.json'), JSON.stringify({ pages: ['pages/index/index'], window: {} }))
  writeFileSync(join(proj, 'project.config.json'), JSON.stringify({ appid: 'test', miniprogramRoot: mpRoot + '/' }))
  const skill = join(tmp, 'my-skill')
  mkdirSync(join(skill, 'apis'), { recursive: true })
  writeFileSync(join(skill, 'mcp.json'), JSON.stringify({ apis: [{ name: 'hello', description: '打招呼' }] }))
  return { proj, skill, mpRoot }
}

describe('基础安装', () => {
  it('安装到 miniprogram/skills/', () => {
    const { proj, skill } = createFixture()
    installSkill(skill, proj, { skillName: 'my-skill' })
    assert.ok(existsSync(join(proj, 'miniprogram', 'skills', 'my-skill', 'mcp.json')))
  })

  it('更新 app.json agent.skills', () => {
    const { proj, skill } = createFixture()
    installSkill(skill, proj, { skillName: 'my-skill' })
    const app = JSON.parse(readFileSync(join(proj, 'miniprogram', 'app.json'), 'utf-8'))
    assert.ok(app.agent?.skills?.some((s: any) => s.path === 'skills/my-skill'))
    assert.ok(app.lazyCodeLoading)
  })

  it('subPackages.root = "skills" + independent', () => {
    const { proj, skill } = createFixture()
    installSkill(skill, proj, { skillName: 'my-skill' })
    const app = JSON.parse(readFileSync(join(proj, 'miniprogram', 'app.json'), 'utf-8'))
    const sp = app.subPackages.find((p: any) => p.root === 'skills')
    assert.ok(sp)
    assert.equal(sp.independent, true)
  })

  it('写入锁文件', () => {
    const { proj, skill } = createFixture()
    installSkill(skill, proj, { skillName: 'my-skill', source: 'test' })
    assert.ok(readLock(proj).skills.some((s: any) => s.name === 'my-skill'))
  })

  it('project.config.json 注入 packOptions.include', () => {
    const { proj, skill } = createFixture()
    installSkill(skill, proj, { skillName: 'my-skill' })
    const config = JSON.parse(readFileSync(join(proj, 'project.config.json'), 'utf-8'))
    assert.ok(config.packOptions?.include?.some((i: any) => i.value === 'skills'))
  })

  it('已存在时覆盖', () => {
    const { proj, skill } = createFixture()
    installSkill(skill, proj, { skillName: 'my-skill' })
    installSkill(skill, proj, { skillName: 'my-skill' })
    assert.ok(existsSync(join(proj, 'miniprogram', 'skills', 'my-skill')))
  })
})

describe('自定义 miniprogramRoot', () => {
  ;['client', 'src', 'app', 'miniprogram-dev'].forEach((root) => {
    it(`miniprogramRoot = "${root}" 时安装到 ${root}/skills/`, () => {
      const { proj, skill } = createFixture(root)
      installSkill(skill, proj, { skillName: 's' })
      assert.ok(existsSync(join(proj, root, 'skills', 's')))
    })
  })

  it('更新自定义根路径下的 app.json', () => {
    const { proj, skill } = createFixture('client')
    installSkill(skill, proj, { skillName: 's' })
    const app = JSON.parse(readFileSync(join(proj, 'client', 'app.json'), 'utf-8'))
    assert.ok(app.agent?.skills?.length > 0)
  })
})

describe('缺少配置文件', () => {
  it('无 project.config.json 时默认用 miniprogram/', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
    const proj = join(tmp, 'project')
    mkdirSync(join(proj, 'miniprogram'), { recursive: true })
    writeFileSync(join(proj, 'miniprogram', 'app.json'), JSON.stringify({ pages: ['p'] }))
    const skill = join(tmp, 's')
    mkdirSync(join(skill, 'apis'), { recursive: true })
    writeFileSync(join(skill, 'mcp.json'), JSON.stringify({ apis: [] }))
    installSkill(skill, proj, { skillName: 's' })
    assert.ok(existsSync(join(proj, 'miniprogram', 'skills', 's')))
  })

  it('无 app.json 时不报错', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
    const proj = join(tmp, 'project')
    mkdirSync(join(proj, 'miniprogram'), { recursive: true })
    writeFileSync(join(proj, 'project.config.json'), JSON.stringify({ appid: 'test' }))
    const skill = join(tmp, 's')
    mkdirSync(join(skill, 'apis'), { recursive: true })
    writeFileSync(join(skill, 'mcp.json'), JSON.stringify({ apis: [] }))
    // 不报错，只打印警告
    installSkill(skill, proj, { skillName: 's' })
  })
})

describe('已存在的配置', () => {
  it('重复安装不产生重复 agent.skills 条目', () => {
    const { proj, skill } = createFixture()
    installSkill(skill, proj, { skillName: 'my-skill' })
    installSkill(skill, proj, { skillName: 'my-skill' })
    const app = JSON.parse(readFileSync(join(proj, 'miniprogram', 'app.json'), 'utf-8'))
    const matches = app.agent.skills.filter((s: any) => s.name === 'my')
    assert.equal(matches.length, 1, '不应有重复条目')
  })

  it('重复安装不产生重复 subPackages 条目', () => {
    const { proj, skill } = createFixture()
    installSkill(skill, proj, { skillName: 'a' })
    installSkill(skill, proj, { skillName: 'b' })
    const app = JSON.parse(readFileSync(join(proj, 'miniprogram', 'app.json'), 'utf-8'))
    const skillsPkg = app.subPackages.filter((p: any) => p.root === 'skills')
    assert.equal(skillsPkg.length, 1, 'subPackages 不应重复')
  })

  it('多个 Skill 同时存在', () => {
    const { proj, skill } = createFixture()
    installSkill(skill, proj, { skillName: 'a' })
    installSkill(skill, proj, { skillName: 'b' })
    assert.ok(existsSync(join(proj, 'miniprogram', 'skills', 'a')))
    assert.ok(existsSync(join(proj, 'miniprogram', 'skills', 'b')))
  })
})

describe('异常处理', () => {
  it('损坏的 app.json 抛异常', () => {
    const { proj, skill } = createFixture()
    writeFileSync(join(proj, 'miniprogram', 'app.json'), '{invalid')
    assert.throws(() => installSkill(skill, proj, { skillName: 's' }))
  })
})
