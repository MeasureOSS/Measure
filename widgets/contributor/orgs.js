module.exports = function(options, callback) {
    options.db.user.find({}).toArray().then(user => { // we're limited to this user by the framework
        options.templates.orgs({login:user[0].login}, callback);
    }).catch(e => { callback(e); });
}

