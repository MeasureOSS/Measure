var widgetUtils = require("../widgetUtils");

module.exports = function(options, callback) {
    /* get issue counts by month */
    options.db.pull_request.aggregate([
        { $group: { _id: { $substr: ['$created_at', 0, 7] }, issue_count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ], (err, result) => {
        if (err) return callback(err);
        var graph = {
            title: "PRs created",
            graphdata: JSON.stringify({
                type: "line",
                data: {
                    adjustable: {
                        Monthly: widgetUtils.fillGaps({
                            labels: result.map(n => n._id),
                            minimumLength: 5,
                            datasets: [
                                {
                                    data: result.map(n => n.issue_count),
                                    borderColor: options.COLORS[0],
                                    borderWidth: 2,
                                    pointStyle: "rect"
                                }
                            ],
                            sliderInitial: 24
                        })
                    }
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