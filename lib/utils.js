const path = require('path');

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
            return "$$BASEURL$$/repo/" + key + ".html";
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

module.exports = {
    COLORS: COLORS,
    EXPECTED_COLLECTIONS: EXPECTED_COLLECTIONS,
    url_lookup: url_lookup,
    fixOutputLinks: fixOutputLinks
}