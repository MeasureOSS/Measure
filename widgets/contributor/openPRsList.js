const moment = require("moment");

module.exports = function(options, callback) {
    if (!options.db.pull_request) {
        return callback({
            message: "There are no PRs to count",
            stack: "skipping"
        });
    }

    /* Work out how many PRs are open now */
    options.db.pull_request.find({state: "open"}, {html_url: 1, title: 1}).toArray().then(openNowPR => {
        if (openNowPR.length == 0) return callback({
            message: "There are no PRs to count",
            stack: "skipping"
        });
        let result = {
            title: "Open PRs",
            list: openNowPR.map(pr => { 
                return {html: '<a href="' + pr.html_url + '">' + pr.title + '</a>'}; 
            })
        }
        options.templates.list(result, callback);
    }).catch(e => { callback(e); });;
}