module.exports = function(options, callback) {
    options.db.issue.aggregate([{$group: {_id: "$user.login", total:{$sum:1}}}], (err, issueUsers) => {
        if (err) return callback(err);
        options.db.issue_comment.aggregate([{$group: {_id: "$user.login", total:{$sum:1}}}], (err, issueCommentUsers) => {
            if (err) return callback(err);
            var allUsers = {};
            issueUsers.forEach(u => {
                allUsers[u._id] = u.total;
            })
            issueCommentUsers.forEach(u => {
                if (allUsers[u._id]) {
                    allUsers[u._id] += u.total;
                } else {
                    allUsers[u._id] = u.total;
                }
            })

            for (var k in options.org2People) {
                options.org2People[k].forEach(p => {
                    if (allUsers[p.login]) delete(allUsers[p.login]);
                })
            }

            var noOrg = [];
            for (var u in allUsers) {
                noOrg.push([u, allUsers[u]]);
            }
            noOrg.sort((a,b) => { return b[1] - a[1]; })

            var result = {
                title: "Users not in an org",
                list: noOrg.map(l => { 
                    return {html: '<a href="' + options.url("contributor", l[0]) + '">' + l[0] + 
                        ' (' + l[1] + ' contributions)</a>'}; 
                })
            }
            options.templates.list(result, callback);
        });
    })
}