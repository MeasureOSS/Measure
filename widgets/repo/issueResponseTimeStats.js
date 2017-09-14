const moment = require("moment");
const widgetUtils = require("../widgetUtils");

module.exports = function(options, callback) {
    options.db.issue.find({pull_request: null}, {created_at:1,url:1}).toArray().then(issues => {
        // Find, for each issue, the first comment for it
        // https://stackoverflow.com/a/38336293/1418014
        options.db.issue_comment.aggregate([
            { $sort: { issue_url: 1, created_at: 1 } },
            { $group: { _id: "$issue_url", d: { $first: "$$ROOT" } } },
            { $project: { "d.issue_url": 1, "d.created_at": 1 } }
        ], (err, comments) => {
            if (err) return callback(err);

            // pair up issues and first issue comment
            var pairs = {};
            issues.forEach(is => {
                pairs[is.url] = {issue_created: moment(is.created_at)}
            });
            comments.forEach(co => {
                if (pairs[co.d.issue_url]) {
                    pairs[co.d.issue_url].comment_created = moment(co.d.created_at);
                }
            })
            var diffs = [];
            for (k in pairs) {
                if (pairs[k].comment_created) {
                    diffs.push({
                        diff: pairs[k].comment_created.diff(pairs[k].issue_created),
                        groupDate: pairs[k].issue_created
                    })
                }
            }
            var res = widgetUtils.groupDiffsByTimePeriods(diffs);

            var hoursToRespondLine;
            if (options.config.hoursToRespond) {
                hoursToRespondLine = {
                    drawTime: 'afterDatasetsDraw', // (default)
                    events: [],
                    annotations: [{
                        type: 'line',
                        mode: 'horizontal',
                        scaleID: 'y-axis-0',
                        value: options.config.hoursToRespond,
                        borderColor: 'red',
                        borderWidth: 2
                    }]
                };
            };

            var graph = {
                title: "First issue response",
                graphdata: JSON.stringify({
                    type: "line",
                    data: {
                        adjustable: {
                            monthly: {
                                default: true,
                                minimumLength: 5,
                                labels: res.monthly.labels,
                                datasets: [
                                    {
                                        data: res.monthly.data.map(n => Math.round(n.average.value / 1000 / 60 / 60)),
                                        borderColor: "#3ccf53",
                                        label: "Average (hrs)"
                                    }, {
                                        data: res.monthly.data.map(n => Math.round(n.median.value / 1000 / 60 / 60)),
                                        borderColor: "#AC8D1C",
                                        label: "Median (hrs)"
                                    }, {
                                        data: res.monthly.data.map(n => Math.round(n.pc95.value / 1000 / 60 / 60)),
                                        borderColor: "#4150F8",
                                        label: "95th percentile (hrs)"
                                    }
                                ]
                            },
                            weekly: {
                                minimumLength: 5,
                                labels: res.weekly.labels,
                                datasets: [
                                    {
                                        data: res.weekly.data.map(n => Math.round(n.average.value / 1000 / 60 / 60)),
                                        borderColor: "#3ccf53",
                                        labels: "Average"
                                    }, {
                                        data: res.weekly.data.map(n => Math.round(n.median.value / 1000 / 60 / 60)),
                                        borderColor: "#AC8D1C",
                                        label: "Median (hrs)"
                                    }, {
                                        data: res.weekly.data.map(n => Math.round(n.pc95.value / 1000 / 60 / 60)),
                                        borderColor: "#4150F8",
                                        label: "95th percentile (hrs)"
                                    }
                                ]
                            }
                        }
                    },
                    options: {
                        scales: {
                            xAxes: [{display: true}],
                            yAxes: [{display: false}]
                        },
                        annotation: hoursToRespondLine
                    }
                })
            }
            options.templates.graph(graph, callback);

        })
    }).catch(e => { callback(e); })
}