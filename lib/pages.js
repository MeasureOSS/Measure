const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');
const async = require('async');

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
                        return { link: utils.url_lookup("org", org),
                            title: org, count: options.org2People[org].length}
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

        /*
        let links = options.userConfig.github_repositories.map(op => {
            return {
                link: utils.url_lookup("repo", op),
                title: op
            }
        });
        const repoOutputFile = path.join(options.userConfig.output_directory, "repositories.html");
        let orgs = Object.keys(options.org2People).sort().map(org => {
            return {
                link: utils.url_lookup("org", org),
                title: org,
                count: options.org2People[org].length
            }
        });
        const orgOutputFile = path.join(options.userConfig.output_directory, "organizations.html");
        let teams = [];
        if (options.userConfig.teams) {
            teams = Object.keys(options.userConfig.teams).sort().map(teamname => {
                return {
                    link: utils.url_lookup("team", teamname),
                    title: teamname
                }
            });
        }
        const teamOutputFile = path.join(options.userConfig.output_directory, "teams.html");

        options.templates.repositories({links:links, isRepository:true}, (err, output) => {
            if (err) return reject(err);
            output = utils.fixOutputLinks(output, repoOutputFile, options);
            fs.writeFile(repoOutputFile, output, {encoding: "utf8"}, err => {
                if (err) {
                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                }

                options.templates.organizations({orgs:orgs, isOrganization:true}, (err, output) => {
                    if (err) return reject(err);
                    output = utils.fixOutputLinks(output, orgOutputFile, options);
                    fs.writeFile(orgOutputFile, output, {encoding: "utf8"}, err => {
                        if (err) {
                            return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                        }

                        options.templates.repositories({links:teams, isTeam:true}, (err, output) => {
                            if (err) return reject(err);
                            output = utils.fixOutputLinks(output, teamOutputFile, options);
                            fs.writeFile(teamOutputFile, output, {encoding: "utf8"}, err => {
                                if (err) {
                                    return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                                }
                                return resolve(options);
                            })
                        });

                    })
                });

            })
        });
        */

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

function generatedAt(options) {
    return new Promise((resolve, reject) => {
        var outputFile = path.join(options.userConfig.output_directory, "generated");
        fs.writeFile(outputFile, moment().utc().toISOString(), {encoding: "utf8"}, err => {
            if (err) {
                return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
            }
            return resolve(options);
        });
    })
}

function previousGeneratedAt(options) {
    return new Promise((resolve, reject) => {
        var outputFile = path.join(options.userConfig.output_directory, "generated");
        fs.readFile(outputFile, {encoding: "utf8"}, (err, data) => {
            if (err) {
                options.lastGeneratedAt = moment(0);
                if (options.userConfig.debug) { console.log("Dashboards being generated afresh."); }
            } else {
                try {
                    options.lastGeneratedAt = moment(data);
                    options.lastGeneratedAt.utc();
                    if (options.userConfig.debug) {
                        console.log(`Dashboards last generated at ${options.lastGeneratedAt.format()}. ` +
                            `To generate them from fresh, remove the file ${outputFile}.`);
                    }
                } catch(e) {
                    console.warn("Unable to read the last time the dashboard was generated; ignoring.");
                    options.lastGeneratedAt = moment(0);
                }
            }
            return resolve(options);
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
        var tmplvars = {links: links, widgets: options.htmls, orgs: orgs, isOverview: true, pageTitle: "Measure", subtitle: "Measure"};
        if (options.limit.excludeOrg) {
            tmplvars.includeExcludeOrgFilename = outputSlugAll;
            tmplvars.excludeOrg = true;
        } else {
            tmplvars.includeExcludeOrgFilename = outputSlugExcludeOrg;
            tmplvars.excludeOrg = false;
        }
        options.templates.front(tmplvars, (err, output) => {
            if (err) return reject(err);
            var idx = options.limit.excludeOrg ? outputSlugExcludeOrg : outputSlugAll;
            output = utils.fixOutputLinks(output, outputFile, options);
            fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
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
            })
        });
    })
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
            if (err) { return reject(err); }
            var all_contributors = {};
            results.forEach(ulist => {
                ulist.forEach(u => { all_contributors[u] = {login: u, name: null}; })
            });

            // get contributor full names
            options.db.collection("user").find({login: {$in: Object.keys(all_contributors)}}, {name:1, login:1}).toArray().then(users => {
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
                        name: all_contributors[k].name,
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
                    if (err) return reject(err);
                    output = utils.fixOutputLinks(output, outputFile, options);
                    fs.writeFile(outputFile, output, {encoding: "utf8"}, err => {
                        if (err) {
                            return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputFile));
                        }
                        resolve(options);
                    });
                });

            })

        })
    })
}

module.exports = {
    writeFront: writeFront,
    indexPages: indexPages,
    frontPage: frontPage,
    generatedAt: generatedAt,
    previousGeneratedAt: previousGeneratedAt,
    searchPage: searchPage
}