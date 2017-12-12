const fs = require('fs');
const glob = require('glob');
const path = require('path');

const utils = require('./utils');
const NICE_ERRORS = require('./nice_errors');

function findReportFiles() {
    return new Promise((resolve, reject) => {
        var pth = path.join(__dirname, "..", "reports");
        glob(pth + "/*.js", function(err, files) {
            if (err) { return reject(err); }
            return resolve(files);
        });
    });
}
function loadReportModule(fn, options) {
    return new Promise((resolve, reject) => {
        var mod = null;
        try {
            var parts = fn.split("/");
            var name = parts[parts.length-1].replace(/\.js$/,'');
            mod = require(fn);
            return resolve({
                module: mod,
                filename: fn,
                name: name
            });
        } catch(e) {
            console.warn("Skipping ill-formed report module", fn, e);
            return resolve(null);
        }
    });
}
function executeReportModule(mod, options, in_params) {
    return new Promise((resolve, reject) => {
        try {
            mod.module(in_params, (err, result) => {
                if (err) {
                    console.warn("Skipping report which threw an error", err, mod.filename);
                    return resolve(null);
                }
                return resolve({result: result, module: mod});
            });
        } catch(e) {
            console.warn("Skipping report which threw an error", e, mod.filename);
            return resolve(null);
        }
    });
}
function writeReport(result, options) {
    return new Promise((resolve, reject) => {
        const outputFile = path.join(options.userConfig.output_directory, "reports", result.module.name + ".html");
        var tmplvars = Object.assign(result.result, {isReport: true, subtitle: result.result.title, pageTitle: result.result.title});
        options.templates.report(tmplvars, (err, output) => {
            if (err) return reject(err);
            output = utils.fixOutputLinks(output, outputFile, options);
            fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                }
                return resolve({
                    slug: result.module.name,
                    title: result.result.title
                });
            })
        });
    });
}
function writeReportList(reports, options) {
    return new Promise((resolve, reject) => {
        const outputFile = path.join(options.userConfig.output_directory, "reports.html");
        options.templates.reportlist({reports:reports, isReport: true, subtitle: "Reports", pageTitle: "Reports"}, (err, output) => {
            if (err) return reject(err);
            output = utils.fixOutputLinks(output, outputFile, options);
            fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                }
                return resolve();
            })
        });
    });
}

module.exports = function reports(options) {
    /* Reports live in reports/*.js, are called with the same parameters as widgets,
       and are expected to pass {title: "Some Title", html: "<some><html>"} to their
       callback, which will then be created as a report named reports/<reportModuleName.html> */
    return new Promise((resolve, reject) => {
        options.db.collections((err, colls) => {
            if (err) { return reject(err); }
            var colldict = {};
            colls.forEach(c => { colldict[c.collectionName] = c; })
            var in_params = {
                db: colldict, 
                templates: options.templates, 
                url: utils.url_lookup,
                config: options.userConfig,
                org2People: options.org2People,
                COLORS: utils.COLORS
            };
            try {
                fs.mkdirSync(path.join(options.userConfig.output_directory, "reports"));
            } catch(e) {
                if (e.code != "EEXIST") { return reject(e); }
            }
            return findReportFiles(options)
                .then(files => Promise.all(files.map(f => loadReportModule(f, options))))
                .then(modules => Promise.all(modules.filter(m=>!!m).map(m => executeReportModule(m, options, in_params))))
                .then(results => Promise.all(results.filter(r=>!!r).map(r => writeReport(r, options))))
                .then(reports => writeReportList(reports, options))
                .then(() => {
                    return resolve(options);
                })
                .catch(e => {
                    return reject(e);
                })
        });
    });
}
