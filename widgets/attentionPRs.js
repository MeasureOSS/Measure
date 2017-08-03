/* PRs that need attention */
const moment = require("moment");

module.exports = function(options, callback) {
    if (!options.db.pull_request) {
        return callback({
            message: "There are no PRs to count",
            stack: "skipping"
        });
    }

    /* Work out how many PRs are open now */
    options.db.pull_request.find({state: "open"}, {created_at:1, comments: 1, html_url: 1, title: 1}).toArray().then(openNowPR => {
        /* give each PR a score:
           each day old it is is one point
           each comment it has is five points
         */
        let scores = openNowPR.map(pr => {
            let days = moment().diff(moment(pr.created_at), "days");
            let score = pr.comments * 5 + days;
            return {pr: pr, score: score}
        })
        scores.sort((b,a) => a.score - b.score);
        let result = {
            title: "PRs that need attention",
            list: scores.slice(0,5).map(pr => { 
                return {html: '<a href="' + pr.pr.html_url + '">' + pr.pr.title + '</a>'}; 
            })
        }
        options.templates.list(result, callback);
    }).catch(e => { callback(e); });;
}