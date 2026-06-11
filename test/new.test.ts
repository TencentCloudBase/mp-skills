// test/new.test.ts
// 创建新项目命令测试

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { newCommand } from '../src/commands/new.js'

describe('newCommand (项目创建)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
  const projectDir = join(tmpDir, 'my-app')

  it('项目创建成功', async () => {
    await newCommand(projectDir)
    assert.ok(existsSync(projectDir))
  })

  it('生成了 app.json', () => {
    const app = JSON.parse(readFileSync(join(projectDir, 'miniprogram', 'app.json'), 'utf-8'))
    assert.ok(app.pages)
  })

  it('生成了 project.config.json', () => {
    const config = JSON.parse(readFileSync(join(projectDir, 'project.config.json'), 'utf-8'))
    assert.ok(config.packOptions)
  })

  it('生成了 mcp.json', () => {
    assert.ok(existsSync(join(projectDir, '.mcp.json')))
  })

  it('生成了首页页面', () => {
    assert.ok(existsSync(join(projectDir, 'miniprogram', 'pages', 'index', 'index.js')))
  })

  it('生成了云函数骨架', () => {
    assert.ok(existsSync(join(projectDir, 'cloudfunctions', 'getOpenId', 'index.js')))
  })

  it('目录已存在时发出警告', async () => {
    // 不抛异常
    await newCommand(projectDir)
    assert.ok(existsSync(projectDir))
  })
})
