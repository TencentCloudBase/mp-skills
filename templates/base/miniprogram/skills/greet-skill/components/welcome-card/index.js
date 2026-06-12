// skills/greet-skill/components/welcome-card/index.js
// 欢迎卡片组件 — 展示欢迎信息、快捷操作、推荐 Skill

Component({
  properties: {
    data: {
      type: Object,
      value: {},
      observer: 'render',
    },
  },

  data: {
    welcomeMsg: '',
    quickActions: [],
    recommendedSkills: [],
    usageTip: '',
  },

  lifetimes: {
    created() {
      const { NotificationType } = wx.modelContext
      const modelCtx = wx.modelContext.getContext(this)
      modelCtx.on(NotificationType.Result, (data) => {
        const sc = (data && data.result && data.result.structuredContent) || {}
        this.setData({
          welcomeMsg: sc.welcomeMsg || '你好！欢迎体验 AI 小程序～',
          quickActions: sc.quickActions || [],
          recommendedSkills: sc.recommendedSkills || [],
          usageTip: sc.usageTip || '',
        })
      })

      // 溢出监听
      const viewCtx = wx.modelContext.getViewContext(this)
      viewCtx.on(NotificationType.Overflow, (event) => {
        console.info('[ai-mode] welcome-card overflow monitor=on')
        if (event.overflowHeight > 0) {
          console.info('[ai-mode] welcome-card overflow overflowed=true', JSON.stringify(event))
        }
      })
    },
  },

  methods: {
    render() {
      const d = this.properties.data || {}
      this.setData({
        welcomeMsg: d.welcomeMsg || '你好！欢迎体验 AI 小程序～',
        quickActions: d.quickActions || [],
        recommendedSkills: d.recommendedSkills || [],
        usageTip: d.usageTip || '',
      })
    },

    onAction(e) {
      const { action } = e.currentTarget.dataset
      this.triggerEvent('action', { action })
    },
  },
})
