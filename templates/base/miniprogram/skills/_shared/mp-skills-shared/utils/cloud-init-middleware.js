/**
 * 云开发初始化中间件
 *
 * 在 skill.use() 中注册，自动确保 wx.cloud.init() 已执行，
 * 避免 CLI render 等跳过 app.js 生命周期的场景报
 * "Cloud API isn't enabled" 错误。
 *
 * @example
 *   const cloudInitMw = require('../../_shared/mp-skills-shared/utils/cloud-init-middleware')
 *   skill.use(cloudInitMw)
 *   skill.registerAPI('xxx', xxxHandler)
 *
 * 参考：微信小程序 AI 开发模式报告 5.3 节 — 中间件机制
 */

// ── 配置 ──
// ★ 请将下面的环境 ID 替换为你的云开发环境 ID
const CLOUD_ENV_ID = '填入你的云开发环境ID'

let _cloudInited = false

function ensureCloudInited() {
  if (_cloudInited) return
  try {
    wx.cloud.init({ env: CLOUD_ENV_ID })
    _cloudInited = true
    console.info('[ai-mode] cloud-init middleware: wx.cloud.init() called, env=' + CLOUD_ENV_ID)
  } catch (e) {
    console.warn('[ai-mode] cloud-init middleware: wx.cloud.init() failed:', e.message)
  }
}

async function cloudInitMiddleware(ctx, next) {
  ensureCloudInited()
  await next()
}

module.exports = cloudInitMiddleware
