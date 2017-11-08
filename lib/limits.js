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
const LIMITS_MATCH_LIST = (regexp_values, existing, fieldname) => {
    var matcher = {};
    var relist = regexp_values.map(regexp_value => { 
        var d = {};
        d[fieldname] = {$regex: new RegExp(regexp_value, "i")};
        return d;
    })
    matcher = {$or: relist};
    return { $and: [ existing, matcher ] }
}
const LIMITS_NOT_IN = (userlist, existing, fieldname) => {
    const matcher = {};
    matcher[fieldname] = {$nin: userlist}
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
    /* WARNING: if you add new collections here so that widgets can query them,
       you must also update dashboards.changedContributors to check for new
       contributor activity in those collections. */
    contributor: {
        user: {
            find: (u,e) => { return {$and: [e, {login: u}]} }
        },
        pull_request: {
            find: (u,e) => { return {$and: [e, {"user.login": u}]} },
            count: (u,e) => { return {$and: [e, {"user.login": u}]} },
            distinct: (u,e) => { return {$and: [e, {"user.login": u}]} },
            aggregate: (u,e) => {
                var nexisting = e.slice();
                nexisting.unshift({$match: {"user.login": u}});
                return nexisting;
            }
        },
        issue: {
            find: (u,e) => { return {$and: [e, {"user.login": u}]} },
            count: (u,e) => { return {$and: [e, {"user.login": u}]} },
            distinct: (u,e) => { return {$and: [e, {"user.login": u}]} },
            aggregate: (u,e) => {
                var nexisting = e.slice();
                nexisting.unshift({$match: {"user.login": u}});
                return nexisting;
            }
        },
        issue_comment: {
            find: (u,e) => { return {$and: [e, {"user.login": u}]} },
            count: (u,e) => { return {$and: [e, {"user.login": u}]} },
            distinct: (u,e) => { return {$and: [e, {"user.login": u}]} },
            aggregate: (u,e) => {
                var nexisting = e.slice();
                nexisting.unshift({$match: {"user.login": u}});
                return nexisting;
            }
        }
    },
    org: {
        user: {
            find: (userlist,e) => { return {$and: [e, {login: {$in: userlist}}]} }
        },
        pull_request: {
            find: (userlist,e) => { return {$and: [e, {"user.login": {$in:userlist}}]} },
            count: (userlist,e) => { return {$and: [e, {"user.login": {$in:userlist}}]} },
            distinct: (userlist,e) => { return {$and: [e, {"user.login": {$in:userlist}}]} },
            aggregate: (userlist,e) => {
                var nexisting = e.slice();
                nexisting.unshift({$match: {"user.login": {$in:userlist}}});
                return nexisting;
            }
        },
        issue: {
            find: (userlist,e) => { return {$and: [e, {"user.login": {$in:userlist}}]} },
            count: (userlist,e) => { return {$and: [e, {"user.login": {$in:userlist}}]} },
            distinct: (userlist,e) => { return {$and: [e, {"user.login": {$in:userlist}}]} },
            aggregate: (userlist,e) => {
                var nexisting = e.slice();
                nexisting.unshift({$match: {"user.login": {$in:userlist}}});
                return nexisting;
            }
        },
        issue_comment: {
            find: (userlist,e) => { return {$and: [e, {"user.login": {$in:userlist}}]} },
            count: (userlist,e) => { return {$and: [e, {"user.login": {$in:userlist}}]} },
            distinct: (userlist,e) => { return {$and: [e, {"user.login": {$in:userlist}}]} },
            aggregate: (userlist,e) => {
                var nexisting = e.slice();
                nexisting.unshift({$match: {"user.login": {$in:userlist}}});
                return nexisting;
            }
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
    team: {
        issue: {
            find: (r,e) => { return LIMITS_MATCH_LIST(r.map(rr => rr + "$"), e, "repository_url") },
            count: (r,e) => { return LIMITS_MATCH_LIST(r.map(rr => rr + "$"), e, "repository_url") },
            distinct: (r,e) => { return LIMITS_MATCH_LIST(r.map(rr => rr + "$"), e, "repository_url") },
            aggregate: (repo, existing) => {
                var nexisting = existing.slice();
                var ors = repo.map(rr => {return {repository_url: {$regex: new RegExp(rr + "$", "i")}}});
                nexisting.unshift({$match: {$or: ors}});
                return nexisting;
            }
        },
        issue_comment: {
            find: (r,e) => { return LIMITS_MATCH_LIST(r.map(rr => rr + "/issues/comments/[0-9]+$"), e, "url") },
            count: (r,e) => { return LIMITS_MATCH_LIST(r.map(rr => rr + "/issues/comments/[0-9]+$"), e, "url") },
            distinct: (r,e) => { return LIMITS_MATCH_LIST(r.map(rr => rr + "/issues/comments/[0-9]+$"), e, "url") },
            aggregate: (repo, existing) => {
                var nexisting = existing.slice();
                var ors = repo.map(rr => {return {url: {$regex: new RegExp(rr + "/issues/comments/[0-9]+$", "i")}}});
                nexisting.unshift({$match: {$or: ors}});
                return nexisting;
            }
        },
        pull_request: {
            // pull requests in the data don't link directly to their repo, so parse their url
            find: (r,e) => { return LIMITS_MATCH_LIST(r.map(rr => rr + "/pulls/[0-9]+$"), e, "url") },
            count: (r,e) => { return LIMITS_MATCH_LIST(r.map(rr => rr + "/pulls/[0-9]+$"), e, "url") },
            distinct: (r,e) => { return LIMITS_MATCH_LIST(r.map(rr => rr + "/pulls/[0-9]+$"), e, "url") },
            aggregate: (repo, existing) => {
                var nexisting = existing.slice();
                var ors = repo.map(rr => {return {url: {$regex: new RegExp(rr + "/pulls/[0-9]+$", "i")}}});
                nexisting.unshift({$match: {$or: ors}});
                return nexisting;
            }
        }
    },
    excludeOrg: {
        issue: {
            find: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login"); },
            count: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login"); },
            distinct: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login"); },
            aggregate: (orgusers, existing) => {
                var nexisting = existing.slice();
                nexisting.unshift({$match: {"user.login": {$nin: orgusers}}});
                return nexisting;
            }
        },
        pull_request: {
            find: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login"); },
            count: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login"); },
            distinct: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login"); },
            aggregate: (orgusers, existing) => {
                var nexisting = existing.slice();
                nexisting.unshift({$match: {"user.login": {$nin: orgusers}}});
                return nexisting;
            }
        }
    }
}

module.exports = LIMITS;