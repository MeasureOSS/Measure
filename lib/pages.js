const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');
const async = require('async');
const hasher = require('folder-hash');
const crypto = require('crypto');

const utils = require('./utils');
const dashboards = require('./dashboards');
const NICE_ERRORS = require('./nice_errors');

function indexPages(options) {
    return new Promise((resolve, reject) => {

        var ipgs = [
            {
                filename: "repositories.html",
                template: options.templates.repositories,
                props: {
                    isRepository: true,
                    links: options.userConfig.github_repositories.map(op => {
                        return { link: utils.url_lookup("repo", op), title: op }
                    }),
                    pageTitle: "Repositories",
                    subtitle: "Repositories"
                }
            },
            {
                filename: "organizations.html",
                template: options.templates.organizations,
                props: {
                    isOrganization: true,
                    orgs: Object.keys(options.org2People).sort().map(org => {
                        return {
                            link: utils.url_lookup("org", org),
                            title: org,
                            count_current: options.org2People[org].filter(p => { return !p.left; }).length,
                            count_left: options.org2People[org].filter(p => { return !!p.left; }).length
                        }
                    }),
                    pageTitle: "Organizations",
                    subtitle: "Organizations"
                }
            },
            {
                filename: "organizations-edit.html",
                template: options.templates["organizations-edit"],
                props: {
                    isOrganization: true,
                    orgs: Object.keys(options.org2People).sort().map(org => {
                        return {
                            title: org,
                            people: options.org2People[org].map(u => { return u.login }).sort().join(", "),
                            id: options.orgDetails[org]
                        }
                    }),
                    pageTitle: "Organizations editor",
                    subtitle: "Organizations editor"
                }
            },
            {
                filename: "teams.html",
                template: options.templates.repositories,
                props: {
                    isTeam: true,
                    links: options.userConfig.teams ? Object.keys(options.userConfig.teams).sort().map(teamname => {
                        return { link: utils.url_lookup("team", teamname), title: teamname }
                    }) : [],
                    pageTitle: "Teams",
                    subtitle: "Teams"
                }
            }
        ];

        async.each(ipgs, (pg, done) => {
            const ofile = path.join(options.userConfig.output_directory, pg.filename);
            pg.template(pg.props, (err, output) => {
                if (err) return done(err);
                output = utils.fixOutputLinks(output, ofile, options);
                fs.writeFile(ofile, output, {encoding: "utf-8"}, err => {
                    if (err) { err.failingFile = ofile; return done(err); }
                    done();
                })
            })
        }, (err) => {
            if (err) {
                if (err.failingFile) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                } else {
                    return reject(err);
                }
            }
            return resolve(options);
        })
    })
}

function copyAssets(options) {
    const outputAssets = path.join(options.userConfig.output_directory, "assets");
    return new Promise((resolve, reject) => {
        fs.copy("assets", outputAssets, e => {
            if (e) {
                return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(e, outputAssets));
            }
            return resolve(options);
        });
    })
}


function frontPage(options) {
    return new Promise((resolve, reject) => {
        let links = options.userConfig.github_repositories.map(op => {
            return {
                link: utils.url_lookup("repo", op),
                title: op
            }
        })
        let orgs = Object.keys(options.org2People).map(org => {
            return {
                link: utils.url_lookup("org", org),
                title: org
            }
        })

        dashboards.runWidgets(Object.assign({}, options),  {limitType: "root", value: null})
            .then(options => { return writeFront(options, links, orgs); })
            .then(options => {
                return dashboards.runWidgets(Object.assign({}, options),  {limitType: "root", value: null, excludeOrg: true})
            })
            .then(options => { return writeFront(options, links, orgs); })
            .then(copyAssets)
            .then(options => {
                resolve(options);
            })
            .catch(e => { reject(e); })
    });
}

function generatedAtAndHash(options) {
    return new Promise((resolve, reject) => {
        var outputFile = path.join(options.userConfig.output_directory, "generated");
        var odata = {
            generated: moment().utc().toISOString(),
            codeHash: options.codeHash
        };
        fs.writeFile(outputFile, JSON.stringify(odata), {encoding: "utf8"}, err => {
            if (err) {
                return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
            }
            return resolve(options);
        });
    })
}

function previousGeneratedAtAndHash(options) {
    return new Promise((resolve, reject) => {
        var outputFile = path.join(options.userConfig.output_directory, "generated");
        fs.readFile(outputFile, {encoding: "utf8"}, (err, data) => {
            try {
                if (err) {
                    options.lastGeneratedAt = moment(0);
                    if (options.userConfig.debug) { console.log("Dashboards being generated afresh."); }
                } else {
                    try {
                        var jdata = JSON.parse(data);
                        options.lastGeneratedAt = moment(jdata.generated);
                        options.lastGeneratedAt.utc();

                        if (jdata.codeHash != options.codeHash) {
                            options.lastGeneratedAt = moment(0);
                            if (options.userConfig.debug) {
                                console.log(`Code has changed; generating all dashboards afresh.`);
                            }
                        } else {
                            if (options.userConfig.debug) {
                                console.log(`Dashboards last generated at ${options.lastGeneratedAt.format()}. ` +
                                    `To generate them from fresh, remove the file ${outputFile}.`);
                            }
                        }

                    } catch(e) {
                        console.warn("Unable to read the last time the dashboard was generated; ignoring.");
                        options.lastGeneratedAt = moment(0);
                    }
                }
                return resolve(options);
            } catch(e) { return reject(e); }
        });
    })
}

function writeFront(options, links, orgs) {
    return new Promise((resolve, reject) => {
        const outputSlugAll = "index-include-org.html";
        const outputSlugExcludeOrg = "index-outside-org.html";
        const outputSlugRedirect = "index.html";
        const outputSlug = options.limit.excludeOrg ? outputSlugExcludeOrg : outputSlugAll;
        const outputFile = path.join(options.userConfig.output_directory, outputSlug);
        const outputFileRedirect = path.join(options.userConfig.output_directory, outputSlugRedirect);
        var tmplvars = {links: links, widgets: options.htmls, orgs: orgs, isOverview: true, pageTitle: options.userConfig.my_organizationsTitle + " - Measure", subtitle: options.userConfig.my_organizationsTitle};
        if (options.limit.excludeOrg) {
            tmplvars.includeExcludeOrgFilename = outputSlugAll;
            tmplvars.excludeOrg = true;
        } else {
            tmplvars.includeExcludeOrgFilename = outputSlugExcludeOrg;
            tmplvars.excludeOrg = false;
        }
        options.templates.front(tmplvars, (err, output) => {
            try {
                if (err) return reject(err);
                var idx = options.limit.excludeOrg ? outputSlugExcludeOrg : outputSlugAll;
                output = utils.fixOutputLinks(output, outputFile, options);
                fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
                    try {
                        if (err) {
                            return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                        }
                        options.templates.redirect({outputSlugAll:path.basename(outputSlugAll), outputSlugExcludeOrg:path.basename(outputSlugExcludeOrg)}, (err, output) => {
                            fs.writeFile(outputFileRedirect, output, {encoding: "utf8"}, err => {
                                if (err) {
                                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                                }
                                return resolve(options);
                            });
                        })
                    } catch(e) { return reject(e); }
                })
            } catch(e) { return reject(e); }
        });
    })
}

function calculateCodeHash(options) {
    /* We want to regenerate all the contributor dashboards automatically
       if something in the code has changed which would cause them to be
       generated differently. So, we calculate a hash of all the files in
       lib, templates, and widgets/contributor. That is then saved in the
       "generated" file in the dashboard; if it's changed since the
       dashboards were generated, we redo all the contributor dashboards. */
    return new Promise((resolve, reject) => {
        var folders = ["../lib", "../templates", "../widgets/contributor", "../config.yaml"];
        async.mapSeries(folders, (folder, done) => {
            hasher.hashElement(path.join(__dirname, folder), done);
        }, (err, results) => {
            try {
                if (err) return reject(NICE_ERRORS.COULD_NOT_HASH(err));
                var hashes = results.map(r => { return r.hash; })
                // Calculate an "overall hash" by hashing the combined string of hashes
                options.codeHash = crypto.createHash("sha1").update(hashes.join(","), "utf-8").digest("hex");
                resolve(options);
            } catch(e) { return reject(e); }
        })
    });
}

function searchPage(options) {
    // get a list of all repos, all orgs, and all contributors, to add to the search list
    // this looks like dashboards.changedContributors
    return new Promise((resolve, reject) => {
        async.map(["issue", "issue_comment", "pull_request"], (coll, done) => {
            options.db.collection(coll).distinct("user.login", {}).then(res => {
                done(null, res);
            }).catch(err => {
                console.log("caught with", err);
                done(err); 
            })
        }, (err, results) => {
            try {
                if (err) { return reject(err); }
                var all_contributors = {};
                results.forEach(ulist => {
                    ulist.forEach(u => { all_contributors[u] = {login: u, name: null}; })
                });

                // get contributor full names
                options.db.collection("user").find({login: {$in: Object.keys(all_contributors)}}, {name:1, login:1}).toArray().then(users => {
                    try {
                        users.forEach(u => {
                            if (all_contributors[u.login]) {
                                all_contributors[u.login].name = u.name;
                                all_contributors[u.login].company = u.company;
                            }
                        })

                        const outputFile = path.join(options.userConfig.output_directory, "search.html");
                        var searchdata = [];
                        for (var k in all_contributors) {
                            searchdata.push({
                                type: "contributor", 
                                name: utils.removeTags(all_contributors[k].name),
                                login: all_contributors[k].login,
                                link: utils.url_lookup("contributor", all_contributors[k].login)
                            });
                        }

                        // repositories
                        searchdata = searchdata.concat(options.userConfig.github_repositories.map(op => {
                            return { type: "repository", link: utils.url_lookup("repo", op), name: op }
                        }));

                        // organizations
                        searchdata = searchdata.concat(Object.keys(options.org2People).sort().map(org => {
                                return { type: "organization", link: utils.url_lookup("org", org), name: org}
                        }));

                        var tmplvars = {
                            searchdata: JSON.stringify(searchdata, null, 2)
                        }
                        options.templates.search(tmplvars, (err, output) => {
                            try {
                                if (err) return reject(err);
                                output = utils.fixOutputLinks(output, outputFile, options);
                                fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
                                    if (err) {
                                        return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                                    }
                                    resolve(options);
                                });
                            } catch(e) {
                                return reject(e);
                            }
                        });
                    } catch(e) {
                        return reject(e);
                    }
                })
            } catch(e) {
                return reject(e);
            }
        })
    })
}

module.exports = {
    writeFront: writeFront,
    indexPages: indexPages,
    frontPage: frontPage,
    generatedAtAndHash: generatedAtAndHash,
    previousGeneratedAtAndHash: previousGeneratedAtAndHash,
    searchPage: searchPage,
    calculateCodeHash: calculateCodeHash
}
