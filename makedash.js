const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const path = require('path');
const fs = require('fs-extra');
const async = require('async');
const wrap = require('word-wrap');
const util = require('util');
const glob = require('glob');
const sqlite3 = require('sqlite3');
const entries = require('object.entries');
const moment = require('moment');
const request = require('request');

const reports = require('./lib/reports');
const utils = require('./lib/utils');
const dashboards = require('./lib/dashboards');
const pages = require('./lib/pages');
const loads = require('./lib/loads');
const checking = require('./lib/checking');
const runtime_auth = require('./lib/runtime_auth');
const NICE_ERRORS = require('./lib/nice_errors');

if (!Object.entries) { entries.shim(); }

var db;


function connectToDB(options) {
    /*
    Normal connection to MongoDB. This is the MongoDB being run by ghcrawler.
    */
    return new Promise((resolve, reject) => {
        var url = 'mongodb://localhost:27017/ghcrawler';
        MongoClient.connect(url, {connectTimeoutMS: 6000, keepAlive: 5000}, function(err, mdb) {
            if (err) return reject(NICE_ERRORS.NO_MONGO_ERROR(err));
            db = mdb;
            //console.log("Connected correctly to server.");
            return resolve(Object.assign({db: mdb}, options));
        });
    })
}

function getAllOrgUsers(options) {
    return new Promise((resolve, reject) => {
        var sqlite3 = require('sqlite3').verbose();
        var db = new sqlite3.Database(options.sqliteDatabase, (err) => {
            if (err) return reject(NICE_ERRORS.COULD_NOT_OPEN_DB(err, options.sqliteDatabase));
            var questionmarks = [];
            for (i=0; i<options.userConfig.my_organizations.length; i++) {
                questionmarks.push("?");
            }
            var sql = "select p.login, p.joined, p.left, o.name, o.id as orgid " +
                "from orgs o left outer join people2org p " +
                "on o.id = p.org";
            db.all(sql, [], (err, results) => {
                db.close();
                if (err) return reject(err);
                var org2People = {}, orgDetails = {};
                results.forEach(function(r) {
                    if (!org2People[r.name.toLowerCase()]) org2People[r.name.toLowerCase()] = [];
                    if (r.login) {
                        org2People[r.name.toLowerCase()].push({login: r.login, joined: r.joined, left: r.left});
                    }
                    orgDetails[r.name.toLowerCase()] = r.orgid;
                })
                options.org2People = org2People;
                options.orgDetails = orgDetails;

                options.userConfig.my_organizationsTitle = "Measure";
                if (options.userConfig.main_organization) {
                    options.userConfig.my_organizationsTitle = options.userConfig.main_organization
                }
                else if (options.userConfig.my_organizations.length > 0) {
                    options.userConfig.my_organizationsTitle = options.userConfig.my_organizations[0];
                }

                // and override config to have orgnames in lowercase as well, so that when
                // widgets use them to look up entries in org2People, it works
                options.userConfig.my_organizations = options.userConfig.my_organizations.map(n => n.toLowerCase());

                return resolve(options);
            })
        });
    });
}

function getMyOrgUsers(options) {
    return new Promise((resolve, reject) => {
        if (!options.userConfig.my_organizations || options.userConfig.my_organizations.length === 0) {
            // we don't have any orgs defined as ours, so skip
            return resolve(options);
        }
        options.myOrgUsers = [];
        options.userConfig.my_organizations.forEach(o => {
            var people = options.org2People[o.toLowerCase()];
            if (people) {
                options.myOrgUsers = options.myOrgUsers.concat(people);
            }
        });
        return resolve(options);
    });
}



function api(options) {
    return new Promise((resolve, reject) => {
        fs.readFile("php/api.php", {encoding: "utf-8"}, (err, data) => {
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

function apiSecret(options) {
    return new Promise((resolve, reject) => {
        function apiSecretWrite(secret) {
            fs.readFile("php/secret.php", {encoding: "utf-8"}, (err, data) => {
                data = data.replace(
                    "$secret = 'Eihiqu4a Ma7Ek0ae Hozai5ci eish4Shi phiiw6Un ohD8wi3k';",
                    "$secret = '" + secret + "';"
                );
                const outputFile = path.join(options.userConfig.output_directory, "secret.php");
                fs.writeFile(outputFile, data, {encoding: "utf8"}, err => {
                    if (err) {
                        return reject(NICE_ERRORS.COULD_NOT_WRITE_API(err, outputFile));
                    }
                    return resolve(options);
                });
            })
        }

        var sqlite3 = require('sqlite3').verbose();
        var db = new sqlite3.Database(options.sqliteDatabase, (err) => {
            if (err) return reject(NICE_ERRORS.COULD_NOT_OPEN_DB(err, options.sqliteDatabase));
            db.all("select * from secret", [], (err, rows) => {
                if (err) { return reject(NICE_ERRORS.COULD_NOT_READ_DB(err)); }
                if (rows.length > 0) {
                    return apiSecretWrite(rows[0].secret);
                } else {
                    var secret = utils.randomString(50);
                    db.run("insert into secret (secret) values (?)", [secret], (err) => {
                        if (err) return reject(NICE_ERRORS.COULD_NOT_WRITE_SECRET(err));
                        apiSecretWrite(secret);
                    })
                }
            })
        });
    });
}

const tableDefinitions = [
    "notes (id INTEGER PRIMARY KEY, login TEXT, note TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "orgs (id INTEGER PRIMARY KEY, name TEXT UNIQUE)",
    "people2org (id INTEGER PRIMARY KEY, org INTEGER, login TEXT, joined DATETIME DEFAULT CURRENT_TIMESTAMP, left DATETIME)",
    "orgChanges (id INTEGER PRIMARY KEY, org INTEGER, change TEXT, destination INTEGER)",
    "secret (secret TEXT)",
    "bio (login TEXT PRIMARY KEY, name TEXT, company TEXT, blog TEXT, location TEXT, email TEXT, hireable TEXT)"
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

function apidbOrg(options) {
    return new Promise((resolve, reject) => {
        var sqlite3 = require('sqlite3').verbose();
        var db = new sqlite3.Database(options.sqliteDatabase, (err) => {
            if (err) return reject(NICE_ERRORS.COULD_NOT_OPEN_DB(err, options.sqliteDatabase));
            async.each(options.userConfig.my_organizations, (orgName, done) => {
                db.run("INSERT OR IGNORE INTO orgs(name) VALUES('"+orgName+"')", [], done);
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

/* Look for changes marked in the database -- orgs deleted or merged -- and actually execute them */
function apidbActionChanges(options) {
    return new Promise((resolve, reject) => {
        var sqlite3 = require('sqlite3').verbose();
        var db = new sqlite3.Database(options.sqliteDatabase, (err) => {
            if (err) return reject(NICE_ERRORS.COULD_NOT_OPEN_DB(err, options.sqliteDatabase));
            db.all("select id, org, change, destination from orgChanges", [], (err, results) => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_READ_ORG_CHANGES(err))
                }
                async.eachSeries(results, (row, done) => {
                    if (row.change == "delete") {
                        // just blow away that org, and remove everyone from it
                        db.run("delete from orgs where id = ?", [row.org], (err) => {
                            if (err) return done(err);
                            return db.run("delete from people2org where org = ?", [row.org], done);
                        })
                    } else if (row.change == "merge") {
                        // move everyone into the destination, and then remove the org
                        db.run("update people2org set org = ? where org = ?", [row.destination, row.org], (err) => {
                            if (err) return done(err);
                            return db.run("delete from orgs where id = ?", [row.org], done);
                        })
                    }
                }, (err) => {
                    if (err) return reject(err);
                    // remove all orgChanges rows, because they've been processed
                    db.run("delete from orgChanges", [], (err) => {
                        if (err) return reject(err);
                        db.close();
                        return resolve(options);
                    });
                })
            });
        });
    });
}

function createMongoIndexes(options) {
    let indexes = [
        {collection: "pull_request", fields: {"updated_at":1}},
        {collection: "issue_comment", fields: {"updated_at":1}},
        {collection: "issue", fields: {"updated_at":1}}
    ];
    return new Promise((resolve, reject) => {
        async.each(indexes, (index, done) => {
            options.db.collection(index.collection).ensureIndex(index.fields, {}, done);
        }, err => {
            if (err) return reject(err);
            resolve(options);
        })
    })
}

function leave(options) {
    /* And shut all our stuff down. Don't close down ghcrawler itself. */
    options.db.close();
    if (options.userConfig.debug) {
        console.log(`Dashboards generated OK in directory '${options.userConfig.output_directory}'.`);
        console.log(`Database ensured in directory '${options.userConfig.database_directory}'.`);
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


var startupTime = (new Date()).getTime();
loads.loadTemplates()
    .then(loads.readConfig)
    .then(loads.loadWidgets)
    .then(connectToDB)
    .then(checking.confirmCrawler)
    .then(checking.confirmTokens)
    .then(checking.confirmActivity)
    .then(pages.calculateCodeHash)
    .then(pages.previousGeneratedAtAndHash)
    .then(createMongoIndexes)
    .then(api)
    .then(apidb)
    .then(apidbOrg)
    .then(apiSecret)
    .then(apidbActionChanges)
    .then(getAllOrgUsers)
    .then(getMyOrgUsers)
    .then(runtime_auth.setupRuntimeAuth)
    .then(runtime_auth.copyAuthPHP)
    .then(dashboards.dashboardForEachTeam)
    .then(dashboards.dashboardForEachRepo)
    .then(dashboards.changedContributors)
    .then(dashboards.dashboardForEachContributor)
    .then(dashboards.dashboardForEachOrg)
    .then(reports)
    .then(pages.frontPage)
    .then(pages.indexPages)
    .then(pages.generatedAtAndHash)
    .then(pages.searchPage)
    .then(leave)
    .catch(e => {
        try {
            if (db) db.close();
            if (e.isNiceError) {
                console.error("Problem message:")
                console.error(e.message);
            } else {
                require("stacktrace-js").fromError(e)
                    .then(function(frames) {
                        var lineno = 0, sourcefile = "(an unknown file)";
                        if (frames.length) {
                            lineno = frames[0].lineNumber + ":" + frames[0].columnNumber;
                            sourcefile = path.relative(__dirname, frames[0].fileName);
                        }
                        console.error("\nAn internal error has occurred: " + e.message + ".\n" +
                            "Internal errors are by definition a bug in Measure, and should be reported.\n" +
                            "The error was detected at line " + lineno + " of '" + sourcefile + "'.\n" + 
                            "This should never happen, and I am halting in abject failure.");
                    })
                    .catch(function(ste) {
                        console.error("\nAn internal error has occurred: " + e.message + ".\n" +
                            "Internal errors are by definition a bug in Measure, and should be reported.\n" +
                            "Additionally, while handling that error another error occurred: " + 
                                ste.message + ".\n" +
                            "The original error may have been " + e.stack.split("\n")[1].trim() + "\n" +
                            "This should never happen, and I am halting in abject failure.");
                    })
            }
        } catch(ste) {
            console.error("\nAn internal error has occurred: " + e.message + ".\n" +
                "Internal errors are by definition a bug in Measure, and should be reported.\n" +
                "Additionally, while handling that error another error occurred: " + 
                    ste.message + ".\n" +
                "The original error may have been " + e.stack.split("\n")[1].trim() + "\n" +
                "This should never happen, and I am halting in abject failure.");
        }
    });
