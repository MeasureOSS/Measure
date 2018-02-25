const wrap = require('word-wrap');
const fs = require('fs-extra');
const path = require('path');

const utils = require('./utils');
const NICE_ERRORS = require('./nice_errors');

function copyAuthPHP(options) {
    const outputAuthPHP = path.join(options.userConfig.output_directory, "auth");
    return new Promise((resolve, reject) => {
        fs.copy(path.join(__dirname, "..", "php", "auth"), outputAuthPHP, e => {
            if (e) {
                return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(e, outputAuthPHP));
            }
            fs.copy(path.join(__dirname, "..", "php", "login.php"),
                path.join(options.userConfig.output_directory, "login.php"), e => {
                if (e) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(e, outputAuthPHP));
                }
                fs.copy(path.join(__dirname, "..", "php", "logout.php"),
                    path.join(options.userConfig.output_directory, "logout.php"), e => {
                    if (e) {
                        return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(e, outputAuthPHP));
                    }
                    return resolve(options);
                });
            });
        });
    })
}

const setupRuntimeGithub = function(options) {
    return new Promise((resolve, reject) => {
        fs.readFile("php/github-login.php", {encoding: "utf-8"}, (err, data) => {
            data = data.replace("define('OAUTH2_CLIENT_ID', '');", 
                "define('OAUTH2_CLIENT_ID', '" + options.userConfig.authentication.github.client_id + "');");
            data = data.replace("define('OAUTH2_CLIENT_SECRET', '');", 
                "define('OAUTH2_CLIENT_SECRET', '" + options.userConfig.authentication.github.client_secret + "');");
            data = data.replace("define('GITHUB_PERMITTED_ORGANIZATION', '');", 
                "define('GITHUB_PERMITTED_ORGANIZATION', '" + options.userConfig.authentication.github.organization + "');");
            const outputFile = path.join(options.userConfig.output_directory, "github-login.php");
            fs.writeFile(outputFile, data, {encoding: "utf8"}, err => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_API(err, outputFile));
                }
                return resolve(options);
            });
        })
    });
}

const writeTemplate = function(options) {
    return new Promise((resolve, reject) => {
        const outputFile = path.join(options.userConfig.output_directory, "php.tmpl");
        var tmplvars = {isReport: true, title: "", html: "HTMLHTML"};
        options.templates.report(tmplvars, (err, output) => {
            if (err) return reject(err);
            output = utils.fixOutputLinks(output, outputFile, options);
            fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                }
                return resolve(options);
            })
        });
    });
}

const writeAuthList = function(auths, options) {
    return new Promise((resolve, reject) => {
        fs.readFile("php/authlist.php", {encoding: "utf-8"}, (err, data) => {
            var authList = auths.map(a => '"' + a.name + '" => "' + a.php_verifier + '"').join(",");
            data = data.replace("$auth_list = array();", "$auth_list = array(" + authList + ");")
            const outputFile = path.join(options.userConfig.output_directory, "authlist.php");
            fs.writeFile(outputFile, data, {encoding: "utf8"}, err => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_API(err, outputFile));
                }
                return resolve(options);
            });
        })
    });
}

const setupRuntimeAuth = function(options) {
    return new Promise((resolve, reject) => {
        if (!options.userConfig.authentication) {
            console.warn(wrap("WARNING: no authentication will be required to edit " +
                "organizations and notes in the generated dashboards. To require " +
                "authentication, add an authentication key to config.yaml.", {width:65}));
            writeAuthList([], options).then(function(options) {
                return resolve(options);
            })
            return;
        }
        var valid_auths = [], bad_auths = new Set();
        for (var aname in AUTHS) {
            var a = AUTHS[aname];
            a.name = aname;
            if (options.userConfig.authentication[aname]) {
                var missing = [];
                a.config_fields.forEach(f => {
                    if (!options.userConfig.authentication[aname][f]) missing.push(f);
                });
                if (missing.length > 0) {
                    var s = missing.length == 1 ? "" : "s";
                    var isare = missing.length == 1 ? "is" : "are";
                    var missinglist = missing.join(", ");
                    console.warn(wrap(`WARNING: ${a.display_name} authentication was specified ` +
                        `but field${s} ${missinglist} ${isare} missing from config.yaml, ` +
                        `so ${a.display_name} authentication is not available.`, {width:65}));
                    bad_auths.add(aname);
                } else {
                    valid_auths.push(a);
                }
            }
        }
        var valid_auth_names = new Set(valid_auths.map(v => { return v.name; }));
        var unknown_auths = Object.keys(options.userConfig.authentication)
            .filter(x => !valid_auth_names.has(x))
            .filter(x => !bad_auths.has(x));
        if (valid_auths.length == 1) {
            return resolve(writeTemplate(options)
                .then(options => writeAuthList([valid_auths[0]], options))
                .then(options => valid_auths[0].setup(options)));
        } else if (valid_auths.length > 1) {
            console.warn(wrap("WARNING: You have multiple authentication entries in " +
                "the configuration; currently using only the first, " +
                `${valid_auths[0].display_name}.`, {width:65}));
            return resolve(writeTemplate(options)
                .then(options => writeAuthList([valid_auths[0]], options))
                .then(options => valid_auths[0].setup(options)));
        } else if (unknown_auths.length > 0) {
            console.warn(wrap(`WARNING: unknown authentication providers (${unknown_auths.join(", ")}) ` +
                "set in the configuration and ignored.", {width:65}));
            return resolve(options);
        } else {
            // shouldn't really get here
            return resolve(options);
        }
    });
}

const AUTHS = {
    github: {
        config_fields: ["client_id", "client_secret", "organization"],
        display_name: "Github",
        setup: setupRuntimeGithub,
        php_verifier: "github_verify"
    }
};

module.exports = {
    setupRuntimeAuth: setupRuntimeAuth,
    copyAuthPHP: copyAuthPHP
}