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
            var sql = "select p.login, p.joined, p.left, o.name, o.id as orgid from people2org p left outer join orgs o " +
                "on o.id = p.org";
            db.all(sql, [], (err, results) => {
                db.close();
                if (err) return reject(err);
                var org2People = {};
                results.forEach(function(r) {
                    if (!org2People[r.name.toLowerCase()]) org2People[r.name.toLowerCase()] = [];
                    org2People[r.name.toLowerCase()].push({login: r.login, joined: r.joined, left: r.left});
                })
                options.org2People = org2People;

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
    .then(pages.previousGeneratedAt)
    .then(api)
    .then(apidb)
    .then(getAllOrgUsers)
    .then(getMyOrgUsers)
    .then(dashboards.dashboardForEachTeam)
    .then(dashboards.dashboardForEachRepo)
    .then(dashboards.changedContributors)
    .then(dashboards.dashboardForEachContributor)
    .then(dashboards.dashboardForEachOrg)
    .then(reports)
    .then(pages.frontPage)
    .then(pages.indexPages)
    .then(pages.generatedAt)
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