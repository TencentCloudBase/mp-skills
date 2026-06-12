// app.js — 小程序入口文件
// 负责初始化云开发环境。
// 注意：不启用云开发时，Skill 组件会使用 seed/mock 数据正常运行，
// 因此云开发初始化失败不会阻塞小程序启动。

var envId = 'your-env-id' // TODO: 替换为你的云开发环境 ID

try {
  wx.cloud.init({
    env: envId,
    traceUser: true,
  })
  console.log('[app] 云开发初始化成功，环境 ID:', envId)
} catch (e) {
  // 云开发初始化失败（如模拟器、无网络等），Skill 降级为预览模式
  console.warn('[app] 云开发初始化失败，将使用预览模式', e)
}

App({})
