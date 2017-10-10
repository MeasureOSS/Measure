const moment = require("moment");

function groupby(result, keyFormat, labelFormat, durationStep, linkBase, options) {
    if (result.length == 0) { return {labels:[], datasets: []}; };

    var minGroup = "zzzzzz";
    var byGroup = {open:{}, closed:{}};
    result.forEach(r => {
        var dt = moment(r.dt).format(keyFormat);
        if (r.dt < minGroup) minGroup = r.dt;
        byGroup[r.state][dt] = r.issue_count;
    });

    var datasets = {open:[], closed:[]};
    var links = {open:[], closed:[]};
    var minGroup = moment(minGroup);
    var now = moment();
    var labels = [];
    while (minGroup < now) {
        var key = minGroup.format(keyFormat);
        labels.push(minGroup.format(labelFormat));
        datasets.open.push(byGroup.open[key] || 0);
        datasets.closed.push(byGroup.closed[key] || 0);
        links.open.push(linkBase+"?utf8=%E2%9C%93&q=is%3Apr%20is%3Aopen%20created%3A" + minGroup.format("YYYY-MM-DD") + ".." + minGroup.add(1, durationStep).format("YYYY-MM-DD"));
        links.closed.push(linkBase+"?utf8=%E2%9C%93&q=is%3Apr%20is%3Aclosed%20created%3A" + minGroup.format("YYYY-MM-DD") + ".." + minGroup.add(1, durationStep).format("YYYY-MM-DD"));
        minGroup.add(1, durationStep);
    }
    return {
        labels:labels, 
        datasets: [{
            label: "Opened issues",
            data: datasets.open,
            backgroundColor: options.COLORS[0],
            links: links.open
        }, {
            label: "Closed issues",
            data: datasets.closed,
            backgroundColor: options.COLORS[2],
            links: links.closed
        }]
    }
}

module.exports = function(options, callback) {
    /* get one issue so that we have a repo base URL */
    options.db.issue.find({},{"repository_url":1}).limit(1).toArray().then(baseIssue => {
        if (baseIssue.length == 0) return callback();
        var linkBase = baseIssue[0].repository_url.replace('api.github.com/repos', 'github.com') + '/issues';
        /* get issue counts by month */
        options.db.issue.aggregate([
            { $match: { pull_request: null } },
            { $group: { 
                _id: { $concat: [{$substrCP: ['$created_at', 0, 7]}, "$state"]},
                issue_count: {$sum: 1},
                state: {$first:"$state"}, 
                dt: {$first:{$substrCP:['$created_at', 0, 7]}}
            } },
            { $sort: { _id: 1 } }
        ], (err, result) => {
            if (err) return callback(err);

            var monthlyValues = groupby(result, "YYYY-MM", "MM-YYYY", "month", linkBase, options);
            monthlyValues.minimumLength = 5;

            /* get issue counts by day */
            options.db.issue.aggregate([
                { $match: { pull_request: null } },
                { $group: { 
                    _id: { $concat: [{$substrCP: ['$created_at', 0, 10]}, "$state"]},
                    issue_count: {$sum: 1},
                    state: {$first:"$state"}, 
                    dt: {$first:{$substrCP:['$created_at', 0, 10]}}
                } },
                { $sort: { _id: 1 } }
            ], (err, result) => {
                if (err) return callback(err);

                var weeklyValues = groupby(result, "YYYY-ww", "ww-YYYY", "week", linkBase, options);
                weeklyValues.minimumLength = 5;

                var graph = {
                    title: "Issues open and closed this month",
                    graphdata: JSON.stringify({
                        type: "bar",
                        data: {
                            adjustable: {
                                Monthly: monthlyValues,
                                Weekly: weeklyValues,
                            }
                        },
                        options: {
                            scales: {
                                xAxes: [{stacked: true}],
                                yAxes: [{display: false, stacked: true}]
                            }
                        }
                    })
                }
                options.templates.graph(graph, callback);
            });
        });
    }).catch(e => { return callback(e); })
}
