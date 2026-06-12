const getWelcome = require('./apis/getWelcome')
const cloudMw = require('../_shared/mp-skills-shared/utils/cloud-middleware')

function registerAPIs() {
  const skill = wx.modelContext.createSkill('skills/greet-skill')
  skill.use(cloudMw)
  skill.registerAPI('getWelcome', getWelcome)
  console.info('[greet-skill] APIs registered')
}

registerAPIs()
