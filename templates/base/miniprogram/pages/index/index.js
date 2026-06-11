// pages/index/index.js — 首页
// 展示欢迎卡片 + Skill 入口

let getWelcomeApi
try {
  getWelcomeApi = require('../../skills/greet-skill/apis/getWelcome')
} catch (e) {
  // Skill 被移除时降级
}

Page({
  data: {
    welcomeData: {},
    loading: true,
  },

  onLoad() {
    this.loadWelcome()
  },

  onShow() {
    this.loadWelcome()
  },

  loadWelcome() {
    if (getWelcomeApi) {
      try {
        const res = getWelcomeApi()
        this.setData({
          welcomeData: res.structuredContent || {},
          loading: false,
        })
      } catch (err) {
        console.error('[welcome]', err)
        this.setData({ loading: false })
      }
    } else {
      this.setData({ loading: false })
    }
  },

  onAction(e) {
    const { action } = e.detail
    wx.showToast({ title: `操作: ${action}`, icon: 'none' })
  },
})
