# 项目记忆

## 设计与决策

### 中立 setup 设计（2026-06-15 定稿）

**核心理念**：`mp-skills setup` 是一个脚本编排器，不认知任何平台。

**关键决策**：
- `mp-skills.json` 是标准和唯一的配置文件，通过 `scripts.setup` 声明要执行的命令
- `mp-skills plugin --name cloudbase setup` 是内置命令，不开放三方插件
- 第三方直接在 `scripts.setup` 里写 shell 命令
- 所有脚本执行前都有二次确认
- `description` 字段可选，用于在确认时展示脚本意图
- 串行执行，失败不阻断后续
- 锁文件记录执行状态，默认跳过已成功的脚本
- 脚本有 5 分钟超时，使用 `spawn` 而非 `exec`
- 工作目录是 Skill 自身目录，注入 `PROJECT_DIR` 和 `SKILL_DIR` 环境变量
- 不输出到锁文件，防止敏感信息泄露

**详细设计文档**：`specs/plugin-system/design.md`
