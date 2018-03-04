/*
"Response time by Repository" with Repo/Issue first Response/Issue Close Time/
    PR first response/PR merge time
    over the last 45 days
    Avg/Median for each
*/
var moment = require("moment");
var values = require("object.values");
var widgetUtils = require("../widgets/widgetUtils");

if (!Object.values) { values.shim(); }
module.exports = function(options, callback) {
    var maxage = moment().add(-45, "days").format("YYYY-MM-DD");

    var orglogins = new Set();
    for (var orgname in options.org2People) {
        options.org2People[orgname].forEach(p => {
            if (p.left < maxage) return;
            orglogins.add(p.login);
        });
    }

    options.db.issue.find(
        {$or: [{closed_at: null}, {closed_at: {$gte: maxage}}]},
        {created_at: 1, closed_at: 1, repository_url: 1, pull_request: 1, url: 1})
        .sort({created_at: 1}).toArray().then(issues => {
        var issue_urls = issues.map(i => { return i.url; })
        var issuesByUrl = {};
        issues.forEach(i => {
            i.first_org_comment = null;
            issuesByUrl[i.url] = {
                created_at: moment(i.created_at),
                closed_at: i.closed_at ? moment(i.closed_at) : null,
                repository_url: i.repository_url,
                pull_request: i.pull_request
            };
        })

        // now get all comments that match
        options.db.issue_comment.find(
            {issue_url: {$in: issue_urls}, "user.login": {$in: Array.from(orglogins)}}, 
            {issue_url: 1, created_at: 1}).sort({created_at: 1}).toArray().then(comments => {

            comments.forEach(c => {
                if (!issuesByUrl[c.issue_url].first_org_comment) {
                    issuesByUrl[c.issue_url].first_org_comment = moment(c.created_at);
                }
            });

            var stats = {};
            Object.values(issuesByUrl).forEach(i => {
                var parts = i.repository_url.split("/");
                var repo = parts.slice(parts.length-2).join("/");
                if (!stats[repo]) {
                    stats[repo] = {
                        issueCloseTime: [],
                        prCloseTime: [],
                        issueFirstOrgResponse: [],
                        prFirstOrgResponse: []
                    }
                }

                if (i.pull_request) {
                    if (i.closed_at) {
                        stats[repo].prCloseTime.push(i.closed_at.diff(i.created_at, "hours"));
                    }
                    if (i.first_org_comment) {
                        var diff = i.first_org_comment.diff(i.created_at, "hours");
                        if (diff > 0) { // ignore PRs filed by org members
                            stats[repo].prFirstOrgResponse.push(diff);
                        }
                    }
                } else {
                    if (i.closed_at) {
                        stats[repo].issueCloseTime.push(i.closed_at.diff(i.created_at, "hours"));
                    }
                    if (i.first_org_comment) {
                        var diff = i.first_org_comment.diff(i.created_at, "hours");
                        if (diff > 0) { // ignore issues filed by org members
                            stats[repo].issueFirstOrgResponse.push(i.first_org_comment.diff(i.created_at, "hours"));
                        }
                    }
                }
            });

            var trs = [];

            function av(arr) {
                if (arr.length === 0) return "-";
                var res = widgetUtils.averageArray(arr);
                if (res && !isNaN(res)) {
                    return res.toFixed(2);
                }
                return res;
            }
            function me(arr) {
                if (arr.length === 0) return "-";
                var res = widgetUtils.medianArray(arr);
                if (res) return res.toFixed(2);
                return "-";
            }

            for (var repo in stats) {
                trs.push("<tr><td>" + [
                    '<a href="' + options.url("repo", repo) + '">' + repo + "</a>",
                    av(stats[repo].issueCloseTime),
                    me(stats[repo].issueCloseTime),
                    av(stats[repo].issueFirstOrgResponse),
                    me(stats[repo].issueFirstOrgResponse),
                    av(stats[repo].prCloseTime),
                    me(stats[repo].prCloseTime),
                    av(stats[repo].prFirstOrgResponse),
                    me(stats[repo].prFirstOrgResponse)
                ].join("</td>\n<td>") + "</td></tr>");
            }

            var html = "<table class='sortable'><thead><tr><th>Repository</th>\n" +
                "<th>Issue close</small></th>\n" +
                "<th>Issue close</th>\n" +
                "<th>Issue first response</th>\n" +
                "<th>Issue first response</th>\n" +
                "<th>PR close</th>\n" +
                "<th>PR close</th>\n" +
                "<th>PR first response</th>\n" +
                "<th>PR first response</th></tr>\n" +
                "<tr><th></th>\n" +
                "<th><small>(hrs, avg)</small></small></th>\n" +
                "<th><small>(hrs, mdn)</small></th>\n" +
                "<th><small>(hrs, avg)</small></th>\n" +
                "<th><small>(hrs, mdn)</small></th>\n" +
                "<th><small>(hrs, avg)</small></th>\n" +
                "<th><small>(hrs, mdn)</small></th>\n" +
                "<th><small>(hrs, avg)</small></th>\n" +
                "<th><small>(hrs, mdn)</small></th></tr>\n" +
                "</thead><tbody>" + trs.join("\n") + "</tbody><table>";

            return callback(null, {
                title: "Response time by Repository",
                html: html
            })
        }).catch(e => { callback(e); })

    }).catch(e => { callback(e); })
}