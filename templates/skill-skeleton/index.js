// index.js — Skill 注册入口
const greet = require('./apis/greet')
const cloudMw = require('../_shared/mp-skills-shared/utils/cloud-middleware')

function registerAPIs() {
  const skill = wx.modelContext.createSkill('skills/my-skill')
  skill.use(cloudMw)
  skill.registerAPI('greet', greet)
  console.info('[my-skill] APIs registered')
}

registerAPIs()
