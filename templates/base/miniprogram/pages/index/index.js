// pages/index/index.js — 首页
// 展示欢迎卡片并加载 Skill 提供的欢迎数据。

let getWelcomeApi

try {
  getWelcomeApi = require('../../skills/greet-skill/apis/getWelcome')
} catch (e) {
  // greet-skill 未安装时静默降级，不阻塞页面渲染
  console.warn('[index] greet-skill 未安装，欢迎卡片将不可用')
}

Page({
  data: {
    welcomeData: null,
    loading: true,
    error: null,
  },

  onLoad() {
    this.loadWelcome()
  },

  onShow() {
    // 从其他页面返回时刷新数据，确保 Skill 状态更新后及时反映
    if (!this.data.loading) {
      this.loadWelcome()
    }
  },

  loadWelcome() {
    if (!getWelcomeApi) {
      this.setData({ loading: false, error: null })
      return
    }

    this.setData({ loading: true, error: null })

    try {
      var res = getWelcomeApi()

      if (res && res.structuredContent) {
        this.setData({
          welcomeData: res.structuredContent,
          loading: false,
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('[index] 加载欢迎数据失败', err)
      this.setData({
        loading: false,
        error: err.message || '加载失败',
      })
    }
  },

  onAction(e) {
    var action = e.detail && e.detail.action

    if (action) {
      wx.showToast({
        title: '操作: ' + action,
        icon: 'none',
        duration: 2000,
      })
    }
  },
})
