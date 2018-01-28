const widgetUtils = require("../widgetUtils");
const moment = require("moment");

module.exports = function(options, callback) {
    const oneMonthAgo = moment().add(-1, "month").toISOString();
    let counts = {};

    if (!options.db.issue) {
        return callback({
            message: "There are no issues to count",
            stack: "skipping"
        });
    }

    /* Work out how many issues are open now */
    options.db.issue.count({state: "open", pull_request: null}).then(openNowCount => {
        counts.openNowCount = openNowCount;
        return options.db.issue.count({state: "open", pull_request: null, created_at: {$lt: oneMonthAgo}});
    }).then(openThenCount => {
        counts.openThenCount = openThenCount;
        return options.db.issue.count({state: "closed", pull_request: null, closed_at: {$gt: oneMonthAgo}});
    }).then(closedSinceCount => {
        counts.closedSinceCount = closedSinceCount;
        return options.db.issue.find({}, {repository_url:1}).limit(1).toArray();
    }).then(firstIssue => {
        counts.firstIssue = firstIssue;
        return options.db.issue.find({state: "open", pull_request: null}, {created_at:1}).toArray();
    }).then(openIssues => {
        var link;
        if (counts.firstIssue.length > 0) {
            link = counts.firstIssue[0].repository_url.replace('api.github.com/repos', 'github.com') + '/issues';
        }
        var now = moment();
        var ages = openIssues.map(i => {
            return now.diff(moment(i.created_at), "days");
        })

        let openAMonthAgoCount = counts.openThenCount + counts.closedSinceCount;
        let diff = ((openAMonthAgoCount < counts.openNowCount) ? "+" : "") + 
            (counts.openNowCount - openAMonthAgoCount);
        var result = {
            title: "Open Issues",
            bignumber: counts.openNowCount,
            unit: "issues",
            changename: moment().format("MMMM"),
            changeamount: diff,
            link: link,
            mean: Math.round(widgetUtils.averageArray(ages)) + " days open",
            median: Math.round(widgetUtils.medianArray(ages)) + " days open",
            pc95: Math.round(widgetUtils.pc95Array(ages)) + " days open"
        }
        options.templates.bignumberstats(result, callback);
    }).catch(e => { callback(e); });
}
