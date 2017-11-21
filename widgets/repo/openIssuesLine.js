const moment = require("moment");

var groupings = [
    ["weekly", "YYYY-ww", "weeks"],
    ["monthly", "YYYY-MM", "months"]
];

function datesBetween(startString, endString, format, increment) {
    var start = moment(startString);
    var end = endString ? moment(endString) : moment();
    var dates = [];
    while (start < end) {
        dates.push(start.format(format));
        start.add(1, increment);
    }
    return dates;
}

module.exports = function(options, callback) {
    // get the oldest issue
    options.db.issue.find({pull_request:null, closed_at:null}, {created_at:1}).sort({created_at: 1}).toArray().then(results => {
        if (results.length == 0) { return callback(); }

        var counts = {
            weekly: {}, 
            monthly: {}
        };

        var earliest = "9999-99-99";
        results.forEach(function(r) {
            if (r.created_at < earliest) earliest = r.created_at;
            groupings.forEach(function(g) {
                var dbt = datesBetween(r.created_at, r.closed_at, g[1], g[2]);
                dbt.forEach(function(datePeriod) {
                    if (!counts[g[0]][datePeriod]) { counts[g[0]][datePeriod] = 0; }
                    counts[g[0]][datePeriod] += 1;
                })
            })
        })

        var weeklyValues = Object.entries(counts.weekly).sort((a,b) => {
            if (a[0]<b[0]) return -1;
            if (a[0]>b[0]) return 1;
            return 0;
        });

        var monthlyValues = Object.entries(counts.monthly).sort((a,b) => {
            if (a[0]<b[0]) return -1;
            if (a[0]>b[0]) return 1;
            return 0;
        });

        var graph = {
            title: "Total open issues",
            graphdata: JSON.stringify({
                type: "line",
                data: {
                    adjustable: {
                        Monthly: {
                            minimumLength: 5,
                            default: true,
                            labels: monthlyValues.map(n => { return n[0]; }),
                            datasets: [{
                                data: monthlyValues.map(n => { return n[1]; }),
                                borderColor: options.COLORS[0],
                                borderWidth: 2,
                                pointStyle: "rect",
                                label: "Open issues"
                            }]
                        },
                        Weekly: {
                            minimumLength: 5,
                            labels: weeklyValues.map(n => { return n[0]; }),
                            datasets: [{
                                data: weeklyValues.map(n => { return n[1]; }),
                                borderColor: options.COLORS[0],
                                borderWidth: 2,
                                pointStyle: "rect",
                                label: "Open issues"
                            }]
                        },
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
                    }
                }
            })
        }
        options.templates.graph(graph, callback);

    }).catch(e => { callback(e); });

}
