const fs = require('fs')
const crypto = require('crypto')
const Mustache = require('mustache')
const table = require('markdown-table')
const GitHub = require('github')

const gh = new GitHub()
gh.authenticate({type: 'token', token: process.env.TOKEN})

const template = fs.readFileSync('README.mustache', 'utf-8')
Mustache.parse(template)

const replicate = (n, v) => {
  let a = new Array(n), i
  for (i = 0; i < n; i++) a[i] = v
  return a
}

const sign = content => 'sha1=' + crypto.createHmac('sha1', process.env.SECRET).update(content).digest('hex')

const getMembers = () => {
  let results = []
  const nextPage = result => {
    results = results.concat(result.data)
    return gh.hasNextPage(result.meta.link) ? gh.getNextPage(result.meta.link).then(nextPage) : results
  }
  return gh.orgs.getMembers({org: 'bvmites', per_page: 100}).then(nextPage)
}

const getView = members => {
  const maxColumns = 5, maxRows = Math.ceil(members.length / maxColumns), maxIndex = members.length,
    header = replicate(maxColumns, 'Profile'), body = new Array(maxRows)

  let row, column, index

  for (row = 0, column = 0, index = 0; row < maxRows; row++) {
    body[row] = new Array(maxColumns)
    for (column = 0; column < maxColumns && index < maxIndex; column++, index++)
      body[row][column] = `[${members[index].login}](${members[index].html_url})`
  }

  return {count: members.length, members: table([header].concat(body), {align: replicate(maxColumns, 'c')})}
}

const updateREADME = members =>
  gh.repos.getContent({
    owner: 'bvmites',
    repo: 'about',
    path: 'README.md'
  }).then(({data: {sha}}) => gh.repos.updateFile({
    owner: 'bvmites',
    repo: 'about',
    path: 'README.md',
    message: 'Update',
    sha,
    content: Buffer.from(Mustache.render(template, getView(members))).toString('base64')
  }))

module.exports = {
  memberAdded: (event, context, callback) => {
    const ghEvent = event.headers['X-GitHub-Event'] || event.headers['x-github-event']
    const signature = event.headers['X-Hub-Signature'] || event.headers['x-hub-signature']
    if (ghEvent === 'organization')
      if (sign(event.body) !== signature) callback(null, {statusCode: 400})
      else {
        const body = JSON.parse(event.body)
        if (body.action !== 'member_added' || body.action !== 'member_removed')
          callback(null, {statusCode: 200})
        else
          getMembers().then(updateREADME)
            .then(() => callback(null, {statusCode: 200}))
            .catch(error => callback(error))
      }
    else if (ghEvent === 'ping')
      if (sign(event.body) !== signature) callback(null, {statusCode: 400})
      else callback(null, {statusCode: 200})
    else callback(null, {statusCode: 400})
  }
}
