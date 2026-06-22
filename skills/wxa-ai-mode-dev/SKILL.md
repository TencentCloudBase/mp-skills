---
name: wxa-ai-mode-dev
description: 微信小程序 AI 开发模式（beta）完整开发指南。当开发者需要将小程序改造为 AI 开发模式、封装 SKILL、编写原子接口/原子组件、编写 SKILL.md 或 mcp.json 时触发。覆盖接入流程、项目结构、Schema 设计、content 文本写法、组件约束、最佳实践、常见反例的全部规范。
metadata:
  author: TencentCloudBase
  version: '0.1.0'
compatibility: [微信小程序基础库 ≥3.16.1, iOS 微信 ≥8.0.74]
---

# 小程序 AI 开发模式（beta）开发指南

小程序 AI 开发模式（以下简称此模式）提供了一套智能化的运行环境和开发框架。开发者将小程序功能抽象为**原子接口（API）**和**原子组件（Component）**，封装成 **SKILL**，供小程序 AI 调用。

当用户通过小程序 AI 发起对话时，小程序 AI 通过**小程序 MCP 协议**选择合适的原子接口和原子组件，完成数据处理和任务执行，最终以 GUI 卡片展示结果。用户身份与原小程序保持一致（可通过 storage 共享登录凭证）。

> **当前处于内测阶段**，暂未开放代码提审。仅支持 iOS（微信 ≥8.0.74），基础库 ≥3.16.1。**请勿将 AI 模式代码合入正式版本提交审核。**

## 职责边界

- ✅ 提供 AI 开发模式的完整技术规范参考
- ✅ 定义原子接口/组件的设计规范、最佳实践和禁令
- ✅ 定义 content 文本写法、description 三段式模板、注意力权重原则
- ✅ 提供接入配置、调试流程、FAQ 的完整指引
- ❌ 不生成业务原子接口/组件代码（交给 `wxa-skills-generate`）
- ❌ 不执行校验和修复（交给 `wxa-skills-validate`）
- ❌ 不进行端到端评测（交给 `wxa-skills-eval`）
- ❌ 不创建新小程序项目（交给 `wxa-create-ai-miniprogram`）
- 📦 交付：参考文档 + 规范说明

## 术语约定

| 概念 | 说明 |
|------|------|
| **小程序 MCP** | 向小程序 AI 暴露可调用能力的协议，与标准 MCP 不同，适配小程序开发特点 |
| **原子接口（API）** | 最小执行单元，封装单一业务功能，标准化输入/输出，运行在微信客户端**独立 JS 环境** |
| **原子组件（Component）** | 原子接口的可视化展示单元，将结构化数据渲染为 **GUI 卡片**展示在对话流中 |
| **SKILL** | 完成特定场景任务的完整能力封装，包含 `SKILL.md`、`mcp.json`、原子接口实现、原子组件实现 |

## 参考资料索引

| 来源 | 用途 | 加载时机 |
|------|------|---------|
| `wxa-skills-generate/SKILL.md` | 代码生成器的工作流 | 需要生成代码时 |
| `wxa-skills-validate/SKILL.md` | 校验器的工作流和修复流程 | 需要校验时 |
| `wxa-skills-eval/SKILL.md` | 评测引擎的使用方式 | 需要评测时 |

---

## 核心概念

### 三层架构与数据传递

```
[原子接口上下文 A] ──── 返回值(content/structuredContent/_meta) ────→ [小程序 AI 后台]
[原子组件上下文 B] ─┐
[实时动态组件上下文 C]┘ 三个上下文全局变量不共享，数据只能通过返回值传递
[半屏页面] ───────── 与小程序运行环境一致，部分接口受限
```

| 返回值字段 | LLM 可见 | 用途 |
|-----------|---------|------|
| `content` | ✅ | LLM 决策的上下文和指令（TextContent[]，≤200KB） |
| `structuredContent` | ✅ | LLM 理解屏幕展示内容的结构化数据（≤200KB） |
| `_meta` | ❌ | 纯渲染数据，如图片 URL，对 LLM 不可见（≤200KB） |

---

## 接入方式（关键代码）

### 1. 全局配置 `app.json`

```json
{
  "lazyCodeLoading": "requiredComponents",
  "subPackages": [
    {
      "root": "path/to/pkg",
      "independent": true,
      "pages": []
    }
  ],
  "agent": {
    "skills": [
      {
        "name": "weather",
        "description": "查询天气业务",
        "path": "path/to/pkg/weather-skill"
      }
    ],
    "instruction": "path/to/AGENTS.md",
    "pageMetadata": "path/to/page-meta.json"
  }
}
```

约束：
- SKILL 必须放在**独立分包**中（`independent: true`）
- 必须开启 `lazyCodeLoading: "requiredComponents"`
- 最多 30 个 SKILL
- 一个 SKILL 只能在一个分包中

### 2. SKILL 目录结构（固定）

```
skills/<skill-name>/
├── SKILL.md         # 业务说明（固定文件名，≤16000 字节）
├── mcp.json         # 原子接口声明（固定文件名，≤24000 字节，不计 outputSchema）
├── index.js         # 注册入口（固定文件名）
├── apis/            # 原子接口实现（建议目录）
└── components/      # 原子组件实现（建议目录）
```

### 3. 原子接口实现规范

```javascript
async function myAPI({ param1, param2 }) {
  // 业务逻辑...
  return {
    isError: false,    // 是否出错（isError=true 时不渲染卡片）
    content: [
      { type: "text", text: "事实陈述 + 业务动作引导" }
    ],
    structuredContent: {
      // 供 LLM 理解卡片内容的字段（不放图片 URL）
    },
    _meta: {
      // LLM 不可见的私有数据（如图片 URL、后台多余字段）
    }
  }
}
```

### 4. 注册入口 `index.js`

```javascript
const skill = wx.modelContext.createSkill('/path/to/pkg/my-skill')

// 注册原子接口
skill.registerAPI('getData', require('./apis/getData'))
skill.registerAPI('searchItems', require('./apis/searchItems'))

// 中间件（洋葱模型，用于统一登录、上报、错误监听等）
skill.use(async (ctx, next) => {
  const start = Date.now()
  try {
    await next()
  } catch (err) {
    reportError({ name: ctx.name, error: err })
    throw err
  }
})
```

### 5. `mcp.json` 能力声明

```json
{
  "apis": [
    {
      "name": "getWeather",
      "description": "查询天气。按位置和天数查询未来天气。\n调用时机：用户询问天气时。\n【严禁场景】不要用于查询历史天气。",
      "inputSchema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "要查询天气的地点名（用户原话中的地点）。【禁止编造】用户未提及时禁止填写，应反问『请问您想查哪个城市的天气？』"
          },
          "days": {
            "type": "number",
            "description": "预报天数，范围1-15。用户未提及时默认填7。"
          }
        },
        "required": ["days"]
      },
      "outputSchema": {},
      "_meta": { "ui": { "componentPath": "components/weather-card/index" } }
    }
  ],
  "components": [
    {
      "path": "components/weather-card/index",
      "relatedPage": "/pages/weather/detail"
    }
  ]
}
```

处理图片/文件的接口需在 `inputSchema` 对应字段加 `"format": "image"` 或 `"format": "file"`。

### 6. 原子组件实现

```javascript
Component({
  lifetimes: {
    created() {
      const modelCtx = wx.modelContext.getContext(this)
      const viewCtx = wx.modelContext.getViewContext(this)
      const { NotificationType } = wx.modelContext

      // 监听原子接口返回结果
      modelCtx.on(NotificationType.Result, (data) => {
        const sc = data.result.structuredContent
        const meta = data.result._meta
        this.setData({ ...sc, ...meta })
      })

      // 必须设置关联小程序页面
      viewCtx.setRelatedPage({ query: `id=${this.data.id}` })

      // 监听溢出/过期事件
      viewCtx.on(NotificationType.Overflow, (data) => { /* 内容溢出 */ })
      viewCtx.on(NotificationType.Expire, (event) => { /* 清理逻辑 */ })
    }
  },
  methods: {
    onTap() {
      // 代用户上行消息（等效于用户发送），可附带 api/call 指定下一步原子接口
      this._modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: '选择拿铁' },
          { type: 'api/call', data: { name: 'selectDrink', arguments: { drinkId: 123 } } }
        ]
      })
      // 打开半屏页面（原子接口内不可调用）
      this._viewCtx.openDetailPage({ url: '/package/pages/detail?drinkId=123' })
    }
  }
})
```

### 7. `page-meta.json` 文字链元数据

```json
{
  "pages": [
    {
      "path": "pages/detail/detail",
      "name": "商品详情",
      "description": "展示特定商品的信息",
      "query": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "商品的唯一标识符" }
        },
        "required": ["id"]
      }
    }
  ]
}
```

≤8000 字节。文字链是**兜底策略**，核心功能应在 AI 内闭环。

### 8. 小程序 ↔ 小程序 AI 交互接口

- `wx.openAgent({ followUpMessage, context })` — 打开 AI 界面
- `wx.navigateBackAgent({ followUpMessage, context })` — 从文字链/关联页面返回 AI 界面
- `wx.checkIsSupportAgent()` — 判断当前设备是否支持
- `wx.onAgentOpen(callback)` — 监听用户从胶囊打开 AI 界面

---

## 新增 API 速查（全部在 `wx.modelContext` 下）

### 原子接口环境

| API | 说明 |
|-----|------|
| `wx.modelContext.createSkill(path)` | 创建 Skill 实例 |
| `skill.registerAPI(name, handler)` | 注册原子接口 |
| `skill.use(middleware)` | 注册中间件（洋葱模型） |
| `wx.modelContext.getSessionId()` | 获取会话 ID |
| `wx.modelContext.expireAllCards({ componentPaths, match })` | 设置组件过期 |

### 原子组件环境

| API | 说明 |
|-----|------|
| `wx.modelContext.getContext(this)` | 获取 ModelContext |
| `wx.modelContext.getViewContext(this)` | 获取 ViewContext |
| `modelCtx.sendFollowUpMessage({ content })` | 代用户上行消息 |
| `viewCtx.openDetailPage({ url })` | 打开半屏页面 |
| `viewCtx.preloadDetailPage({ url })` | 预加载半屏页面 |
| `viewCtx.setRelatedPage({ path, query })` | 设置关联小程序页面（**必填**） |
| `viewCtx.expirePreviousCards({ componentPaths, match })` | 过期之前组件卡片 |
| `viewCtx.getDimensions()` | 获取卡片尺寸（`{ minHeight, maxHeight, width }`） |
| `viewCtx.on(NotificationType, callback)` | 监听 Input / Result / Overflow / Expire 事件 |

---

## 原子组件约束（硬性规则）

- 卡片宽度随屏幕固定，高度最小 4:1，最大 1:1；初始化时决定高度，后续**不可变**
- 仅支持 `tap` 点击事件、image load/error 事件
- 默认**不支持**网络请求和定时器，如需支持需声明 `permissions: { "scope.dynamic": { "desc": "..." } }` 为实时动态组件
- 不支持动画、禁止竖向滚动（`overflow-y`）
- **必须配置** `relatedPage`（关联小程序页面），在 `mcp.json` 的 `components[].relatedPage` 中声明固定 path，在组件 `created` 中通过 `setRelatedPage` 设置动态 query
- 不支持 `wx.navigateTo` 等页面路由接口

### WXSS 支持范围（原子组件渲染引擎差异）

- 选择器：仅支持类选择器、ID 选择器、标签选择器、后代选择器（推荐类选择器）
- 单位：`px`、`vw`、`rpx`、`em`、`rem`
- 支持 `@media (prefers-color-scheme: dark)` 暗黑模式适配
- flex 布局完整支持，display 支持 flex/block/inline/none
- 设计规范：圆角建议 4px，屏幕边距 16px，内容外边距 6px，内容内边距 9px 或 16px
- 字体：标题 17、正文 15、注释 12，最大不超过 36，最小 12

### 内置组件支持范围

| 组件 | 说明 |
|------|------|
| view | 完全支持 |
| text | 不支持 user-select |
| map | 不支持拖动、放大交互 |
| button | 不支持所有 open-type |
| image | 仅网络地址，仅 png/jpg |
| canvas | 仅 2d |
| scroll-view | 仅横向滚动（scroll-x） |

---

## 最佳实践（核心规范）

### 注意力权重原则

LLM 对不同信息源的注意力不平均，按优先级排列：

| 优先级 | 信息源 | 作用 |
|--------|--------|------|
| ★★★★★ | 原子接口返回的 `content` | 离决策点最近，LLM 当"事实承接 + 直接指令"理解 |
| ★★★★ | `mcp.json` 的 `description` | 首句决定接口选择准确率 |
| ★★★★ | `inputSchema` 字段 `description` | 参数填充的核心参考 |
| ★★★ | `SKILL.md` | 业务流程编排、跨接口规则、意图分流 |

多处约束冲突时，LLM 遵循高权重位置的指令。核心约束不应全依赖 `SKILL.md`，硬约束应通过 `content` 或 `description` 字段说明。

### 内容分工

| 位置 | 放什么 |
|------|--------|
| `content` | 本次调用结果 + 下一步动作 |
| `mcp.json` description | 接口功能、调用时机、严禁场景 |
| `inputSchema` description | 参数语义与取值约束 |
| `SKILL.md` | 跨接口规则、意图分流、业务流程编排 |

### 字段 description 三段式模板（必须严格遵守）

```
<字段语义（一句话）>。
取值来源：<用户原话 / 上游接口 X 返回的 Y 字段 / 枚举集合>。
【禁止编造】<用户未提供 / 上下文无来源 / 越界> 时，<反问用户『…』 / 改走接口 Z / 留空>。
```

三段缺一不可：前两段决定模型能不能填对，第三段决定模型不会"硬填"。

### content 文本写法

#### ✅ 正确：事实陈述 + 业务动作两段式

```
"已查到该 orderId 的机票订单数据。请把本次接口返回的卡片数据展示给用户，并用简短一句话引导用户查看。"
"用户当前授权状态：手机号=未授权，定位=已授权。下一步允许的动作：把手机号授权确认卡片展示给用户，等用户在卡片中亲自点击同意后才能进入下一步。"
```

#### ❌ 反例：裸指令

```
"接下来请务必为用户展示订单确认卡片"
```

仅有动作无事实，模型可能跳过等待用户决策。

### 常见禁令（在 SKILL.md 中声明）

- 禁止裸指令：所有成功返回的接口（`isError=false`）且绑定组件的，**必须展示卡片**，禁止纯文本列出卡片详情数据
- 禁止 ID 编造：`drinkId` / `orderId` / `itemId` 等必须来自上游接口返回的原值
- 禁止并发调用支付类接口：`payOrder` / `createOrder` 须等上一笔结束后再发起
- 禁止在 `structuredContent` 中放图片 URL
- 动作类接口必须先调成功（`isError=false`）再向用户宣布结果
- 枚举值必须使用英文枚举，禁止中文 label

### SKILL.md 业务 SOP 写法

`SKILL.md` 承载业务级 SOP，包含四部分：

1. **完整业务流程图**（ASCII 流程图，接口名须与 `mcp.json` 的 `name` 完全一致）
2. **原子接口依赖关系表**（接口名、作用、组件、前置条件）
3. **业务约束**（输出形态、执行顺序、并发串行、数据来源等铁律）
4. **用户意图分流表**（直接意图触发词 + 意图分流规则）

注意：
- 不重复 `mcp.json` 的 description 和 inputSchema
- 不在 `SKILL.md` 中写具体 URL 字面量（模型会原文照搬）
- 歧义短表达的兜底动作统一为"先反问澄清"

---

## 调试与评测

- **开发者工具**：下载 [Nightly Electron Build 最新版](https://developers.weixin.qq.com/miniprogram/dev/devtools/log#nightly)，切换至「小程序 AI 编译」模式，基础库切至 3.16.1
- **真机预览**：iOS 微信 ≥8.0.74，胶囊右上角进入「小程序 AI 开发模式」，支持打开 vConsole 调试
- **生成 SKILL**：安装 `wxa-skills-generate`，输入「帮我分析这个项目，接入微信小程序 AI 开发模式」激活生成流程
- **校验 SKILL**：安装 `wxa-skills-validate`，自动渲染与执行校验
- **评测 SKILL**：安装 `wxa-skills-eval`，模拟真实用户对话，自动分析问题，输出 `eval_report.html`

> 使用校验和评测工具前，必须在微信开发者工具「设置 → 安全设置」中开启服务端口。

---

## 常见限制与 FAQ 速查

- 仅 iOS 微信 ≥8.0.74 支持真机，安卓/鸿蒙暂不支持
- AI 回复不支持流式输出
- AI 回复仅支持两种格式：纯文本，或「文本 + 卡片」固定格式
- 支持多模态：用户可发图片/文件，接口可声明 `"format": "image"` 或 `"format": "file"`
- 原子接口的超时上限为 300s（含中间件链）
- 半屏页面禁止所有跳转、路由、广告接口
- 如需在原子组件中发网络请求，必须声明为实时动态组件（`scope.dynamic`）
- uni-app 项目需用 `patch-package` 补 `@dcloudio/uni-mp-weixin`，补上 `modelContext`

---

## 相关链接

- [微信官方文档](https://developers.weixin.qq.com/miniprogram/dev/ai/guide.html)
- [官方 demo](https://github.com/wechat-miniprogram/ai-mode-demo)
- [微信开放社区 - 小程序 AI 能力专区](https://developers.weixin.qq.com/community/minihome/mixflow/4547794673309990912)
- [mp-skills 工具](https://github.com/TencentCloudBase/mp-skills)
