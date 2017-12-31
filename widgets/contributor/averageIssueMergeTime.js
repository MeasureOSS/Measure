const moment = require("moment");
const widgetUtils = require("../widgetUtils");

module.exports = function(options, callback) {
    /* Get PRs that are closed */
    options.db.issue.find({closed_at: { $ne: null }, pull_request: null}, {closed_at:1}).toArray().then(issues => {
        var now = moment();
        var ages = issues.map(pr => {
            return now.diff(moment(pr.closed_at), "days");
        })
        var avg = Math.round(widgetUtils.averageArray(ages));
        var result = {
            title: "Average time to close an issue",
            bignumber: avg,
            unit: "days",
            mean: Math.round(widgetUtils.averageArray(ages)) + " days open",
            median: Math.round(widgetUtils.medianArray(ages)) + " days open",
            pc95: Math.round(widgetUtils.pc95Array(ages)) + " days open"
        }
        options.templates.bignumberstats(result, callback);
    }).catch(e => { callback(e); });
}