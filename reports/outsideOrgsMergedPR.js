/*
"Outside Organizations that have had a PR merged in the last 30 days" 
($OutsideOrg - # of PRs merged)
*/
var moment = require("moment");

module.exports = function(options, callback) {
    var days = 30;
    var maxage = moment().add(-days, "days").format("YYYY-MM-DD");

    var orglogins = new Set(), people2Org = {}, orgsWith = {};
    for (var orgname in options.org2People) {
        if (options.config.my_organizations.indexOf(orgname) != -1) continue;
        options.org2People[orgname].forEach(p => {
            if (p.left != "" && p.left < maxage) return; 
            orglogins.add(p.login);
            if (!people2Org[p.login]) people2Org[p.login] = new Set();
            people2Org[p.login].add(orgname);
            if (!orgsWith[orgname]) orgsWith[orgname] = 0;
        });
    }
    orglogins = Array.from(orglogins);

    options.db.pull_request.find(
        {"user.login": {$in: orglogins}, "merged_at": {$gte: maxage}},
        {"user.login": 1})
        .toArray().then(prs => {

            prs.forEach(pr => {
                people2Org[pr.user.login].forEach(orgname => {
                    orgsWith[orgname] += 1;
                })
            })

            var html = [];
            var lis = [];
            Object.keys(orgsWith).forEach(orgname => {
                if (orgsWith[orgname] > 0) {
                    lis.push('<li><a href="' + options.url("org", orgname) + '">' + orgname + '</a>' + 
                        " (" + orgsWith[orgname] + " PRs merged)");
                }
            });
            if (lis.length == 0) {
                html.push("<p>No outside organizations have had a PR merged recently.</p>");
            } else {
                lis.sort((a, b) => { return b[1] - a[1]; })
                html.push("<ul>");
                html = html.concat(lis.map(li => { return lis[0]; }))
                html.push("</ul>");
            }


            return callback(null, {
                title: "Outside Organizations with a merged PR in the last " + days + " days",
                html: html.join("\n")
            })
        })

}