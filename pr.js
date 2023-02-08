const { Octokit } = require("@octokit/rest");
const axios = require("axios");

const sleep = function (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
function updateAirtableRecord1(base, tableName, dataList) {
  let ret = true;
  base(tableName).update(dataList, function (err, _records) {
    if (err) {
      console.error(err);
      ret = false;
      return;
    }
  });
  return ret;
}

async function updateAirtableRecord(url, dataList, airtableApiKey) {
  let tryagain = true;
  while (tryagain) {
    try {
      await axios.patch(
        url,
        { records: dataList },
        {
          headers: {
            Authorization: `Bearer ${airtableApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      tryagain = false;
    } catch (e) {
      console.log(e);
      tryagain = true;
    }
  }
}
async function createAirtableRecord(url, dataList, airtableApiKey) {
  let tryagain = true;
  while (tryagain) {
    try {
      await axios.post(
        url,
        { records: dataList },
        {
          headers: {
            Authorization: `Bearer ${airtableApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      tryagain = false;
    } catch (e) {
      console.log(e);
      tryagain = true;
    }
  }
}
exports.syncAirtableWithRest = async function (argv) {
  const octokit = new Octokit({
    auth: `${argv.token}`,
  });
  console.log("start get pr");
  let currentPage = 1; //当前页，初始化为1
  const maxPerPage = 100;
  const repoList = new Map();
  let urlData = "https://api.airtable.com/v0/appAdi5zFFEsCzmEM/data";
  let urlPr =
    "https://api.airtable.com/v0/appAdi5zFFEsCzmEM/pull%20request%20state";
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
  console.log(repoList.size);

  const airtableDataMap = new Map();
  const airtablePrMap = new Map();

  const airtableApiKey = argv.apiKey;
  const Airtable = require("airtable");
  const base = new Airtable({ apiKey: airtableApiKey }).base(
    "appAdi5zFFEsCzmEM"
  );
  let dataRecCount = 0;
  let prRecCount = 0;
  let offset = null;
  do {
    let url =
      "https://api.airtable.com/v0/appAdi5zFFEsCzmEM/data?pageSize=100&view=Grid%20view&offset=";
    if (!!offset) {
      url += offset;
    }
    let tryagain = true;
    while (tryagain) {
      try {
        const resp = await axios.get(url, {
          headers: { Authorization: `Bearer ${airtableApiKey}` },
        });
        resp.data.records.forEach((it) => {
          airtableDataMap.set(it.fields.url, it.id);
          // console.log(it.fields.url, " ", it.id);
          dataRecCount++;
        });
        offset = resp.data.offset;
        console.log("data offset:", offset);
        tryagain = false;
      } catch (e) {
        console.error(e);
        tryagain = true;
      }
    }
  } while (offset);
  console.log(`airtable data has "${dataRecCount}" item`);
  offset = null;
  do {
    let url =
      "https://api.airtable.com/v0/appAdi5zFFEsCzmEM/pull%20request%20state?pageSize=100&view=Grid%20view&offset=";
    if (!!offset) {
      url += offset;
    }
    let tryagain = true;
    while (tryagain) {
      try {
        const resp = await axios.get(url, {
          headers: { Authorization: `Bearer ${airtableApiKey}` },
        });
        resp.data.records.forEach((it) => {
          airtablePrMap.set(it.fields.Url, it.id);
          // console.log(it.fields.url, " ", it.id);
          prRecCount++;
        });
        offset = resp.data.offset;
        console.log("pr offset:", offset);
        tryagain = false;
      } catch (e) {
        console.error(e);
        tryagain = true;
      }
    }
  } while (offset);
  console.log(`airtable pr has "${prRecCount}" item`);

  let postCount = 0;
  let dataCount = 0;
  let prCount = 0;
  let dataCreateCount = 0;
  let prCreateCount = 0;
  let dataList = [];
  let prList = [];
  let dataCreateList = [];
  let prCreateList = [];
  for (const [repoName, owner] of repoList) {
    // console.log(repoName);
    // if (repoName != "kfx-broker-tora-option") {
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

      console.log(pulls.data.length);
      for (let i = 0; i < pulls.data.length; i++) {
        try {
          const item = pulls.data[i];
          const prId = airtablePrMap.get(item.html_url);
          const dataId = airtableDataMap.get(item.html_url);
          console.log("dataId ", dataId);
          console.log("prId ", prId);
          if (!!dataId) {
            dataList.push({
              id: dataId,
              fields: {
                url: item.html_url,
                pull_request: JSON.stringify({ pull_request: item }),
              },
            });
          } else {
            dataCreateList.push({
              fields: {
                url: item.html_url,
                pull_request: JSON.stringify({ pull_request: item }),
              },
            });
          }
          if (!!prId) {
            const reviewer = [];
            item.requested_reviewers.forEach((it) => {
              reviewer.push(it.login);
            });
            prList.push({
              id: prId,
              fields: {
                Url: item.html_url,
                Creator: item.user.login,
                Reviewer: reviewer.toString(),
                Repo: item.base.repo.name,
                State: item.state,
                "Last Modified": item.updated_at,
              },
            });
          } else {
            if (item.state != "closed") {
              const reviewer = [];
              item.requested_reviewers.forEach((it) => {
                reviewer.push(it.login);
              });
              prCreateList.push({
                fields: {
                  Url: item.html_url,
                  Creator: item.user.login,
                  Reviewer: reviewer.toString(),
                  Repo: item.base.repo.name,
                  State: item.state,
                  "Last Modified": item.updated_at,
                },
              });
            }
          }
        } catch (e) {
          continue;
        }
        if (dataList.length == 10) {
          await updateAirtableRecord(urlData, dataList, argv.apiKey);
          postCount++;
          // if (postCount % 5 === 0) {
          //   await new Promise((resolve) => setTimeout(resolve, 1000));
          // }
          dataList = [];
          dataCount += 10;
          console.log("update ", dataCount, "data table");
        }
        if (dataCreateList.length == 10) {
          await createAirtableRecord(urlData, dataCreateList, argv.apiKey);
          postCount++;
          dataCreateList = [];
          dataCreateCount += 10;
          console.log("create ", dataCreateCount, "data table");
        }
        if (prList.length == 10) {
          await updateAirtableRecord(urlPr, prList, argv.apiKey);
          postCount++;
          prList = [];
          prCount += 10;
          console.log("update ", prCount, "pr table");
        }
        if (prCreateList.length == 10) {
          await createAirtableRecord(urlPr, prCreateList, argv.apiKey);
          postCount++;
          prCreateList = [];
          prCreateCount += 10;
          console.log("create ", prCreateCount, "pr table");
        }
      }

      if (pulls.data.length < maxPerPage) {
        break;
      }
      curPage++;
    }
  }
  if (dataList.length > 0) {
    await updateAirtableRecord(urlData, dataList, argv.apiKey);
    postCount++;
    dataCount += dataList.length;
    dataList = [];
    console.log("update ", dataCount, "data table");
  }
  if (dataCreateList.length > 0) {
    await createAirtableRecord(urlData, dataCreateList, argv.apiKey);
    postCount++;
    dataCreateCount += dataCreateList.length;
    dataCreateList = [];
    console.log("create ", dataCreateCount, "data table");
  }
  if (prList.length > 0) {
    await updateAirtableRecord(urlPr, prList, argv.apiKey);
    postCount++;
    prCount += prList.length;
    prList = [];
    console.log("update ", prCount, "pr table");
  }
  if (prCreateList.length > 0) {
    await createAirtableRecord(urlPr, prCreateList, argv.apiKey);
    postCount++;
    prCreateCount += prCreateList.length;
    prCreateList = [];
    console.log("create ", prCreateCount, "pr table");
  }
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
          try {
            await axios.post(
              "https://hooks.zapier.com/hooks/catch/14417843/3ybdcab/",
              {
                pull_request: pulls.data[i],
              }
            );
            tryagain = false;
          } catch (e) {
            console.error(
              `sync ${repoName} fail in pull id ${curPage * 100 + i}`
            );
            tryagain = true;
          }
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
