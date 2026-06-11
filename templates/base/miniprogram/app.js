// app.js — 小程序入口
// 云开发初始化，替换 env 为你的云环境 ID
// 不启用云开发时，Skill 使用 seed/mock 数据正常运行

const cloudConfig = {
  env: 'your-env-id',
  traceUser: true,
}

try {
  wx.cloud.init(cloudConfig)
  console.log('[app] 云开发已初始化')
} catch (e) {
  console.warn('[app] 云开发初始化失败，将使用预览模式', e)
}

App({})
