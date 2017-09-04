const moment = require("moment");
const widgetUtils = require("../widgetUtils");

module.exports = function(options, callback) {
    widgetUtils.dateDiffsByTimePeriods(options.db.issue, {closed_at: {$ne: null}}, 
        "created_at", obj => {
        return moment(obj.closed_at).diff(moment(obj.created_at));
    }, function(err, res) {
        if (err) return callback(err);
        var graph = {
            title: "Time to close an issue",
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
                                    data: res.monthly.data.map(n => n.average.value),
                                    borderColor: "#3ccf53",
                                    label: "Average"
                                }, {
                                    data: res.monthly.data.map(n => n.median.value),
                                    borderColor: "#AC8D1C",
                                    label: "Median"
                                }, {
                                    data: res.monthly.data.map(n => n.pc95.value),
                                    borderColor: "#4150F8",
                                    label: "95th percentile"
                                }
                            ]
                        },
                        weekly: {
                            minimumLength: 5,
                            labels: res.weekly.labels,
                            datasets: [
                                {
                                    data: res.weekly.data.map(n => n.average.value),
                                    borderColor: "#3ccf53",
                                    labels: "Average"
                                }, {
                                    data: res.weekly.data.map(n => n.median.value),
                                    borderColor: "#AC8D1C",
                                    label: "Median"
                                }, {
                                    data: res.weekly.data.map(n => n.pc95.value),
                                    borderColor: "#4150F8",
                                    label: "95th percentile"
                                }
                            ]
                        }
                    }
                },
                options: {
                    scales: {
                        xAxes: [{display: true}],
                        yAxes: [{display: false}]
                    }
                }
            })
        }
        options.templates.graph(graph, callback);
    });
}