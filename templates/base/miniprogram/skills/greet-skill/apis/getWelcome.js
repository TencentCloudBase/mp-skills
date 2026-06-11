// skills/greet-skill/apis/getWelcome.js — 首页欢迎接口
// 返回欢迎信息 + 快捷操作 + 推荐 Skill 列表

function getWelcome(params = {}) {
  const { userId } = params || {}
  const userName = wx.getStorageSync('userName') || ''

  const welcomeMsg = userName ? `欢迎回来，${userName}！` : '你好！欢迎体验 AI 小程序～'

  const quickActions = [
    { id: 'install', label: '安装 Skill', icon: '📦', action: 'install' },
    { id: 'demo', label: '查看示例', icon: '👀', action: 'demo' },
    { id: 'help', label: '使用帮助', icon: '💡', action: 'help' },
  ]

  const recommendedSkills = [
    { name: 'drink-skill', description: '咖啡点单 — 推荐、选口味、下单支付' },
    { name: 'order-skill', description: '外卖点餐 — 搜餐厅、浏览菜单、下单' },
  ]

  const usageTip = '点击下方推荐，或直接发消息告诉我你想做什么'

  return {
    content: [{ type: 'text', text: welcomeMsg }],
    structuredContent: {
      welcomeMsg,
      quickActions,
      recommendedSkills,
      usageTip,
    },
  }
}

module.exports = getWelcome
