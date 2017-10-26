const moment = require("moment");

module.exports = function(options, callback) {
    const oneMonthAgo = moment().add(-1, "month").minute(0).second(0).millisecond(0).toISOString();
    let counts = {};

    if (!options.db.issue) {
        return callback({
            message: "There are no issues to count",
            stack: "skipping"
        });
    }

    /* Work out how many issues are closed now */
    options.db.issue.count({state: "closed", pull_request: null}).then(closedNowCount => {
        counts.closedNowCount = closedNowCount;
        return options.db.issue.count({state: "closed", pull_request: null, closed_at: {$lt: oneMonthAgo}});
    }).then(closedThenCount => {
        counts.closedThenCount = closedThenCount;
        return options.db.issue.find({}, {repository_url:1}).limit(1).toArray();
    }).then(firstIssue => {;
        var link;
        if (firstIssue.length > 0) {
            link = firstIssue[0].repository_url.replace('api.github.com/repos', 'github.com') + '/issues';
        }

        let diff = counts.closedNowCount - counts.closedThenCount;
        var result = {
            title: "Closed Issues",
            bignumber: counts.closedNowCount,
            unit: "issues",
            changename: moment().format("MMMM"),
            changeamount: diff,
            link: link
        }
        options.templates.bignumber(result, callback);
    }).catch(e => { callback(e); });
}