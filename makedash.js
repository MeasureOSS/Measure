const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const path = require('path');
const fs = require('fs-extra');
const async = require('async');
const mu = require('mu2');
const yaml = require('js-yaml');
const wrap = require('word-wrap');
const util = require('util');
const glob = require('glob');
const sqlite3 = require('sqlite3');
const StackTraceParser = require('stacktrace-parser');
const entries = require('object.entries');
const moment = require('moment');
if (!Object.entries) { entries.shim(); }

var db;
// mongo collections used by widgets.
// get this list with:
// egrep -oh 'options.db.[a-z_]+' widgets/*/*.js | sed 's/options.db.//g' | sort | uniq
var EXPECTED_COLLECTIONS = ["issue", "issue_comment", "pull_request", "user"];

/*
The way the dashboard is created is this: we have a collection of "widgets",
which are given access to the ghcrawler database and can do whatever they want,
and then return some HTML, and the HTML is assembled into the final static
dashboard.
*/

function loadTemplates() {
    /*
    We first load and compile widget HTML templates for later. This is a
    list of template files found in the templates/*.tmpl folder. We don't dynamically
    load them so that we can have subsidiary files, partials, and the like.
    Realistically, widgets use these by name, so just adding a new one to be
    dynamically picked up doesn't buy us much.
    */
    const TEMPLATES_LIST = ["list", "bignumber", "graph", "dashboard", "front", 
        "table", "dl", "notes", "orgs"];

    return new Promise((resolve, reject) => {
        /*
        Load each of the template files and compile them to a template object.
        */
        mu.root = __dirname + '/templates';
        var options = {templates: {}};
        async.map(TEMPLATES_LIST, (tn, done) => {
            mu.compile(tn + ".tmpl", function(err, ctmpl) {
                if (err) {
                    console.warn("Skipping bad template", tn, err);
                    return done();
                }
                done(null, {name: tn, template: ctmpl});
            })
        }, (err, results) => {
            if (err) { return reject(err); }
            var widget_counter = 1;
            results.forEach(r => {
                /*
                Template objects have a render method which returns a node stream.
                We don't really want widgets to have to understand that, so we spin
                up a little function for each template; the widget can then just
                call options.templates.templateName({my:data}, callback) to get their
                data rendered with a template and pass rendered HTML to the callback.
                */
                if (r) {
                    options.templates[r.name] = function(view, done) {
                        var bailed = false, output = [];
                        
                        function doneOK() {
                            if (bailed) return;
                            bailed = true;
                            done(null, output.join(""));
                        }

                        let augmented_view = Object.assign({
                            unique_id: r.name + "_" + widget_counter++
                        }, view);

                        mu.render(r.template, augmented_view)
                            .on('data', function(data) { output.push(data.toString()); })
                            .on('error', function(err) {
                                bailed = true;
                                return done(err);
                            })
                            .on('finish', doneOK)
                            .on('close', doneOK)
                            .on('end', doneOK)
                    }
                }
            })
            return resolve(options);
        })
    });
}

function loadWidgets(options) {
    /*
    So, we need to load the widgets. We don't execute them yet;
    we just load them into a list. This is dynamic, in that we search the widgets
    folder and list everything in it; one of the goals here is that there should be
    as little as possible configuration required. Where we can do something
    automatically, or deduce what should be done, then we should do so; don't require
    a bunch of configuration to be created in order to set all this up. So, any widgets
    in the "widgets" folder are included. A plugin needs to be in a *.js file, and
    may export a function `run(options, callback)` where options is an object with properties
    `db`: an object with properties for each of the relevant ghcrawler collections, which are 
        pull_request_commit, statuses, subscribers, pull_request_commits, deadletter, 
        issue_comments, contributors, stargazers, issue, issue_comment, commits, commit, 
        reviews, review_comments, pull_request, repo, user, issues.
    `templates`: a list of simple HTML templates for widgets. Currently available:
        `list`: takes parameters `title` and `list` and displays a list as requested
        `dashboard`: widgets don't use this. This template is the dashboard itself.
    */
    return new Promise((resolve, reject) => {
        var pth = path.join(__dirname, "widgets");
        glob(pth + "/*/*.js", function(err, files) {
            if (err) { return reject(err); }
            async.map(files, function(fn, done) {
                var mod_details;
                try {
                    var parts = fn.split("/");
                    var name = parts[parts.length-1].replace(/\.js$/,'');
                    if (options.userConfig.debug && options.userConfig.onlyTheseWidgets && 
                        options.userConfig.onlyTheseWidgets.indexOf(name) == -1) {
                        console.warn("Skipping widget", name, "because config says so");
                        return done(null, null);
                    }
                    var index = "99";
                    var mm = name.match(/^([0-9]+)_(.*)$/);
                    if (mm) {
                        index = mm[1];
                        name = mm[2];
                    }
                    mod_details = {
                        module: require(fn),
                        name: name,
                        widgetType: parts[parts.length-2],
                        index: index
                    };
                } catch(e) {
                    console.warn("Skipping ill-formed widget", fn, e);
                    // here mod_details is null, because this didn't load
                }
                done(null, mod_details);
            }, function(err, mods) {
                if (err) { return reject(err); }
                var valid_mods = mods.filter(m => !!m);
                var m2 = {};
                valid_mods.forEach(function(vm) {
                    if (!m2[vm.widgetType]) { m2[vm.widgetType] = []; }
                    m2[vm.widgetType].push(vm);
                })
                //console.log("Loaded widgets", util.inspect(m2, {depth:null}));
                return resolve(Object.assign({widgets: m2}, options));
            });
        });
    });
}

function connectToDB(options) {
    /*
    Normal connection to MongoDB. This is the MongoDB being run by ghcrawler.
    */
    return new Promise((resolve, reject) => {
        var url = 'mongodb://localhost:27017/ghcrawler';
        MongoClient.connect(url, function(err, mdb) {
            if (err) return reject(NICE_ERRORS.NO_MONGO_ERROR(err));
            db = mdb;
            //console.log("Connected correctly to server.");
            return resolve(Object.assign({db: mdb}, options));
        });
    })
}

function getMyOrgUsers(options) {
    return new Promise((resolve, reject) => {
        if (!options.userConfig.my_organisations || options.userConfig.my_organisations.length === 0) {
            // we don't have any orgs defined as ours, so skip
            return resolve(options);
        }
        var sqlite3 = require('sqlite3').verbose();
        var db = new sqlite3.Database(options.sqliteDatabase, (err) => {
            if (err) return reject(NICE_ERRORS.COULD_NOT_OPEN_DB(err, options.sqliteDatabase));
            var questionmarks = [];
            for (i=0; i<options.userConfig.my_organisations.length; i++) {
                questionmarks.push("?");
            }
            var sql = "select p.login from orgs o inner join people2org p " +
                "on o.id = p.org " +
                "where lower(o.name) in (" + questionmarks.join(",") + ") " +
                "and p.left is null";
            db.all(sql, options.userConfig.my_organisations.map(o => { return o.toLowerCase(); }), (err, results) => {
                db.close();
                if (err) return reject(err);
                if (results.length > 0) {
                    options.myOrgUsers = results.map(r => { return r.id; });
                }
                return resolve(options);
            })
        });

    });
}

function notyetWarning(orgs, repos) {
    var warning = "WARNING: there seem to be no database entries for " +
        "some of your repositories. You may need to wait a little " +
        "longer for the data to arrive before these dashboards " +
        "can be generated.\n" +
        "Alternatively, you may need to tell the crawler to fetch " +
        "these data. Run the following commands in the ghcrawler-cli " +
        "folder:\n" +
        "node bin/cc orgs " + orgs.join(" ") + "\n" +
        "node bin/cc queue " + repos.join(" ") + "\n" +
        "node bin/cc start\n";
    return warning;
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
                            console.warn(wrap(notyetWarning(orgs, unfound), {width: 65}));
                    }

                    /*
                    Confirm that there are at least some issues for each repo in your
                    config. If not, show a warning.
                    */
                    async.eachLimit(repo_names, 5, function(repo_name, done) {
                        issue.find({html_url: { $regex: new RegExp(repo_name), $options: 'i' }}).limit(1).toArray().then(iss => {
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

/*
We define some "nice" errors; these have detailed helpful error text to
attempt to make things easier to use.
*/

function NiceError(name, message) {
    this.message = wrap(
        message.replace(/\n +/g, ' ') || 'Badly created nice error', 
        {width: 65}
    );
    this.stack = (new Error()).stack;
    this.isNiceError = true;
}
NiceError.prototype = Object.create(Error.prototype);
NiceError.prototype.constructor = NiceError;

function renderStack(e) {
    var st = StackTraceParser.parse(e.stack)[0];
    var fn = st.file.replace(__dirname + "/", "");
    return `${e.message}, ${fn}:${st.lineNumber}`;
}
const NICE_ERRORS = {
    NO_CONFIG_ERROR: fn => new NiceError("NoConfigFileError", 
        `I looked for the configuration file, "${fn}", and couldn't find
        it. This file needs to exist to set up which repositories to monitor
        and where to put the generated dashboard file. Please copy
        config.yaml.example to config.yaml and then edit it to taste.`),
    NO_MONGO_ERROR: e => new NiceError("NoDatabaseError", 
        `The database doesn't seem to be running, so I can't get information
        from it. Perhaps you need to run "docker-compose up" in the
        "ghcrawler/docker" directory.

        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    NO_COLLECTION_ERROR: (orgs, repos) => new NiceError("NoRepoCollectionError", 
        notyetWarning(orgs, repos)),
    BAD_CONFIG_ERROR: (e, fn) => new NiceError("MisunderstoodConfigError",
        `I couldn't understand the configuration file "${fn}". The issue
        is on line ${e.mark.line + 1} at position ${e.mark.position}.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e.reason}".)`),
    NO_OUTPUT_DIR_CONFIGURED: (fn) => new NiceError("NoOutputDirectoryError",
        `I couldn't understand the configuration file "${fn}". The output directory
        doesn't seem to be set correctly: it needs to be a path to a directory where
        the dashboard will be created.`),
    NONSTRING_OUTPUT_DIR_CONFIGURED: (fn) => new NiceError("NoOutputDirectoryError",
        `I couldn't understand the configuration file "${fn}". The output directory
        doesn't seem to be set correctly: it needs to be a path to a directory where
        the dashboard will be created, and a single string, not an array. The line
        in ${fn} should look like this:

        \noutput_directory: dashboard
        \nor
        \noutput_directory: /path/to/dashboard`),
    BAD_OUTPUT_DIR_CONFIGURED: (e, fn, od) => new NiceError("OutputDirectoryError",
        `I couldn't understand the configuration file "${fn}". The output directory
        is set to "${od}" but I couldn't use that directory.

        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    NO_DATABASE_DIR_CONFIGURED: (fn) => new NiceError("NoDatabaseDirectoryError",
        `I couldn't understand the configuration file "${fn}". The database directory
        doesn't seem to be set correctly: it needs to be a path to a directory where
        the dashboard will be created.`),
    NONSTRING_DATABASE_DIR_CONFIGURED: (fn) => new NiceError("NoDatabaseDirectoryError",
        `I couldn't understand the configuration file "${fn}". The database directory
        doesn't seem to be set correctly: it needs to be a path to a directory where
        the dashboard will be created, and a single string, not an array. The line
        in ${fn} should look like this:

        \ndatabase_directory: dashboard
        \nor
        \ndatabase_directory: /path/to/dashboardfolder`),
    BAD_DATABASE_DIR_CONFIGURED: (e, fn, od) => new NiceError("DatabaseDirectoryError",
        `I couldn't understand the configuration file "${fn}". The database directory
        is set to "${od}", but I couldn't use that directory.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    COULD_NOT_WRITE_OUTPUT: (e, ofn) => new NiceError("OutputWriteError",
        `I couldn't write the dashboard output file. I was trying to write it to
        ${ofn}, but that didn't work, so I'm giving up.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    COULD_NOT_WRITE_API: (e, ofn) => new NiceError("APIWriteError",
        `I couldn't write the dashboard's admin API PHP script. I was trying to write it to
        ${ofn}, but that didn't work, so I'm giving up.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    COULD_NOT_OPEN_DB: (e, ofn) => new NiceError("DBCreateError",
        `I couldn't create the dashboard's admin database. I was trying to write it to
        ${ofn}, but that didn't work, so I'm giving up.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    COULD_NOT_CREATE_TABLES: (e, ofn) => new NiceError("DBCreateTableError",
        `I couldn't set up the dashboard's admin database, so I'm giving up.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    WIDGET_ERROR: (e, widget) => new NiceError("WidgetError",
        `One of the dashboard widgets ("${widget.name}") had a problem, 
        so I've skipped over it. This is really an internal error, and
        should be reported.
        \n(The error is described like this, which will help in the report:
        ${renderStack(e)})
        \n\n`),
    MISSING_COLLECTIONS: (missing) => new NiceError("DBError",
        `We seem to be missing some collections of data about repositories
        and issues. The missing collections are named: ${missing.join(', ')}.
        To fix this, try re-running the crawler (for now; we'll handle this
        better later.)`)
}

function readConfig(options) {
    /*
    The config is a yaml file, because that's easier to write for community
    managers than json, which is picky about formatting.
    We try to detect as many issues as possible and provide useful help.
    */
    const config_file_name = 'config.yaml';
    return new Promise((resolve, reject) => {
        try {
            var doc = yaml.safeLoad(fs.readFileSync(config_file_name, 'utf8'));
        } catch (e) {
            if (e.code === "ENOENT") { return reject(NICE_ERRORS.NO_CONFIG_ERROR(config_file_name)); }
            if (e.name === "YAMLException") { return reject(NICE_ERRORS.BAD_CONFIG_ERROR(e, config_file_name));}
            return reject(e);
        }
        if (!doc.github_repositories || !Array.isArray(doc.github_repositories)) {
            return reject(NICE_ERRORS.NO_REPOS_CONFIGURED(config_file_name));
        }
        if (!doc.output_directory) {
            return reject(NICE_ERRORS.NO_OUTPUT_DIR_CONFIGURED(config_file_name));
        }
        if (typeof doc.output_directory !== "string") {
            return reject(NICE_ERRORS.NONSTRING_OUTPUT_DIR_CONFIGURED(config_file_name, doc.output_directory));
        }
        if (!doc.database_directory) {
            return reject(NICE_ERRORS.NO_DATABASE_DIR_CONFIGURED(config_file_name));
        }
        if (typeof doc.database_directory !== "string") {
            return reject(NICE_ERRORS.NONSTRING_DATABASE_DIR_CONFIGURED(config_file_name, doc.database_directory));
        }

        function make_exist(dir) {
            try {
                var ods = fs.statSync(dir);
            } catch(e) {
                if (e.code === "ENOENT") {
                    fs.ensureDirSync(dir);
                }
            }
        }

        try {
            make_exist(doc.output_directory);
        } catch(e) {
            return reject(NICE_ERRORS.BAD_OUTPUT_DIR_CONFIGURED(e, 
                config_file_name, doc.output_directory));
        }
        try {
            make_exist(doc.database_directory);
        } catch(e) {
            return reject(NICE_ERRORS.BAD_DATABASE_DIR_CONFIGURED(e, 
                config_file_name, doc.output_directory));
        }

        // smash case on the org name of the repos
        var nr = [];
        doc.github_repositories.forEach(repo => {
            var parts = repo.split("/");
            var lcrepo = parts[0].toLowerCase() + "/" + parts[1];
            nr.push(lcrepo);
        })
        doc.github_repositories = nr;

        return resolve(Object.assign({userConfig: doc}, options));
    });
}

/* These are basically monkeypatches. The top level keys are collections; inside that are methods.
   Each monkeypatch defines a function with parameters (repo, existing); this means that when
   a widget calls db.issue.find({whatever:foo}), the {issue: {find: ...}} monkeypatch will get called with
   a repo parameter naming a github repository ("stuartlangridge/sorttable", frex) and the existing
   query ({whatever:foo}). It is the monkeypatch's job to return a new dict, to be used instead of
   "existing", which does whatever "existing" does PLUS also limits the query to only those documents
   matching the repo name that was passed in. */
const LIMITS_MATCH = (regexp_value, existing, fieldname) => {
    const matcher = {};
    matcher[fieldname] = {$regex: new RegExp(regexp_value, "i")}
    return { $and: [ existing, matcher ] }
}
const LIMITS_IN = (userlist, existing, fieldname) => {
    const matcher = {};
    matcher[fieldname] = {$in: userlist}
    return { $and: [ existing, matcher ] }
}
const LIMITS = {
    root: {
        issue: { 
            find: (r,e) => { return e; },
            count: (r,e) => { return e; },
            distinct: (r,e) => { return e; },
            aggregate: (r,e) => { return e; },
        },
        issue_comment: { 
            find: (r,e) => { return e; },
            count: (r,e) => { return e; },
            distinct: (r,e) => { return e; },
            aggregate: (r,e) => { return e; },
        },
        pull_request: { 
            find: (r,e) => { return e; },
            count: (r,e) => { return e; },
            distinct: (r,e) => { return e; },
            aggregate: (r,e) => { return e; },
        },
    },
    contributor: {
        user: {
            find: (u,e) => { return {$and: [e, {login: u}]} }
        },
        pull_request: {
            find: (u,e) => { return {$and: [e, {"user.login": u}]} },
            count: (u,e) => { return {$and: [e, {"user.login": u}]} },
            distinct: (u,e) => { return {$and: [e, {"user.login": u}]} }
        },
        issue: {
            find: (u,e) => { return {$and: [e, {"user.login": u}]} },
            count: (u,e) => { return {$and: [e, {"user.login": u}]} },
            distinct: (u,e) => { return {$and: [e, {"user.login": u}]} }
        },
        issue_comment: {
            find: (u,e) => { return {$and: [e, {"user.login": u}]} },
            count: (u,e) => { return {$and: [e, {"user.login": u}]} },
            distinct: (u,e) => { return {$and: [e, {"user.login": u}]} }
        }
    },
    repo: {
        issue: {
            find: (r,e) => { return LIMITS_MATCH(r + "$", e, "repository_url") },
            count: (r,e) => { return LIMITS_MATCH(r + "$", e, "repository_url") },
            distinct: (r,e) => { return LIMITS_MATCH(r + "$", e, "repository_url") },
            aggregate: (repo, existing) => {
                var nexisting = existing.slice();
                nexisting.unshift({$match: {repository_url: {$regex: new RegExp(repo + "$", "i")}}});
                return nexisting;
            }
        },
        issue_comment: {
            find: (r,e) => { return LIMITS_MATCH(r + "/issues/comments/[0-9]+$", e, "url") },
            count: (r,e) => { return LIMITS_MATCH(r + "/issues/comments/[0-9]+$", e, "url") },
            distinct: (r,e) => { return LIMITS_MATCH(r + "/issues/comments/[0-9]+$", e, "url") },
            aggregate: (repo, existing) => {
                var nexisting = existing.slice();
                nexisting.unshift({$match: {url: {$regex: new RegExp(repo + "/issues/comments/[0-9]+$", "i")}}});
                return nexisting;
            }
        },
        pull_request: {
            // pull requests in the data don't link directly to their repo, so parse their url
            find: (r,e) => { return LIMITS_MATCH(r + "/pulls/[0-9]+$", e, "url") },
            count: (r,e) => { return LIMITS_MATCH(r + "/pulls/[0-9]+$", e, "url") },
            distinct: (r,e) => { return LIMITS_MATCH(r + "/pulls/[0-9]+$", e, "url") },
            aggregate: (repo, existing) => {
                var nexisting = existing.slice();
                nexisting.unshift({$match: {url: {$regex: new RegExp(repo + "/pulls/[0-9]+$", "i")}}});
                return nexisting;
            }
        }
    },
    excludeOrg: {
        issue: {
            find: (orgusers, e) => { return LIMITS_IN(orgusers, e, "user.login"); },
            count: (orgusers, e) => { return LIMITS_IN(orgusers, e, "user.login"); },
            distinct: (orgusers, e) => { return LIMITS_IN(orgusers, e, "user.login"); },
            aggregate: (orgusers, existing) => {
                var nexisting = existing.slice();
                nexisting.unshift({$match: {"user.login": {$in: orgusers}}});
                return nexisting;
            }
        },
        pull_request: {
            find: (orgusers, e) => { return LIMITS_IN(orgusers, e, "user.login"); },
            count: (orgusers, e) => { return LIMITS_IN(orgusers, e, "user.login"); },
            distinct: (orgusers, e) => { return LIMITS_IN(orgusers, e, "user.login"); },
            aggregate: (orgusers, existing) => {
                var nexisting = existing.slice();
                nexisting.unshift({$match: {"user.login": {$in: orgusers}}});
                return nexisting;
            }
        }
    }
}

function url_lookup(user_collection_name, key) {
    switch(user_collection_name) {
        case "contributor":
            return "$$BASEURL$$/contributor/" + key + ".html";
        case "repo":
            return "$$BASEURL$$/repo/" + key + ".html";
    }
}

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

            var missing = EXPECTED_COLLECTIONS.filter(c => { return !colldict[c] });
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
                            //console.log(mylimit.value, collname, method, util.inspect(nargs, {depth:null}));
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

            var in_params = {db: colldict, templates: options.templates, url: url_lookup};
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

function fixOutputLinks(output, outputFile, options) {
    var rel = path.relative(path.dirname(outputFile), options.userConfig.output_directory);
    if (rel != "") rel += "/";
    return output.replace(/\$\$BASEURL\$\$\//g, rel);
}

function assembleDashboard(options) {
    /*
    Pass all the collected HTML outputs from the widgets to the dashboard
    template, which gives us an actual dashboard. Save that to the output
    file as defined in the config.
    */
    return new Promise((resolve, reject) => {
        const outputSlugAll = options.limit.limitType + "/" + 
            options.limit.value + ".html";
        const outputSlugExcludeOrg = options.limit.limitType + "/" + 
            options.limit.value + 
            "-outside-org" +
            ".html";
        const outputSlug = options.limit.excludeOrg ? outputSlugExcludeOrg : outputSlugAll;
        const outputFile = path.join(options.userConfig.output_directory, outputSlug);
        const outputDir = path.dirname(outputFile);
        let tmplvars = {
            widgets: options.htmls,
            subtitle: options.limit.value,
        };
        if (options.limit.excludeOrg) {
            tmplvars.includeExcludeOrgFilename = outputSlugAll;
            tmplvars.includeExcludeOrgText = "include everyone";
        } else {
            tmplvars.includeExcludeOrgFilename = outputSlugExcludeOrg;
            tmplvars.includeExcludeOrgText = "exclude org members";
        }
        options.templates.dashboard(tmplvars, (err, output) => {
            if (err) return reject(err);
            fs.ensureDirSync(outputDir);
            options.outputFile = outputFile; options.outputSlug = outputSlug;
            output = fixOutputLinks(output, outputFile, options);
            fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                }
                return resolve(options);
            })
        })
    });
}

function api(options) {
    return new Promise((resolve, reject) => {
        fs.readFile("api.php", {encoding: "utf-8"}, (err, data) => {
            options.sqliteDatabase = options.userConfig.database_directory + "/admin.db";
            var rel = path.relative(options.userConfig.output_directory,
                options.sqliteDatabase);
            data = data.replace("$dsn = '';", "$dsn = 'sqlite:' . dirname(__FILE__) . '/" + rel + "';")
            const outputFile = path.join(options.userConfig.output_directory, "api.php");
            fs.writeFile(outputFile, data, {encoding: "utf8"}, err => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_API(err, outputFile));
                }
                return resolve(options);
            });
        })
    });
}

const tableDefinitions = [
    "notes (id INTEGER PRIMARY KEY, login TEXT, note TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "orgs (id INTEGER PRIMARY KEY, name TEXT)",
    "people2org (id INTEGER PRIMARY KEY, org INTEGER, login TEXT, joined DATETIME DEFAULT CURRENT_TIMESTAMP, left DATETIME)"
];
function apidb(options) {
    return new Promise((resolve, reject) => {
        var sqlite3 = require('sqlite3').verbose();
        var db = new sqlite3.Database(options.sqliteDatabase, (err) => {
            if (err) return reject(NICE_ERRORS.COULD_NOT_OPEN_DB(err, options.sqliteDatabase));
            async.each(tableDefinitions, (td, done) => {
                db.run("CREATE TABLE IF NOT EXISTS " + td, [], done);
            }, (err) => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_CREATE_TABLES(err));
                }
                db.close();
                return resolve(options);
            })
        });
    });
}

function leave(options) {
    /* And shut all our stuff down. Don't close down ghcrawler itself. */
    options.db.close();
    console.log(`Dashboards generated OK in directory '${options.userConfig.output_directory}'.`);
    console.log(`Database ensured in directory '${options.userConfig.database_directory}'.`);
    if (options.userConfig.debug) {
        var dur = (new Date()).getTime() - startupTime;
        console.log("Time taken:", moment.duration(dur).as("seconds"), "seconds");
        var timestaken = [];
        for (var widgetname in options.times) {
            timestaken.push([
                widgetname, 
                options.times[widgetname].reduce(function (a, b) { return a + b; }, 0), 
                options.times[widgetname].length
            ]);
        }
        timestaken.sort((a,b) => { return a[1] - b[1]; })
        console.log(timestaken.map(n => { 
            return n[0] + ": " + Math.round(n[1] / 1000) + "s total in " + 
                n[2] + " iterations, " + Math.round(n[1] / n[2]) + "ms/iteration"; 
        }).join("\n"));
    }
}

function frontPage(options) {
    return new Promise((resolve, reject) => {
        let links = options.userConfig.github_repositories.map(op => {
            return {
                link: url_lookup("repo", op),
                title: op
            }
        })
        runWidgets(Object.assign({}, options), {limitType: "root", value: null})
            .then(options => {
                options.templates.front({links: links, widgets: options.htmls}, (err, output) => {
                    if (err) return reject(err);
                    const outputFile = path.join(options.userConfig.output_directory, "index.html");
                    const outputAssets = path.join(options.userConfig.output_directory, "assets");
                    output = fixOutputLinks(output, outputFile, options);
                    fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
                        if (err) {
                            return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                        }
                        fs.copy("assets", outputAssets, e => {
                            if (err) {
                                return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputAssets));
                            }
                            return resolve(options);
                        });
                    })
                })

            })
            .catch(e => { reject(e); })
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

var startupTime = (new Date()).getTime();
loadTemplates()
    .then(readConfig)
    .then(loadWidgets)
    .then(connectToDB)
    .then(confirmCrawler)
    .then(api)
    .then(apidb)
    .then(getMyOrgUsers)
    .then(dashboardForEachRepo)
    .then(dashboardForEachContributor)
    .then(frontPage)
    .then(leave)
    .catch(e => {
        if (db) db.close();
        if (e.isNiceError) {
            console.error("Problem message:")
            console.error(e.message);
        } else {
            console.error("Internal error. (Internal errors are a bug in the code and should be reported.)");
            console.error(e.message);
            console.error(e.stack);
        }
    });