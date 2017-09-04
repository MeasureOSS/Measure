const moment = require("moment");

var averageArray = arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length;
var medianArray = arr => arr[Math.round(arr.length/2)];
// this isn't strictly 95th percentile, but it's likely to be about right
// assuming a reasonably even distribution of possibilities
var pc95Array = arr => arr[Math.round(0.95*arr.length)];

function groupby(result, keyFormat, labelFormat, durationStep) {
    if (result.length == 0) { return {labels:[], data: []}; };

    var minGroup = moment();
    var byGroup = {};
    result.forEach(r => {
        var dt = r.groupDate.format(keyFormat);
        if (r.groupDate < minGroup) minGroup = r.groupDate;
        if (!byGroup[dt]) byGroup[dt] = [];
        byGroup[dt].push(r.diff);
    });

    var data = [];
    var minGroup = moment(minGroup);
    var now = moment();
    var labels = [];
    while (minGroup < now) {
        var key = minGroup.format(keyFormat);
        labels.push(minGroup.format(labelFormat));
        var values = byGroup[key];
        if (!values || values.length == 0) {
            data.push({
                average: {
                    value: 0,
                    label: "0"
                },
                median: {
                    value:0,
                    label: "0"
                },
                pc95: {
                    value: 0,
                    label: "0"
                }
            })
        } else {
            var v = {
                average: averageArray(values),
                median: medianArray(values),
                pc95: pc95Array(values)
            };
            for (k in v) {
                v[k] = {
                    value: v[k],
                    label: moment.duration(v[k]).humanize()
                }
            }
            data.push(v);
        }
        minGroup.add(1, durationStep);
    }
    return {
        labels:labels, 
        data: data
    }
}
var timePeriods = {
    monthly: {keyFormat:"YYYY-MM", labelFormat:"MM-YYYY", durationStep:"month"},
    weekly: {keyFormat:"YYYY-ww", labelFormat:"ww-YYYY", durationStep:"week"}
};
module.exports.dateDiffsByTimePeriods = function(collection, query, groupByField, diffFunction, callback) {
    collection.find(query).toArray().then(function(result) {
        var diffs = result.map(o => { return {diff: diffFunction(o), groupDate: moment(o[groupByField])}});
        var groups = {};
        for (var tp in timePeriods) {
            groups[tp] = groupby(diffs, timePeriods[tp].keyFormat, 
            timePeriods[tp].labelFormat, timePeriods[tp].durationStep);
        }
        return callback(null, groups);
    }).catch(e => { console.log("err", e); return callback(e); })
}