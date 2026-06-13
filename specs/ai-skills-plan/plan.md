# mp-skills AI Skill 生态规划

## 设计原则

1. **不重复官方技能**——不复制 wxa-skills-generate/validate/eval 的功能，通过 `mp-skills` CLI 引用它们
2. **补充连接层**——串联 CLI 工具、CloudBase 服务、模板仓库，降低用户心智负担
3. **AI 原生友好**——每个 Skill 暴露清晰的 API，让 AI coding 工具可以直接调用
4. **渐进式引导**——从「想点子」到「上线」有一条完整路径

## 命名

统一前缀 `wxa-`（与微信官方保持一致，表明是微信小程序 AI Skill 生态），名字突出各自定位：

| 设计名 | 最终名 | 定位 |
|------|------|------|
| `concierge` | `wxa-landing` | 入口引导 |
| `ideator` | `wxa-idea-lab` | 创意脑暴 |
| `blueprint` | `wxa-workbench` | Skill 设计工作台 |
| `starter` | `wxa-foundation` | 云开发基建 |
| `doctor` | `wxa-health-check` | 校验诊断 |
| `reviewer` | `wxa-review` | 评测审查 |

## Skill 架构

```
wxa-landing                ← 入口：了解生态、引导到其他 Skill
    │
    ├── wxa-idea-lab       ← 想点子：生成小程序 AI 方案
    │
    ├── wxa-workbench      ← 设计：SKILL.md + mcp.json 设计
    │
    ├── wxa-foundation     ← 基建：数据库/登录/支付模板
    │
    ├── wxa-health-check   ← 校验：封装 validate/execute/render
    │
    └── wxa-review         ← 评测：封装 eval + 结果解读
```

---

## Skill 详细设计

### 1. wxa-landing（入口）

**定位**：用户第一次接触 mp-skills 时的引导入口。告诉用户生态全貌，推荐下一步。

**API**：
- `getEcosystemOverview()` — 返回 mp-skills 的完整生态图（CLI 能力、模板仓库、官方技能）
- `recommendNextStep(context)` — 根据用户意图推荐跳转到哪个 Skill

**输出示例**：
```
mp-skills 生态系统：
  - CLI 工具：安装/管理/校验/评测 AI Skills
  - 模板仓库：awesome-miniprogram-skills（全栈模板，含数据库/登录/支付）
  - 官方技能：generate（生成）/ validate（校验）/ eval（评测）
```

---

### 2. wxa-idea-lab（创意）

**定位**：帮助用户想小程序 AI 的点子，生成项目方案。

**API**：
- `brainstormIdeas(domain)` — 给定领域，生成小程序 AI 功能点子
- `createProjectPlan(idea)` — 将一个点子展开为技术方案、Skill 清单、模板选择

**参考**：
- `awesome-miniprogram-skills` 中的现有 Skill（点餐/排队/挂号/出行等）
- `SKILL-DEV-GUIDE.md` 的设计规范

---

### 3. wxa-workbench（设计）

**定位**：辅助用户设计一个新的 Skill，产出 `SKILL.md` + `mcp.json`。

**API**：
- `designSkill(spec)` — 根据用户描述生成 SKILL.md + mcp.json 骨架
- `validateBlueprint(skillPath)` — 对设计稿做静态检查（接口粒度过粗等）

**约束**：
- 接口命名 camelCase
- description 包含前置条件和严禁场景
- mcp.json 不超过 24000 字符
- 遵守 WeCard 设计规范

**不重复**：不代替 wxa-skills-generate 的代码生成，只做设计阶段。用户确认设计后再运行 `mp-skills create --ai` 进入代码生成。

---

### 4. wxa-foundation（基建）

**定位**：从 `awesome-miniprogram-skills` 模板快速搭建项目，集成云开发能力。

**API**：
- `listTemplates(filter)` — 列出可用模板（数据库/登录/支付等）
- `scaffoldProject(options)` — 创建项目骨架，集成云开发配置
- `guideSetup(projectPath)` — 引导完成 setup（数据库创建、环境配置）

**参考**：
- `awesome-miniprogram-skills` 的 `cloudbaserc.json` 配置
- `cloud-error-handler.js` 的错误处理中间件
- `cloud-middleware.js` 的初始化中间件

---

### 5. wxa-health-check（校验）

**定位**：封装 `mp-skills validate` / `execute` / `render` 命令，为用户提供友好的校验体验。

**API**：
- `runValidation(projectPath, skillName)` — 运行静态校验，返回可读报告
- `runExecute(projectPath, apiName, args)` — 执行原子接口，调试数据
- `runRender(projectPath, apiName)` — 渲染组件，截图检查

**实现**：调用 `node <validate-path>/scripts/validate.mjs <project>` 等官方脚本

**不重复**：不重写校验逻辑，只做结果解读和引导修复。

---

### 6. wxa-review（评测）

**定位**：封装 `mp-skills eval` 命令，解读评测报告，给出改进建议。

**API**：
- `runEvaluation(projectPath, options)` — 运行端到端评测
- `reviewReport(reportPath)` — 解读评测报告，总结问题
- `suggestFixes(failures)` — 根据失败归因给出修复建议

**参考**：wxa-skills-eval 的 12 节点管线产出

---

## 技术方案

### 目录结构

每个 Skill 放在 `skills/` 下，与 awesome-miniprogram-skills 同一仓库或单独仓库：

```
skills/
├── wxa-landing/
│   ├── SKILL.md
│   ├── mcp.json
│   ├── index.js
│   ├── apis/
│   │   └── getEcosystemOverview.js
│   │   └── recommendNextStep.js
│   └── utils/
├── wxa-idea-lab/
├── wxa-workbench/
├── wxa-foundation/
├── wxa-health-check/
└── wxa-review/
```

### 与官方技能的分工

| 场景 | 用户会用 | 底层调用 |
|------|---------|---------|
| 想做一个点餐 AI | `wxa-idea-lab` | → 参考 awesome 模板 |
| 设计 Skill 接口 | `wxa-workbench` | → 产出 SKILL.md → 转 `wxa-skills-generate` |
| 校验写好的代码 | `wxa-health-check` | → `mp-skills validate/execute/render` |
| 上线前评测 | `wxa-review` | → `mp-skills eval` → 解读报告 |
| 配置云开发 | `wxa-foundation` | → `mp-skills setup` + 模板复制 |
| 不知道从哪开始 | `wxa-landing` | → 推荐上述之一 |

### 安装方式

用户只需安装 `mp-skills` CLI，执行：

```bash
mp-skills add TencentCloudBase/awesome-miniprogram-skills --all
```

即可获得所有生态 Skill（含 `_shared` 中间件和 `wxa-foundation` 等）。
