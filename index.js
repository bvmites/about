const fs = require('fs');
const read = require('read')
const gfmt = require('gfmt')
const GitHubAPI = require('github')
const template = require('handlebars').compile(fs.readFileSync('README.handlebars.md', 'utf-8'))

const getCredentials = () => new Promise((res, rej) => {
  if (process.env.GH_USERNAME && process.env.GH_PASSWORD) {
    res({
      username: process.env.GH_USERNAME,
      password: process.env.GH_PASSWORD
    })
  } else {
    read({prompt: 'Username: '}, (err, username) => {
      if (err) rej(err)
      else read({prompt: 'Password: ', silent: true, replace: '*'}, (err, password) => {
        if (err) rej(err)
        else res({username, password})
      })
    })
  }
})

const getAPI = ({username, password}) => {
  const api = new GitHubAPI()
  api.authenticate({type: 'basic', username, password})
  return api
}

const getAllMembers = api => new Promise((res, rej) => {
  const members = []
  const next = result => {
    members.push(...result.data)
    if (api.hasNextPage(result.meta.link)) api.getNextPage(result.meta.link).then(next).catch(rej)
    else Promise.all(
      members.map(member => api.users.getForUser({username: member.login}).then(({data}) => data))
    ).then(res).catch(rej)
  }
  api.orgs.getMembers({org: 'bvmites', per_page: 100}).then(next).catch(rej)
})

const updateREADME = members => {
  fs.writeFileSync('README.md', template({
    count: members.length,
    table: gfmt(members.map(member => ({
      Name: member.name || member.login,
      Profile: `[${member.login}](${member.html_url})`
    })))
  }))
}

getCredentials()
  .then(getAPI)
  .then(getAllMembers)
  .then(updateREADME)
