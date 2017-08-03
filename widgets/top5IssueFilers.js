module.exports = function(options, callback) {
    options.db.issue.aggregate([
        { $group: { _id: "$user.login", issue_count : {$sum : 1}}},
        { $sort: { issue_count: -1 }}
    ], (err, res) => {
        if (err) return callback(err);
        var result = {
            title: "Top 5 issue filers",
            list: res.slice(0,5).map(l => { 
                return {html: '<a href="https://github.com/' + l._id + '">' + l._id + '</a>'}; 
            })
        }
        options.templates.list(result, callback);
    })
}