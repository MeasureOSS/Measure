const moment = require("moment");

function groupby(result, keyFormat, labelFormat, durationStep, linkBase, options) {
    if (result.length == 0) { return {labels:[], datasets: []}; };

    var minGroup = "zzzzzz";
    var byGroup = {merged:{}, rejected:{}};
    result.forEach(r => {
        var dt = moment(r.dt).format(keyFormat);
        if (r.dt < minGroup) minGroup = r.dt;
        byGroup[r.merged ? "merged" : "rejected"][dt] = r.issue_count;
    });

    var datasets = {merged:[], rejected:[]};
    var links = {merged:[], rejected:[]};
    var minGroup = moment(minGroup);
    var now = moment();
    var labels = [];

    while (minGroup < now) {
        var key = minGroup.format(keyFormat);
        labels.push(minGroup.format(labelFormat));
        datasets.merged.push(byGroup.merged[key] || 0);
        datasets.rejected.push(byGroup.rejected[key] || 0);
        links.merged.push(linkBase+"?utf8=%E2%9C%93&q=is%3Apr%20is%3Amerged%20closed%3A" + minGroup.format("YYYY-MM-DD") + ".." + minGroup.add(1, durationStep).format("YYYY-MM-DD"));
        links.rejected.push(linkBase+"?utf8=%E2%9C%93&q=is%3Apr%20is%3Aclosed%20is%3Aunmerged%20closed%3A" + minGroup.format("YYYY-MM-DD") + ".." + minGroup.add(1, durationStep).format("YYYY-MM-DD"));
        minGroup.add(1, durationStep);
    }
    return {
        labels:labels, 
        datasets: [{
            label: "Merged PRs",
            data: datasets.merged,
            backgroundColor: options.COLORS[0],
            links: links.merged
        }, {
            label: "Rejected PRs",
            data: datasets.rejected,
            backgroundColor: options.COLORS[2],
            links: links.rejected
        }]
    }
}

module.exports = function(options, callback) {
    /* get one PR so that we have a repo base URL */
    options.db.pull_request.find({},{"base.repo.pulls_url":1}).limit(1).toArray().then(baseIssue => {
        if (baseIssue.length == 0) return callback();
        var linkBase = baseIssue[0].base.repo.pulls_url.replace(/\{\/number\}$/,'').replace('api.github.com/repos', 'github.com');
        /* get issue counts by month */
        options.db.pull_request.aggregate([
            { $match: { closed_at: {$ne: null} }},
            { $group: { 
                _id: { $concat: [{$substrCP: ['$created_at', 0, 7]}, {$cond: { if: "$merged", then: "-merged", else: "-unmerged"}}]},
                issue_count: {$sum: 1},
                merged: {$first:"$merged"}, 
                dt: {$first:{$substrCP:['$created_at', 0, 7]}}
            } },
            { $sort: { _id: 1 } }
        ], (err, result) => {
            if (err) return callback(err);

            var monthlyValues = groupby(result, "YYYY-MM", "MM-YYYY", "month", linkBase, options);
            monthlyValues.minimumLength = 5;
            monthlyValues.default = true;

            /* get issue counts by day */
            options.db.pull_request.aggregate([
                { $match: { closed_at: {$ne: null} }},
                { $group: { 
                    _id: { $concat: [{$substrCP: ['$closed_at', 0, 10]}, {$cond: { if: "$merged", then: "-merged", else: "-unmerged"}}]},
                    issue_count: {$sum: 1},
                    merged: {$first:"$merged"}, 
                    dt: {$first:{$substrCP:['$closed_at', 0, 10]}}
                } },
                { $sort: { _id: 1 } }
            ], (err, result) => {
                if (err) return callback(err);

                var weeklyValues = groupby(result, "YYYY-ww", "ww-YYYY", "week", linkBase, options);
                weeklyValues.minimumLength = 5;

                var graph = {
                    title: "PRs accepted and rejected this month",
                    graphdata: JSON.stringify({
                        type: "bar",
                        data: {
                            adjustable: {
                                Monthly: monthlyValues,
                                Weekly: weeklyValues,
                            }
                        },
                        options: {
                            legend: {
                                display: true,
                                position: "top",
                                labels: {
                                    boxWidth: 2,
                                    fontSize: 8,
                                    fontColor: "white"
                                }
                            },
                            scales: {
                                xAxes: [{display: true,  gridLines: {display: false}}],
                                yAxes: [{display: true,  gridLines: {color: "#666666"}, ticks: {fontColor: "white"}}]
                            }
                        }
                    })
                }
                options.templates.graph(graph, callback);
            });
        });
    }).catch(e => { callback(e); })
}
