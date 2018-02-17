/*
"Recent Contributors report" 
Report with name, org, and email address of everyone who's made a
contribution in the last ___ where ___ is a dropdown with say
week/month/quarter/year. Should not show if not authenticated.
(https://github.com/MeasureOSS/Measure/issues/73)
*/
var moment = require("moment");
var async = require("async");

module.exports = function(options, callback) {
    var people2Org = {};
    for (var orgname in options.org2People) {
        options.org2People[orgname].forEach(p => {
            if (p.left != "") return; 
            if (!people2Org[p.login]) people2Org[p.login] = new Set();
            people2Org[p.login].add(orgname);
        });
    }

    var mostRecentUserAction = {};

    options.db.issue.find({}, {"user.login": 1, "closed_by.login": 1, created_at: 1, closed_at: 1}).toArray().then(issues => {
        issues.forEach(function(i) {
            if (i.closed_at) {
                var ca = moment(i.closed_at);
                var mr = mostRecentUserAction[i.closed_by.login];
                if (mr) {
                    mr = moment(mr);
                    if (ca.isAfter(mr)) {
                        mostRecentUserAction[i.closed_by.login] = ca;
                    }
                } else {
                    mostRecentUserAction[i.closed_by.login] = ca;
                }
            }

            var oa = moment(i.created_at);
            var mr = mostRecentUserAction[i.user.login];
            if (mr) {
                mr = moment(mr);
                if (oa.isAfter(mr)) {
                    mostRecentUserAction[i.user.login] = oa;
                }
            } else {
                mostRecentUserAction[i.user.login] = oa;
            }
        })

        var peopleList = [];
        for (var k in mostRecentUserAction) {
            peopleList.push({
                login: k, 
                date: mostRecentUserAction[k],
                yyyymmdd: mostRecentUserAction[k].format("YYYY-MM-DD"),
                org: people2Org[k] || [],
                ts: mostRecentUserAction[k].unix()
            })
        }
        peopleList.sort(function(b, a) { 
            return a.ts - b.ts;
        });

        var trs = peopleList.map(function(p) {
            var orglist = Array.from(p.org).map(function(o) {
                return '<a href="' + options.url("org", o) + '">' + o + '</a>';
            }).join("/");
            var contributor = '<a href="' + options.url("contributor", p.login) + '">' + p.login + "</a>";
            return "<tr><td>" + contributor + "</td><td>" + orglist + 
                "</td><td sorttable_customkey='"+p.ts+"'>" + p.yyyymmdd + "</td></tr>";
        })

        var table = '<table id="report_t" class="sortable">' +
            '<thead>\n<tr><th>Contributor</th><th>Organisations</th>' +
            '<th>Most recent contribution</th></tr>\n</thead>\n<tbody>' +
            trs.join("\n") + "<tbody></table>";

        var dropdown = '<p>Show contributors from last ' +
            '<select id="report_dd" onchange="report_filter()"><option value="365">year</option>' +
            '<option value="90">quarter</option><option value="30">month</option>' +
            '<option value="7">week</option></select></p>';
        var filter_script = `<script>
            var report_dd = document.getElementById("report_dd");
            var report_t = document.getElementById("report_t");
            function report_filter() {
                var days = report_dd.options[report_dd.selectedIndex].value;
                var ts = new Date().getTime();
                var then = ts - (days * 24 * 60 * 60 * 1000);
                var then_yyyymmdd = (new Date(then)).toISOString().substring(0, 10);
                console.log("looking for dates bigger than", then_yyyymmdd);
                Array.prototype.slice.call(report_t.rows).forEach(function(r) {
                    var dval = r.cells[2].textContent;
                    if (dval > then_yyyymmdd) {
                        r.style.display = ""
                    } else {
                        r.style.display = "none";
                    }
                });
            }
            report_filter();
            </script>
            `;

        var html = dropdown + table + filter_script;

        return callback(null, {
            title: "Recent Contributors",
            html: html,
            requires_authentication: true
        })
    })
}