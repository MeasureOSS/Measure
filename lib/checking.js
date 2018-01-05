const async = require('async');
const request = require('request');
const wrap = require('word-wrap');
const moment = require('moment');
const NICE_ERRORS = require('./nice_errors');

// If the newest data we have (issues and comments) for a repo is older than
// this in days, warn about it.
const WARN_DATA_AGE = 7;

function confirmTokens(options) {
    /*
    Confirm that you have Github tokens in the crawler.
    If you don't, show a warning and instructions.
    */
    return new Promise((resolve, reject) => {
        request.get({
            url: "http://localhost:3000/config/tokens",
            headers: { "X-Token": "secret"},
            json: true
        }, function(err, response, body) {
            if (err) {
                /*
                Got an error talking to the crawler.
                This probably means that it's running somewhere other than
                where we expect. So, don't say anything, and carry on.
                */
                return resolve(options);
            }
            // No error. Check the body, which is JSON (otherwise we'd have an error).
            if (body.length === 0) {
                console.warn(wrap("You do not have any GitHub tokens allocated to the " +
                    "GitHub crawler. This means that it can only fetch your " +
                    "repository information at a very restricted rate. You should " +
                    "register some GitHub tokens at https://github.com/settings/tokens and " +
                    "then add them to the crawler with:\nbin/cc tokens aaaaaaaaa#private\n " +
                    "using the cc utility from https://github.com/Microsoft/ghcrawler-cli.",
                    {width: 65}));
            } else if (body.length < 3 && options.userConfig.debug) {
                console.warn(wrap("You only have " + body.length + " GitHub token" +
                    (body.length == 1 ? "" : "s") + " allocated to the " +
                    "GitHub crawler. Registering more tokens will help the crawler " +
                    "fetch data much faster. You should " +
                    "register more GitHub tokens at https://github.com/settings/tokens and " +
                    "then add them to the crawler with:\nbin/cc tokens aaaaaaaaa#private\n" +
                    "using cc from https://github.com/Microsoft/ghcrawler-cli.",
                    {width: 65}));
            } else {
                // do nothing
            }
            resolve(options);
        })
    });
}


function confirmCrawler(options) {
    /*
    Confirm that you have repo entries for all the repos in your config.
    If you don't, show a warning.
    */
    return new Promise((resolve, reject) => {

        var orgs = {};
        options.userConfig.github_repositories.forEach(ur => {
            orgs[ur.split("/")[0]] = "";
        })
        orgs = Object.keys(orgs);
        options.db.collection("repo", {strict: true}, function(err, repo) {
            if (err) {
                if (err.message.match(/^Collection repo does not exist/)) {
                    return reject(NICE_ERRORS.NO_COLLECTION_ERROR(orgs, options.userConfig.github_repositories));
                } else {
                    return reject(err);
                }
            }
            options.db.collection("issue", {strict: true}, function(err, issue) {
                if (err) {
                    if (err.message.match(/^Collection issue does not exist/)) {
                        return reject(NICE_ERRORS.NO_COLLECTION_ERROR(orgs, options.userConfig.github_repositories));
                    } else {
                        return reject(err);
                    }
                }
                repo.find({}, {full_name:1}).toArray().then(repos => {
                    var repo_names = repos.map(r => { return r.full_name.toLowerCase(); });
                    var unfound = [];
                    options.userConfig.github_repositories.forEach(ur => {
                        if (repo_names.indexOf(ur.toLowerCase()) == -1) {
                            unfound.push(ur);
                        }
                    })
                    if (unfound.length > 0) {
                            console.warn(wrap(NICE_ERRORS.notyetWarning(orgs, unfound), {width: 65}));
                    }

                    /*
                    Confirm that there are at least some issues for each repo in your
                    config. If not, show a warning.
                    */
                    async.eachLimit(options.userConfig.github_repositories, 5, function(repo_name, done) {
                        issue.find({html_url: { $regex: new RegExp(repo_name), $options: 'i' }}).sort({updated_at:-1}).limit(1).toArray().then(iss => {
                            if (iss.length == 0) {
                                var warning = "WARNING: there are no issues recorded for the " +
                                    repo_name + " repository. This may just be because we haven't " +
                                    "fetched that data yet.";
                                console.warn(wrap(warning, {width: 65}));
                            }
                            done();
                        }).catch(e => { done(e); })
                    }, function(err) {
                        if (err) { return reject(err); }
                        return resolve(options);
                    })
                }).catch(e => { return reject(e); })
            })
        });
    });
}

function confirmActivity(options) {
    /*
    Confirm that your repositories show recent activity.
    If they don't, show a warning suggesting that you may need to queue.
    */
    return new Promise((resolve, reject) => {

        var orgs = {};
        options.userConfig.github_repositories.forEach(ur => {
            orgs[ur.split("/")[0]] = "";
        })
        orgs = Object.keys(orgs);
        options.db.collection("repo", {strict: true}, function(err, repo) {
            options.db.collection("issue", {strict: true}, function(err, issue) {
                options.db.collection("issue_comment", {strict: true}, function(err, issue_comment) {
                    repo.find({}, {full_name:1}).toArray().then(repos => {
                        var repo_names = repos.map(r => { return r.full_name.toLowerCase(); });
                        async.mapLimit(repo_names, 5, function(repo_name, done) {
                            issue.find({html_url: { $regex: new RegExp(repo_name), $options: 'i' }}).sort({updated_at:-1}).limit(1).toArray().then(iss => {
                                issue_comment.find({html_url: { $regex: new RegExp(repo_name), $options: 'i' }}).sort({updated_at:-1}).limit(1).toArray().then(iss_com => {
                                    var newest;
                                    if (iss.length > 0) {
                                        newest = moment(iss[0].updated_at);
                                    }
                                    if (iss_com.length > 0) {
                                        var issue_comment_newest = moment(iss_com[0].updated_at);
                                        if (newest) {
                                            var diff = newest.diff(issue_comment_newest);
                                            if (diff < 0) {
                                                newest = issue_comment_newest;
                                            }
                                        } else {
                                            newest = issue_comment_newest;
                                        }
                                    }
                                    done(null, {repo: repo_name, newest: newest});
                                }).catch(e => { done(e); });
                            }).catch(e => { done(e); });
                        }, function(err, values) {
                            if (err) { return reject(err); }
                            var old_repos = values.filter(v => { return moment().diff(v.newest, "days") > WARN_DATA_AGE; });
                            if (old_repos.length > 0) {
                                var old_repo_names = old_repos.map(v => { return v.repo; }).join(" ");
                                var warning = "WARNING: the newest issues and comments we have recorded " +
                                    "for some repositories are over " + WARN_DATA_AGE + " days old. If you " +
                                    "would expect that (for some little-used repositories) then it it safe " +
                                    "to ignore this message. If you believe there should be data from more " +
                                    "recently than that, then you may need to queue the repositories in the " +
                                    "crawler again. Do so with:\n" +
                                    "    node bin/cc queue " + old_repo_names + "\n" +
                                    "    node bin/cc start 10";
                                console.warn(wrap(warning, {width: 65}));
                            }
                            return resolve(options);
                        })
                    }).catch(e => { return reject(e); })
                })
            })
        });
    });
}


module.exports = {
    confirmCrawler: confirmCrawler,
    confirmActivity: confirmActivity,
    confirmTokens: confirmTokens
}