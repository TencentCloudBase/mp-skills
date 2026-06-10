# mp-skills SDK

> 微信小程序 AI Skills 的运行时工具库。

---

## 运行时 API

### createSkill — 装配入口

```javascript
// skills/<name>/index.js
const { createSkill } = require('mp-skills')

module.exports = createSkill({
  path: 'skills/food-delivery',   // 与 app.json agent.skills[].path 一致
  apis: require('./apis'),        // API 注册表，同时按名匹配 mcp.json 的 inputSchema 做校验
  middleware: [],                 // 中间件数组
})
```

```javascript
// skills/<name>/apis/index.js — 新增 API 在这里加一行
module.exports = {
  searchRestaurants: require('./searchRestaurants'),
  getRestaurantDetail: require('./getRestaurantDetail'),
  // ...
}
```

### defineApi — 原子接口

声明 handler，入参校验由 `mcp.json` 中同名 API 的 `inputSchema` 提供。

```javascript
// skills/<name>/apis/searchDishes.js
const { defineApi, reply } = require('mp-skills')

module.exports = defineApi({
  async handler({ keyword, restaurantId }, ctx) {
    const matched = await searchDishes(restaurantId, keyword)

    if (!matched.length) {
      return reply.fail(`未找到「${keyword}」相关菜品，请换个关键词。`)
    }

    return reply.ok({
      text: `已搜到 ${matched.length} 款。展示卡片，禁止纯文本列详情。`,
      structured: { items: matched.slice(0, 4), total: matched.length },
      render: { dishes: matched.slice(0, 4) },
    })
  },
})
```

### reply — 返回值

```javascript
reply.ok({ text, structured, render })   // 成功
reply.fail('错误原因 + 正确出口引导')      // 失败
```

| 字段 | 映射到 | 谁可见 | 放什么 |
|---|---|---|---|
| `text` | `content[].text` | LLM | 事实陈述 + 下一步引导 |
| `structured` | `structuredContent` | LLM | 业务语义（id / name / price / status） |
| `render` | `_meta` | 组件 | 渲染字段（imageUrl 等） |

> 渲染哪个组件由 `mcp.json` 中 `apis[]._meta.ui.componentPath` 绑定，`reply.ok` 只负责产出数据。

### defineComponent — 原子组件

封装 `modelContext` / `viewContext` API 到 `this.skill` 命名空间，收口 `NotificationType` 四类事件。

> 静态 `relatedPage` 在 `mcp.json` 的 `components[].relatedPage` 中声明；运行时动态设置 query 用 `this.skill.setRelatedPage(...)`。

```javascript
// skills/<name>/components/dish-list/index.js
const { defineComponent } = require('mp-skills/component')

module.exports = defineComponent({
  data: { restaurantName: '', dishes: [] },

  onResult({ structured, render }) {
    this.setData({ restaurantName: structured.restaurant?.name || '', dishes: render.dishes || [] })
  },
  onInput({ input }) { this.setData({ loading: true }) },
  onOverflow({ overflow }) { this.setData({ truncated: true }) },
  onExpire() { clearInterval(this._timer) },

  methods: {
    onTapDish(e) {
      const { item } = e.currentTarget.dataset
      this.skill.sendFollowUpMessage({
        content: [
          { type: 'text', text: `看看${item.name}` },
          { type: 'api/call', data: { name: 'selectDish', arguments: { dishId: item.dishId } } },
        ],
      })
    },
    onTapMore() {
      this.skill.openDetailPage({ url: '/pages/restaurant-detail' })
    },
  },
})
```

**挂载到 `this.skill` 的方法：**

| 方法 | 来源 | 用途 |
|---|---|---|
| `this.skill.sendFollowUpMessage(...)` | `modelCtx` | 代用户上行消息 |
| `this.skill.setRelatedPage(...)` | `viewCtx` | 动态设置「进入小程序」按钮的 query 参数 |
| `this.skill.openDetailPage({ url })` | `viewCtx` | 打开半屏页面 |
| `this.skill.preloadDetailPage({ url })` | `viewCtx` | 预加载半屏页面 |
| `this.skill.expirePreviousCards(...)` | `viewCtx` | 过期当前组件之前的卡片 |
| `this.skill.expireAllCards(...)` | `wx.modelContext` | 过期任意卡片 |
| `this.skill.getDimensions()` | `viewCtx` | 返回 `{ minHeight, maxHeight, width }` |
| `this.skill.getSessionId()` | `wx.modelContext` | 获取当前会话 ID |

**四个事件钩子：**

| 钩子 | 触发 |
|---|---|
| `onResult({ structured, render })` | 接口出参 |
| `onInput({ input })` | 接口入参 |
| `onOverflow({ overflow })` | 内容溢高 |
| `onExpire()` | 卡片过期 |

**`defineApi` handler 的 `ctx`：** 同样具有 `getSessionId`、`expireAllCards` 等视图侧能力，还额外提供：

| 属性 | 用途 |
|---|---|
| `ctx.apiName` | 当前接口名 |
| `ctx.args` | 当前接口入参 |

---

## 内置能力

### 中间件

从 `mp-skills/middleware` 引入，在 `createSkill` 的 `middleware` 数组按顺序声明。

#### logger — 日志上报

```javascript
const { logger } = require('mp-skills/middleware')

createSkill({
  middleware: [
    logger({
      // 每次 API 调用结束时回调，你决定发到哪
      provider: async (entry) => {
        // entry = { apiName, args, duration, success, timestamp, sessionId }
        await wx.request({ url: 'https://your-log-api.com/ingest', method: 'POST', data: entry })
      },
    }),
  ],
})
```

#### auth — 登录态注入

```javascript
const { auth } = require('mp-skills/middleware')

createSkill({
  middleware: [
    auth({
      // 用 wx.login 拿到的 code 换 openid
      code2session: async (code) => {
        const res = await wx.request({ url: 'https://api.xxx.com/wx/login', data: { code } })
        return res.data.openid
      },
    }),
  ],
})
```

注入后，所有 API handler 的 `ctx.openid` 可用。

#### 自定义中间件

签名 `async (ctx, next) => { await next() }`，洋葱模型。

```javascript
// skills/<name>/middleware/timing.js
module.exports = async (ctx, next) => {
  const start = Date.now()
  await next()
  console.log(`[${ctx.apiName}] ${Date.now() - start}ms`)
}
```

### API Handler

`defineApi` 的内置变体，封装特定前置流程。

#### definePaidApi — 支付

前置 `wx.requestPayment`，handler 仅在支付成功后执行。

```javascript
const { definePaidApi, reply } = require('mp-skills')

module.exports = definePaidApi({
  // prepare：校验 + 获取 prepay 参数，throw Error 自动转 reply.fail  async prepare({ orderId, address }) {
    const order = await getOrder(orderId)
    if (!order) throw new Error('订单不存在，请重新选品下单')
    if (order.status === 'paid') throw new Error('该订单已支付完成')
    if (!order.address && !address) throw new Error('缺少收货地址，请先补充')

    const params = await yourBackend.prepay(orderId)
    return params   // { timeStamp, nonceStr, package, signType, paySign }
  },

  // handler 仅在支付成功后执行
  async handler({ orderId }) {
    const order = await confirmPayment(orderId)
    return reply.ok({
      text: `支付成功！实付 ¥${order.paidAmount}，预计 ${order.deliveryTime} 送达`,
      structured: { orderId, status: 'paid', paidAmount: order.paidAmount },
      render: { ...order },
    })
  },
})
```

**执行流程：** `prepare` → 框架自动 `wx.requestPayment` → `handler`

#### defineCloudPayApi — 云开发支付

基于 [CloudBase 微信支付集成](https://docs.cloudbase.net/integration/wechat-pay-miniprogram/index.md)，无需自建 prepay 后端。`prepare` 返回下单 body。

```javascript
const { defineCloudPayApi, reply } = require('mp-skills/cloudbase')

module.exports = defineCloudPayApi({
  functionName: 'miniapp-wxpay-xxxxxx',   // 集成中心生成的云函数名

  async prepare({ orderId, address }) {
    const order = await getOrder(orderId)
    if (!order) throw new Error('订单不存在，请重新选品下单')
    if (order.status === 'paid') throw new Error('该订单已支付完成')
    if (!order.address && !address) throw new Error('缺少收货地址，请先补充')

    return {
      description: `${order.restaurantName} - 外卖订单`,
      out_trade_no: orderId,
      amount: { total: Math.round(order.totalAmount * 100), currency: 'CNY' },
    }
  },

  async handler({ orderId }) {
    const order = await confirmPayment(orderId)
    return reply.ok({
      text: `支付成功！实付 ¥${order.paidAmount}，预计 ${order.deliveryTime} 送达`,
      structured: { orderId, status: 'paid', paidAmount: order.paidAmount },
      render: { ...order },
    })
  },
})
```

**执行流程：** `prepare` → 框架自动 `callHTTPFunction` 下单 → `wx.requestPayment` → `handler`

**两种支付方案：**

| | `definePaidApi` | `defineCloudPayApi` |
|---|---|---|
| `prepare` 返回 | prepay 参数 | 下单 body |
| 后端 | 自建 prepay API | CloudBase 集成（零代码） |
| 适用 | 有自有后端 | 云开发用户 |

#### 与中间件组合

中间件和 API handler 可自由组合：

```javascript
// index.js
createSkill({
  middleware: [auth({ code2session })],
  apis: require('./apis'),
})

// apis/payOrder.js
module.exports = definePaidApi({
  async prepare({ orderId }) { ... },
  async handler({ orderId }, ctx) {
    // ctx.openid 来自 auth 中间件
  },
})
```

### Agent — 自主推理

`defineAgent` 把多个 API 组合成一个黑盒 Agent，LLM 一次 invoke，内部自闭环多步推理。

#### defineAgent — 定义 Agent

```javascript
// skills/<name>/apis/foodOrderAgent.js
const { defineAgent } = require('mp-skills')

module.exports = defineAgent({
  name: 'foodOrderAgent',

  // LLM 提供方，默认微信云开发，可选别的
  llm: {
    provider: 'cloudbase'
  },

  // 系统指令 — LLM 的推理蓝图
  instruction: 
  `你是外卖点餐助手。收到用户需求后：
  1. 先 searchRestaurants 搜索餐厅
  2. 如果用户没指定，推荐评分最高的
  3. getRestaurantDetail 查看菜单
  4. 帮用户确认选品后下单并支付
  注意：缺少地址时必须先问用户`,

  // 可用工具 — 本地函数实现，框架自动转 tool schema
  tools: {
    searchRestaurants: async ({ keyword }, ctx) => {
      const res = await fetch(`https://api.xxx.com/restaurants?keyword=${keyword}`)
      return { text: `找到 ${res.total} 家餐厅`, structured: res.data }
    },
    createOrder: require('./apis/createOrder'),
  },

  maxSteps: 15,   // 最大推理步数，防止无限循环
})
```

**Agent 的 inputSchema 在 `mcp.json` 中声明，对外暴露为一个普通 tool：**

```json
{
  "apis": [
    { "name": "searchRestaurants", "inputSchema": { ... } },
    { "name": "createOrder", "inputSchema": { ... } }
  ],
  "agents": [
    {
      "name": "foodOrderAgent",
      "path": "./apis/foodOrderAgent.js",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "用户的外卖需求" }
        },
        "required": ["query"]
      }
    }
  ]
}
```

**执行流程：** 外部 invoke `foodOrderAgent({ query })` → LLM 推理循环（选工具 → 调 API → 观察结果 → 循环）→ 返回最终 `reply.ok`

**Agent 与 API 的对比：**

| | `defineApi` | `defineAgent` |
|---|---|---|
| 粒度 | 原子操作 | 多步推理 |
| 调用方式 | LLM 逐次调度 | 一次 invoke，内部自闭环 |
| 状态 | 无状态 | `sessionId` 贯穿全流程 |
| 返回 | 单步结果 | 最终结论 |

**sessionId 是 Agent 内部的状态总线：**

```
Agent 内部（同一 sessionId=abc）
  step1: searchRestaurants({ keyword: "川菜" })
    → ctx.getSessionId() → "abc"
    → logger entry { sessionId: "abc", apiName: "search...", ... }

  step2: getRestaurantDetail({ restaurantId: "r_001" })
    → ctx.getSessionId() → "abc"

  step3: createOrder({ ... })
    → auth 中间件注入 ctx.openid
    → logger entry { sessionId: "abc", ... }
```

`sessionId` 保证了三件事：

- **可观测** — 整个 Agent 推理链路的日志通过 sessionId 串起来
- **上下文保持** — 中间件注入的 `openid` 等信息在 Agent 生命周期内一致
- **父子关联** — 外部调用者可传入自己的 sessionId，建立父子会话关系

---

## 目录结构

```
my-miniapp/
├── app.json                       # ← create 回写
├── pages/ ...
└── skills/
    └── <name>/                    # ← create 生成
        ├── mcp.json               # API / 组件 / Agent 声明
        ├── index.js               # createSkill 装配入口
        ├── SKILL.md               # 业务说明书
        ├── apis/
        │   ├── index.js           # API / Agent 注册表
        │   └── *.js               # defineApi / defineAgent 实现

        └── components/
            └── */                 # 原子组件（四件套）
```

| 文件 | 约束 |
|---|---|
| `SKILL.md` | ≤ 16KB |
| `mcp.json` | ≤ 24KB |
| 单分包总大小 | ≤ 2MB |

---

MIT
