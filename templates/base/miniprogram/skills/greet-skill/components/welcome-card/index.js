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
