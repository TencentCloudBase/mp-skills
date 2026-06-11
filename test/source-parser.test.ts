// test/source-parser.test.ts
// 来源解析测试 — 参考 vercel-labs/skills 的细化粒度

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseSource } from '../src/lib/source-parser.js'

describe('parseSource', () => {
  describe('GitHub shorthand', () => {
    it('标准 owner/repo', () => {
      const r = parseSource('owner/repo')
      assert.equal(r.type, 'github')
      assert.equal(r.repoName, 'owner/repo')
      assert.equal(r.repoUrl, 'https://github.com/owner/repo.git')
      assert.equal(r.ref, 'main')
    })

    it('带数字的仓库名', () => {
      const r = parseSource('org/project-v2')
      assert.equal(r.type, 'github')
      assert.equal(r.repoName, 'org/project-v2')
    })

    it('带点的仓库名', () => {
      const r = parseSource('my-org/my.project')
      assert.equal(r.type, 'github')
      assert.equal(r.repoName, 'my-org/my.project')
    })
  })

  describe('完整 URL', () => {
    it('https URL', () => {
      const r = parseSource('https://github.com/foo/bar.git')
      assert.equal(r.type, 'url')
      assert.equal(r.repoUrl, 'https://github.com/foo/bar.git')
    })

    it('git URL', () => {
      const r = parseSource('git@github.com:foo/bar.git')
      assert.equal(r.type, 'url')
    })

    it('http URL', () => {
      const r = parseSource('http://example.com/repo.git')
      assert.equal(r.type, 'url')
    })
  })

  describe('本地路径', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'mp-skills-test-'))

    it('当前目录', () => {
      const r = parseSource('.')
      assert.equal(r.type, 'local')
      assert.ok(r.localPath)
    })

    it('存在目录被识别为本地路径', () => {
      const r = parseSource(tmpDir)
      assert.equal(r.type, 'local')
    })
  })

  describe('无效输入', () => {
    it('空字符串', () => {
      assert.throws(() => parseSource(''), /不能为空/)
    })

    it('undefined', () => {
      assert.throws(() => parseSource(undefined as any), /不能为空/)
    })

    it('null', () => {
      assert.throws(() => parseSource(null as any), /不能为空/)
    })

    it('纯特殊字符', () => {
      assert.throws(() => parseSource('!!!invalid!!!'), /无法解析/)
    })

    it('路径穿越被识别为本地路径（由 sanitize 后续防护）', () => {
      const r = parseSource('../../../etc/passwd')
      assert.equal(r.type, 'local')
      assert.ok(r.localPath)
    })

    it('带空格的输入', () => {
      assert.throws(() => parseSource('not valid path!!!__test__'), /无法解析/)
    })

    it('单段名称（无 /）', () => {
      assert.throws(() => parseSource('nonexistent_path_12345'), /无法解析/)
    })
  })

  describe('trim 处理', () => {
    it('前后空格被忽略', () => {
      const r = parseSource('  owner/repo  ')
      assert.equal(r.repoName, 'owner/repo')
    })
  })
})
