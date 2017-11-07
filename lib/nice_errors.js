const StackTraceParser = require('stacktrace-parser');
const wrap = require('word-wrap');

/*
We define some "nice" errors; these have detailed helpful error text to
attempt to make things easier to use.
*/

function notyetWarning(orgs, repos) {
    var warning = "WARNING: there seem to be no database entries for " +
        "some of your repositories. You may need to wait a little " +
        "longer for the data to arrive before these dashboards " +
        "can be generated.\n" +
        "Alternatively, you may need to tell the crawler to fetch " +
        "these data. Run the following commands in the ghcrawler-cli " +
        "folder:\n" +
        "node bin/cc orgs " + orgs.join(" ") + "\n" +
        "node bin/cc queue " + repos.join(" ") + "\n" +
        "node bin/cc start 10\n";
    return warning;
}


function NiceError(name, message) {
    this.message = wrap(
        message.replace(/\n +/g, ' ') || 'Badly created nice error', 
        {width: 65}
    );
    this.stack = (new Error()).stack;
    this.isNiceError = true;
}
NiceError.prototype = Object.create(Error.prototype);
NiceError.prototype.constructor = NiceError;

function renderStack(e) {
    var st = StackTraceParser.parse(e.stack)[0];
    var parts = __dirname.split("/");
    var parent = parts.slice(0, parts.length-1).join("/")
    var fn = st.file.replace(parent + "/", "");
    return `${e.message}, ${fn}:${st.lineNumber}`;
}
const NICE_ERRORS = {
    notyetWarning: notyetWarning,
    NO_CONFIG_ERROR: fn => new NiceError("NoConfigFileError", 
        `I looked for the configuration file, "${fn}", and couldn't find
        it. This file needs to exist to set up which repositories to monitor
        and where to put the generated dashboard file. Please copy
        config.yaml.example to config.yaml and then edit it to taste.`),
    NO_MONGO_ERROR: e => new NiceError("NoDatabaseError", 
        `The database doesn't seem to be running, so I can't get information
        from it. Perhaps you need to run "docker-compose up" in the
        "ghcrawler/docker" directory.

        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    NO_COLLECTION_ERROR: (orgs, repos) => new NiceError("NoRepoCollectionError", 
        notyetWarning(orgs, repos)),
    BAD_CONFIG_ERROR: (e, fn) => new NiceError("MisunderstoodConfigError",
        `I couldn't understand the configuration file "${fn}". The issue
        is on line ${e.mark.line + 1} at position ${e.mark.position}.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e.reason}".)`),
    UNEXPECTED_LIMIT_TYPE: (limit) => new NiceError("UnexpectedLimitTypeError",
        `I was asked to generate a dashboard of a type "${limit.limitType}",
        which I don't know how to do. This is a coding error.`),
    NO_OUTPUT_DIR_CONFIGURED: (fn) => new NiceError("NoOutputDirectoryError",
        `I couldn't understand the configuration file "${fn}". The output directory
        doesn't seem to be set correctly: it needs to be a path to a directory where
        the dashboard will be created.`),
    NONSTRING_OUTPUT_DIR_CONFIGURED: (fn) => new NiceError("NoOutputDirectoryError",
        `I couldn't understand the configuration file "${fn}". The output directory
        doesn't seem to be set correctly: it needs to be a path to a directory where
        the dashboard will be created, and a single string, not an array. The line
        in ${fn} should look like this:

        \noutput_directory: dashboard
        \nor
        \noutput_directory: /path/to/dashboard`),
    BAD_OUTPUT_DIR_CONFIGURED: (e, fn, od) => new NiceError("OutputDirectoryError",
        `I couldn't understand the configuration file "${fn}". The output directory
        is set to "${od}" but I couldn't use that directory.

        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    NO_DATABASE_DIR_CONFIGURED: (fn) => new NiceError("NoDatabaseDirectoryError",
        `I couldn't understand the configuration file "${fn}". The database directory
        doesn't seem to be set correctly: it needs to be a path to a directory where
        the dashboard will be created.`),
    NONSTRING_DATABASE_DIR_CONFIGURED: (fn) => new NiceError("NoDatabaseDirectoryError",
        `I couldn't understand the configuration file "${fn}". The database directory
        doesn't seem to be set correctly: it needs to be a path to a directory where
        the dashboard will be created, and a single string, not an array. The line
        in ${fn} should look like this:

        \ndatabase_directory: dashboard
        \nor
        \ndatabase_directory: /path/to/dashboardfolder`),
    BAD_DATABASE_DIR_CONFIGURED: (e, fn, od) => new NiceError("DatabaseDirectoryError",
        `I couldn't understand the configuration file "${fn}". The database directory
        is set to "${od}", but I couldn't use that directory.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    COULD_NOT_WRITE_OUTPUT: (e, ofn) => new NiceError("OutputWriteError",
        `I couldn't write the dashboard output file. I was trying to write it to
        ${ofn}, but that didn't work, so I'm giving up.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    COULD_NOT_WRITE_API: (e, ofn) => new NiceError("APIWriteError",
        `I couldn't write the dashboard's admin API PHP script. I was trying to write it to
        ${ofn}, but that didn't work, so I'm giving up.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    COULD_NOT_OPEN_DB: (e, ofn) => new NiceError("DBCreateError",
        `I couldn't create the dashboard's admin database. I was trying to write it to
        ${ofn}, but that didn't work, so I'm giving up.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    COULD_NOT_CREATE_TABLES: (e, ofn) => new NiceError("DBCreateTableError",
        `I couldn't set up the dashboard's admin database, so I'm giving up.
        
        \n\n(The error is described like this, which may not be helpful:
        "${e}".)`),
    WIDGET_ERROR: (e, widget) => new NiceError("WidgetError",
        `One of the dashboard widgets ("${widget.name}") had a problem, 
        so I've skipped over it. This is really an internal error, and
        should be reported.
        \n(The error is described like this, which will help in the report:
        ${renderStack(e)})
        \n\n`),
    MISSING_COLLECTIONS: (missing) => new NiceError("DBError",
        `We seem to be missing some collections of data about repositories
        and issues. The missing collections are named: ${missing.join(', ')}.
        To fix this, try re-running the crawler (for now; we'll handle this
        better later.)`)
}

module.exports = NICE_ERRORS;
