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
    options.db.issue.count({state: "open"}).then(openNowCount => {
        counts.openNowCount = openNowCount;
        return options.db.issue.count({state: "open", created_at: {$lt: oneMonthAgo}});
    }).then(openThenCount => {
        counts.openThenCount = openThenCount;
        return options.db.issue.count({state: "closed", closed_at: {$gt: oneMonthAgo}});
    }).then(closedSinceCount => {
        counts.closedSinceCount = closedSinceCount;
        let openAMonthAgoCount = counts.openThenCount + counts.closedSinceCount;
        let diff = ((openAMonthAgoCount < counts.openNowCount) ? "+" : "") + 
            (counts.openNowCount - openAMonthAgoCount);
        var result = {
            title: "Open Issues",
            bignumber: counts.openNowCount,
            unit: "issues",
            changename: moment().format("MMMM"),
            changeamount: diff
        }
        options.templates.bignumber(result, callback);
    }).catch(e => { callback(e); });
}