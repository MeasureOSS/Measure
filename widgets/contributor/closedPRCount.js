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

    /* Work out how many pull_requests are closed now */
    options.db.pull_request.count({state: "closed"}).then(closedNowCount => {
        counts.closedNowCount = closedNowCount;
        return options.db.pull_request.count({state: "closed", closed_at: {$lt: oneMonthAgo}});
    }).then(closedThenCount => {
        counts.closedThenCount = closedThenCount;
        return options.db.issue.find({}, {repository_url:1}).limit(1).toArray();
    }).then(firstIssue => {;
        var link;
        if (firstIssue.length > 0) {
            link = firstIssue[0].repository_url.replace('api.github.com/repos', 'github.com') + '/pulls';
        }

        let diff = counts.closedNowCount - counts.closedThenCount;
        var result = {
            title: "Closed PRs",
            bignumber: counts.closedNowCount,
            unit: "pull requests",
            changename: moment().format("MMMM"),
            changeamount: diff,
            link: link
        }
        options.templates.bignumber(result, callback);
    }).catch(e => { callback(e); });
}