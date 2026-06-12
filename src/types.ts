// ── 共享类型定义 ──

export type SourceType = 'github' | 'url' | 'local'

export interface SourceInfo {
  type: SourceType
  original: string
  repoUrl?: string
  repoName?: string
  ref?: string
  match?: string
  localPath?: string
  skillName?: string
}

export interface LockEntry {
  name: string
  source: string
  hash?: string
  installedAt?: string
}

// ── 部署状态（skills-lock.json 中的 deployed 字段） ──

export interface DeployedState {
  cloudfunctions: string[]
  collections: string[]
  services: string[]
}

// ── 云函数扫描结果 ──

export type CloudFunctionType = 'event' | 'http'

export interface CloudFunctionInfo {
  name: string
  skillName: string
  type: CloudFunctionType
  sourcePath: string
  hasCloudbaserc: boolean
}

// ── 数据库集合声明 ──

export interface CollectionIndex {
  name: string
  field: string
}

export interface CollectionDeclaration {
  name: string
  description: string
  indexes: CollectionIndex[]
}

export interface CollectionInfo {
  name: string
  description: string
  indexes: CollectionIndex[]
  skills: string[]
}

export interface RegistryRepo {
  name: string
  repo: string
  ref?: string
  match?: string
  skills?: Array<{ name: string; description: string }>
}

export interface Registry {
  version: number
  repositories: RegistryRepo[]
}

export interface SkillInfo {
  name: string
  description?: string
  path: string
}
