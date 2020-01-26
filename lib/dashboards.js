const async = require('async');
const path = require('path');
const fs = require('fs-extra');
const util = require('util');
const wrap = require('word-wrap');

const utils = require('./utils');
const LIMITS = require('./limits');
const NICE_ERRORS = require('./nice_errors');

let globalCounter = 0;

function runWidgets(options, limit) {
    /*
    For each of our loaded widgets, we pass it the database connection information
    it needs, and a list of templates it can use; it then calls the callback with
    some HTML which it can generate any way it likes.
    */
    return new Promise((resolve, reject) => {
        var mylimit = Object.assign({}, limit);
        var executedQueries = [];
        options.db.collections((err, colls) => {
            if (err) { return reject(err); }
            var colldict = {};
            colls.forEach(c => {
                colldict[c.collectionName] = c;
            })

            var missing = utils.EXPECTED_COLLECTIONS.filter(c => { return !colldict[c] });
            if (missing.length > 0) {
                return reject(NICE_ERRORS.MISSING_COLLECTIONS(missing));
            }

            // Monkeypatch the find, count, and aggregate functions
            // to add {user: (thisuser)} or {repo: (thisrepo)} match criteria
            // to each query, thus limiting its results to only the ones
            // appropriate for this dashboard
            Object.entries(colldict).forEach(([collname, coll]) => {
                let replacements = LIMITS[mylimit.limitType][collname];
                if (replacements) {
                    Object.entries(replacements).forEach(([method, fixQuery]) => {
                        let orig = coll[method];
                        coll[method] = function() {
                            let nargs = Array.prototype.slice.call(arguments);
                            let argIndex = 0;
                            if (method == "distinct") { argIndex = 1; } // bit of a hack, this.
                            
                            var thisOrgPeople = null; // this might not be an org
                            if (limit.limitType == "org") {
                                thisOrgPeople = options.org2People[limit.title];
                            }
                            nargs[argIndex] = fixQuery(limit.value, nargs[argIndex], thisOrgPeople);
                            executedQueries.push({collection: collname, args:nargs, widget_name: colldict.widget_name});
                            //console.log("Executing", util.inspect(nargs, {depth:null}));
                            return orig.apply(coll, nargs);
                        }
                    })
                }
            })

            if (mylimit.excludeOrg && options.myOrgUsers) {
                // monkeypatch find, count, aggregate to exclude all users in the org
                Object.entries(LIMITS.excludeOrg).forEach(([collname, methods]) => {
                    Object.entries(methods).forEach(([method, fixQuery]) => {
                        let coll = colldict[collname]
                        let orig = coll[method];
                        coll[method] = function() {
                            let nargs = Array.prototype.slice.call(arguments);
                            let argIndex = 0;
                            if (method == "distinct") { argIndex = 1; } // bit of a hack, this.

                            nargs[argIndex] = fixQuery(options.myOrgUsers, nargs[argIndex]);
                            executedQueries.push({collection: collname, args:nargs});
                            return orig.apply(coll, nargs);
                        }
                    })
                })
            }

            var in_params = {
                db: colldict, 
                templates: options.templates, 
                url: utils.url_lookup,
                config: options.userConfig,
                org2People: options.org2People,
                COLORS: utils.COLORS,
                limitedTo: mylimit.value,
                limitedToTitle: mylimit.title,
                orgExcluded: !!mylimit.excludeOrg
            };
            async.mapSeries(options.widgets[mylimit.limitType], function(widget, done) {
                try {
                    var startTime = (new Date()).getTime();
                    in_params.internalRunId = globalCounter++;
                    //console.log("[Widget " + widget.name + "] " + mylimit.limitType + ":" + mylimit.value + 
                    //    " (" + in_params.internalRunId + ")");
                    in_params.db.widget_name = widget.name;
                    widget.module(in_params, function(err, result) {
                        if (err) {
                            if (err.stack == "skipping") {
                                // widget deliberately decided to skip itself; don't say anything
                            } else {
                                console.error(NICE_ERRORS.WIDGET_ERROR(err, widget, mylimit).message);
                            }
                            return done();
                        }
                        var details = {html: result, extraClasses:widget.module.extraClasses, widget: widget.name, limit: limit};
                        var dur = (new Date()).getTime() - startTime;
                        if (!options.times) options.times = {};
                        if (!options.times[widget.name]) options.times[widget.name] = [];
                        options.times[widget.name].push(dur);
                        return done(null, details);
                    });
                } catch(err) {
                    console.error(NICE_ERRORS.WIDGET_ERROR(err, widget, mylimit).message);
                    return done();
                }
            }, function(err, results) {
                var htmls = results.filter(h => !!h);
                var result = Object.assign({}, options);
                result.limit = mylimit;
                result.htmls = htmls;
                result.executedQueries = executedQueries;
                return resolve(result);
            })
        });
    });
}

function assembleDashboard(options) {
    /*
    Pass all the collected HTML outputs from the widgets to the dashboard
    template, which gives us an actual dashboard. Save that to the output
    file as defined in the config.
    */
    return new Promise((resolve, reject) => {
        const outputSlugAll = options.limit.limitType + "/" + 
            options.limit.value + "-include-org.html";
        const outputSlugExcludeOrg = options.limit.limitType + "/" + 
            options.limit.value + "-outside-org.html";
        const outputSlugNoTitleRedirect = options.limit.limitType + "/" + 
            options.limit.value + ".html";
        const outputSlugTitleAll = options.limit.limitType + "/" + 
            (options.limit.title || options.limit.value) + "-include-org.html";
        const outputSlugTitleExcludeOrg = options.limit.limitType + "/" + 
            (options.limit.title || options.limit.value) + "-outside-org.html";
        const outputSlugTitleRedirect = options.limit.limitType + "/" + 
            (options.limit.title || options.limit.value) + ".html";

        var outputSlug, writeRedirect, includeExcludeOrgFilenames, outputSlugRedirect;
        if (options.limit.limitType == "repo" || options.limit.limitType == "root") {
            outputSlug = options.limit.excludeOrg ? outputSlugExcludeOrg : outputSlugAll;
            writeRedirect = true;
            includeExcludeOrgFilenames = [outputSlugAll, outputSlugExcludeOrg];
            outputSlugRedirect = outputSlugNoTitleRedirect;
        } else if (options.limit.limitType == "contributor") {
            // contributors don't have inside or outside org
            outputSlug = outputSlugNoTitleRedirect;
            writeRedirect = false;
            outputSlugRedirect = outputSlugNoTitleRedirect;
        } else if (options.limit.limitType == "org") {
            // orgs have a title
            outputSlug = outputSlugTitleRedirect;
            writeRedirect = false;
            outputSlugRedirect = outputSlugTitleRedirect;
        } else if (options.limit.limitType == "team") {
            // teams have a title and inside/outside org
            outputSlug = options.limit.excludeOrg ? outputSlugTitleExcludeOrg : outputSlugTitleAll;
            writeRedirect = true;
            includeExcludeOrgFilenames = [outputSlugTitleAll, outputSlugTitleExcludeOrg];
            outputSlugRedirect = outputSlugTitleRedirect;
        } else {
            return reject(NICE_ERRORS.UNEXPECTED_LIMIT_TYPE(options.limit));
        }
        const outputFile = path.join(options.userConfig.output_directory, outputSlug);
        const outputFileRedirect = path.join(options.userConfig.output_directory, outputSlugRedirect);
        const outputDir = path.dirname(outputFile);
        let tmplvars = {
            widgets: options.htmls,
            subtitle: options.limit.title || options.limit.value,
            type: options.limit.limitType,
            includeIncExcOrgSwitch: writeRedirect,
            isOverview: options.limit.limitType == "root",
            isRepository: options.limit.limitType == "repo" || options.limit.limitType == "contributor",
            isOrganization: options.limit.limitType == "org",
            isTeam: options.limit.limitType == "team"
        };

        if (options.userConfig.debug) {
            options.executedQueries.forEach(s => { s.args = JSON.stringify(s.args); });
            tmplvars.executedQueries = options.executedQueries;
        }
        if (options.limit.excludeOrg && writeRedirect) {
            tmplvars.includeExcludeOrgFilename = includeExcludeOrgFilenames[0];
            tmplvars.excludeOrg = true;
        } else if (!options.limit.excludeOrg && writeRedirect) {
            tmplvars.includeExcludeOrgFilename = includeExcludeOrgFilenames[1];
            tmplvars.excludeOrg = false;
        }
        options.templates.dashboard(tmplvars, (err, output) => {
            try {
                if (err) return reject(err);
                fs.ensureDirSync(outputDir);
                options.outputFile = outputFile; options.outputSlug = outputSlug;
                output = utils.fixOutputLinks(output, outputFile, options);
                fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
                    if (err) {
                        return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                    }
                    if (writeRedirect) {
                        var redirectParams = {
                            outputSlugAll: path.basename(includeExcludeOrgFilenames[0]), 
                            outputSlugExcludeOrg: path.basename(includeExcludeOrgFilenames[1])
                        };
                        options.templates.redirect(redirectParams, (err, output) => {
                            fs.writeFile(outputFileRedirect, output, {encoding: "utf8"}, err => {
                                if (err) {
                                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                                }
                                return resolve(options);
                            });
                        });
                    } else {
                        return resolve(options);
                    }
                })
            } catch(e) { return reject(e); }
        })
    });
}

function dashboardForEachRepo(options) {
    var dashboardMakersAll = options.userConfig.github_repositories.map(repo => {
        return runWidgets(Object.assign({}, options), {limitType: "repo", value: repo.toLowerCase()})
            .then(assembleDashboard);
    });
    var dashboardMakersExcludeOrg = options.userConfig.github_repositories.map(repo => {
        return runWidgets(Object.assign({}, options), {limitType: "repo", value: repo.toLowerCase(), excludeOrg: true})
            .then(assembleDashboard);
    });
    var dashboardMakers = dashboardMakersAll.concat(dashboardMakersExcludeOrg);
    return Promise.all(dashboardMakers)
        .then(function(arrayOfOptions) {
            var optionsBase = Object.assign({}, arrayOfOptions[0]);
            delete optionsBase.repo;
            delete optionsBase.outputFile;
            return optionsBase;
        });
}

function dashboardForEachOrg(options) {
    return new Promise((resolve, reject) => {
        async.map(Object.keys(options.org2People), (orgName, done) => {
            done(null, runWidgets(Object.assign({}, options), {
                limitType: "org",
                title: orgName,
                value: options.org2People[orgName].map(u => { return u.login; })
            }).then(assembleDashboard));
        }, (err, orgMakers) => {
            if (err) return reject(err);
            return resolve(options);
            return Promise.all(orgMakers)
                .then(function(arrayOfOptions) {
                    var optionsBase = Object.assign({}, arrayOfOptions[0]);
                    return optionsBase;
                });
        });
    });
}

function dashboardForEachTeam(options) {
    if (!options.userConfig.teams) { return new Promise((resolve, reject) => { resolve(options); }); }
    var dashboardMakersAll = Object.keys(options.userConfig.teams).map(teamname => {
        var repolist = options.userConfig.teams[teamname];
        return runWidgets(Object.assign({}, options), {limitType: "team", value: repolist, title: teamname})
            .then(assembleDashboard);
    });
    var dashboardMakersExcludeOrg = Object.keys(options.userConfig.teams).map(teamname => {
        var repolist = options.userConfig.teams[teamname];
        return runWidgets(Object.assign({}, options), {limitType: "team", value: repolist, title: teamname, excludeOrg: true})
            .then(assembleDashboard);
    });
    var dashboardMakers = dashboardMakersAll.concat(dashboardMakersExcludeOrg);
    return Promise.all(dashboardMakers)
        .then(function(arrayOfOptions) {
            var optionsBase = Object.assign({}, arrayOfOptions[0]);
            delete optionsBase.repo;
            delete optionsBase.outputFile;
            return optionsBase;
        });
}

function getUsers(options) {
    return new Promise((resolve, reject) => {
        options.db.collection("user").find({}, {login:1}).toArray().then(users => {
            var userList = [], skipList = [];
            users.forEach(function(u) {
                if (options.changedContributors.has(u.login)) {
                    userList.push(u);
                } else if (!fs.existsSync(path.join(options.userConfig.output_directory, "contributor", u.login + ".html"))) {
                    // if we feel like we ought to skip this user but actually there's no dashboard for them, don't skip
                    userList.push(u);
                } else {
                    skipList.push(u)
                }
            })
            resolve({options: options, users: userList, skipped_users: skipList})
        }).catch(e => { reject(e); })
    });
}

const makeDashboardCallForUsers = (params) => {
    return new Promise((resolve, reject) => {
        params.userCalls = params.users.map(u => {
            return {
                fn: runWidgets,
                params: [Object.assign({}, params.options), {limitType: "contributor", value: u.login}],
                after: assembleDashboard,
                login: u.login
            }
        });
        resolve(params);
    });
}

const executeCallsInBatches = params => {
    return new Promise((resolve, reject) => {
        var chunk = 0;
        var chunkSize = 50;
        var results = [];

        function nextChunk() {
            var block = params.userCalls.slice(chunk, chunk + chunkSize).map(detail => {
                return detail.fn.apply(this, detail.params)
                        .then(detail.after)
                        .catch(e => {
                            console.log("error in dashboard for", detail.login);
                            return null;
                        })
            });
            if (params.options.userConfig.debug) {
                console.log("Creating contributor dashboards " +
                    chunk + "-" + (chunk + chunkSize) +
                    " of " + params.userCalls.length);
            }
            Promise.all(block)
                .then(function(r) {
                    results = results.concat(r.filter(rr => !!rr));
                    chunk += chunkSize;
                    if (chunk >= params.userCalls.length) {
                        params.dashboardResults = results;
                        resolve(params);
                    } else {
                        process.nextTick(nextChunk);
                    }
                }).catch(e => { reject(e); })
        }
        nextChunk();
    });
}

const printSummary = params => {
    return new Promise((resolve, reject) => {
        if (params.options.userConfig.debug) {
            var out = "Generated dashboards for " + params.users.length + " contributors.";
            if (params.skipped_users.length > 0) {
                out += " We skipped generating dashboards for " + params.skipped_users.length +
                    " other contributors because their data have not changed since " +
                    "the last generation.";
            }
            console.log(wrap(out, {width:65}));
        }
        resolve(params);
    });
}

function dashboardForEachContributor(options) {
    /*
    We create a big list of functions, one per user, to generate that user's dashboard.
    Then we execute them, fifty or so at a time. This avoids the problem of throwing
    thousands of simultaneous connections at MongoDB and causing it to time out.

    makeDashboardCallForUsers works out which function to call for a user to generate
    their dashboard, but does not actually call it; instead, it puts all the descriptions
    of these functions in a big list and returns the list. Then, executeCallsInBatches
    actually calls the functions, in blocks of fifty at a time, and then returns all
    the results.

    Note that the individual user calls have to succeed, because we execute a block
    all at once with Promise.all, and if one fails then Promise.all aborts. So we have
    each function always return true, and print any errors, rather than having them
    actually fail.
    */
    return new Promise((resolve, reject) => {

        getUsers(options)
            .then(makeDashboardCallForUsers)
            .then(executeCallsInBatches)
            .then(printSummary)
            .then(params => {
                if (params.dashboardResults.length === 0) { return resolve(options); }
                return resolve(params.dashboardResults[0])
            })
            .catch(e => { reject(e); })

    });
}

/* to be removed
function dashboardForEachContributorX(options) {
    return options.db.collection("user").find({}, {login:1}).toArray().then(users => {
        var skipped = [], genned = [], regenned = [];
        var userMakers = users.map(u => {
            var fileIsntThere = false;
            if (options.userConfig.debug) {
                if (!fs.existsSync(path.join(options.userConfig.output_directory, "contributor", u.login + ".html"))) {
                    fileIsntThere = true;
                }
            }
            if (options.changedContributors.has(u.login)) {
                if (options.userConfig.debug) { genned.push(u.login); }
                return runWidgets(Object.assign({}, options), {limitType: "contributor", value: u.login})
                    .then(assembleDashboard);
            } else if (fileIsntThere) {
                genned.push(u.login);
                regenned.push(u.login);
                return runWidgets(Object.assign({}, options), {limitType: "contributor", value: u.login})
                    .then(assembleDashboard);
            } else {
                if (options.userConfig.debug) { skipped.push(u.login); }
                return null;
            }
        }).filter(thing => !!thing);
        if (skipped.length > 0 && options.userConfig.debug) {
            var skiplist;
            if (skipped.length > 5) {
                var sl = skipped.length;
                skipped = skipped.slice(0,5);
                skipped[skipped.length-1] = "and " + skipped[skipped.length-1];
                skiplist = sl + " users, including " + skipped.join(", ");
            } else if (skipped.length == 1) {
                skiplist = skipped[0];
            } else {
                skipped[skipped.length-1] = "and " + skipped[skipped.length-1];
                skiplist = skipped.join(", ");
            }
            console.log(wrap(`Skipping creation of contributor dashboard for ${skiplist} because the data are unchanged. (We generated dashboards for ${genned.length} contributors.)`, {width:65}));
        }
        if (regenned.length > 0 && options.userConfig.debug) {
            console.log("Regenerating dashboard for", regenned.length, " contributors because the files were unexpectedly not there.");
        }
        return Promise.all(userMakers)
            .then(function(arrayOfOptions) {
                var optionsBase = Object.assign({}, arrayOfOptions[0]);
                if (arrayOfOptions.length == 0) { return options; }
                return optionsBase;
            });
    })
}
*/

function changedContributors(options) {
    /* Generating contributor dashboards is the slowest part of the process,
       because there are a lot of contributor names. Here, we look at the
       last time we generated the dashboards, and then query various tables
       for lists of contributors who have done something since that date.
       Later, we only generate new contributor dashboards for people on that
       list (because the existing ones won't have changed so there's no need
       to regenerate them). */
    return new Promise((resolve, reject) => {
        const mongoLGA = options.lastGeneratedAt.format();
        const cre_upd_clo = {$or: [
            {created_at: {$gt: mongoLGA}},
            {updated_at: {$gt: mongoLGA}},
            {closed_at: {$gt: mongoLGA}}
        ]};
        const cre_upd = {$or: [
            {created_at: {$gt: mongoLGA}},
            {updated_at: {$gt: mongoLGA}}
        ]};
        var contributorsSinceLast = new Set();
        async.map(["issue", "issue_comment", "pull_request"], (coll, done) => {
            options.db.collection(coll).find(cre_upd_clo, {"user.login": 1}).toArray().then(res => {
                done(null, res);
            }).catch(err => {
                console.log("caught with", err);
                done(err); 
            })
        }, (err, results) => {
            if (err) { return reject(err); }
            try {
                results.forEach(ulist => {
                    ulist.forEach(u => { contributorsSinceLast.add(u.user.login); })
                });
                options.changedContributors = contributorsSinceLast;
                resolve(options);
            } catch(e) {
                reject(e);
            }
        })
    })
}

module.exports = {
    changedContributors: changedContributors,
    dashboardForEachOrg: dashboardForEachOrg,
    dashboardForEachContributor: dashboardForEachContributor,
    dashboardForEachRepo: dashboardForEachRepo,
    dashboardForEachTeam: dashboardForEachTeam,
    runWidgets: runWidgets
}
