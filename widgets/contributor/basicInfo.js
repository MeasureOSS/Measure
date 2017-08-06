const fields = ["login", "name", "company", "blog", "location", 
    "email", "hireable", "bio", "public_repos", "public_gists", 
    "followers", "following", "created_at", "updated_at"];
function deslug(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

module.exports = function(options, callback) {
    options.db.user.find({}).toArray().then(user => { // we're limited to this user by the framework
        var result = {
            title: "Bio",
            list: fields.map(f => { return {html: deslug(f) + ": " + user[0][f] }})
        }
        options.templates.list(result, callback);
    }).catch(e => { callback(e); });
}

