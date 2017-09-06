const moment = require("moment");

var fn = function(options, callback) {
    var events_list = [];
    options.db.pull_request.find({},{updated_at:1, html_url:1, title:1}).sort({updated_at:-1}).toArray().then(prs => {
        events_list = events_list.concat(prs.map(o=>{
            return {
                type:"PR", 
                url:o.html_url, 
                title: o.title,
                updated_at: o.updated_at,
                ago: moment(o.updated_at).fromNow()
            }
        }));
        delete(prs);
        return options.db.issue.find({},{updated_at:1, html_url:1, title:1,user:1}).sort({updated_at:-1}).toArray();
    }).then(issues => {
        events_list = events_list.concat(issues.map(o=>{
            return {
                type:"issue",
                url:o.html_url,
                title: o.html_url.split("/")[4] + ": " + o.title,
                updated_at: o.updated_at,
                ago: moment(o.updated_at).fromNow()
            }
        }));
        delete(issues);
        return options.db.issue_comment.find({},{updated_at:1, html_url:1, body:1, issue_url:1}).sort({updated_at:-1}).toArray();
    }).then(issue_comments => {
        events_list = events_list.concat(issue_comments.map(o=>{
            return {
                type:"comment", 
                url:o.html_url, 
                title: o.issue_url.split("/")[5] + ": " + o.body.substr(0,20) + "...",
                updated_at: o.updated_at,
                ago: moment(o.updated_at).fromNow()
            }
        }));
        delete(issue_comments);
        if (events_list.length > 0) {
            events_list.sort((a,b) => {
                if (a.updated_at < b.updated_at) return 1;
                if (a.updated_at > b.updated_at) return -1;
                return 0;
            })
            var result = {
                title: "Events timeline",
                columns: [{name:"Event"}, {name:"Type"}, {name: "Date"}],
                rows: events_list.map(ev => {
                    return {cells: [{text: ev.title, link: ev.url}, {text: ev.type}, {text: ev.ago}]}
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