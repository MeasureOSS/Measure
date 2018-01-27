const widgetUtils = require("../widgetUtils");
const moment = require("moment");

module.exports = function(options, callback) {
    const oneMonthAgo = moment().add(-1, "month").toISOString();
    let counts = {};

    if (!options.db.pull_request) {
        return callback({
            message: "There are no PRs to count",
            stack: "skipping"
        });
    }

    /* Work out how many PRs are open now */
    options.db.pull_request.count({state: "open"}).then(openNowCount => {
        counts.openNowCount = openNowCount;
        return options.db.pull_request.count({state: "open", created_at: {$lt: oneMonthAgo}});
    }).then(openThenCount => {
        counts.openThenCount = openThenCount;
        return options.db.pull_request.count({state: "closed", closed_at: {$gt: oneMonthAgo}});
    }).then(closedSinceCount => {
        counts.closedSinceCount = closedSinceCount;
        return options.db.issue.find({}, {repository_url:1}).limit(1).toArray();
    }).then(firstIssue => {;
        counts.firstIssue = firstIssue;
        return options.db.pull_request.find({state: "open"}, {created_at:1}).toArray();
    }).then(openPRs => {
        var link;
        if (counts.firstIssue.length > 0) {
            link = counts.firstIssue[0].repository_url.replace('api.github.com/repos', 'github.com') + '/pulls';
        }
        var now = moment();
        var ages = openPRs.map(i => {
            return now.diff(moment(i.created_at), "days");
        })

        let openAMonthAgoCount = counts.openThenCount + counts.closedSinceCount;
        let diff = ((openAMonthAgoCount < counts.openNowCount) ? "+" : "") + 
            (counts.openNowCount - openAMonthAgoCount);
        var result = {
            title: "Open PRs",
            bignumber: counts.openNowCount,
            unit: "Pull Requests",
            changename: moment().format("MMMM"),
            changeamount: diff,
            mean: Math.round(widgetUtils.averageArray(ages)) + " days open",
            median: Math.round(widgetUtils.medianArray(ages)) + " days open",
            pc95: Math.round(widgetUtils.pc95Array(ages)) + " days open"
        };
        if (options.limitedTo) result.link = link; // so we don't get a link on the root page
        options.templates.bignumberstats(result, callback);
    }).catch(e => { callback(e); });
}