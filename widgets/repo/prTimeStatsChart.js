const moment = require("moment");
const widgetUtils = require("../widgetUtils");

module.exports = function(options, callback) {
    widgetUtils.dateDiffsByTimePeriods(options.db.pull_request, {merged_at: {$ne: null}}, 
        "created_at", obj => {
        return moment(obj.merged_at).diff(moment(obj.created_at));
    }, function(err, res) {
        if (err) return callback(err);
        var graph = {
            title: "Time to merge a PR",
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
    return;


    /* our dates are strings, and the mongo aggregation framework can't
       aggregate and do date calculations on dates that are strings. So,
       we'll aggregate them ourselves */
    options.db.pull_request.find({merged_at: {$ne: null}}).toArray().then(result => {
        var byMonth = {};
        var minMonth = moment();
        result.forEach(r => {
            var c = moment(r.created_at);
            var m = moment(r.merged_at);
            var my = c.format("YYYYMM");
            if (!byMonth[my]) byMonth[my] = [];
            byMonth[my].push(m.diff(c, "hours"));
            if (c < minMonth) { minMonth = c; }
        });

        var now = moment();
        var values = [];
        while (minMonth < now) {
            var key = minMonth.format("YYYYMM");
            var prnt = minMonth.format("MM-YYYY");
            var thesevalues = byMonth[key];
            if (thesevalues) {
                values.push({
                    month: prnt, 
                    average: Math.round(averageArray(thesevalues)),
                    median: Math.round(medianArray(thesevalues))
                });
            } else {
                values.push({month: prnt, average: 0, median: 0});
            }
            minMonth.add(1, "month");
        }
        var graph = {
            title: "Time to merge a PR",
            graphdata: JSON.stringify({
                type: "line",
                data: {
                    labels: values.map(n => n.month),
                    datasets: [
                        {
                            data: values.map(n => n.average),
                            borderColor: "#3ccf53",
                            borderWidth: 2,
                            pointStyle: "rect",
                            labels: "Average"
                        }, {
                            data: values.map(n => n.median),
                            borderColor: "#AC8D1C",
                            borderWidth: 2,
                            pointStyle: "rect",
                            label: "Median"
                        }
                    ]
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
    }).catch(e => { callback(e); });;
}