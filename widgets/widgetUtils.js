const moment = require("moment");

var averageArray = arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length;
var medianArray = arr => arr[Math.round(arr.length/2)];
// this isn't strictly 95th percentile, but it's likely to be about right
// assuming a reasonably even distribution of possibilities
var pc95Array = arr => arr[Math.round(0.95*(arr.length-1))];

module.exports.averageArray = averageArray;
module.exports.medianArray = medianArray;
module.exports.pc95Array = pc95Array;

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

module.exports.groupDiffsByTimePeriods = function(diffs) {
    var groups = {};
    for (var tp in timePeriods) {
        groups[tp] = groupby(diffs, timePeriods[tp].keyFormat, 
        timePeriods[tp].labelFormat, timePeriods[tp].durationStep);
    }
    return groups;
}

module.exports.dateDiffsByTimePeriods = function(collection, query, groupByField, diffFunction, callback) {
    collection.find(query).toArray().then(function(result) {
        var diffs = result.map(o => { return {diff: diffFunction(o), groupDate: moment(o[groupByField])}});
        var groups = module.exports.groupDiffsByTimePeriods(diffs);
        return callback(null, groups);
    }).catch(e => { console.log("err", e); return callback(e); })
}

module.exports.timeIncrementGroupings = [
    ["weekly", "YYYY-ww", "weeks"],
    ["monthly", "YYYY-MM", "months"]
];

module.exports.datesBetween = function(startString, endString, format, increment) {
    /* How do you work out which "time periods" are between two dates? Say a bug is 
    opened on 19th August and it is currently December 12th. Which months should get credit 
    for that bug being open in the graph?
    Clearly: August, September, October, November, December.
    But if you just start on 19th August and then add months until you hit the end date:
    So, 19th August (add August to list), add a month to get 19th September 
    (add September to list), add a month to get 19th October (add October to list), 
    add a month to get 19th November (add November to list), add a month to get 
    19th December -- ah, that's greater than today's date of December 12th, so exit.
    So that bug doesn't get credit for being open in December.
    The way to fix this is: a bug gets credit for being open in the month it's open,
    then you set the date to the 1st of *that opening month*, and *then* increment
    by months until you end up larger than today.
    (Ditto for weeks.) */
    var start = moment(startString);
    var end = endString ? moment(endString) : moment();
    var dates = [];

    // first set to the beginning of this week/month/etc
    start = start.startOf(increment);
    // *now*, add increments on
    while (start < end) {
        dates.push(start.format(format));
        start.add(1, increment);
    }
    return dates;
}
