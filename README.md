# mp-skills

<p align="center">
  <img src="media/logo.svg" alt="mp-skills logo" width="480">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mp-skills"><img src="https://img.shields.io/npm/v/mp-skills.svg?style=flat-square" alt="npm version"></a>&nbsp;
  <a href="https://www.npmjs.com/package/mp-skills"><img src="https://img.shields.io/npm/dm/mp-skills.svg?style=flat-square" alt="npm downloads"></a>&nbsp;
  <a href="https://github.com/TencentCloudBase/mp-skills/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/mp-skills.svg?style=flat-square" alt="license"></a>&nbsp;
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/mp-skills?style=flat-square" alt="node version"></a>
</p>

<p align="center">
  <img src="media/term-screenshot.svg" alt="mp-skills terminal screenshot" width="600">
</p>

小程序 Skill 开发工具，支持快速创建新的 AI 小程序和 Skill，或将现有小程序改造为支持 AI 开发模式，并内置 AI 评测校验工具，保障 Skill 执行质量和稳定性。

> 什么是微信小程序 Skill？快速了解 ➡️ [微信 AI 开发模式官方文档](https://developers.weixin.qq.com/miniprogram/dev/ai/guide.html)

特性
- 📦 **Skill 发现与安装**：跨注册仓库搜索、安装、更新、移除远程 Skill（`find` / `add` / `update` / `remove`），支持 GitHub、URL、本地路径多源安装
- 🏗️ **项目脚手架**：一键创建带 AI Skill 支持的小程序项目骨架（`new`），或在已有项目中快速生成 Skill 模板（`create`）
- 🤖 **AI 辅助生成**：Agent 模式通过大模型分析项目自动生成符合规范的 Skill，支持增量迭代（`create --mode agent`）
- 🔍 **Skill 静态校验**：对项目中 Skills 进行规范性检查，支持原子接口执行和组件渲染（`validate` / `execute` / `render`）
- 🧪 **端到端质量评估**：集成官方评测工具（`wxa-skills-eval`），支持 official 和 agent 两种评估模式，自动生成测试用例并执行（`eval`）
- 🔑 **多 LLM 提供方**：内置 DeepSeek、智谱 GLM、Kimi、MiniMax、CloudBase 网关等提供方预设，支持 BYOK（Bring Your Own Key）
- 📋 **版本锁定与部署追踪**：`skills-lock.json` 追踪 Skill 版本 hash 和部署状态

---

## 1. 安装

### 1.1 环境要求

- **Node.js** ≥ 18（推荐 20+）
- **npm** ≥ 9（或 pnpm / yarn）
- **Git**（可选，`add` 命令从 GitHub 安装时需要）

### 1.2 全局安装

```bash
npm install -g mp-skills
```

安装后即可在任意小程序项目目录使用：

```bash
mp-skills --help
```

### 1.3 通过 `npx` 免安装运行

无需全局安装，直接用 `npx` 运行：

```bash
npx mp-skills --help
npx mp-skills find
npx mp-skills add TencentCloudBase/awesome-miniprogram-skills
```

## 2. 快速开始

### 2.1 从小程序模板开始

从零创建一个自带 AI Skill 支持的小程序项目：

```bash
# 创建项目骨架（含 miniprogram/、云函数、示例 Skill 等）
mp-skills new my-app
cd my-app

# 搜索并安装你需要的业务 Skill
mp-skills find
mp-skills add TencentCloudBase/awesome-miniprogram-skills -s <skill-name>

# 执行 Skill 初始化脚本
mp-skills setup
```

### 2.2 从现有小程序项目开始

在已有小程序项目（含 `project.config.json` 的目录）中添加 AI Skill 能力：

```bash
# 进入小程序项目根目录
cd ./my-existing-miniprogram

# 搜索并安装业务 Skill
mp-skills find
mp-skills add TencentCloudBase/awesome-miniprogram-skills -s <skill-name>

# 或基于模板创建自定义 Skill
mp-skills create my-skill

# 执行 Skill 初始化脚本（如聚合云函数、创建数据库等）
mp-skills setup
```

安装后自动注入 `app.json`、`project.config.json` 等配置，无需手动修改。

### 2.3 发现并安装 Skill

```bash
# 1️⃣ 先搜索看看有哪些可用 Skill
mp-skills find

# 2️⃣ 交互式选择并安装 Skill
mp-skills add TencentCloudBase/awesome-miniprogram-skills

# 3️⃣ 或直接安装指定 Skill
mp-skills add TencentCloudBase/awesome-miniprogram-skills -s <name>

# 4️⃣ 一键安装所有
mp-skills add TencentCloudBase/awesome-miniprogram-skills --all
```

命令需要在**小程序项目根目录**下执行（含 `project.config.json`）。安装后自动：

- 拷贝 Skill 到 `miniprogram/skills/<name>/`
- 更新 `miniprogram/app.json` 的 `agent.skills` + `subPackages`
- 更新 `project.config.json` 的 `packOptions.include`
- 写入 `skills-lock.json` 版本锁

### 2.4 Skill 初始化

安装 Skill 后，运行 `setup` 自动执行各 Skill 声明的初始化脚本（如聚合云函数、创建数据库集合、配置服务等）：

```bash
mp-skills setup
```

`setup` 会扫描所有 Skill 的 `mp-skills.json`，展示待执行脚本清单，确认后串行执行。

---

## 3. 命令

| 命令         | 描述                                                       | 层级 |
| ------------ | ---------------------------------------------------------- | ---- |
| `add`        | 从注册表/GitHub/URL/本地路径安装 Skill                     | ③ |
| `find`       | 搜索远程仓库中的可用 Skill                                 | ③ |
| `list`       | 列出已安装的 Skill                                         | ③ |
| `remove`     | 移除已安装的 Skill                                         | ③ |
| `update`     | 检查并更新已安装的 Skill                                   | ③ |
| `create`     | 在已有项目中创建新的 Skill 骨架                            | ② |
| `new`        | 创建新的小程序项目骨架                                     | ② |
| `validate`   | 对项目中 Skills 进行静态校验                               | ② |
| `execute`    | 执行 Skill 的原子接口                                     | ② |
| `render`     | 渲染 Skill 的原子组件                                     | ② |
| `setup`      | 执行各 Skill 声明的初始化脚本                         | ② |
| `eval`       | 对已有 Skills 项目启动端到端质量评估（需 wxa-skills-eval） | ② |

---

### 3.1 add

从注册表、GitHub 仓库、URL 或本地路径安装 Skill 到当前项目。

```bash
# 从注册表（交互式选择 Skill）
mp-skills add TencentCloudBase/awesome-miniprogram-skills

# GitHub shorthand（指定单个 Skill）
mp-skills add TencentCloudBase/awesome-miniprogram-skills -s <name>

# 安装全部
mp-skills add TencentCloudBase/awesome-miniprogram-skills --all

# 本地路径
mp-skills add ./my-local-skill

# 跳过确认
mp-skills add TencentCloudBase/awesome-miniprogram-skills -s <name> -y
```

| 选项                   | 说明                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `-s, --skill <name>`   | 安装指定的 Skill                                           |
| `--all`                | 安装仓库中所有 Skill                                       |
| `-y, --yes`            | 跳过确认提示                                               |

---

### 3.2 find

跨注册仓库搜索可用的 Skill。不需要提前知道 Skill 来自哪个仓库，`find` 会自动查询所有注册源。

```bash
# 列出所有远程可用 Skill
mp-skills find

# 按关键词搜索（中英文均可）
mp-skills find 咖啡
mp-skills find payment
mp-skills find 挂号

# 搜索到后可以直接用 add 安装
mp-skills add TencentCloudBase/awesome-miniprogram-skills -s <name>
```

发现 Skill → 安装 Skill → 环境搭建，三步搞定。

---

### 3.3 list

列出当前项目已安装的 Skill。

```bash
# 列出已安装
mp-skills list

# 列出远程可用的
mp-skills list --remote

# 同时列出已安装和远程
mp-skills list --all
```

| 选项            | 说明                         |
| --------------- | ---------------------------- |
| `-r, --remote`  | 列出远程可用的 Skill         |
| `--all`         | 同时列出已安装和远程         |

---

### 3.4 remove

移除已安装的 Skill。

```bash
mp-skills remove <name>
mp-skills remove --all
mp-skills remove <name> -y
```

| 选项        | 说明               |
| ----------- | ------------------ |
| `--all`     | 移除全部 Skill     |
| `-y, --yes` | 跳过确认           |

---

### 3.5 update

检查已安装 Skill 是否有更新。

```bash
# 检查所有
mp-skills update

# 检查指定
mp-skills update <name1> <name2>
```

---

### 3.6 new

创建一个新的小程序项目，含 AI Skill 支持的基础配置。

```bash
mp-skills new my-app
cd my-app
mp-skills add TencentCloudBase/awesome-miniprogram-skills -s <name>
```

---

### 3.7 create

在当前小程序项目中创建一个新的 Skill。**默认走本地模板复制**；`--mode agent` 时调用 [opencode](https://github.com/sst/opencode) 让大模型分析项目并生成符合规范的 Skill 分包。

```bash
# 模板模式：拷贝模板到 <miniprogramRoot>/skills/<name>/
cd ./my-miniprogram
mp-skills create my-skill

# 指定项目目录
mp-skills create my-skill -p ./my-miniprogram

# agent 模式：进入 opencode 多轮会话，生成并自校验
mp-skills create my-skill --mode agent \
  -s "咖啡点单、订单管理"

# agent 模式 + 在已有 Skill 上迭代（同名再跑一次即可，agent 会做增量修改）
mp-skills create my-skill --mode agent \
  -q "createOrder 接口缺少 amount 字段"

# agent 模式 + 不指定 name：扫描整个项目，agent 自决要生成哪些 Skill
mp-skills create --mode agent
```

| 选项                    | 说明                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| `-p, --project <path>`  | 项目目录（默认当前目录）                                             |
| `--mode <mode>`         | 运行模式：`template`（默认，走模板）\| `agent`（大模型辅助生成）     |
| `-s, --scenario <desc>` | [agent] 业务场景描述，帮助模型聚焦（如：商品检索、订单管理）         |
| `-q, --query <text>`    | [agent] 本轮诉求；在已有产物上迭代时尤其有用                         |
| `--provider <name>`     | [agent] LLM 提供方预设（deepseek / glm / kimi / minimax）            |
| `-m, --model <name>`    | [agent] 模型名，覆盖 `--provider` 预设                               |
| `-e, --env <envId>`     | [agent] CloudBase 环境 ID（可选）                                    |
| `--non-interactive`     | [agent] 非交互模式：一次性跑完，适合脚本 / CI                        |

> agent 模式需要 `opencode-ai` + 一组 OpenAI 兼容凭据。详见下方「LLM 凭证」。

---

### 3.8 setup

执行各 Skill 声明的初始化脚本。`setup` 会扫描所有 `skills/*/mp-skills.json` 中的 `scripts.setup`，展示确认后串行执行。

```bash
# 执行所有 Skill 的 setup 脚本
mp-skills setup

# 预览模式，只展示不执行
mp-skills setup --dry-run

# JSON 格式输出（适合 CI/AI 消费）
mp-skills setup --json
mp-skills setup --dry-run --json
```

| 选项            | 说明                                                   |
| --------------- | ------------------------------------------------------ |
| `--dry-run`     | 预览模式，只展示待执行脚本，不实际运行                 |
| `--json`        | JSON 格式输出                                           |

Skill 通过 `mp-skills.json` 声明自己的 setup 脚本：

```json
{
  "scripts": {
    "setup": "mp-skills plugin --name cloudbase setup"
  },
  "description": "配置云开发环境并初始化资源"
}
```

`setup` 是通用编排器——CloudBase 用户通过内置 plugin 执行云函数聚合、数据库创建等操作；第三方用户可写任意 shell 命令。

---

### 3.9 validate

对项目中 Skills 进行静态校验。

```bash
# 校验当前项目
mp-skills validate

# 校验指定项目
mp-skills validate ./path/to/project
```

---

### 3.10 execute

执行 Skill 的原子接口。

```bash
mp-skills execute --name getDrinkList
mp-skills execute --name createOrder --args '{"drinkId":"123"}'
mp-skills execute --name getDrinkList --project ./path/to/project
```

| 选项                      | 说明                     |
| ------------------------- | ------------------------ |
| `-n, --name <api-name>`   | 接口名称（必填）         |
| `-a, --args <json>`       | JSON 格式参数            |
| `-p, --project <path>`    | 项目路径，默认当前目录   |

---

### 3.11 render

渲染 Skill 的原子组件。

```bash
mp-skills render --name drinkList
mp-skills render --name drinkList --project ./path/to/project
```

| 选项                      | 说明                     |
| ------------------------- | ------------------------ |
| `-n, --name <api-name>`   | 接口名称（必填）         |
| `-p, --project <path>`    | 项目路径，默认当前目录   |

---

### 3.12 eval

对**已安装 Skill 的**小程序项目启动端到端质量评估。需先安装 [wxa-skills-eval](https://github.com/wechat-miniprogram/ai-mode-skills)，并依赖微信开发者工具。

```bash
# 设置凭据
export WXA_SKILL_EVAL_LLM_BASE_URL=https://api.deepseek.com/v1
export WXA_SKILL_EVAL_LLM_API_KEY=sk-xxxx
export WXA_SKILL_EVAL_LLM_MODEL=deepseek-chat

# 默认 official 模式
mp-skills eval -c 3

# 使用 provider 预设
mp-skills eval --provider deepseek -m deepseek-v4-flash -c 3

# 指定项目目录
mp-skills eval -p ./my-miniprogram -c 3
```

| 选项                         | 说明                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `-p, --project <path>`       | 项目目录（默认当前目录）                                                             |
| `-e, --env <envId>`          | CloudBase 环境 ID。**BYOK 模式下可省略**——仅在需要透传给下游时填写                    |
| `-c, --cases <n>`            | 生成的测试用例数（默认 1）                                                           |
| `-s, --skill <name>`         | 只评估指定 Skill（默认评估全部）                                                     |
| `--headless`                 | 无界面模式，适合 CI 环境                                                             |
| `--mode <mode>`              | 评估模式，`official`（默认）或 `agent`                                               |
| `--provider <name>`          | LLM 提供方预设（deepseek / glm / kimi / minimax），预填 baseUrl 与默认 model         |
| `-m, --model <name>`         | 模型名，覆盖 `--provider` 预设与 `WXA_SKILL_EVAL_LLM_MODEL` 环境变量                 |
| `--openai-api-key <key>`     | OpenAI 兼容 API Key，覆盖对应环境变量                                                |
| `--openai-base-url <url>`    | OpenAI 兼容 Base URL，覆盖 `--provider` 预设与对应环境变量                           |

**两种评估模式**（实际评测都由官方 `wxa-skills-eval` CLI 执行）：

- `official`（默认）：mp-skills 直接拼好命令行调用官方 CLI，参数固定、可预期，适合 CI。
- `agent`：启动内置 coding agent（用 BYOK 凭证），让它读取 `wxa-skills-eval/SKILL.md` 后**自主调用官方 CLI** 发起评测，并按 SKILL.md 的续跑/排错指引自动重试。相比手敲命令更省心。

```bash
# agent 模式
mp-skills eval --mode agent -c 3
```

> 两种模式都依赖微信开发者工具（官方 CLI 的硬性要求）。

---

## 4. LLM 凭证（BYOK）

`create --mode agent` 与 `eval` 共用**同一套** OpenAI 兼容凭证，通过环境变量配置：

```bash
export WXA_SKILL_EVAL_LLM_BASE_URL=<your-endpoint>
export WXA_SKILL_EVAL_LLM_API_KEY=<your-key>
export WXA_SKILL_EVAL_LLM_MODEL=<model-name>
```

运行前还会自动加载当前目录的 `.env`（不覆盖已显式 `export` 的变量）。

### 4.1 交互式向导

若运行 `create --mode agent` / `eval` 时**未配置任何凭证**且处于交互式终端（TTY），会弹出交互式向导让你选择提供方：

```
? 请选择 LLM 提供方：
  ❯ CloudBase（云开发 AI 网关，自动获取密钥）
    DeepSeek
    智谱 GLM
    Kimi（Moonshot）
    MiniMax
    自定义（手填 endpoint / key / model）
```

#### 4.1.1 提供方详解

**1. CloudBase（云开发 AI 网关）**

自动完成整套凭证配置，无需手动管理密钥：

1. **登录验证**：自动检测 CloudBase CLI 登录状态，未登录会提示先登录
2. **选择环境**：列出你的所有 CloudBase 环境，选择其中一个
3. **选择模型**：以表格形式展示可用模型（模型名、提供商、状态），已开启的排在前面的，未开启的会提示去控制台开通
4. **API Key 管理**：选择已有 API Key（自动获取明文）或新建一个

```
┌─────────────────────┬────────────┬──────────┐
│ 模型                │ 提供商     │ 状态     │
├─────────────────────┼────────────┼──────────┤
│ deepseek-v3         │ deepseek   │ 已开启   │
│ glm-4               │ zhipu      │ 已开启   │
│ moonshot-v1         │ moonshot   │ 未开启   │
└─────────────────────┴────────────┴──────────┘
```

完成后自动拼接出 CloudBase AI 网关的 OpenAI 兼容凭证（Base URL 含环境 ID 和模型路径）。

**2. 预设提供方**

内置了常用 LLM 提供方的端点和默认模型，只需填写 API Key 即可：

| 提供方          | 默认模型           | Base URL                              |
| --------------- | ------------------ | ------------------------------------- |
| DeepSeek        | `deepseek-v4-flash`| `https://api.deepseek.com/v1`         |
| 智谱 GLM        | `glm-5.1`         | `https://open.bigmodel.cn/api/paas/v4`|
| Kimi (Moonshot) | `kimi-k2.6`       | `https://api.moonshot.cn/v1`          |
| MiniMax         | `minimax-m2.7`    | `https://api.minimaxi.com/v1`         |

选择预设提供方后，只需输入：
- **API Key**（必填）
- **模型名**（可选，默认使用上表中的默认模型）

**3. 自定义**

完全手动填写 OpenAI 兼容接口的凭证：

- **Base URL**：如 `https://api.openai.com/v1`
- **API Key**（必填）
- **模型名**（必填）

### 4.2 凭证持久化

选完的凭证会写入当前目录的 `.env` 文件，下次运行时自动加载，不再弹出向导。

```bash
# 写入的 .env 示例
WXA_SKILL_EVAL_LLM_BASE_URL=https://api.deepseek.com/v1
WXA_SKILL_EVAL_LLM_API_KEY=sk-xxxx
WXA_SKILL_EVAL_LLM_MODEL=deepseek-v4-flash
```

> ⚠️ **安全提示**：`.env` 含明文密钥，请注意保管，建议加入 `.gitignore`：
> ```
> echo ".env" >> .gitignore
> ```

### 4.3 非交互式环境（CI）

在非交互式环境（如 CI/CD）下不会弹出向导，缺凭证时会打印所需环境变量并退出。需在运行前通过环境变量或 `.env` 文件配置好凭证。

### 4.4 URL 规范化

`WXA_SKILL_EVAL_LLM_BASE_URL` 会自动规范化处理：

- 去掉末尾的 `/`
- 剥离 `/anthropic` 或 `/messages` 后缀
- 补上 `/v1` 路径

例如：
- `https://api.deepseek.com` → `https://api.deepseek.com/v1`
- `https://api.deepseek.com/anthropic` → `https://api.deepseek.com/v1`

只需配置一组凭证即可同时驱动 `create --mode agent`（opencode）和 `eval`（wxa-skills-eval）。

---

## 5. add 做了什么

```
项目目录/
├── miniprogram/app.json      ← 自动注入 agent.skills + subPackages + lazyCodeLoading
├── project.config.json       ← 自动注入 packOptions.include
├── skills/<name>/            ← 拷贝 Skill 全套文件
│   ├── mcp.json              ← API Schema
│   ├── SKILL.md              ← 业务流程
│   ├── index.js              ← 注册入口
│   ├── apis/                 ← 原子接口
│   └── components/           ← 原子组件
├── skills-lock.json          ← 版本追踪
└── .deployed.json            ← 部署状态（云函数/数据库/服务跟踪）
```

---

## 7. 技术栈

- TypeScript + ESM
- [commander.js](https://github.com/tj/commander.js) — CLI 框架
- [opencode-ai](https://github.com/sst/opencode) — AI 模式 Skill 生成
- GitHub Trees API — 远程 Skill 发现（无需 git clone）
- `skills-lock.json` — 版本追踪 + 增量更新
- `@cloudbase/cli` — 云开发环境管理

---

## 8. 相关链接

- [awesome-miniprogram-skills](https://github.com/TencentCloudBase/awesome-miniprogram-skills) — 完整 Skill 仓库
- [wechat-miniprogram/ai-mode-skills](https://github.com/wechat-miniprogram/ai-mode-skills) — 微信官方 Skill 示例
- [微信小程序 AI 开发模式文档](https://developers.weixin.qq.com/miniprogram/dev/ai/guide.html)

---

## 9. `mp-skills` 的 Skill

本仓库 `skills/` 下的三个 SKILL.md 文件，**不安装到小程序中**。AI coding 工具读取后按步骤执行，帮你完成开发任务。

> 例子：
> - `wxa-find-skills` → AI 读完后知道怎么通过 mp-skills 搜索安装业务 Skill
> - `wxa-create-ai-miniprogram` → AI 读完后知道怎么通过 mp-skills 从零创建项目
> - `wxa-create-mp-skill` → AI 读完后知道怎么通过 mp-skills 生成自定义 Skill 代码

安装方式（通过 skills.sh 安装给 AI coding 工具使用）：

```bash
# 安装全部
npx skills add TencentCloudBase/mp-skills --all

# 或安装指定 Skill
npx skills add TencentCloudBase/mp-skills -s wxa-find-skills
npx skills add TencentCloudBase/mp-skills -s wxa-create-ai-miniprogram
npx skills add TencentCloudBase/mp-skills -s wxa-create-mp-skill
```

也可在 [skills.sh](https://www.skills.sh/TencentCloudBase/mp-skills) 上查看。

也可通过 ClawHub 社区查看：

- https://clawhub.ai/binggg/wxa-find-skills
- https://clawhub.ai/binggg/wxa-create-ai-miniprogram
- https://clawhub.ai/binggg/wxa-create-mp-skill
