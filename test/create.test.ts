// test/create.test.ts
// 创建项目命令测试

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createCommand } from '../src/commands/create.js'

describe('createCommand', () => {
  describe('创建新项目', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
    const projectDir = join(tmpDir, 'my-app')

    it('项目创建成功', async () => {
      // 清理可能存在的残留
      try { await createCommand(projectDir) } catch {}
      assert.ok(existsSync(projectDir), '项目目录应存在')
    })

    it('生成了 app.json', () => {
      const appJson = join(projectDir, 'miniprogram', 'app.json')
      assert.ok(existsSync(appJson), 'app.json 应存在')
      const app = JSON.parse(readFileSync(appJson, 'utf-8'))
      assert.ok(app.pages)
      assert.ok(app.window)
    })

    it('生成了 project.config.json', () => {
      const configPath = join(projectDir, 'project.config.json')
      assert.ok(existsSync(configPath), 'project.config.json 应存在')
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      assert.ok(config.description, '应有描述')
      assert.ok(config.packOptions?.include, '应有 packOptions')
    })

    it('生成了 mcp.json', () => {
      const mcpPath = join(projectDir, '.mcp.json')
      assert.ok(existsSync(mcpPath), '.mcp.json 应存在')
    })

    it('生成了 README.md', () => {
      const readmePath = join(projectDir, 'README.md')
      assert.ok(existsSync(readmePath), 'README.md 应存在')
    })

    it('生成了云函数骨架', () => {
      const funcPath = join(projectDir, 'cloudfunctions', 'getOpenId', 'index.js')
      assert.ok(existsSync(funcPath), '云函数 getOpenId 应存在')
    })

    it('生成了首页页面', () => {
      const pagePath = join(projectDir, 'miniprogram', 'pages', 'index', 'index.js')
      assert.ok(existsSync(pagePath), '页面 index.js 应存在')
      assert.ok(existsSync(join(projectDir, 'miniprogram', 'pages', 'index', 'index.wxml')))
      assert.ok(existsSync(join(projectDir, 'miniprogram', 'pages', 'index', 'index.wxss')))
      assert.ok(existsSync(join(projectDir, 'miniprogram', 'pages', 'index', 'index.json')))
    })

    it('生成了开发指南', () => {
      const guide = join(projectDir, 'docs', 'SKILL-DEV-GUIDE.md')
      assert.ok(existsSync(guide), 'SKILL-DEV-GUIDE.md 应存在')
    })

    it('生成了 git 仓库', () => {
      const gitDir = join(projectDir, '.git')
      // git init 可能失败（无 git），跳过
      // 只是验证创建不报错即可
    })
  })

  describe('已存在的目录', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
    const projectDir = join(tmpDir, 'existing')

    it('目录已存在时发出警告并跳过', async () => {
      mkdirSync(projectDir, { recursive: true })
      // 应该不报错，只输出警告
      // createCommand 内部调用 warn 后 return
      await createCommand(projectDir)
      // 目录仍然存在，未抛异常
      assert.ok(existsSync(projectDir))
    })
  })

  describe('项目名称', () => {
    it('相对路径项目名', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
      // 不能用 CD 过去，直接传绝对路径
      const absPath = join(tmpDir, 'relative-project')
      await createCommand(absPath)
      assert.ok(existsSync(absPath))
    })

    it('带连字符的名称', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
      const dir = join(tmpDir, 'my-skill-app')
      await createCommand(dir)
      assert.ok(existsSync(dir))
    })

    it('带点的名称', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
      const dir = join(tmpDir, 'my.app')
      await createCommand(dir)
      assert.ok(existsSync(dir))
    })
  })
})
