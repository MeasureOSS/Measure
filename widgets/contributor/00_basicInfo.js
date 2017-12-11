const fields = ["login", "name", "company", "blog", "location", "email", "hireable"];
function deslug(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

module.exports = function(options, callback) {
    options.db.user.find({}).toArray().then(user => { // we're limited to this user by the framework
        var result = {
            title: "Bio",
            login: user[0].login,
            dl: fields.map(f => { return {dt: deslug(f), dd: user[0][f] || "-", editname: f=="login"?"":f }})
        }
        result.dl.push({
            dt: "repos/gists/followers/ing",
            dd: user[0].public_repos + "/" + user[0].public_gists + 
                "/" + user[0].followers + "/" + user[0].following
        })
        options.templates.userBasicInfo(result, callback);
    }).catch(e => { callback(e); });
}

