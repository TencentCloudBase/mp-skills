const getWelcome = require('./apis/getWelcome')
const cloudInitMw = require('../_shared/mp-skills-shared/utils/cloud-init-middleware')

function registerAPIs() {
  const skill = wx.modelContext.createSkill('skills/greet-skill')
  skill.use(cloudInitMw)
  skill.registerAPI('getWelcome', getWelcome)
  console.info('[greet-skill] APIs registered')
}

registerAPIs()
