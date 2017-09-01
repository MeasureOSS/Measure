const moment = require("moment");

var averageArray = arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length;

module.exports = function(options, callback) {
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
            byMonth[my].push(m.diff(c, "seconds"));
            if (c < minMonth) { minMonth = c; }
        });

        var now = moment();
        var values = [];
        while (minMonth < now) {
            var key = minMonth.format("YYYYMM");
            var prnt = minMonth.format("MM-YYYY");
            var thesevalues = byMonth[key];
            if (thesevalues) {
                values.push({month: prnt, avgPRMergeTime: averageArray(thesevalues)});
            } else {
                values.push({month: prnt, avgPRMergeTime: 0});
            }
            minMonth.add(1, "month");
        }
        var graph = {
            title: "Average time to merge a PR",
            graphdata: JSON.stringify({
                type: "line",
                data: {
                    labels: values.map(n => n.month),
                    datasets: [
                        {
                            data: values.map(n => n.avgPRMergeTime),
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
    }).catch(e => { callback(e); });;
}