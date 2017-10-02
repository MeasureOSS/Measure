const moment = require("moment");

var fn = function(options, callback) {
    var early = [], late = [];
    options.db.issue.aggregate([
        {$project: {
            earliest: { $min: "$created_at" },
            latest:   { $max: "$created_at" }
        }}
    ], (err, issueDetails) => {
        if (err) return callback(err);
        if (issueDetails.length > 0) {
            if (issueDetails[0].earliest) { early.push(issueDetails[0].earliest); }
            if (issueDetails[0].latest) { late.push(issueDetails[0].latest); }
        }
        options.db.issue_comment.aggregate([
            {$project: {
                earliest: { $min: "$created_at" },
                latest:   { $max: "$created_at" }
            }}
        ], (err, issueCommentDetails) => {
            if (err) return callback(err);
            if (issueCommentDetails.length > 0) {
                if (issueCommentDetails[0].earliest) { early.push(issueCommentDetails[0].earliest); }
                if (issueCommentDetails[0].latest) { late.push(issueCommentDetails[0].latest); }
            }
            options.db.pull_request.aggregate([
                {$project: {
                    earliest: { $min: "$created_at" },
                    latest:   { $max: "$created_at" }
                }}
            ], (err, prDetails) => {
                if (err) return callback(err);
                if (prDetails.length > 0) {
                    if (prDetails[0].earliest) { early.push(prDetails[0].earliest); }
                    if (prDetails[0].latest) { late.push(prDetails[0].latest); }
                }
                if (early.length == 0) { return callback(); }
                if (late.length == 0) { return callback(); }
                early.sort();
                late.sort();
                var result = {
                    from_title: "First Seen",
                    from: moment(early[0]).format("YYYY-MM-DD"),
                    to_title: "Last Seen",
                    to: moment(late[late.length-1]).format("YYYY-MM-DD")
                }
                options.templates.fromto(result, callback);
            });
        });
    })
}
fn.extraClasses = "wide";
module.exports = fn;