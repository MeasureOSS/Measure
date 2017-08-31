const moment = require("moment");

/* Anyone who's contributed in the last three months but not the last month */

module.exports = function(options, callback) {
    const oneMonthAgo = moment().add(-1, "month").toISOString();
    const threeMonthsAgo = moment().add(-3, "month").toISOString();
    options.db.issue_comment.distinct("user.login", {created_at:{$gte:oneMonthAgo}}, (err, recentIssueUsers) => {
        if (err) return callback(err);
        options.db.issue_comment.distinct("user.login", {created_at:{$lt:oneMonthAgo, $gt:threeMonthsAgo}}, (err, oldIssueUsers) => {
            if (err) return callback(err);
            options.db.pull_request.distinct("user.login", {created_at:{$gte:oneMonthAgo}}, (err, recentPRUsers) => {
                if (err) return callback(err);
                options.db.pull_request.distinct("user.login", {created_at:{$lt:oneMonthAgo, $gt:threeMonthsAgo}}, (err, oldPRUsers) => {
                    if (err) return callback(err);
                    let recentUsers = recentIssueUsers.concat(recentPRUsers);
                    let oldUsers = oldPRUsers.concat(oldIssueUsers);
                    let leavingUsers = [];
                    oldUsers.forEach(r => { 
                        if (recentUsers.indexOf(r) == -1) leavingUsers.push(r);
                    })
                    var result = {
                        title: "Leaving contributors",
                        list: leavingUsers.map(u => { 
                            return {html: '<a href="' + options.url("contributor", u) + '">' + u + '</a>'}; 
                        })
                    }
                    options.templates.list(result, callback);
                });
            });
        });
    })
}