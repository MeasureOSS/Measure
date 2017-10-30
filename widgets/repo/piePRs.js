module.exports = function(options, callback) {
    /* Work out how many PRs are open now */
    var counts = {};
    var orgUsers = [];
    (options.config.my_organizations || []).forEach(orgName => {
        var orgPeople = options.org2People[orgName];
        if (orgPeople) {
            orgUsers = orgUsers.concat(orgPeople);
        }
    });
    console.log("pieprs");
    options.db.pull_request.count({state: "open"}).then(openTotal => {
        counts.openTotal = openTotal;
        return options.db.pull_request.count({state: "open", "user.login": {$in: orgUsers}});
    }).then(openOrg => {
        counts.openOrg = openOrg;
        console.log(counts);
        var graph = {
            title: "Open PRs",
            graphdata: JSON.stringify({
                type: "doughnut",
                data: {
                    labels: ["Outside the organizations", "Inside the organizations"],
                    datasets: [{
                        data: [counts.openTotal - counts.openOrg, openOrg],
                        backgroundColor: [options.COLORS[0], options.COLORS[1]]
                    }]
                }
            })
        }
        options.templates.graph(graph, callback);
    }).catch(e => { callback(e); });
}