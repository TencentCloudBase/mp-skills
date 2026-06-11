// test/installer.test.ts
// 安装器测试 — 覆盖标准结构和自定义 miniprogramRoot

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdirSync, writeFileSync, existsSync, readFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installSkill } from '../src/lib/installer.js'
import { readLock } from '../src/lib/lock-file.js'

function createFixture(mpRoot = 'miniprogram') {
  const tmp = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
  const proj = join(tmp, 'project')

  mkdirSync(join(proj, mpRoot), { recursive: true })
  writeFileSync(
    join(proj, mpRoot, 'app.json'),
    JSON.stringify({ pages: ['pages/index/index'], window: {} }),
  )
  writeFileSync(
    join(proj, 'project.config.json'),
    JSON.stringify({ appid: 'test', miniprogramRoot: mpRoot + '/' }),
  )

  const skill = join(tmp, 'my-skill')
  mkdirSync(join(skill, 'apis'), { recursive: true })
  mkdirSync(join(skill, 'components'), { recursive: true })
  writeFileSync(
    join(skill, 'mcp.json'),
    JSON.stringify({ apis: [{ name: 'hello', description: '打招呼' }] }),
  )

  return { proj, skill, mpRoot }
}

describe('installSkill', () => {
  describe('默认 miniprogramRoot', () => {
    it('拷贝到 miniprogram/skills/ 下', () => {
      const { proj, skill } = createFixture()
      installSkill(skill, proj, { skillName: 'my-skill' })

      const target = join(proj, 'miniprogram', 'skills', 'my-skill')
      assert.ok(existsSync(target), 'Skill 应在 miniprogram/skills/ 下')
      assert.ok(existsSync(join(target, 'mcp.json')))
    })

    it('更新 app.json agent.skills', () => {
      const { proj, skill } = createFixture()
      installSkill(skill, proj, { skillName: 'my-skill' })

      const app = JSON.parse(readFileSync(join(proj, 'miniprogram', 'app.json'), 'utf-8'))
      assert.ok(app.agent?.skills?.some((s: any) => s.path === 'skills/my-skill'))
      assert.ok(app.lazyCodeLoading)
    })

    it('subPackages.root = "skills"', () => {
      const { proj, skill } = createFixture()
      installSkill(skill, proj, { skillName: 'my-skill' })

      const app = JSON.parse(readFileSync(join(proj, 'miniprogram', 'app.json'), 'utf-8'))
      const sp = app.subPackages.find((p: any) => p.root === 'skills')
      assert.ok(sp, 'subPackages 应有 root: skills')
      assert.equal(sp.independent, true)
    })

    it('更新 project.config.json packOptions', () => {
      const { proj, skill } = createFixture()
      installSkill(skill, proj, { skillName: 'my-skill' })

      const config = JSON.parse(readFileSync(join(proj, 'project.config.json'), 'utf-8'))
      assert.ok(config.packOptions?.include?.some((i: any) => i.value === 'skills'))
    })

    it('写入锁文件', () => {
      const { proj, skill } = createFixture()
      installSkill(skill, proj, { skillName: 'my-skill', source: 'test' })

      const lock = readLock(proj)
      assert.ok(lock.skills.some((s: any) => s.name === 'my-skill'))
    })

    it('已存在的 Skill 被覆盖', () => {
      const { proj, skill } = createFixture()
      installSkill(skill, proj, { skillName: 'my-skill' })
      installSkill(skill, proj, { skillName: 'my-skill' })
      const target = join(proj, 'miniprogram', 'skills', 'my-skill')
      assert.ok(existsSync(target))
    })
  })

  describe('自定义 miniprogramRoot', () => {
    it('安装到 client/skills/ 下', () => {
      const { proj, skill } = createFixture('client')
      installSkill(skill, proj, { skillName: 'my-skill' })

      const target = join(proj, 'client', 'skills', 'my-skill')
      assert.ok(existsSync(target), 'Skill 应在 client/skills/ 下')
    })

    it('app.json 在 client/ 下也被更新', () => {
      const { proj, skill } = createFixture('client')
      installSkill(skill, proj, { skillName: 'my-skill' })

      const app = JSON.parse(readFileSync(join(proj, 'client', 'app.json'), 'utf-8'))
      assert.ok(app.agent?.skills?.some((s: any) => s.path === 'skills/my-skill'))
    })
  })

  describe('无 project.config.json', () => {
    it('默认使用 miniprogram/', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
      const proj = join(tmp, 'project')
      mkdirSync(join(proj, 'miniprogram'), { recursive: true })
      writeFileSync(join(proj, 'miniprogram', 'app.json'), JSON.stringify({ pages: ['p'] }))
      // 没有 project.config.json

      const skill = join(tmp, 's')
      mkdirSync(join(skill, 'apis'), { recursive: true })
      writeFileSync(join(skill, 'mcp.json'), JSON.stringify({ apis: [] }))

      installSkill(skill, proj, { skillName: 's' })
      assert.ok(existsSync(join(proj, 'miniprogram', 'skills', 's')))
    })
  })
})
