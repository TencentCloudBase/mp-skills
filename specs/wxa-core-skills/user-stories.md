# 用户故事与场景梳理

## 场景一：从零开始，做一个咖啡点单小程序

**用户**：小王，独立开发者，想做一个咖啡店小程序。

**对话**：

> 小王："我想做一个咖啡店点单小程序"
>
> AI → **wxa-create-ai-miniprogram**
>
> Step 1 — 需求分析
> AI：问目标用户、核心功能
> 小王："顾客扫码点单，能选饮品规格，微信支付"
> AI：推荐方案 → order-skill + payment-skill + greet-skill
>
> Step 2 — 创建项目
> → `npx mp-skills new coffee-shop`
>
> Step 3 — 安装 Skill
> → `npx mp-skills add ... --skill order-skill`
> → `npx mp-skills add ... --skill payment-skill`
> → `npx mp-skills add ... --skill greet-skill`
>
> Step 4 — 引导配置
> AI：教小王填 appid、云环境 ID、运行 setup、打开开发者工具

**走通**：✅ wxa-create-ai-miniprogram 完整覆盖

---

## 场景二：已有项目，想加一个排队取号功能

**用户**：小李，已有小程序，想加新功能。

**对话**：

> 小李："帮我的小程序加一个排队取号功能"
>
> AI → **wxa-find-skills**
>
> Step 1 — 理解需求
> 小李："餐饮门店，顾客取号等位"
>
> Step 2 — 搜索
> → `npx mp-skills find queue`
> 结果：queue-skill
>
> Step 3 — 确认
> AI："queue-skill 支持搜索门店、取号、查看排队进度"
> 小李："就这个"
>
> Step 4 — 安装
> → `npx mp-skills list`（检查已安装）
> → `npx mp-skills add TencentCloudBase/awesome-miniprogram-skills --skill queue-skill`
>
> Step 5 — 引导
> AI："运行 npx mp-skills setup 完成配置"

**走通**：✅ wxa-find-skills 完整覆盖

---

## 场景三：已有项目，想要一个社区没有的定制功能

**用户**：小张，需要定制化 AI 能力。

**对话**：

> 小张："帮我做一个预约试驾的 AI 功能"
>
> AI → **wxa-find-skills**（先搜索）
> → `npx mp-skills find test-drive`
> → 没有结果
> AI："没有现成的社区 Skill，我可以帮你创建一个"
>
> 转 → **wxa-create-mp-skill**
>
> Step 1 — 接口设计
> AI：设计 `searchDealers`、`bookTestDrive`、`getAppointments`
>
> Step 2 — 产出 SKILL.md + mcp.json
> 用户确认
>
> Step 3 — 代码生成
> → `npx mp-skills --help` 获取路径
> → 读取 `<generate-dir>/SKILL.md`，按阶段生成
>
> Step 4 — 校验
> → `<validate-dir>/scripts/validate.mjs`
> → execute + render
>
> Step 5 — 修复
> 如果有 T1~T6 问题，修复后重跑

**走通**：✅ wxa-find-skills → 无结果 → 转 wxa-create-mp-skill

---

## 场景四：项目做好了，想全面检查一下

**用户**：小赵，开发完了想上线前检查。

**对话**：

> 小赵："帮我检查一下我的 Skill 有没有问题"
>
> AI → **wxa-create-mp-skill**（或直接用 wxa-skills-validate）
>
> 实际上这个场景目前三个 Skill 都没有直接覆盖。
> 用户需要知道 `npx mp-skills validate` 或直接调 wxa-skills-validate。
> 可以在 wxa-create-mp-skill 的"不做什么"里补一句？或者以后加 wxa-health-check。

**待定**：❌ 目前三个 Skill 都不适合"纯校验"场景

---

## 场景五：我想用 AI 生成代码，但不想从头设计

**用户**：小康，知道要做什么功能，想直接生成代码。

**对话**：

> 小康："帮我生成一个 todolist 的 Skill"
>
> AI → **wxa-create-mp-skill**
>
> Step 1 — 接口设计
> 小康："增删改查待办事项"
> AI：设计 `getTodoList`、`addTodo`、`toggleTodo`、`deleteTodo`
>
> Step 2 — SKILL.md + mcp.json
> 用户确认
>
> Step 3 → 读取 wxa-skills-generate 生成代码
> Step 4 → 校验
> Step 5 → 修复

**走通**：✅ wxa-create-mp-skill 覆盖

---

## 场景六：想装一个 Skill，但不太确定装哪个

**用户**：小陈，说"帮我装个有用的 Skill"。

**对话**：

> 小陈："帮我装个有用的 Skill"
>
> AI → **wxa-find-skills**
>
> Step 1 — 理解需求
> AI：问"你的小程序是做什么的？"
> 小陈："生鲜配送"
>
> Step 2 — 搜索
> → `npx mp-skills find fresh`
> → 没有结果
> → `npx mp-skills find delivery`
> → 没有结果
> → `npx mp-skills add TencentCloudBase/awesome-miniprogram-skills --all`（全部安装让用户自己看）
> AI：列出全部 Skill 让用户选择

**走通**：✅ wxa-find-skills 覆盖（需要后备逻辑）

---

## 场景七：已经装了 Skill，想查看或移除

**用户**：小马，装了太多想清理。

**对话**：

> 小马："我装了哪些 Skill？帮我删掉不需要的"
>
> AI → **wxa-find-skills**（职责包含查找和安装，不包含移除）
>
> AI 可以直接执行：
> → `npx mp-skills list`（查看已安装）
> → `npx mp-skills remove <name>`（移除不需要的）
>
> 但在 wxa-find-skills 的"不做什么"里没有提到移除功能。

**待定**：❌ 移除功能在 wxa-find-skills 的"不做什么"里被遗漏了，但实际上用户问了 AI 可以执行。

---

## 总结

| 场景 | 覆盖 | 对应 Skill |
|------|------|-----------|
| 从零创建小程序 | ✅ | wxa-create-ai-miniprogram |
| 安装社区 Skill | ✅ | wxa-find-skills |
| 找不到想要的社区 Skill → 自己创建 | ✅ | wxa-find-skills → wxa-create-mp-skill |
| 自定义新 Skill | ✅ | wxa-create-mp-skill |
| 纯校验/检查 | ❌ 未覆盖 | 需要用户直接用 `npx mp-skills validate` |
| 查看/移除已安装 | ⚠️ 能执行但未说明 | wxa-find-skills 可补 |
