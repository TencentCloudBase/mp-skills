# mp-skills

让微信小程序接入 AI 生态——为小程序安装 `wx.modelContext` Skill，构建 AI 友好的小程序。

```bash
npx mp-skills add awesome-miniprogram
```

---

## 快速开始

### 安装一个 Skill

```bash
# 从注册表安装（自动拉取最新仓库列表）
npx mp-skills add awesome-miniprogram

# 从 GitHub 仓库安装指定 Skill
npx mp-skills add TencentCloudBase/awesome-miniprogram-skills -s drink-skill

# 安装仓库中所有 Skill
npx mp-skills add TencentCloudBase/awesome-miniprogram-skills --all
```

命令需要在**小程序项目根目录**下执行（含 `project.config.json`）。安装后自动：

- 拷贝 Skill 到 `miniprogram/skills/<name>/`
- 更新 `miniprogram/app.json` 的 `agent.skills` + `subPackages`
- 更新 `project.config.json` 的 `packOptions.include`
- 写入 `skills-lock.json` 版本锁

### 环境搭建

安装 Skill 后，若有云开发依赖，运行一站式环境搭建：

```bash
npx mp-skills setup
```

`setup` 会聚合云函数、创建数据库集合、检查所需服务，让项目快速就绪。

---

## 命令

| 命令         | 描述                                                       |
| ------------ | ---------------------------------------------------------- |
| `add`        | 从注册表/GitHub/URL/本地路径安装 Skill                     |
| `find`       | 搜索远程仓库中的可用 Skill                                 |
| `list`       | 列出已安装的 Skill                                         |
| `remove`     | 移除已安装的 Skill                                         |
| `update`     | 检查并更新已安装的 Skill                                   |
| `create`     | 在已有项目中创建新的 Skill 骨架                            |
| `new`        | 创建新的小程序项目骨架                                     |
| `validate`   | 对项目中 Skills 进行静态校验                               |
| `execute`    | 执行 Skill 的原子接口                                     |
| `render`     | 渲染 Skill 的原子组件                                     |
| `setup`      | 一站式环境搭建：聚合云函数、创建集合、检查服务             |
| `status`     | 查看云函数/数据库/服务的状态差异                           |
| `doctor`     | 健康检查：检测云函数联通性、数据库集合、服务配置            |
| `eval`       | 对已有 Skills 项目启动端到端质量评估（需 wxa-skills-eval） |

---

### add

从注册表、GitHub 仓库、URL 或本地路径安装 Skill 到当前项目。

```bash
# 从注册表（交互式选择 Skill）
npx mp-skills add awesome-miniprogram

# GitHub shorthand（指定单个 Skill）
npx mp-skills add TencentCloudBase/awesome-miniprogram-skills -s drink-skill

# 安装全部
npx mp-skills add TencentCloudBase/awesome-miniprogram-skills --all

# 本地路径
npx mp-skills add ./my-local-skill

# 跳过确认
npx mp-skills add TencentCloudBase/awesome-miniprogram-skills -s drink-skill -y
```

| 选项                   | 说明                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `-s, --skill <name>`   | 安装指定的 Skill                                           |
| `--all`                | 安装仓库中所有 Skill                                       |
| `-y, --yes`            | 跳过确认提示                                               |

---

### find

跨仓库搜索可用的 Skill。

```bash
# 列出所有远程可用 Skill
npx mp-skills find

# 按关键词搜索
npx mp-skills find 咖啡
npx mp-skills find payment
npx mp-skills find 挂号
```

---

### list

列出当前项目已安装的 Skill。

```bash
# 列出已安装
npx mp-skills list

# 列出远程可用的
npx mp-skills list --remote

# 同时列出已安装和远程
npx mp-skills list --all
```

| 选项            | 说明                         |
| --------------- | ---------------------------- |
| `-r, --remote`  | 列出远程可用的 Skill         |
| `--all`         | 同时列出已安装和远程         |

---

### remove

移除已安装的 Skill。

```bash
npx mp-skills remove drink-skill
npx mp-skills remove --all
npx mp-skills remove drink-skill -y
```

| 选项        | 说明               |
| ----------- | ------------------ |
| `--all`     | 移除全部 Skill     |
| `-y, --yes` | 跳过确认           |

---

### update

检查已安装 Skill 是否有更新。

```bash
# 检查所有
npx mp-skills update

# 检查指定
npx mp-skills update drink-skill payment-skill
```

---

### new

创建一个新的小程序项目，含 AI Skill 支持的基础配置。

```bash
npx mp-skills new my-app
cd my-app
npx mp-skills add TencentCloudBase/awesome-miniprogram-skills -s drink-skill
```

---

### create

在当前小程序项目中创建一个新的 Skill。**默认走本地模板复制**；显式 `--ai` 时调用 [opencode](https://github.com/sst/opencode) 让大模型分析项目并生成符合规范的 Skill 分包。

```bash
# 模板模式：拷贝模板到 <miniprogramRoot>/skills/<name>/
cd ./my-miniprogram
npx mp-skills create my-skill

# AI 模式：进入 opencode 多轮会话，生成并自校验
cd ./my-miniprogram
npx mp-skills create my-skill --ai \
  -s "咖啡点单、订单管理"

# AI 模式 + 在已有 Skill 上迭代（同名再跑一次即可，agent 会做增量修改）
npx mp-skills create my-skill --ai \
  -q "createOrder 接口缺少 amount 字段"

# AI 模式 + 不指定 name：扫描整个项目，agent 自决要生成哪些 Skill
npx mp-skills create --ai
```

| 选项                    | 说明                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| `--ai`                  | 使用大模型辅助生成 Skill（默认走模板）                               |
| `-s, --scenario <desc>` | [--ai] 业务场景描述，帮助模型聚焦（如：商品检索、订单管理）          |
| `-q, --query <text>`    | [--ai] 本轮诉求；在已有产物上迭代时尤其有用                          |
| `-p, --provider <name>` | [--ai] LLM 提供方预设（deepseek / glm / kimi / minimax）             |
| `-m, --model <name>`    | [--ai] 模型名，覆盖 `--provider` 预设与 `OPENAI_MODEL`               |
| `-e, --env <envId>`     | [--ai] CloudBase 环境 ID（可选）                                     |
| `-n, --non-interactive` | [--ai] 非交互模式：一次性跑完，适合脚本 / CI                         |

> AI 模式需要 `opencode-ai` + 一组 OpenAI 兼容凭据。详见下方「LLM 凭证」。

---

### setup

一站式环境搭建：聚合云函数、创建数据库集合、检查服务配置。

```bash
# 完整流程（云函数 + 数据库 + 服务检查）
npx mp-skills setup

# 仅处理云函数
npx mp-skills setup --cloud-functions

# 仅处理数据库
npx mp-skills setup --database

# 仅检查服务
npx mp-skills setup --services

# 预览模式，不实际执行
npx mp-skills setup --dry-run

# 指定云开发环境
npx mp-skills setup --env-id your-env-id
```

| 选项                       | 说明                                                   |
| -------------------------- | ------------------------------------------------------ |
| `-f, --cloud-functions`    | 仅处理云函数                                           |
| `-d, --database`           | 仅处理数据库                                           |
| `-s, --services`           | 仅检查服务                                             |
| `--dry-run`                | 预览模式，不实际执行                                   |
| `--env-id <id>`            | 云开发环境 ID（未指定则从项目配置读取）                 |

安装 Skill 后运行 `setup` 可自动完成所有云开发基础设施的部署。

---

### status

查看云函数、数据库、服务的状态差异（基于锁文件与 Skill 声明的对比）。

```bash
npx mp-skills status
```

输出示例：
```
云函数
────────────────────────────────────────
  ok    drink-skill-xxxx
  --    payment-skill-xxxx [HTTP，需 CLI 部署]
  已部署 1 个，待处理 1 个

数据库
────────────────────────────────────────
  ok    drinks
  --    orders [drink-skill, payment-skill]
  已创建 1 个，待处理 1 个

服务
────────────────────────────────────────
  ok    HTTP 访问服务
  ok    AI 模型

运行 npx mp-skills setup 处理待办项。
```

---

### doctor

健康检查：实际调用 CloudBase API 检测云函数联通性、数据库集合和服务配置。

```bash
npx mp-skills doctor
```

---

### validate

对项目中 Skills 进行静态校验。

```bash
# 校验当前项目
npx mp-skills validate

# 校验指定项目
npx mp-skills validate ./path/to/project
```

---

### execute

执行 Skill 的原子接口。

```bash
npx mp-skills execute --name getDrinkList
npx mp-skills execute --name createOrder --args '{"drinkId":"123"}'
npx mp-skills execute --name getDrinkList --project ./path/to/project
```

| 选项                      | 说明                     |
| ------------------------- | ------------------------ |
| `-n, --name <api-name>`   | 接口名称（必填）         |
| `-a, --args <json>`       | JSON 格式参数            |
| `-p, --project <path>`    | 项目路径，默认当前目录   |

---

### render

渲染 Skill 的原子组件。

```bash
npx mp-skills render --name drinkList
npx mp-skills render --name drinkList --project ./path/to/project
```

| 选项                      | 说明                     |
| ------------------------- | ------------------------ |
| `-n, --name <api-name>`   | 接口名称（必填）         |
| `-p, --project <path>`    | 项目路径，默认当前目录   |

---

### eval

对当前目录下**已安装 Skill 的**小程序项目启动端到端质量评估。需先安装 [wxa-skills-eval](https://github.com/wechat-miniprogram/ai-mode-skills)，并依赖微信开发者工具。也可显式传入项目路径。

```bash
export OPENAI_BASE_URL=https://api.deepseek.com/v1
export OPENAI_API_KEY=sk-xxxx
export OPENAI_MODEL=deepseek-chat

# 默认 official 模式
npx mp-skills eval -c 3

# 使用 provider 预设，无需手动设置环境变量中的模型信息
npx mp-skills eval -p deepseek -m deepseek-v4-flash -c 3
```

| 选项                         | 说明                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `-e, --env <envId>`          | CloudBase 环境 ID。**BYOK 模式下可省略**——仅在需要透传给下游时填写                    |
| `-c, --cases <n>`            | 生成的测试用例数（默认 1）                                                           |
| `-s, --skill <name>`         | 只评估指定 Skill（默认评估全部）                                                     |
| `--headless`                 | 无界面模式，适合 CI 环境                                                             |
| `--mode <mode>`              | 评估模式，`official`（默认）或 `agent`                                               |
| `-p, --provider <name>`      | LLM 提供方预设（deepseek / glm / kimi / minimax），预填 baseUrl 与默认 model         |
| `-m, --model <name>`         | 模型名，覆盖 `--provider` 预设与 `OPENAI_MODEL` 环境变量                             |
| `--openai-api-key <key>`     | OpenAI 兼容 API Key，覆盖 `OPENAI_API_KEY` 环境变量                                  |
| `--openai-base-url <url>`    | OpenAI 兼容 Base URL，覆盖 `--provider` 预设与 `OPENAI_BASE_URL` 环境变量            |

**两种评估模式**（实际评测都由官方 `wxa-skills-eval` CLI 执行）：

- `official`（默认）：mp-skills 直接拼好命令行调用官方 CLI，参数固定、可预期，适合 CI。
- `agent`：启动内置 coding agent（用 BYOK 凭证），让它读取 `wxa-skills-eval/SKILL.md` 后**自主调用官方 CLI** 发起评测，并按 SKILL.md 的续跑/排错指引自动重试。相比手敲命令更省心。

```bash
# agent 模式
npx mp-skills eval --mode agent -c 3
```

> 两种模式都依赖微信开发者工具（官方 CLI 的硬性要求）。

---

## LLM 凭证（BYOK）

`create --ai` 与 `eval` 共用**同一套** OpenAI 兼容凭证，按以下优先级解析：

1. `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` ← **推荐**
2. `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`（或 `ANTHROPIC_API_KEY`） / `ANTHROPIC_MODEL`
3. `CLOUDBASE_AI_ENDPOINT` / `CLOUDBASE_API_KEY` / `CLOUDBASE_AI_MODEL`

运行前还会自动加载当前目录的 `.env`（不覆盖已显式 `export` 的变量）。

### 交互式向导

若运行 `create --ai`/`eval` 时**未配置任何凭证**且处于交互式终端（TTY），会弹出交互式向导让你选择提供方：

```
? 请选择 LLM 提供方：
  ❯ CloudBase（云开发 AI 网关，自动获取密钥）
    DeepSeek
    智谱 GLM
    Kimi（Moonshot）
    MiniMax
    自定义（手填 endpoint / key / model）
```

#### 提供方详解

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

| 提供方        | 环境变量前缀 | 默认模型           | Base URL                              |
| ------------- | ------------- | ------------------ | ------------------------------------- |
| DeepSeek      | `OPENAI_`     | `deepseek-v4-flash`| `https://api.deepseek.com/v1`         |
| 智谱 GLM      | `OPENAI_`     | `glm-5.1`         | `https://open.bigmodel.cn/api/paas/v4`|
| Kimi (Moonshot) | `OPENAI_`   | `kimi-k2.6`       | `https://api.moonshot.cn/v1`          |
| MiniMax       | `OPENAI_`     | `minimax-m2.7`    | `https://api.minimaxi.com/v1`         |

选择预设提供方后，只需输入：
- **API Key**（必填）
- **模型名**（可选，默认使用上表中的默认模型）

**3. 自定义**

完全手动填写 OpenAI 兼容接口的凭证：

- **Base URL**：如 `https://api.openai.com/v1`
- **API Key**（必填）
- **模型名**（必填）

### 凭证持久化

选完的凭证会写入当前目录的 `.env` 文件（`OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`），下次运行时自动加载，不再弹出向导。

```bash
# 写入的 .env 示例
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=sk-xxxx
OPENAI_MODEL=deepseek-v4-flash
```

> ⚠️ **安全提示**：`.env` 含明文密钥，请注意保管，建议加入 `.gitignore`：
> ```
> echo ".env" >> .gitignore
> ```

### 非交互式环境（CI）

在非交互式环境（如 CI/CD）下不会弹出向导，缺凭证时会打印所需环境变量并退出。需在运行前通过环境变量或 `.env` 文件配置好凭证。

### URL 规范化

`BASE_URL` 会自动规范化处理：

- 去掉末尾的 `/`
- 剥离 `/anthropic` 或 `/messages` 后缀
- 补上 `/v1` 路径

例如：
- `https://api.deepseek.com` → `https://api.deepseek.com/v1`
- `https://api.deepseek.com/anthropic` → `https://api.deepseek.com/v1`

只需配置一组凭证即可同时驱动 `create --ai`（opencode）和 `eval`（wxa-skills-eval）。

---

## add 做了什么

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

## 安装

```bash
npm install -g mp-skills
# 或直接用 npx
npx mp-skills --help
```

---

## 从源码使用

```bash
git clone https://github.com/TencentCloudBase/mp-skills.git
cd mp-skills
npm install
npm run build
npm link
mp-skills --help
```

---

## 技术栈

- TypeScript + ESM
- [commander.js](https://github.com/tj/commander.js) — CLI 框架
- [opencode-ai](https://github.com/sst/opencode) — AI 模式 Skill 生成
- GitHub Trees API — 远程 Skill 发现（无需 git clone）
- `skills-lock.json` — 版本追踪 + 增量更新
- `@cloudbase/cli` — 云开发环境管理

---

## 相关链接

- [awesome-miniprogram-skills](https://github.com/TencentCloudBase/awesome-miniprogram-skills) — 完整 Skill 仓库
- [wechat-miniprogram/ai-mode-skills](https://github.com/wechat-miniprogram/ai-mode-skills) — 微信官方 Skill 示例
- [微信小程序 AI 开发模式文档](https://developers.weixin.qq.com/miniprogram/dev/ai/guide.html)
