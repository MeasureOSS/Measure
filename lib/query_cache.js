const util = require("util");
const objectHash = require("object-hash");
const moment = require("moment");

var QUERY_CACHE = {};
var CACHED_KEYS = new Set();

function keyify(key) {
    var oh = objectHash(key);
    //console.log("Caching", util.inspect(key, {depth:null}), "to give", oh);
    return oh;
}

var COUNTS = {
    cached: 0,
    uncached: 0
}

function dump() {
    //console.log(util.inspect(CACHED_KEYS, {depth:null}));
    console.log("Cached queries:", COUNTS.cached, ", uncached:", COUNTS.uncached);
}

function get(key) {
    var result = QUERY_CACHE[key];
    if (result) {
        COUNTS.cached += 1;
        return result;
    } else {
        COUNTS.uncached += 1;
        return null;
    }
}

function set(key, result) {
    QUERY_CACHE[key] = result;
}

function execute_with_cache(actual_function, coll, collname, method, args, options) {
    /* There are three types of methods.
       One calls its callback: you do it as collection.method({query:here}, function(err, results) { ... })
       One returns a promise: you do it as collection.method({query:here}).then(results => {...})
       One returns a cursor: you do it as collection.method({query:here}).limit(4).toArray().then(results => {...})
       We need to handle each in different ways. */

    var key = [collname, method, args];
    CACHED_KEYS.add(key);
    var cache_key = keyify(key);
    
    if (options.userConfig.debug_query_cache) console.log(cache_key, "Processing cache key", collname, method, args);
    var cached_result = get(cache_key);
    if (cached_result) {
        if (options.userConfig.debug_query_cache) console.log(cache_key, "There is a cached result", cached_result);
        if (cached_result.type == "callback") {
            if (typeof(args[args.length - 1]) != "function") {
                throw new Error("We cached a callback result but it's been called as a non-callback method");
            }
            // immediately call their callback with the cached result
            if (options.userConfig.debug_query_cache) console.log(cache_key, "Calling their callback with the cached result");
            return args[args.length-1](null, cached_result.result);
        } else if (cached_result.type == "promise") {
            // return a promise which resolves to the cached result
            if (options.userConfig.debug_query_cache) console.log(cache_key, "Returning a promise which resolves to the cached result");
            return new Promise((resolve, reject) => {
                if (options.userConfig.debug_query_cache) console.log(cache_key, "Returning inside the promise which resolves to the cached result");
                resolve(cached_result.result);
            })
        } else if (cached_result.type == "cursor") {
            // return a fake Cursor with a toArray() which returns a promise that resolves to the cached result
            if (options.userConfig.debug_query_cache) console.log(cache_key, "Returning a cursor with custom toArray which resolves to the cached result");
            return {
                toArray: function() {
                    if (options.userConfig.debug_query_cache) console.log(cache_key, "Returning inside toArray a promise which resolves to the cached result");
                    return new Promise((resolve, reject) => {
                        if (options.userConfig.debug_query_cache) console.log(cache_key, "Returning from inside the toArray promise which resolves to the cached result");
                        resolve(cached_result.result);
                    })
                },
                limit: function() { return this; },
                sort: function() { return this; },
            }
        } else {
            throw new Error("Query cache error: a cached result had no type. " + JSON.stringify(cached_result));
        }
    }

    //console.log(cache_key, "NO CACHE", util.inspect(key, {depth:null,breakLength:Infinity}));

    if (options.userConfig.debug_query_cache) console.log(cache_key, "There is no cached result");
    // Check if we were passed a callback
    if (typeof(args[args.length - 1]) == "function") {
        if (options.userConfig.debug_query_cache) console.log(cache_key, "They have a callback");
        // Override their callback to cache the result and then call their callback
        var orig_callback = args[args.length - 1];
        args[args.length - 1] = function(err, result) {
            if (!err) { set(cache_key, {type: "callback", result: result}); }
            if (options.userConfig.debug_query_cache) console.log(cache_key, "Returning from inside our wrapper callback");
            return orig_callback(err, result);
        }
        // and call the original function to kick everything off
        if (options.userConfig.debug_query_cache) console.log(cache_key, "Calling the real function to start their callback");
        return actual_function.apply(coll, args);
    }

    // We weren't passed a callback. So, now we execute the original and see
    // what we get back.
    if (options.userConfig.debug_query_cache) console.log(cache_key, "Not a callback; calling the real thing");
    var fn_return = actual_function.apply(coll, args);
    if (options.userConfig.debug_query_cache) console.log(cache_key, "The real thing is called");

    if (typeof(fn_return.then) == "function") {
        // it's a promise. So, we need to add a then to the promise
        // which gets the results and caches them, and then return
        // that whole thing
        if (options.userConfig.debug_query_cache) console.log(cache_key, "The real thing is a promise");
        return new Promise((resolve, reject) => {
            fn_return.then(result => {
                if (options.userConfig.debug_query_cache) console.log(cache_key, "The promise resolves");
                set(cache_key, {type: "promise", result: result});
                resolve(result);
            }).catch(e => { reject(e); })
        })
    } else if (typeof(fn_return.limit) == "function") {
        // it's a cursor. So, we need to return a Cursor with an
        // overridden toArray() method which stores the results
        // in the cache before returning them
        if (options.userConfig.debug_query_cache) console.log(cache_key, "The real thing is a cursor");
        var orig_toArray = fn_return.toArray;
        fn_return.toArray = function() {
            if (options.userConfig.debug_query_cache) console.log(cache_key, "Inside the overridden toArray");
            var result = orig_toArray.apply(fn_return, []);
            set(cache_key, {type: "cursor", result: result});
            return new Promise((resolve, reject) => {
                if (options.userConfig.debug_query_cache) console.log(cache_key, "Returning inside the promise inside the overridden toArray");
                resolve(result);
            })
        }
        return fn_return;
    }
}

Set.prototype.difference = function(setB) {
    var difference = new Set(this);
    for (var elem of setB) {
        difference.delete(elem);
    }
    return difference;
}


function prepopulateUsers(options) {
    return new Promise((resolve, reject) => {
        options.db.collection("user").find({}).toArray().then(users => {
            var allUserNames = new Set();
            users.forEach(u => {
                var cache_key = keyify(["user", "find", [ { '$and': [ {}, { login: u.login } ] } ] ]);
                set(cache_key, {type: "cursor", result: [u]});
                allUserNames.add(u.login);
            });
            resolve([options, {allUserNames: allUserNames}]);
        });
    })
}

function prepopulateIssueUserLogins([options, sets]) {
    return new Promise((resolve, reject) => {
        options.db.collection("issue").find({}, {"user.login": 1, repository_url: 1}).toArray().then(issues => {
            var issueUserNames = new Set();
            issues.forEach(i => {
                var key = ["issue", "find", [ { '$and': [ {}, { "user.login": i.user.login } ] }, {repository_url:1} ] ];
                var cache_key = keyify(key);
                set(cache_key, {type: "cursor", result: [i]});
                issueUserNames.add(i.user.login);
            });
            // cache an empty result for users who aren't in the issues list
            var usersWithoutIssues = sets.allUserNames.difference(issueUserNames);
            usersWithoutIssues.forEach(i => {
                var key = ["issue", "find", [ { '$and': [ {}, { "user.login": i } ] }, {repository_url:1} ] ];
                var cache_key = keyify(key);
                set(cache_key, {type: "cursor", result: []});
            })
            resolve([options, sets]);
        });
    })
}

function prepopulateClosedIssueCounts([options, sets]) {
    return new Promise((resolve, reject) => {
        options.db.collection("issue").aggregate([
            {$match: {state: 'closed', pull_request: null}},
            {$group : {_id:"$user.login", count:{$sum:1}}}
        ], function(err, results) {
            var issueAggregateNames = new Set();
            results.forEach(r => {
                var cache_key = keyify(["issue", "count", [ { '$and': [ {state: "closed", pull_request:null}, { "user.login": r._id } ] } ] ]);
                set(cache_key, {type: "promise", result: r.count});
                issueAggregateNames.add(r._id);
            });
            // cache an empty result for users who aren't in the issues aggregate counts list
            var usersWithoutIssueAggregates = sets.allUserNames.difference(issueAggregateNames);
            const oneMonthAgo = moment().add(-1, "month").minute(0).second(0).millisecond(0).toISOString();
            usersWithoutIssueAggregates.forEach(i => {
                var key = ["issue", "count", [ { '$and': [ {state: "closed", pull_request:null, closed_at:{$lt:oneMonthAgo}}, { "user.login": i } ] } ] ];
                var cache_key = keyify(key);
                set(cache_key, {type: "promise", result: 0});
                //console.log("CACHING", util.inspect(key, {depth:null,breakLength:Infinity}), "AS", cache_key);
                var key = ["issue", "count", [ { '$and': [ {state: "closed", pull_request:null}, { "user.login": i } ] } ] ];
                var cache_key = keyify(key);
                set(cache_key, {type: "promise", result: 0});
            })
            resolve([options, sets]);
        });
    })
}


function prepopulate(options) {
    /* An optimisation. Because we run each widget for each contributor, we
       often end up running essentially the same query thousands of times,
       once per contributor. This data is much more efficiently read by
       doing one big query for all the data, grouped by contributor, and 
       then inserting that into the cache in such a way as to seem like this
       data is already cached. 

       So here we do a bunch of the queries that the widgets do, but in one
       go per query (rather than once per contributor per query) and then
       insert those results into the cache.
       */
    return new Promise((resolve, reject) => {
        prepopulateUsers(options)
            .then(prepopulateIssueUserLogins)
            .then(prepopulateClosedIssueCounts)
            .then(() => { 
                console.log("-------------------------------------------- END PREPOP");
                resolve(options); 
            }).catch(e => {reject(e);})
    })
}

module.exports = {
    dump: dump,
    execute_with_cache: execute_with_cache,
    prepopulate: prepopulate
}