var fn = function(options, callback) {
    var events = {};
    options.db.pull_request.find({},{updated_at:1, html_url:1, title:1}).sort({updated_at:-1}).toArray().then(prs => {
        events.prs = prs;
        return options.db.issue.find({},{updated_at:1, html_url:1, title:1}).sort({updated_at:-1}).toArray();
    }).then(issues => {
        events.issues = issues;
        return options.db.issue_comment.find({},{updated_at:1, html_url:1, body:1}).sort({updated_at:-1}).toArray();
    }).then(issue_comments => {
        events.issue_comments = issue_comments;
        var events_list = events.prs.map(o=>{return {type:"PR", url:o.html_url, title: o.title}});
        events_list.concat(events.issues.map(o=>{return {type:"issue", url:o.html_url, title: o.title}}));
        events_list.concat(events.issue_comments.map(o=>{return {type:"comment", url:o.html_url, title: o.body}}));
        if (events_list.length > 0) {
            var result = {
                title: "Events timeline",
                columns: [{name:"Event"}, {name:"Type"}],
                rows: events_list.map(ev => {
                    return {cells: [{text: ev.title, link: ev.url}, {text: ev.type}]}
                })
            }
            options.templates.table(result, callback);
        } else {
            callback();
        }
    }).catch(e => { callback(e); });
}
fn.extraClasses = "wide";
module.exports = fn;