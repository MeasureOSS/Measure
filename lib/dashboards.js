const async = require('async');
const path = require('path');
const fs = require('fs-extra');

const utils = require('./utils');
const LIMITS = require('./limits');
const NICE_ERRORS = require('./nice_errors');

function runWidgets(options, limit) {
    /*
    For each of our loaded widgets, we pass it the database connection information
    it needs, and a list of templates it can use; it then calls the callback with
    some HTML which it can generate any way it likes.
    */
    return new Promise((resolve, reject) => {
        var mylimit = Object.assign({}, limit);
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
                            nargs[argIndex] = fixQuery(limit.value, nargs[argIndex]);
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
                limitedTo: mylimit.value
            };
            async.mapSeries(options.widgets[mylimit.limitType], function(widget, done) {
                try {
                    var startTime = (new Date()).getTime();
                    widget.module(in_params, function(err, result) {
                        if (err) {
                            console.error(NICE_ERRORS.WIDGET_ERROR(err, widget).message);
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
                    console.error(NICE_ERRORS.WIDGET_ERROR(err, widget).message);
                    return done();
                }
            }, function(err, results) {
                var htmls = results.filter(h => !!h);
                var result = Object.assign({}, options);
                result.limit = mylimit;
                result.htmls = htmls;
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
        const outputSlugRedirect = options.limit.limitType + "/" + 
            options.limit.value + ".html";
        const outputSlugTitle = options.limit.limitType + "/" + 
            (options.limit.title || options.limit.value) + ".html";
        var outputSlug = options.limit.excludeOrg ? outputSlugExcludeOrg : outputSlugAll;
        var writeRedirect = true;
        // special handling for contributors, who don't have inside or outside org
        if (options.limit.limitType == "contributor") {
            outputSlug = outputSlugRedirect;
            writeRedirect = false;
        }
        // special handling for orgs, who have a title
        if (options.limit.limitType == "org") {
            outputSlug = outputSlugTitle;
            writeRedirect = false;
        }
        const outputFile = path.join(options.userConfig.output_directory, outputSlug);
        const outputFileRedirect = path.join(options.userConfig.output_directory, outputSlugRedirect);
        const outputDir = path.dirname(outputFile);
        let tmplvars = {
            widgets: options.htmls,
            subtitle: options.limit.title || options.limit.value,
            includeIncExcOrgSwitch: writeRedirect,
            isOverview: options.limit.limitType == "root",
            isRepository: options.limit.limitType == "repo" || options.limit.limitType == "contributor",
            isOrganization: options.limit.limitType == "org"
        };
        if (options.limit.excludeOrg) {
            tmplvars.includeExcludeOrgFilename = outputSlugAll;
            tmplvars.excludeOrg = true;
        } else {
            tmplvars.includeExcludeOrgFilename = outputSlugExcludeOrg;
            tmplvars.excludeOrg = false;
        }
        options.templates.dashboard(tmplvars, (err, output) => {
            if (err) return reject(err);
            fs.ensureDirSync(outputDir);
            options.outputFile = outputFile; options.outputSlug = outputSlug;
            output = utils.fixOutputLinks(output, outputFile, options);
            fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                }
                if (writeRedirect) {
                    options.templates.redirect({outputSlugAll:path.basename(outputSlugAll), outputSlugExcludeOrg:path.basename(outputSlugExcludeOrg)}, (err, output) => {
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
        })
    });
}

function dashboardForEachRepo(options) {
    var dashboardMakersAll = options.userConfig.github_repositories.map(repo => {
        return runWidgets(Object.assign({}, options), {limitType: "repo", value: repo})
            .then(assembleDashboard);
    });
    var dashboardMakersExcludeOrg = options.userConfig.github_repositories.map(repo => {
        return runWidgets(Object.assign({}, options), {limitType: "repo", value: repo, excludeOrg: true})
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
            done(null, runWidgets(Object.assign({}, options), {limitType: "org", title: orgName, value: options.org2People[orgName]})
                .then(assembleDashboard));
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


function dashboardForEachContributor(options) {
    return options.db.collection("user").find({}, {login:1}).toArray().then(users => {
        var userMakers = users.map(u => {
            return runWidgets(Object.assign({}, options), {limitType: "contributor", value: u.login})
                .then(assembleDashboard);
        });
        return Promise.all(userMakers)
            .then(function(arrayOfOptions) {
                var optionsBase = Object.assign({}, arrayOfOptions[0]);
                return optionsBase;
            });
    })
}

module.exports = {
    dashboardForEachOrg: dashboardForEachOrg,
    dashboardForEachContributor: dashboardForEachContributor,
    dashboardForEachRepo: dashboardForEachRepo,
    runWidgets: runWidgets
}