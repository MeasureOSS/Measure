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
    }).then(firstIssue => {;
        var link;
        if (firstIssue.length > 0) {
            link = firstIssue[0].repository_url.replace('api.github.com/repos', 'github.com') + '/issues';
        }

        let openAMonthAgoCount = counts.openThenCount + counts.closedSinceCount;
        let diff = ((openAMonthAgoCount < counts.openNowCount) ? "+" : "") + 
            (counts.openNowCount - openAMonthAgoCount);
        var result = {
            title: "Open Issues",
            bignumber: counts.openNowCount,
            unit: "issues",
            changename: moment().format("MMMM"),
            changeamount: diff,
            link: link
        }
        options.templates.bignumber(result, callback);
    }).catch(e => { callback(e); });
}