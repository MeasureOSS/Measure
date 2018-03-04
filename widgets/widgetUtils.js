const moment = require("moment");

var averageArray = arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length;
var medianArray = arr => arr[Math.floor(arr.length/2)];
// this isn't strictly 95th percentile, but it's likely to be about right
// assuming a reasonably even distribution of possibilities
var pc95Array = arr => arr[Math.floor(0.95*(arr.length-1))];

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
    }).catch(e => { return callback(e); })
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

module.exports.fillGaps = function(data) {
    /* graphs often have months or weeks in data, but if nothing happened in
       a month, there'll be no entry at all for that month. This function
       inspects the data and fills in the gaps with zeroes. */

    function from_yyyymm(yyyymm) { return {
        p: parseInt(yyyymm.split("-")[1], 10),
        y: parseInt(yyyymm.split("-")[0], 10)
    }}
    function from_mmyyyy(mmyyyy) { return {
        p: parseInt(mmyyyy.split("-")[0], 10),
        y: parseInt(mmyyyy.split("-")[1], 10)
    }}
    function to_yyyymm(d) { return d.y + "-" + ("0" + d.p).slice(-2); }
    function to_mmyyyy(d) { return ("0" + d.p).slice(-2) + "-" + d.y; }

    function isProbablyWeekly(labels, _from) {
        // this is not ideal. Check the labels, which are e.g., MM-YYYY
        // to see if MM gets bigger than 12. If it does, this is probably
        // weekly data.
        // This will cause problems if by coincidence we only have weekly
        // data for weeks less than 12.
        for (var i=0; i<labels.length; i++) {
            var p = _from(labels[i]);
            if (p.p > 12) { return true; }
        }
        return false;
    }

    function walk(first, clockover, _from, _to, data) {
        var nlabels = [];
        var ndatasets = [];
        var current = first;
        var current_p = _from(first);
        var label_pointer = 0;

        var now = moment();
        var now_formatted = to_yyyymm({
            y: now.format("YYYY"), 
            p: now.format(clockover == 53 ? "w" : "MM")
        });
        while (true) {
            if (to_yyyymm(current_p) > now_formatted) { break; }
            if (data.labels[label_pointer] == current) {
                // we have a value for this time period
                nlabels.push(data.labels[label_pointer]);
                if (ndatasets.length == 0) {
                    // create the correct number of datasets
                    for (var i=0; i<data.datasets.length; i++) { ndatasets.push([]); }
                }
                for (var i=0; i<data.datasets.length; i++) { ndatasets[i].push(data.datasets[i].data[label_pointer]); }
                label_pointer += 1;
            } else {
                // no value for this time period so use zeroes
                nlabels.push(current);
                if (ndatasets.length == 0) {
                    // create the correct number of datasets
                    for (var i=0; i<data.datasets.length; i++) { ndatasets.push([]); }
                }
                for (var i=0; i<data.datasets.length; i++) { ndatasets[i].push(0); }
            }
            // add one to current
            current_p.p += 1;
            if (current_p.p > clockover) {
                current_p.p = 1;
                current_p.y += 1;
            }
            current = _to(current_p);
        }
        // now reassemble data
        data.labels = nlabels;
        for (var i=0; i<ndatasets.length; i++) {
            data.datasets[i].data = ndatasets[i];
        }
        return data;
    }

    // first, sanity check that the things we know how to fix are present
    if (!data.labels || data.labels.length == 0) return data;
    if (!data.datasets || data.datasets.length == 0) return data;
    if (data.labels[0].match(/^[0-9][0-9]-[0-9][0-9][0-9][0-9]/)) {
        // monthly or weekly data MM-YYYY
        if (isProbablyWeekly(data.labels, from_mmyyyy)) {
            return walk(data.labels[0], 53, from_mmyyyy, to_mmyyyy, data);
        } else {
            return walk(data.labels[0], 12, from_mmyyyy, to_mmyyyy, data);
        }
    } else if (data.labels[0].match(/^[0-9][0-9][0-9][0-9]-[0-9][0-9]/)) {
        // monthly or weekly data YYYY-MM
        if (isProbablyWeekly(data.labels, from_yyyymm)) {
            return walk(data.labels[0], 53, from_yyyymm, to_yyyymm, data);
        } else {
            return walk(data.labels[0], 12, from_yyyymm, to_yyyymm, data);
        }
    } else {
        // don't know what this is
        return data;
    }

    return data;
}