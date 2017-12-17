const mu = require('mu2');
const async = require('async');
const path = require('path');
const glob = require('glob');
const yaml = require('js-yaml');
const fs = require('fs-extra');
const NICE_ERRORS = require('./nice_errors');

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
        "table", "dl", "notes", "orgs", "redirect", "fromto", "repositories",
        "organizations", "report", "reportlist", "organizations-edit", "bignumberstats",
        "search", "userBasicInfo"];

    return new Promise((resolve, reject) => {
        /*
        Load each of the template files and compile them to a template object.
        */
        mu.root = __dirname + '/../templates';
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
        var pth = path.join(__dirname, "..", "widgets");
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

        // dedupe
        doc.github_repositories = Array.from(new Set(doc.github_repositories));

        return resolve(Object.assign({userConfig: doc}, options));
    });
}

module.exports = {
    loadWidgets: loadWidgets,
    loadTemplates: loadTemplates,
    readConfig: readConfig
}