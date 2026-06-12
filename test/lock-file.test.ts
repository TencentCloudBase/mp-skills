// test/lock-file.test.ts
// 锁文件读写测试

import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readLock, writeLock, addLockEntry, removeLockEntry } from '../src/lib/lock-file.js'

function tmpProject(): string {
  return mkdtempSync(join(tmpdir(), 'mp-skills-test-'))
}

describe('readLock', () => {
  it('无锁文件返回空列表', () => {
    const lock = readLock(tmpProject())
    assert.equal(lock.version, 2)
    assert.deepEqual(lock.skills, [])
  })

  it('损坏的锁文件返回空列表', () => {
    const dir = tmpProject()
    writeFileSync(join(dir, 'skills-lock.json'), '{invalid json')
    const lock = readLock(dir)
    assert.deepEqual(lock.skills, [])
  })
})

describe('writeLock / addLockEntry', () => {
  it('写入并读取', () => {
    const dir = tmpProject()
    writeLock(dir, [{ name: 'test-skill', source: 'test/repo', hash: 'abc123' }])
    const lock = readLock(dir)
    assert.equal(lock.skills.length, 1)
    assert.equal(lock.skills[0].name, 'test-skill')
    assert.equal(lock.skills[0].hash, 'abc123')
  })

  it('相同 name 覆盖', () => {
    const dir = tmpProject()
    addLockEntry(dir, { name: 's1', source: 'old', hash: 'h1' })
    addLockEntry(dir, { name: 's1', source: 'new', hash: 'h2' })
    const lock = readLock(dir)
    assert.equal(lock.skills.length, 1)
    assert.equal(lock.skills[0].hash, 'h2')
  })

  it('多条目共存', () => {
    const dir = tmpProject()
    addLockEntry(dir, { name: 'a', source: 'r1' })
    addLockEntry(dir, { name: 'b', source: 'r2' })
    const lock = readLock(dir)
    assert.equal(lock.skills.length, 2)
  })

  it('自动添加 installedAt', () => {
    const dir = tmpProject()
    addLockEntry(dir, { name: 'x', source: 'r' })
    const lock = readLock(dir)
    assert.ok(lock.skills[0].installedAt)
  })
})

describe('removeLockEntry', () => {
  it('移除指定条目', () => {
    const dir = tmpProject()
    addLockEntry(dir, { name: 'a', source: 'r' })
    addLockEntry(dir, { name: 'b', source: 'r' })
    removeLockEntry(dir, 'a')
    const lock = readLock(dir)
    assert.equal(lock.skills.length, 1)
    assert.equal(lock.skills[0].name, 'b')
  })

  it('移除不存在的条目不报错', () => {
    const dir = tmpProject()
    addLockEntry(dir, { name: 'a', source: 'r' })
    removeLockEntry(dir, 'nonexistent')
    assert.equal(readLock(dir).skills.length, 1)
  })
})
