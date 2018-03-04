var moment = require("moment");
module.exports = function(options, callback) {
    options.db.repo.find({}, {full_name: 1, created_at: 1}).sort({created_at: 1}).toArray().then(repos => {
        var trs = repos.map(r => {
            return "<tr><td>" + escape(r.full_name) + "</td><td>" + moment(r.created_at).format("YYYY-MM-DD") + "</td></tr>";
        })
        var html = "<table>" + trs.join("\n") + "</table>";
        return callback(null, {
            title: "Repositories by Creation Date",
            html: html
        })
    }).catch(e => { callback(e); })
}