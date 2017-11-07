const path = require('path');
const fs = require('fs-extra');

const utils = require('./utils');
const dashboards = require('./dashboards');
const NICE_ERRORS = require('./nice_errors');

function indexPages(options) {
    return new Promise((resolve, reject) => {
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
            teams = Object.keys(options.userConfig.teams).map(teamname => {
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

    })
}

function copyAssets(options) {
    const outputAssets = path.join(options.userConfig.output_directory, "assets");
    return new Promise((resolve, reject) => {
        fs.copy("assets", outputAssets, e => {
            if (e) {
                return reject(NICE_ERRORS.COULD_NOT_WRITE_OUTPUT(err, outputAssets));
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

function writeFront(options, links, orgs) {
    return new Promise((resolve, reject) => {
        const outputSlugAll = "index-include-org.html";
        const outputSlugExcludeOrg = "index-outside-org.html";
        const outputSlugRedirect = "index.html";
        const outputSlug = options.limit.excludeOrg ? outputSlugExcludeOrg : outputSlugAll;
        const outputFile = path.join(options.userConfig.output_directory, outputSlug);
        const outputFileRedirect = path.join(options.userConfig.output_directory, outputSlugRedirect);
        var tmplvars = {links: links, widgets: options.htmls, orgs: orgs, isOverview: true};
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

module.exports = {
    writeFront: writeFront,
    indexPages: indexPages,
    frontPage: frontPage
}