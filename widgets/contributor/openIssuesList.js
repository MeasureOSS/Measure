const moment = require("moment");

module.exports = function(options, callback) {
    if (!options.db.pull_request) {
        return callback({
            message: "There are no PRs to count",
            stack: "skipping"
        });
    }

    /* Work out how many PRs are open now */
    options.db.issue.find({state: "open", pull_request: null}, {html_url: 1, title: 1}).toArray().then(openNowIssues => {
        let result = {
            title: "Open Issues",
            list: openNowIssues.map(is => { 
                return {html: '<a href="' + is.html_url + '">' + is.title + '</a>'}; 
            })
        }
        options.templates.list(result, callback);
    }).catch(e => { callback(e); });;
}