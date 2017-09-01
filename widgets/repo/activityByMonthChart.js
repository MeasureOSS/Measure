module.exports = function(options, callback) {
    /* get issue counts by month */
    options.db.issue.aggregate([
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
                            borderColor: "#3ccf53",
                            borderWidth: 2,
                            pointStyle: "rect"
                        }
                    ]
                },
                options: {
                    scales: {
                        xAxes: [{display: false}],
                        yAxes: [{display: false, beginAtZero: true}]
                    }
                }
            })
        }
        options.templates.graph(graph, callback);
    });
}