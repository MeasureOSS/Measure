const moment = require("moment");
const widgetUtils = require("../widgetUtils");

module.exports = function(options, callback) {
    widgetUtils.dateDiffsByTimePeriods(options.db.issue, {closed_at: {$ne: null}}, 
        "created_at", obj => {
        return moment(obj.closed_at).diff(moment(obj.created_at));
    }, function(err, res) {
        if (err) return callback(err);
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
            title: "Time to close an issue",
            graphdata: JSON.stringify({
                type: "line",
                data: {
                    adjustable: {
                        Monthly: widgetUtils.fillGaps({
                            default: true,
                            minimumLength: 5,
                            labels: res.monthly.labels,
                            datasets: [
                                {
                                    data: res.monthly.data.map(n => Math.round(n.average.value / 1000 / 60 / 60)),
                                    borderColor: options.COLORS[0],
                                    label: "Average (hrs)"
                                }, {
                                    data: res.monthly.data.map(n => Math.round(n.median.value / 1000 / 60 / 60)),
                                    borderColor: options.COLORS[1],
                                    label: "Median (hrs)"
                                }, {
                                    data: res.monthly.data.map(n => Math.round(n.pc95.value / 1000 / 60 / 60)),
                                    borderColor: options.COLORS[2],
                                    label: "95th percentile (hrs)"
                                }
                            ],
                            sliderInitial: 24
                        }),
                        Weekly: widgetUtils.fillGaps({
                            minimumLength: 5,
                            labels: res.weekly.labels,
                            datasets: [
                                {
                                    data: res.weekly.data.map(n => Math.round(n.average.value / 1000 / 60 / 60)),
                                    borderColor: options.COLORS[0],
                                    labels: "Average (hrs)"
                                }, {
                                    data: res.weekly.data.map(n => Math.round(n.median.value / 1000 / 60 / 60)),
                                    borderColor: options.COLORS[1],
                                    label: "Median (hrs)"
                                }, {
                                    data: res.weekly.data.map(n => Math.round(n.pc95.value / 1000 / 60 / 60)),
                                    borderColor: options.COLORS[2],
                                    label: "95th percentile (hrs)"
                                }
                            ],
                            sliderInitial: 104
                        })
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
                        xAxes: [{display: true, gridLines: {display: false}}],
                        yAxes: [{display: true, gridLines: {color: "#666666"}, ticks: {fontColor: "white"}}]
                    },
                    annotation: hoursToRespondLine
                }
            })
        }
        options.templates.graph(graph, callback);
    });
}