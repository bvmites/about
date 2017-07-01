const fs = require('fs');
const read = require('read')
const gfmt = require('gfmt')
const GitHubAPI = require('github')
const cp = require('child_process')
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
        else {
          process.env.GH_USERNAME = username
          process.env.GH_PASSWORD = password
          res({username, password})
        }
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

const commitAndPush = () => new Promise((res, rej) => {
  if (process.env.REMOTE)
    cp.exec('git reset && git add README.md && git commit -m "Update" && ' +
      `git push https://${encodeURIComponent(process.env.GH_USERNAME)}:${encodeURIComponent(process.env.GH_PASSWORD)}` +
      '@github.com/bvmites/about.git master',
      {encoding: 'utf-8'},
      (err, stdout, stderr) => {
        if (err) rej({stdout, stderr})
        else res()
      })
  else res()
})

getCredentials()
  .then(getAPI)
  .then(getAllMembers)
  .then(updateREADME)
  .then(commitAndPush)
  .catch(console.error.bind(console))
