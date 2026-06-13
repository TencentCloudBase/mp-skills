# wxa-core-skills 设计文档

## 设计哲学

三个 Skill 的 SKILL.md 遵循以下原则（参考 Anthropic skill-creator 和微信官方 wxa-skills-* 的设计经验）：

1. **解释为什么**——不要只说"必须这样做"，要说明原因
2. **渐进式披露**——先给全局概览，再逐步深入细节
3. **避免全大写 MUST**——多用推荐和建议语气，只在真正硬性约束时用明确禁止
4. **祈使句指令**——步骤用祈使句，清晰可执行
5. **为触发而写**——description 要稍微"pushy"，防止 AI undertrigger
6. **不暴露 API**——没有 mcp.json，SKILL.md 就是完整的执行规范
7. **阶段式 + 核心循环**——微信的阶段式勾选框 + Anthropic 的迭代改进循环

## 层级关系

```
AI coding 工具读取 SKILL.md → 按阶段执行
    │
    ├── 调用 mp-skills CLI（安装 / 校验 / 评测）
    ├── 调用 wxa-skills-generate（生成代码）
    ├── 调用 wxa-skills-validate（校验 + 执行 + 渲染）
    ├── 调用 wxa-skills-eval（端到端评测）
    ├── 读取 awesome-miniprogram-skills 模板
    └── 引导用户填写云开发配置
```

---

## 1. wxa-find-skills

**文件**：`skills/wxa-find-skills/SKILL.md`

```yaml
name: wxa-find-skills
description: 搜索和安装社区小程序 AI Skill。当你需要为现有小程序项目添加 AI 能力，但不确定有什么可用的社区 Skill 时触发。可以从 TencentCloudBase/awesome-miniprogram-skills 及其他仓库搜索和安装。
metadata:
  author: TencentCloudBase
  version: 0.1.0
```

**SKILL.md 章节**：

```
# wxa-find-skills

## 职责边界
  做什么：搜索远程仓库、查看 Skill 详情、安装到本地项目
  不做什么：创建新项目、修改 Skill 代码、上架 Skill

## 参考资料
  - mp-skills CLI: npx mp-skills --help（查看所有命令）

## 工作流

  Step 1 — 理解需求
    确认用户的意图，是用什么功能，然后调用 npx mp-skills find <keyword> 搜索。
    如果用户没有指定关键词，先问清楚。

  Step 2 — 查看并选择
    搜索到结果后，展示名称和描述，让用户选择。
    用户确认后，记录要安装的 Skill 名称和来源仓库。

  Step 3 — 安装到项目
    调用 npx mp-skills add <repo> --skill <name> 安装。
    安装后提示用户运行 npx mp-skills setup。

  Step 4 — 后续引导
    告知用户已安装的 Skill 可以被 AI 调用了。
    如果用户想添加更多能力，可以回到 Step 1。
```

---

## 2. wxa-create-ai-miniprogram

**文件**：`skills/wxa-create-ai-miniprogram/SKILL.md`

```yaml
name: wxa-create-ai-miniprogram
description: 从零创建带 AI 能力的微信小程序项目。当用户想创建一个新的微信小程序（不是已有项目上添加功能）时触发。集成云开发、数据库、登录、支付等能力。需要环境：Node.js 18+、npm、微信开发者工具。
metadata:
  author: TencentCloudBase
  version: 0.1.0
compatibility: [mp-skills CLI, Node.js 18+]
```

**SKILL.md 章节**：

```
# wxa-create-ai-miniprogram

## 职责边界
  做什么：了解需求→生成方案→创建项目→安装 Skill→引导配置
  不做什么：在已有项目中添加 Skill（转给 wxa-create-mp-skill）

## 参考资料
  - mp-skills CLI: npx mp-skills --help
  - awesome-miniprogram-skills 模板仓库
  - SKILL-DEV-GUIDE.md 开发规范

## 硬性约束
  - 必须使用 npx mp-skills new <name> 创建项目骨架
  - prpject.config.json 中的 appid 需用户自己填写（微信公众平台获取）
  - 安装 Skill 后必须提示用户执行 npx mp-skills setup
  - 不要帮用户填写云环境 ID，引导用户自行获取

## 工作流

  Step 1 — 需求分析
    与用户对话，了解他们的想法。
    参考 awesome-miniprogram-skills 中的现有 Skill 类型（点餐、排队、电商、出行等），
    给出功能建议和推荐的 Skill 清单。
    输出一个简单的方案说明（含目标用户、核心功能、推荐 Skill）。

  Step 2 — 创建项目
    由用户确认方案后，执行：
    npx mp-skills new <project-name>
    cd <project-name>
    执行后，提示用户下一步。

  Step 3 — 安装首批 Skill
    根据方案推荐，安装所需的 Skill：
    npx mp-skills add TencentCloudBase/awesome-miniprogram-skills --skill <name>
    建议先安装 greet-skill（首页引导），再安装业务 Skill。

  Step 4 — 引导配置
    告诉用户需要完成以下步骤：
    1. 在 project.config.json 中填写 appid（微信公众平台）
    2. 在 miniprogram/app.js 中填写云环境 ID
    3. 运行 npx mp-skills setup 初始化环境
    4. 用微信开发者工具打开项目预览

## 迭代改进
  创建完成后，问用户是否需要调整或添加更多功能。
  如果需要添加新 Skill，引导到 wxa-create-mp-skill。
```

---

## 3. wxa-create-mp-skill

**文件**：`skills/wxa-create-mp-skill/SKILL.md`

```yaml
name: wxa-create-mp-skill
description: 在已有小程序项目中创建新的 AI Skill。当用户想在现有项目中添加新的 AI 能力（而非搜索安装现成的社区 Skill）时触发。完整流程：需求理解 → 接口设计 → 调用 wxa-skills-generate 生成代码 → wxa-skills-validate 校验通过。
metadata:
  author: TencentCloudBase
  version: 0.1.0
compatibility: [mp-skills CLI, Node.js 18+, 微信开发者工具]
```

**SKILL.md 章节**：

```
# wxa-create-mp-skill

## 职责边界
  做什么：理解需求、设计接口、生成代码、校验通过
  不做什么：创建新项目（转给 wxa-create-ai-miniprogram）、搜索安装社区 Skill（转给 wxa-find-skills）

## 参考资料
  - wxa-skills-generate/SKILL.md — 代码生成的完整规范和白名单
  - wxa-skills-validate/SKILL.md — 校验规则和修复流程
  - mp-skills CLI: npx mp-skills --help
  - awesome-miniprogram-skills/SKILL-DEV-GUIDE.md — WeCard 设计规范

## 硬性约束
  - 项目必须是已有 mp-skills 项目（存在 skills/ 目录）
  - 接口命名 camelCase
  - mcp.json 去除 outputSchema 不超过 24000 字符
  - 遵守 WeCard 设计规范
  - 生成代码后必须调用 wxa-skills-validate 校验通过才能交付

## 工作流

  Step 1 — 需求理解与接口设计
    与用户对话明确功能需求，然后设计原子接口清单。
    产出：一份接口清单（name + description + inputSchema）。
    注意：接口描述要包含前置条件和严禁场景，有助于 AI 模型正确选择。
    用户确认设计后再进入下一步。

  Step 2 — 创建 SKILL.md + mcp.json
    在 skills/<skill-name>/ 下创建 SKILL.md 和 mcp.json。
    参考 SKILL-DEV-GUIDE.md 的规范编写。
    用户确认设计文档后再进入下一步。

  Step 3 — 代码生成
    调用 wxa-skills-generate（路径通过 npx mp-skills --help 底部获取）：
  SKILL.md 路径见 wxa-skills-generate/SKILL.md
    如果 wxa-skills-generate 不可用，mp-skills CLI 会自动 ensure。

  Step 4 — 校验与修复
    运行：
    node <validate-path>/scripts/validate.mjs <project-path>
    静态校验通过后（summary.errors === 0），
    对每个带 _meta.ui.componentPath 的接口运行 execute 和 render：
    node <validate-path>/scripts/execute.mjs --project <path> --name <api-name> ...
    node <validate-path>/scripts/render.mjs --project <path> --from-execute ...
    如果有校验失败，按 wxa-skills-validate/SKILL.md 的修复流程修复。
    重复直到所有接口通过。

  Step 5 — 注册到 app.json
    确认 app.json 的 agent.skills[] 中已包含新 Skill。
    提示用户运行 npx mp-skills setup 完成环境配置。
```

---

## 目录结构

三个 Skill 均不包含 mcp.json，结构与 Anthropic 的 skill-creator 一致——SKILL.md 就是完整的执行规范：

```
skills/
├── wxa-find-skills/
│   └── SKILL.md
├── wxa-create-ai-miniprogram/
│   └── SKILL.md
├── wxa-create-mp-skill/
│   └── SKILL.md
└── _shared/
    └── mp-skills-shared/
        └── utils/
            ├── cloud-middleware.js
            └── cloud-error-handler.js
```

放在 awesome-miniprogram-skills 仓库中。
