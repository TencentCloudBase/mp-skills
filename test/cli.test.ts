// test/cli.test.ts
// CLI 命令定义测试

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const cliSource = readFileSync(join(process.cwd(), 'src', 'cli.ts'), 'utf-8')

describe('CLI eval command', () => {
  it('项目路径参数可省略，默认使用当前目录', () => {
    assert.match(cliSource, /\.command\('eval \[project-dir\]'\)/)
    assert.match(cliSource, /evalCommand\(projectDir \|\| '\.', opts\)/)
  })
})
