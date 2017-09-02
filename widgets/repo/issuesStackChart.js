const moment = require("moment");

function groupby(result, keyFormat, labelFormat, durationStep) {
    if (result.length == 0) { return {labels:[], datasets: []}; };

    var minGroup = "zzzzzz";
    var byGroup = {open:{}, closed:{}};
    result.forEach(r => {
        var dt = moment(r.dt).format(keyFormat);
        if (r.dt < minGroup) minGroup = r.dt;
        byGroup[r.state][dt] = r.issue_count;
    });

    var datasets = {open:[], closed:[]};
    var minGroup = moment(minGroup);
    var now = moment();
    var labels = [];
    while (minGroup < now) {
        var key = minGroup.format(keyFormat);
        labels.push(minGroup.format(labelFormat));
        datasets.open.push(byGroup.open[key] || 0);
        datasets.closed.push(byGroup.closed[key] || 0);
        minGroup.add(1, durationStep);
    }
    return {
        labels:labels, 
        datasets: [{
            label: "Opened issues",
            data: datasets.open,
            backgroundColor: "#3ccf53"
        }, {
            label: "Closed issues",
            data: datasets.closed,
            backgroundColor: "#AC8D1C"
        }]
    }
}

module.exports = function(options, callback) {
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

        var monthlyValues = groupby(result, "YYYY-MM", "MM-YYYY", "month");
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

            var weeklyValues = groupby(result, "YYYY-ww", "ww-YYYY", "week");
            weeklyValues.minimumLength = 5;

            var graph = {
                title: "Issues open and closed this month",
                graphdata: JSON.stringify({
                    type: "bar",
                    data: {
                        adjustable: {
                            monthly: monthlyValues,
                            weekly: weeklyValues,
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
}
