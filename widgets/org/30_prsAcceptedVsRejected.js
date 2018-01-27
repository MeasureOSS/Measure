const moment = require("moment");
const querystring = require("querystring");

module.exports = function(options, callback) {
    /* Work out how many pull_requests are closed now */
    var rejectedCount;
    options.db.pull_request.count({state: "closed", merged_at: null}).then(rc => {
        rejectedCount = rc;
        return options.db.pull_request.count({state: "closed", merged_at: { $ne: null }});
    }).then(acceptedCount => {
        var link;
        
        /*
        if (firstIssue.length > 0) {
            link = firstIssue[0].repository_url.replace('api.github.com/repos', 'github.com') + '/pulls';
        }
        */

        var total = acceptedCount + rejectedCount;
        var apc = 0, rpc = 0;
        if (total > 0) {
            apc = (100 * acceptedCount / total).toFixed(0);
            rpc = (100 * rejectedCount / total).toFixed(0);
        }
        var result = {
            title: "PRs accepted/rejected",
            bignumber: acceptedCount + " / " + rejectedCount,
            unit: apc + "% accepted / rejected " + rpc + "%"
        }
        if (Array.isArray(options.limitedTo)) {
            // this is an org or some other collection, so we can't
            // link to PRs by them sensibly
        } else {
            var search = "is:pr author:" + options.limitedTo + " archived:false is:closed " +
                options.config.github_repositories.map(r => { return "repo:" + r; }).join(" ");
            result.link = "https://github.com/pulls?" + querystring.stringify({q: search, utf8: "✓"});
        }
        options.templates.bignumber(result, callback);
    }).catch(e => { callback(e); });
}