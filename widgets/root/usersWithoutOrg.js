module.exports = function(options, callback) {
    options.db.issue.distinct("user.login", {}, (err, issueUsers) => {
        if (err) return callback(err);
        options.db.issue_comment.distinct("user.login", {}, (err, issueCommentUsers) => {
            if (err) return callback(err);
            var allUsers = new Set(issueUsers.concat(issueCommentUsers));
            var hasOrg = new Set();
            for (var k in options.org2People) {
                options.org2People[k].forEach(p => { hasOrg.add(p); })
            }
            var noOrg = [...allUsers].filter(x => !hasOrg.has(x));
            noOrg.sort();

            var result = {
                title: "Users not in an org",
                list: noOrg.map(l => { 
                    return {html: '<a href="' + options.url("contributor", l) + '">' + l + '</a>'}; 
                })
            }
            options.templates.list(result, callback);
        });
    })
}