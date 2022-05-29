async function listPullRequests(github, context) {
  const { baseBranch, limit } = process.env
  return (await github.rest.pulls.list({
    owner: context.repo.owner,
    repo: context.repo.repo,
    base: baseBranch,
    per_page: limit,
    state: "open",
    sort: "created",
    direction: "desc",
  })).data
}

async function filterPullRequests(github, context, prs) {
  const { labels } = process.env
  const targetLabels = labels.split(",")
  const labeledPrs = prs.filter(pr => {
    if (pr.labels.length === 0) return false

    const allLabels = pr.labels.concat(targetLabels)
    return new Set(allLabels).size != allLabels.size
  })

  let targetPrs = []
  for (const pr of labeledPrs) {
    const outdated = await isOutdated(github, context, pr.number)
    if (outdated) {
      targetPrs.push(pr)
    }
  }
  return targetPrs
}

async function isOutdated(github, context, prNumber) {
  const pr = (await github.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: prNumber
  })).data
  const res = (await github.rest.repos.compareCommitsWithBasehead({
    owner: context.repo.owner,
    repo: context.repo.repo,
    basehead: `${pr.base.sha}...${pr.head.sha}`
  })).data

  /* https://github.com/palantir/bulldozer/blob/develop/bulldozer/update.go#L50-L53 */
  return res.behind_by != 0
}

async function updateBranches(github, context, prNumbers) {
  for (const prNum of prNumbers) {
    try {
      const res = await github.rest.pulls.updateBranch({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: prNum
      })
      console.log(`Updated #${prNum}:`, res.data)
    } catch (err) {
      console.error(`Failed #${prNum}`, err.response.data)
    }
  }
}

async function main(github, context) {
  const prs = await listPullRequests(github, context)
  const targets = await filterPullRequests(github, context, prs)
  const prNumbers = targets.map(t => t.number)
  console.log("target PR:", prNumbers)

  const { dryRun } = process.env
  if (!(dryRun.toLowerCase() === "true")) {
    await updateBranches(github, context, prNumbers)
  }
}

module.exports = async ({github, context}) => {
  await main(github, context)
}
