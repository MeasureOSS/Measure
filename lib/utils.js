const path = require('path');
const wrap = require('word-wrap');

// Colors to be used by the graphs so they stay consistent
var COLORS = ["#ff7bac", "#4dced0", "#606469"];
// mongo collections used by widgets.
// get this list with:
// egrep -oh 'options.db.[a-z_]+' widgets/*/*.js | sed 's/options.db.//g' | sort | uniq
var EXPECTED_COLLECTIONS = ["issue", "issue_comment", "pull_request", "user"];

function url_lookup(user_collection_name, key) {
    switch(user_collection_name) {
        case "contributor":
            return "$$BASEURL$$/contributor/" + key + ".html";
        case "repo":
            return "$$BASEURL$$/repo/" + key.toLowerCase() + ".html";
        case "org":
            return "$$BASEURL$$/org/" + key + ".html";
        case "team":
            return "$$BASEURL$$/team/" + key + ".html";
    }
}
function fixOutputLinks(output, outputFile, options) {
    var rel = path.relative(path.dirname(outputFile), options.userConfig.output_directory);
    if (rel != "") rel += "/";
    return output.replace(/\$\$BASEURL\$\$\//g, rel);
}
var randomString = function(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for(var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function wrapWithBackslash(str, options) {
    var out = wrap(str, options);
    out = out.replace(/\n/g, "\\\n");
    return out;
}

function removeTags(str){
    if ( str === null){
        return null
    }
    str = str.replace(/[/&<>]/g,"");
    return str.trim();
}

module.exports = {
    COLORS: COLORS,
    EXPECTED_COLLECTIONS: EXPECTED_COLLECTIONS,
    url_lookup: url_lookup,
    fixOutputLinks: fixOutputLinks,
    randomString: randomString,
    wrapWithBackslash: wrapWithBackslash,
    removeTags: removeTags
}