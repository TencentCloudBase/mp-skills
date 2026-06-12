// index.js — Skill 注册入口
const greet = require('./apis/greet')

function registerAPIs() {
  const skill = wx.modelContext.createSkill('skills/my-skill')
  skill.registerAPI('greet', greet)
  console.info('[my-skill] APIs registered')
}

registerAPIs()
