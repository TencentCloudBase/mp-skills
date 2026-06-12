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
  /** 从 skill 级 cloudbaserc.json 读取的配置（有云函数时） */
  timeout?: number
  handler?: string
  runtime?: string
  memorySize?: number
  installDependency?: boolean
  dir?: string
  envVariables?: Record<string, string>
}

// ── Skill 级 cloudbaserc.json 中的 function 条目 ──

export interface SkillFunctionConfig {
  name: string
  type?: string
  timeout?: number
  handler?: string
  runtime?: string
  memorySize?: number
  installDependency?: boolean
  dir?: string
  envVariables?: Record<string, string>
  triggers?: unknown[]
  ignore?: string[]
}

// ── Skill 级 cloudbaserc.json 完整格式 ──

export interface SkillCloudbaserc {
  version: string
  functions?: SkillFunctionConfig[]
  database?: {
    collections?: Array<{
      name: string
      description: string
      indexes?: Array<{ field: string; unique?: boolean }>
    }>
  }
}

// ── 项目级 cloudbaserc.json 合并结果 ──

export interface ProjectCloudbaserc {
  version: string
  functions: Required<SkillFunctionConfig>[]
  database?: {
    collections: Required<NonNullable<SkillCloudbaserc['database']>>['collections']
  }
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
