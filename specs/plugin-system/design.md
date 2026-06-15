# 中立 setup 设计（v1）

## 核心理念

`mp-skills setup` 是一个**脚本编排器**——收集声明，展示确认，然后执行。不认知任何平台。

---

## 1. `mp-skills.json` Schema

Skill 或项目根目录下可选的文件，用于声明生命周期脚本。

```jsonc
// skills/greet-skill/mp-skills.json
{
  "scripts": {
    "setup": "mp-skills plugin --name cloudbase setup"
  }
}
```

```jsonc
// skills/my-skill/mp-skills.json（第三方，不用 CloudBase）
{
  "scripts": {
    "setup": "node scripts/init.mjs"
  }
}
```

```jsonc
// 项目根目录 mp-skills.json（可选，所有 Skill 的兜底）
{
  "scripts": {
    "setup": "mp-skills plugin --name cloudbase setup"
  }
}
```

**规则**：
- `scripts.setup` 是一个可执行的命令字符串
- 支持任意 CLI 命令、npm scripts、shell 命令
- Skill 级优先于项目级
- **没有 `mp-skills.json` 的 Skill**：跳过，不报错

**`description` 字段**（可选，安全设计）：

```jsonc
{
  "scripts": {
    "setup": "node scripts/init.mjs"
  },
  "description": "向 mock 数据表写入 3 条示例用户记录"
}
```

确认提示中会展示此描述，帮助用户判断脚本意图。

---

## 2. `mp-skills plugin --name cloudbase` 命令

内置命令，不开放扩展。

```
mp-skills plugin --name cloudbase setup
mp-skills plugin --name cloudbase doctor
mp-skills plugin --name cloudbase list
```

将当前硬编码在 `setup.ts` 中的 CloudBase 逻辑（云函数聚合、数据库创建、服务检查）移入此命令。

`--name` 固定为 `cloudbase`，不接受其他值。

---

## 3. `mp-skills setup` 命令

### 3.1 行为

```
mp-skills setup
```

1. 扫描所有 `skills/*/mp-skills.json`，收集 `scripts.setup` 和 `description`
2. 扫描项目根 `mp-skills.json`，收集 `scripts.setup` 和 `description`
3. 按 Skill 名称排序，展示确认清单
4. 用户确认后，**串行**执行每个脚本
5. 记录结果到 `skills-lock.json`

### 3.2 交互示例

```
$ mp-skills setup

扫描到以下 setup 脚本：

  greet-skill    mp-skills plugin --name cloudbase setup
                 聚合云函数、创建数据库集合、配置服务

  my-skill       node scripts/init.mjs
                 向 mock 数据表写入 3 条示例用户记录

即将依次执行以上 2 个脚本。
确认执行？(Y/n)
```

### 3.3 无配置时

```
$ mp-skills setup

未找到任何 setup 脚本，无需执行。
```

不报错，不假设，不注入 CloudBase 逻辑。

### 3.4 `--dry-run`

预览模式，只展示不执行。

```
$ mp-skills setup --dry-run

以下脚本将被执行（dry-run，不实际运行）：

  greet-skill    mp-skills plugin --name cloudbase setup
  my-skill       node scripts/init.mjs
```

---

## 4. 安全与行为约束

### 4.1 执行环境

| 维度 | 规则 |
|------|------|
| 工作目录 | Skill 自身目录（`skills/<name>/`），非项目根 |
| 环境变量 | 注入 `PROJECT_DIR`（项目根路径）和 `SKILL_DIR`（Skill 自身路径） |
| 执行方式 | `spawn` 而非 `exec`，避免 shell 注入 |
| 超时 | 每个脚本默认 5 分钟超时，超时视为失败 |
| 并发 | **串行**执行，下一个等待上一个完成后才启动 |

### 4.2 失败处理

```
$ mp-skills setup

  greet-skill    [OK]  完成
  my-skill       [ERR] 退出码 1 — node scripts/init.mjs 执行失败

  ==== 结果 ====
  成功: 1  失败: 1  跳过: 0

  [ERR] 部分脚本执行失败，请检查后重试。
```

- 脚本非零退出码视为失败
- **失败不阻断后续** — 继续执行剩下的 Skill
- 最终汇总显示成功/失败/跳过
- 失败脚本记录退出码和 stderr（不记录 stdout，防泄露）
- 再次运行 `mp-skills setup` 时，已成功的默认标记为跳过（除非 `--force`）

### 4.3 多次运行的幂等性

- `skills-lock.json` 记录每个脚本的最后执行状态
- 重复运行时，已成功的脚本显示为 `[SKIP] 上次已运行` 并跳过
- `--force` 参数强制全部重新执行
- 脚本内部的幂等性由脚本自身负责（如 CloudBase 的 `createCollectionIfNotExists`）

### 4.4 交互式确认

- 所有脚本一次性展示在确认清单中
- 用户必须显式确认（Y）后才开始执行
- 确认过程不可跳过（无 `--yes` 标志，v1 不提供静默模式）
- 脚本名称和 `description` 同时展示，辅助判断

### 4.5 输出安全

- `skills-lock.json` 仅记录 `status` 和 `errorCode`，不存储 stdout/stderr
- 脚本输出实时打印到终端供用户查看，但不落盘
- 用户可自行重定向输出：`mp-skills setup 2>&1 | tee setup.log`
- 不影响现有 `cloudbaserc.json` 中可能含有的密钥信息（不变动该文件）

---

## 5. CLI 架构变化

### 5.1 命令树

```
mp-skills
├── add           (不变)
├── find          (不变)
├── create        (不变)
├── list          (不变)
├── remove        (不变)
├── new           (不变)
├── update        (不变)
├── validate      (不变)
├── eval          (不变)
├── status        (不变)
├── doctor        (不变)
│
├── setup         ← 从"一站式环境搭建"改为"脚本编排器"
│
└── plugin        ← 新增，仅内置 cloudbase
    └── --name cloudbase setup
    └── --name cloudbase doctor
    └── --name cloudbase list
```

### 5.2 代码迁移

| 当前文件 | 迁移方向 |
|----------|----------|
| `src/commands/setup.ts` | 改为脚本编排器 |
| `src/lib/cloudbase.ts` | 移入 `src/plugin-cloudbase/` |
| `src/lib/cloudbase-config.ts` | 移入 `src/plugin-cloudbase/` |
| `src/lib/cloudfunction-scanner.ts` | 移入 `src/plugin-cloudbase/` |
| `src/lib/database-scanner.ts` | 移入 `src/plugin-cloudbase/` |
| `src/commands/doctor.ts` | CloudBase 相关部分转交 plugin |
| `src/lib/credential-setup.ts` | 移入 `src/plugin-cloudbase/` |

### 5.3 安装后的提示

```diff
- console.log('  * 下一步：执行 npx mp-skills setup')
- console.log('     聚合云函数、生成项目级 cloudbaserc.json、初始化数据库')
+ console.log('  下一步：运行 mp-skills setup')
+ console.log('  将自动执行各 Skill 声明的 setup 脚本')
```

---

## 6. `skills-lock.json` 变化

```typescript
// 当前（CloudBase 专用）
interface DeployedState {
  cloudfunctions: string[]
  collections: string[]
  services: string[]
}

// 改为通用记录
interface SetupRecord {
  script: string
  status: 'done' | 'skipped' | 'failed'
  executedAt: string
  errorCode?: number
}
```

保持向后兼容，旧字段标记为可选。

---

## 7. 模板更新

所有 CloudBase 模板的 Skill 自带 `mp-skills.json`：

```jsonc
// 模板生成时自动写入
{
  "scripts": {
    "setup": "mp-skills plugin --name cloudbase setup"
  }
}
```

第三方 Skill 作者自己决定写什么。
