# AI 小程序模板

基于 [mp-skills](https://github.com/TencentCloudBase/mp-skills) 的云开发 AI 小程序模板，集成了微信小程序云开发 Agent 能力，支持快速接入和开发 AI Skill。

## 前置条件

- Node.js v16+
- 微信开发者工具（Nightly 版本）
- 全局安装 mp-skills CLI: `npm install -g mp-skills`

## 快速开始

1. **注册小程序**：前往 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序，获取 AppID。

2. **填写 AppID**：在 `project.config.json` 中填写 `"appid"` 字段。

3. **填写云环境 ID**：在 `miniprogram/app.js` 中将 `env` 替换为你的云开发环境 ID。如不启用云开发，Skill 会使用 seed/mock 数据正常运行。

4. **发现并安装 Skill**：

   ```bash
   # 先看看有哪些 Skill 可用
   mp-skills find

   # 安装想要的 Skill
   mp-skills add TencentCloudBase/awesome-miniprogram-skills --skill <name>
   ```

5. **运行 setup**（执行 Skill 的初始化脚本）：

   ```bash
   mp-skills setup
   ```

6. **使用微信开发者工具打开项目**：

   ```bash
   # macOS
   /Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project /path/to/project

   # Windows
   "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" open --project D:\path\to\project
   ```

7. **开发你的 Skill**：参考 `docs/SKILL-DEV-GUIDE.md` 了解如何创建自定义 Skill。

## 目录结构

```
project-root/
├── miniprogram/                  # 小程序代码
│   ├── app.js                    # 入口文件（云开发初始化）
│   ├── app.json                  # 全局配置
│   ├── app.wxss                  # 全局样式
│   ├── pages/
│   │   └── index/                # 首页
│   │       ├── index.js
│   │       ├── index.wxml
│   │       ├── index.wxss
│   │       └── index.json
│   └── skills/                   # Skills 目录（由 mp-skills 管理）
│       ├── greet-skill/
│       └── ...                   # 更多 Skill
├── docs/                         # 开发文档
│   ├── SKILL-DEV-GUIDE.md
│   └── COMPONENT-TEMPLATES.md
├── cloudbaserc.json              # 云开发资源配置
├── project.config.json           # 小程序项目配置
└── README.md
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `mp-skills find` | 搜索远程仓库中的 Skill |
| `mp-skills add <repo> --skill <name>` | 安装指定 Skill |
| `mp-skills remove <name>` | 移除指定 Skill |
| `mp-skills list` | 列出已安装的 Skill |
| `mp-skills setup` | 执行各 Skill 的初始化脚本 |
| `mp-skills create <name>` | 创建新的 Skill 模板 |
| `mp-skills new <name>` | 创建新的 AI 小程序项目 |
