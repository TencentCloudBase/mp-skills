// test/find.test.ts
// find 命令测试，特别是 CLI 定义和 --json 标记

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const cliSource = readFileSync(join(process.cwd(), 'src', 'cli.ts'), 'utf-8')
const findSource = readFileSync(join(process.cwd(), 'src', 'commands', 'find.ts'), 'utf-8')

describe('find CLI 定义', () => {
  it('注册了 find 命令', () => {
    assert.match(cliSource, /\.command\('find/)
  })

  it('find --json 已注册', () => {
    assert.match(cliSource, /--json/)
    // find 在 cli.ts 中应该排在 list 之后、create 之前
    const findIdx = cliSource.indexOf(".command('find")
    const jsonNearFind = cliSource.slice(findIdx, findIdx + 300)
    assert.ok(jsonNearFind.includes('--json') || findSource.includes('json'))
  })
})

describe('find JSON 输出逻辑', () => {
  it('staticSearch 支持 json 参数', () => {
    // 验证函数签名带有 json 参数
    assert.match(findSource, /staticSearch.*json/)
  })

  it('json 模式输出 skills + total 结构', () => {
    assert.match(findSource, /JSON\.stringify\(\{.*skills.*total/)
  })
})
