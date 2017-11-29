module.exports = function(options, callback) {
    /* get issue counts by month */
    options.db.issue.aggregate([
        { $match: { pull_request: null }},
        { $group: { _id: { $substr: ['$created_at', 0, 7] }, issue_count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ], (err, result) => {
        if (err) return callback(err);
        var graph = {
            title: "Issues created",
            graphdata: JSON.stringify({
                type: "line",
                data: {
                    labels: result.map(n => n._id),
                    datasets: [
                        {
                            data: result.map(n => n.issue_count),
                            borderColor: options.COLORS[0],
                            borderWidth: 2,
                            pointStyle: "rect"
                        }
                    ]
                },
                options: {
                    scales: {
                        xAxes: [{display: true, gridLines: {display: false}}],
                        yAxes: [{display: true, gridLines: {color: "#666666"}, ticks: {fontColor: "white"}}]
                    }
                }
            })
        }
        options.templates.graph(graph, callback);
    });
}