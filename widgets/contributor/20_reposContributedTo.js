const moment = require("moment");

function repoFromIssueURL(issue_url) {
    var parts = issue_url.split("/");
    var rname = parts[parts.length-4] + "/" + parts[parts.length-3];
    return rname;
}

var fn = function(options, callback) {
    var repo_names = {};
    options.db.pull_request.find({},{"base.repo.full_name":1}).sort({updated_at:-1}).toArray().then(prs => {
        prs.forEach(pr => { repo_names[pr.base.repo.full_name] = ""; })
        return options.db.issue.find({},{updated_at:1, html_url:1, title:1,user:1}).sort({updated_at:-1}).toArray();
    }).then(issues => {
        issues.forEach(issue => { repo_names[repoFromIssueURL(issue.html_url)] = ""; });
        return options.db.issue_comment.find({},{updated_at:1, html_url:1, body:1, issue_url:1}).sort({updated_at:-1}).toArray();
    }).then(issue_comments => {
        issue_comments.forEach(issue => { repo_names[repoFromIssueURL(issue.html_url)] = ""; });
        var rnlist = Object.keys(repo_names);
        if (rnlist.length == 0) { return callback(); }
        rnlist.sort();
        var result = {
            title: "Repositories",
            list: rnlist.map(r => { 
                return {html: '<a href="' + options.url("repo", r) + '">' + r + '</a>'}; 
            })
        }
        options.templates.list(result, callback);
    }).catch(e => { callback(e); });
}
module.exports = fn;