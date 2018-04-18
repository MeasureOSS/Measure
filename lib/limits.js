const util = require("util");
const moment = require("moment");

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
const LIMITS_NOT_IN = (orgusers, existing, userfieldname, datefieldname) => {
    /*
    This is the opposite of makeOrgUserList; it selects items where the relevant user is
    NOT in the org. So it takes a query like
    db.pull_request.find({status: closed})
    and makes it
    db.pull_request.find({
        $and:[
            {status: closed}),
            $or: [
                {login: { $nin: [orguser1, orguser2, orguser3] }},
                {login: orguser1, somedate: {$lt: orguser1.joined}},
                {login: orguser1, somedate: {$gt: orguser1.left}},
                {login: orguser2, somedate: {$lt: orguser2.joined}},
                {login: orguser2, somedate: {$gt: orguser2.left}},
                {login: orguser3, somedate: {$lt: orguser3.joined}},
                {login: orguser3, somedate: {$gt: orguser3.left}}
            ]
        ]
    })
    */
    var matchlist = [];
    var match_nin = {};
    match_nin[userfieldname] = {$nin: orgusers.map(u => u.login)};
    matchlist.push(match_nin);
    orgusers.forEach(u => {
        if (u.joined && u.joined != "") {
            var match_before_join = {};
            match_before_join[userfieldname] = u.login;
            match_before_join[datefieldname] = {$lte: moment(u.joined).toISOString()};
            matchlist.push(match_before_join);
        }
        if (u.left && u.left != "") {
            var match_after_leave = {};
            match_after_leave[userfieldname] = u.login;
            match_after_leave[datefieldname] = {$gte: moment(u.left).toISOString()};
            matchlist.push(match_after_leave);
        }
    })
    const matcher = {$or: matchlist};
    return { $and: [ existing, matcher ] }
}

const makeOrgUserList = (userlist, thisOrgPeople, userfieldname, datefieldname) => {
    /*
    an org query comes in like
    db.pull_request.find({status: closed})
    and we need to make it look like
    db.pull_request.find({
        $and:[
            {status: closed},
            {$or: [
                {login: user1, somedate: {$gt: user1.joined}, somedate: {$lt: user1.left}},
                {login: user2, somedate: {$gt: user2.joined}, somedate: {$lt: user2.left}},
                {login: user3, somedate: {$gt: user3.joined}, somedate: {$lt: user3.left}},
                ...
            ]}
        ]
    })
    This function's job is to construct that $or setup and return it so that the
    wrapper functions can use it.
    If users didn't have joined and left dates, then we wouldn't need the complex $or
    setup; this function would just return {$in: userlist}.

    userfieldname is "login" or "user.login", whichever the table needs.
    datefieldname is the name of the field showing when something was created.
    (a PR or issue is owned by an org if the opening person was in the org at open time.)
    */
    if (userlist.length == 0) { return {}}
    var orlist = [];

    // inefficient to do this every time, but it's quick, and we can cache it later if need be
    var thisOrgPeopleByLogin = {};
    thisOrgPeople.forEach(p => { thisOrgPeopleByLogin[p.login] = p; })

    userlist.forEach(login => {
        var oritem = {};
        oritem[userfieldname] = login;
        oritem[datefieldname] = {};
        if (thisOrgPeopleByLogin[login].left && thisOrgPeopleByLogin[login].left != "") {
            oritem[datefieldname].$lte = thisOrgPeopleByLogin[login].left;
        }
        if (thisOrgPeopleByLogin[login].joined && thisOrgPeopleByLogin[login].joined != "") {
            oritem[datefieldname].$gte = thisOrgPeopleByLogin[login].joined;
        }
        if (Object.keys(oritem[datefieldname]).length == 0) { delete oritem[datefieldname]; }
        orlist.push(oritem);
    });
    return {$or: orlist};
};

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
            find: (userlist,e,thisOrgPeople) => { return {$and: [e, makeOrgUserList(userlist, thisOrgPeople, "login", "created_at")]} }
        },
        pull_request: {
            find: (userlist,e,thisOrgPeople) => { return {$and: [e, makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")]} },
            count: (userlist,e,thisOrgPeople) => { return {$and: [e, makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")]} },
            distinct: (userlist,e,thisOrgPeople) => { return {$and: [e, makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")]} },
            aggregate: (userlist,e,thisOrgPeople) => {
                var nexisting = e.slice();
                nexisting.unshift({$match: makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")});
                return nexisting;
            }
        },
        issue: {
            find: (userlist,e,thisOrgPeople) => { return {$and: [e, makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")]} },
            count: (userlist,e,thisOrgPeople) => { return {$and: [e, makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")]} },
            distinct: (userlist,e,thisOrgPeople) => { return {$and: [e, makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")]} },
            aggregate: (userlist,e,thisOrgPeople) => {
                var nexisting = e.slice();
                nexisting.unshift({$match: makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")});
                return nexisting;
            }
        },
        issue_comment: {
            find: (userlist,e,thisOrgPeople) => { return {$and: [e, makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")]} },
            count: (userlist,e,thisOrgPeople) => { return {$and: [e, makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")]} },
            distinct: (userlist,e,thisOrgPeople) => { return {$and: [e, makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")]} },
            aggregate: (userlist,e,thisOrgPeople) => {
                var nexisting = e.slice();
                nexisting.unshift({$match: makeOrgUserList(userlist, thisOrgPeople, "user.login", "created_at")});
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
            find: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login", "created_at"); },
            count: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login", "created_at"); },
            distinct: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login", "created_at"); },
            aggregate: (orgusers, existing) => {
                var nexisting = existing.slice();
                nexisting.unshift({$match: {"user.login": {$nin: orgusers}}});
                return nexisting;
            }
        },
        pull_request: {
            find: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login", "created_at"); },
            count: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login", "created_at"); },
            distinct: (orgusers, e) => { return LIMITS_NOT_IN(orgusers, e, "user.login", "created_at"); },
            aggregate: (orgusers, existing) => {
                var nexisting = existing.slice();
                nexisting.unshift({$match: {"user.login": {$nin: orgusers}}});
                return nexisting;
            }
        }
    }
}

module.exports = LIMITS;