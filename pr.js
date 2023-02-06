const { Octokit } = require("@octokit/rest");
const axios = require("axios");

const sleep = function (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
exports.getPrWithRest = async function (argv) {
  const octokit = new Octokit({
    auth: `${argv.token}`,
  });
  console.log("start get pr");
  let hasNextPage = false; //是否有下一页，初始化为假
  let currentPage = 1; //当前页，初始化为1
  const maxPerPage = 100;
  const repoList = new Map();
  while (true) {
    const repos = await octokit.rest.repos.listForOrg({
      org: "kungfu-trader",
      per_page: maxPerPage,
      page: currentPage,
    });
    repos.data.forEach((it) => {
      repoList.set(it.name, it.owner.login);
    });
    if (repos.data.length < maxPerPage) {
      break;
    }
    currentPage++;
  }
  let postCount = 0;
  console.log(`repo numbers: ${repoList.size}`);
  for (const [repoName, owner] of repoList) {
    console.log(repoName, " .  ", owner);
    // if(repoName != "kfx-broker-tora-option"){
    //   continue;
    // }
    let curPage = 1;
    while (true) {
      const pulls = await octokit.rest.pulls.list({
        state: "all",
        owner: owner,
        repo: repoName,
        per_page: maxPerPage,
        page: curPage,
      });
      for (let i = 0; i < pulls.data.length; i++) {
        let tryagain = true;
        while (tryagain) {
          axios
            .post("https://hooks.zapier.com/hooks/catch/14417843/3ybdcab/", {
              pull_request: pulls.data[i],
            })
            .then((resp) => {
              tryagain = false;
            })
            .catch((err) => {
              console.error(
                `sync ${repoName} fail in pull id ${curPage * 100 + i}`
              );
              tryagain = true;
            });
          postCount++;
          if (postCount % 5 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
      if (pulls.data.length < maxPerPage) {
        break;
      }
      curPage++;
    }
  }
};

exports.getPrWithGraphQL = async function (argv) {
  const octokit = new Octokit({
    auth: `${argv.token}`,
  });
  console.log("start get pr");
  let endCursor = null;
  let hasNextPage = true;
  while (hasNextPage) {
    let graphRefs = await octokit.graphql(`
    query{
        organization(login: "kungfu-trader") {
            repositories(first: 20, after: ${endCursor}) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  name
                  pullRequests(last: 2) {
                    nodes {
                      url
                      state
                    }
                  }
                }
              }
            }
        }
    }
        `);
    hasNextPage = graphRefs.organization.repositories.pageInfo.hasNextPage;
    endCursor =
      '"' + graphRefs.organization.repositories.pageInfo.endCursor + '"';

    const prs = graphRefs.organization.repositories.edges[0].node.pullRequests;
    // console.log(`prs = ${prs}`)
    if (prs && prs.nodes.length > 0) {
      console.log(prs);
    }
    // break;
  }
};
