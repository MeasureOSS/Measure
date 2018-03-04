/*
"Outside contributions in last 30 days" listed by repo with an overall total
*/
var moment = require("moment");
var entries = require("object.entries");
if (!Object.entries) { entries.shim(); }

module.exports = function(options, callback) {
    var days = 30;
    var maxage = moment().add(-days, "days").format("YYYY-MM-DD");

    var myorglogins = new Set();
    for (var orgname in options.org2People) {
        if (options.config.my_organizations.indexOf(orgname) == -1) continue;
        options.org2People[orgname].forEach(p => {
            if (p.left != "" && (p.left < maxage)) return;
            myorglogins.add(p.login);
        });
    }
    myorglogins = Array.from(myorglogins);

    options.db.issue.find(
        {"user.login": {$nin: myorglogins}, created_at: {$gte: maxage}},
        {created_at: 1, closed_at: 1, repository_url: 1, pull_request: 1, url: 1, "user.login": 1})
        .sort({created_at: 1}).toArray().then(issues => {

            var issuesByRepo = {}, prsByRepo = {}, repos = {};
            issues.forEach(i => {
                var repo = i.repository_url.split("/").slice(-2).join("/");
                if (!repos[repo]) repos[repo] = 0;
                repos[repo] += 1;
                if (i.pull_request) {
                    if (!prsByRepo[repo]) prsByRepo[repo] = {};
                    if (!prsByRepo[repo][i.user.login]) prsByRepo[repo][i.user.login] = [];
                    prsByRepo[repo][i.user.login].push(i);
                } else {
                    if (!issuesByRepo[repo]) issuesByRepo[repo] = {};
                    if (!issuesByRepo[repo][i.user.login]) issuesByRepo[repo][i.user.login] = [];
                    issuesByRepo[repo][i.user.login].push(i);
                }
            })

            var repos = Object.entries(repos).sort((a,b) => { return b[1] - a[1]; })
            var total = repos.map(r => { return r[1]; }).reduce((a, b) => a + b, 0);

            var html = [];

            html.push("<h2>Total contributions in last " + days + " days: " + total + "</h2>");

            repos.forEach(rc => {
                var repo = rc[0], count = rc[1];
                html.push("<details><summary><h2>" + repo + " (" + count + " contributions)</h2></summary>");
                html.push("<ul>");
                var logins = new Set([...Object.keys(prsByRepo[repo] || {}), ...Object.keys(issuesByRepo[repo] || {})]);
                var lis = [];
                Array.from(logins.values()).forEach(l => {
                    var issues = [];
                    if (issuesByRepo[repo]) issues = issuesByRepo[repo][l] || [];
                    var closed_issues = issues.filter(issue => { return issue.closed_at; })
                    var prs = [];
                    if (prsByRepo[repo]) prs = prsByRepo[repo][l] || [];
                    var closed_prs = prs.filter(pr => { return pr.closed_at; })
                    var data = "";
                    var prdata = prs.length + " PR" + (prs.length == 1 ? "" : "s");
                    if (closed_prs.length === 0 && prs.length == 1) {
                        prdata += " (still open)";
                    } else if (closed_prs.length === 0) {
                        prdata += " (all still open)";
                    } else if (closed_prs.length == prs.length && prs.length == 1) {
                        prdata += " (since closed)";
                    } else if (closed_prs.length == prs.length) {
                        prdata += " (all since closed)";
                    } else {
                        prdata += " (" + closed_prs.length + " closed)";
                    }

                    var issuedata = issues.length + " issue" + (issues.length == 1 ? "" : "s");
                    if (closed_issues.length === 0 && issues.length == 1) {
                        issuedata += " (still open)";
                    } else if (closed_issues.length === 0) {
                        issuedata += " (all still open)";
                    } else if (closed_issues.length == issues.length && issues.length == 1) {
                        issuedata += " (since closed)";
                    } else if (closed_issues.length == issues.length) {
                        issuedata += " (all since closed)";
                    } else {
                        issuedata += " (" + closed_issues.length + " closed)";
                    }

                    if (issues.length == 0) {
                        data = prdata;
                    } else if (prs.length == 0) {
                        data = issuedata;
                    } else {
                        data = prdata + " and " + issuedata;
                    }
                    lis.push(["<li>" + data + " by " + l + "</li>", issues.length + prs.length])
                });
                lis.sort((a,b) => { return b[1] - a[1]; })
                html = html.concat(lis.map(li => { return li[0]; }));
                html.push("</ul></details>");
            });

            return callback(null, {
                title: "Recent outside contributions",
                html: html.join("\n")
            })
        }).catch(e => { callback(e); })
}