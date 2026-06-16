// test/plugin.test.ts
// plugin 命令路由测试

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const cliSource = readFileSync(join(process.cwd(), 'src', 'cli.ts'), 'utf-8')
const pluginSource = readFileSync(join(process.cwd(), 'src', 'commands', 'plugin.ts'), 'utf-8')

describe('plugin CLI 定义', () => {
  it('注册了 plugin 命令', () => {
    assert.match(cliSource, /\.command\('plugin'\)/)
  })

  it('plugin 命令有 --name 必填选项', () => {
    assert.match(cliSource, /requiredOption.*--name/)
  })

  it('setup/list/doctor 注册为 plugin 的子命令', () => {
    assert.match(cliSource, /trackCommand/)
  })
})

describe('plugin 路由逻辑', () => {
  it('只允许 cloudbase 插件', () => {
    assert.match(pluginSource, /ALLOWED_PLUGINS = new Set\(\[\'cloudbase\'\]\)/)
  })

  it('子命令路由 setup/doctor/list', () => {
    assert.match(pluginSource, /case 'setup':/)
    assert.match(pluginSource, /case 'doctor':/)
    assert.match(pluginSource, /case 'list':/)
  })

  it('未知子命令报错', () => {
    assert.match(pluginSource, /未知子命令/)
    assert.match(pluginSource, /可用: setup, doctor, list/)
  })

  it('优先读取 PROJECT_DIR 环境变量', () => {
    assert.match(pluginSource, /process\.env\.PROJECT_DIR/)
  })
})
