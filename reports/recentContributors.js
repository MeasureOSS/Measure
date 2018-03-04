/*
"Recent Contributors report" 
Report with name, org, and email address of everyone who's made a
contribution in the last ___ where ___ is a dropdown with say
week/month/quarter/year. Should not show if not authenticated.
(https://github.com/MeasureOSS/Measure/issues/73)
*/
var moment = require("moment");
var async = require("async");
const stringify = require('csv-stringify/lib/sync')

module.exports = function(options, callback) {
    var people2Org = {}, peopleInMyOrgs = {};
    for (var orgname in options.org2People) {
        var isMyOrg = options.config.my_organizations.indexOf(orgname) != -1;
        options.org2People[orgname].forEach(p => {
            if (isMyOrg) {
                var joined = p.joined && p.joined != "" ? moment(p.joined) : moment("1900-01-01");
                var left = p.left && p.left != "" ? moment(p.left) : moment();
                peopleInMyOrgs[p.login] = {joined: joined, left: left};
            }
            if (!people2Org[p.login]) people2Org[p.login] = new Set();
            people2Org[p.login].add(orgname);
        });
    }

    function inMyOrg(login, date) {
        var whenInMyOrg = peopleInMyOrgs[login];
        if (!whenInMyOrg) return false;
        return date.isBetween(whenInMyOrg.joined, whenInMyOrg.left);
    }

    var mostRecentUserAction = {};

    options.db.issue.find({}, {"user.login": 1, "closed_by.login": 1, created_at: 1, closed_at: 1}).toArray().then(issues => {
        issues.forEach(function(i) {
            if (i.closed_at && i.closed_by) {
                var ca = moment(i.closed_at);
                var mr = mostRecentUserAction[i.closed_by.login];
                if (mr) {
                    mr = moment(mr);
                    if (ca.isAfter(mr)) {
                        if (!inMyOrg(i.closed_by.login, ca)) {
                            mostRecentUserAction[i.closed_by.login] = ca;
                        }
                    }
                } else {
                    if (!inMyOrg(i.closed_by.login, ca)) {
                        mostRecentUserAction[i.closed_by.login] = ca;
                    }
                }
            }

            var oa = moment(i.created_at);
            var mr = mostRecentUserAction[i.user.login];
            if (mr) {
                mr = moment(mr);
                if (oa.isAfter(mr)) {
                    if (!inMyOrg(i.user.login, oa)) {
                        mostRecentUserAction[i.user.login] = oa;
                    }
                }
            } else {
                if (!inMyOrg(i.user.login, oa)) {
                    mostRecentUserAction[i.user.login] = oa;
                }
            }
        })

        // need to fetch email addresses for everyone
        var login_list = Object.keys(mostRecentUserAction);
        options.db.user.find({login: {$in: login_list}}, {login:1, email:1}).toArray().then(function(users) {

            var user2Email = {};
            users.forEach(function(u) {
                user2Email[u.login] = u.email;
            })

            var peopleList = [];
            for (var k in mostRecentUserAction) {
                peopleList.push({
                    login: k,
                    email: user2Email[k],
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
                return "<tr><td>" + contributor + "</td><td>" + (p.email || "") + "</td><td>" + orglist + 
                    "</td><td sorttable_customkey='"+p.ts+"'>" + p.yyyymmdd + "</td></tr>";
            })

            var table = '<table id="report_t" class="sortable">' +
                '<thead>\n<tr><th>Contributor</th><th>Email</th><th>Organisations</th>' +
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
                        var dval = r.cells[3].textContent;
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

            var csvlink = '<p><a href="recentContributors.csv">(download as CSV)</a></p>';

            var html = csvlink + dropdown + table + filter_script;
            var csv = stringify(peopleList.map(p => {
                return {
                    github_username: p.login,
                    email: p.email,
                    organizations: Array.from(p.org).join(", "),
                    last_contribution: p.date.toISOString()
                }
            }), {
                columns: ["github_username", "email", "organizations", "last_contribution"],
                header: true
            });

            return callback(null, {
                title: "Recent Contributors (outside the organization)",
                html: html,
                requires_authentication: true,
                additional_files: {
                    "recentContributors.csv": csv
                }
            })


        }).catch(e => { callback(e); })
    }).catch(e => { callback(e); })
}