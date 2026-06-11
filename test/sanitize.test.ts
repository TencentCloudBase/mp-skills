// test/sanitize.test.ts
// 安全函数测试 — 注入防护、路径穿越、输入验证

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { sanitizeGitUrl, sanitizeRef, sanitizeSkillName, isValidGitUrl } from '../src/lib/sanitize.js'

describe('sanitizeGitUrl', () => {
  it('标准 https URL 不变', () => {
    assert.equal(sanitizeGitUrl('https://github.com/owner/repo.git'), 'https://github.com/owner/repo.git')
  })

  it('git SSH URL 不变', () => {
    assert.equal(sanitizeGitUrl('git@github.com:owner/repo.git'), 'git@github.com:owner/repo.git')
  })

  it('移除 shell 注入 (反引号)', () => {
    const result = sanitizeGitUrl('https://github.com/owner/repo`rm -rf /`')
    assert.ok(!result.includes('`'))
    assert.ok(result.includes('rm') === false) // 也会被移除
  })

  it('移除 shell 注入 ($())', () => {
    const result = sanitizeGitUrl('https://github.com/owner/$(id).git')
    assert.ok(!result.includes('$'))
    assert.ok(!result.includes('id'))
  })

  it('移除 shell 注入 (;)', () => {
    const result = sanitizeGitUrl('https://github.com/owner/repo;echo pwned')
    assert.ok(!result.includes(';'))
  })

  it('移除换行符', () => {
    const result = sanitizeGitUrl('https://github.com/owner/repo\n.git')
    assert.ok(!result.includes('\n'))
  })

  it('保留端口号', () => {
    assert.equal(sanitizeGitUrl('https://github.com:443/owner/repo.git'), 'https://github.com:443/owner/repo.git')
  })

  it('保留认证信息', () => {
    assert.equal(sanitizeGitUrl('https://token@github.com/owner/repo.git'), 'https://token@github.com/owner/repo.git')
  })

  it('保留波浪线', () => {
    assert.equal(sanitizeGitUrl('https://github.com/owner/~repo.git'), 'https://github.com/owner/~repo.git')
  })

  it('空字符串返回空', () => {
    assert.equal(sanitizeGitUrl(''), '')
  })

  it('纯特殊字符全被移除', () => {
    const result = sanitizeGitUrl('!@#$%^&*()+=')
    assert.equal(result, '') // 没有安全字符
  })
})

describe('sanitizeRef', () => {
  it('标准分支名不变', () => {
    assert.equal(sanitizeRef('main'), 'main')
    assert.equal(sanitizeRef('feat/skill-market'), 'feat/skill-market')
    assert.equal(sanitizeRef('v1.0.0'), 'v1.0.0')
  })

  it('移除 shell 注入', () => {
    assert.ok(!sanitizeRef('main;rm -rf /').includes(';'))
  })

  it('空字符串返回默认 main', () => {
    assert.equal(sanitizeRef(''), 'main')
  })

  it('纯特殊字符返回默认 main', () => {
    assert.equal(sanitizeRef('!@#$%'), 'main')
  })
})

describe('sanitizeSkillName', () => {
  it('标准名称不变', () => {
    assert.equal(sanitizeSkillName('drink-skill'), 'drink-skill')
    assert.equal(sanitizeSkillName('my_skill'), 'my_skill')
  })

  it('路径穿越 ../ 被移除', () => {
    const result = sanitizeSkillName('../../etc/passwd')
    assert.ok(!result.includes('..'))
    assert.ok(!result.includes('/'))
  })

  it('隐藏目录 . 开头被移除', () => {
    assert.notEqual(sanitizeSkillName('.hidden'), '.hidden')
  })

  it('绝对路径 / 开头被移除', () => {
    const result = sanitizeSkillName('/etc/passwd')
    assert.ok(!result.startsWith('/'))
  })

  it('Windows 路径被清理', () => {
    const result = sanitizeSkillName('C:\\Windows\\System32')
    assert.ok(!result.includes('\\'))
    assert.ok(!result.includes(':'))
  })

  it('空字符串返回 unknown', () => {
    assert.equal(sanitizeSkillName(''), 'unknown')
  })

  it('纯特殊字符返回 unknown', () => {
    assert.equal(sanitizeSkillName('...'), 'unknown')
  })

  it('注入字符被替换为连字符', () => {
    const result = sanitizeSkillName('my/skill/name')
    assert.ok(!result.includes('/'))
    assert.ok(result.length > 0)
  })
})

describe('isValidGitUrl', () => {
  it('https URL 有效', () => {
    assert.ok(isValidGitUrl('https://github.com/owner/repo.git'))
  })

  it('http URL 有效', () => {
    assert.ok(isValidGitUrl('http://gitlab.com/owner/repo.git'))
  })

  it('git SSH URL 有效', () => {
    assert.ok(isValidGitUrl('git@github.com:owner/repo.git'))
  })

  it('ssh:// URL 有效', () => {
    assert.ok(isValidGitUrl('ssh://git@github.com/owner/repo.git'))
  })

  it('本地路径无效', () => {
    assert.ok(!isValidGitUrl('/tmp/repo'))
  })

  it('相对路径无效', () => {
    assert.ok(!isValidGitUrl('./repo'))
  })

  it('空字符串无效', () => {
    assert.ok(!isValidGitUrl(''))
  })

  it('纯文本无效', () => {
    assert.ok(!isValidGitUrl('just-a-name'))
  })

  it('文件名无效', () => {
    assert.ok(!isValidGitUrl('README.md'))
  })

  it('带空格路径无效', () => {
    assert.ok(!isValidGitUrl('/path/with space/repo'))
  })
})
