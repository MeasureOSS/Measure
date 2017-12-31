# How to write Measure widgets

Measure dashboards are composed of "widgets"; small boxes which each show one metric or piece of information. A widget is a small independent piece of JavaScript code which queries the Measure database to calculate its metric and then displays that metric using one of a number of templates; a graph, or a big number, or a table.

## Basic widget creation

Your widget is expected to be a Node.js module which exports one function. That function takes two parameters, `options` and `callback`. It should call the callback with the results of a template function.

The key point about a widget is that the infrastructure only grants it access to the relevant database information. So each widget can assume that it can just select from all info available to it, and Measure ensures that for a widget on the contributor dashboard for contributor `stuartlangridge`, the widget only sees database info about that user.

### A widget example

This is `widgets/repo/openPRsList.js`:

```
module.exports = function(options, callback) {
    options.db.pull_request.find({state: "open"}, {html_url: 1, title: 1}).toArray().then(openNowPR => {
        let result = {
            title: "Open PRs",
            list: openNowPR.map(pr => { 
                return {html: '<a href="' + pr.html_url + '">' + pr.title + '</a>'}; 
            })
        }
        options.templates.list(result, callback);
    }).catch(e => { callback(e); });;
}
```

See that it exports one function. It then queries the `pull_request` collection for all open PRs (those with `state == "open"`), and uses that information to populate a `list` template with a list of those open PRs. Note that the widget does not specify the repository it's inspecting; instead, Measure will call this widget once _per repository_, and each time the widget just queries the `pull_request` collection; that query will be restricted to only the PRs _for that repository_. The widget does not have to (and should not) attempt to restrict its query by repository itself.

### Querying the database

The Measure database is MongoDB. You are provided access to the relevant collections through the `options.db` object. Examples of a (relevant subset of a) document in each collection follow.

#### `options.db.issue`

Note that the `issue` collection _also contains pull requests_, identifiable with a `pull_request == true` attribute. If you want to calculate a metric only on issues that are not pull requests, be sure to filter PRs out of your results.

```
{
    "_id" : (mongodb document ID)
    "url" : "https://api.github.com/repos/stuartlangridge/sorttable/issues/20",
    "repository_url" : "https://api.github.com/repos/stuartlangridge/sorttable",
    "html_url" : "https://github.com/stuartlangridge/sorttable/issues/20",
    "id" : 244413926,
    "number" : 20,
    "title" : "Fails on one out of four columns",
    "user" : { "login" : "uahim" },
    "labels" : [],
    "state" : "open",
    "locked" : false,
    "assignee" : null,
    "assignees" : [],
    "milestone" : null,
    "comments" : 2,
    "created_at" : "2017-07-20T15:56:35Z",
    "updated_at" : "2017-07-20T16:14:18Z",
    "closed_at" : null,
    "closed_by" : null,
}
```

#### `options.db.pull_request`

Only contains pull requests; if you want to calculate a metric on PRs only, it's better to use this collection than to use `issue` with `pull_request: true`.

```
{
    "_id" : (mongodb document ID)
    "url" : "https://api.github.com/repos/stuartlangridge/sorttable/pulls/9",
    "id" : 61385915,
    "html_url" : "https://github.com/stuartlangridge/sorttable/pull/9",
    "issue_url" : "https://api.github.com/repos/stuartlangridge/sorttable/issues/9",
    "number" : 9,
    "state" : "closed",
    "locked" : false,
    "title" : "Fix the \"node.getAttribute is not a function\" error",
    "user" : { "login" : "Veve2" },
    "created_at" : "2016-03-02T11:23:24Z",
    "updated_at" : "2016-03-02T17:28:55Z",
    "closed_at" : "2016-03-02T17:28:55Z",
    "merged_at" : "2016-03-02T17:28:55Z",
    "merge_commit_sha" : "c515108b2c676951153a9f4d722bee6df40ede26",
    "assignee" : null,
    "assignees" : [],
    "requested_reviewers" : [],
    "milestone" : null,
    "head" : {
        "label" : "Veve2:patch-1",
        "ref" : "patch-1",
        "sha" : "fe502615c927147acec60c49d65d4fad8024573e",
        "user" : { "login" : "Veve2" },
        "repo" : null
    },
    "base" : {
        "label" : "stuartlangridge:master",
        "ref" : "master",
        "sha" : "609793374ae6b31a13849e0b95effe1be0a9c9e5",
        "user" : { "login" : "stuartlangridge" },
        "repo" : { "full_name" : "stuartlangridge/sorttable" }
    },
    "merged" : true,
    "mergeable" : null,
    "rebaseable" : null,
    "mergeable_state" : "unknown",
    "merged_by" : { "login" : "stuartlangridge" },
    "comments" : 0,
    "review_comments" : 0,
    "maintainer_can_modify" : false,
    "commits" : 0,
    "additions" : 0,
    "deletions" : 0,
    "changed_files" : 0
}
```

#### `options.db.issue_comment`

Comments on issues.

```
{
    "_id" : (mongodb document ID)
    "url" : "https://api.github.com/repos/stuartlangridge/sorttable/issues/comments/317030711",
    "html_url" : "https://github.com/stuartlangridge/sorttable/pull/18#issuecomment-317030711",
    "issue_url" : "https://api.github.com/repos/stuartlangridge/sorttable/issues/18",
    "id" : 317030711,
    "user" : { "login" : "arichnad" },
    "created_at" : "2017-07-21T15:23:14Z",
    "updated_at" : "2017-07-21T15:23:14Z"
}
```

#### `options.db.user`

Users. Must only be used from contributor, org, and team widgets.

```
{
    "_id" : (mongodb document ID)
    "login" : "acosme",
    "id" : 339732,
    "avatar_url" : "https://avatars2.githubusercontent.com/u/339732?v=4",
    "gravatar_id" : "",
    "url" : "https://api.github.com/users/acosme",
    "html_url" : "https://github.com/acosme",
    "type" : "User",
    "name" : "Adriano Cosme",
    "company" : "Proteste",
    "blog" : "",
    "location" : "Rio de Janeiro",
    "email" : null,
    "hireable" : null,
    "bio" : null,
    "created_at" : "2010-07-21T13:49:48Z",
    "updated_at" : "2017-11-27T17:02:47Z"
}
```

### The options object

The options object contains the following:

* `options.db`: interface to MongoDB collections in the database, as above
* `options.templates`: the list of template functions to create a widget. See "Templates" below
* `options.config`: the user configuration for Measure, from `config.yaml`. Mostly useful for access to `options.config.my_organizations`
* `options.org2People`: a precalculated dictionary of Measure organization names and the users therein: `{myorgname: [{login: "auser", joined: (date), left: (date)}]}`
* `options.url`: A utility function (see "Widget utilities" below)
* `options.COLORS`: a list of colors to be used in graphs, so that the dashboard looks consistent. Use `options.COLORS[0]`, `options.COLORS[1]`, etc.
* `options.limitedTo`: an indication of which thing this widget is currently being run for. When Measure runs, for example, a `repo`-type widget for a particular repository, `options.limitedTo` will be set to the repository name. If you feel like you need to use this to have widgets alter their behavior, think hard about ways to avoid doing that; it is not a good idea to vary widget behavior depending on exactly what they're being run for

## Templates

Measure provides various widget templates. Each is a function which takes two parameters, a dictionary of configuration and a callback when finished. Calling the template will almost certainly be the last thing a widget does, and therefore passing the overall widget callback as the template callback is expected.

Some templates are special cases for internal Measure working. They are not listed here and should be considered not for public use.

All widgets expect the configuration dict to contain a `title` key, to be used as a title for the widget. This title will be ellipsized if too long. Do not write the name of the repo/contributor/etc in a widget title; make it just the name of the metric (for example, "Open Issues"). Widget titles do not have to be unique.

### `options.templates.graph`

Draws a graphical chart.

Expects a config key `graphdata`, which is a JSON-serialized string of a [Chart.js](http://www.chartjs.org/) config dictionary to draw a chart.

See "Adjustable charts" below for how to draw graphs with an adjustable slider to change time period, and to add multiple time periods (for example, monthly and weekly) on the same widget.

### `options.templates.list`

Writes an HTML unordered list.

Expects a config key `list`, which is an Array of objects with key `html`, which is HTML of a list item content.

Example:

```
options.template.list({list: [
    {html: "The first list item"},
    {html: "A second <strong>list</strong> item"}
], title: "Example list"}, callback)
```

### `options.templates.bignumber`

Used for displaying one single calculated number (for example, the number of open issues), optionally with a link to Github and an indication of how this has changed.

Expects `bignumber`, a number, `unit`, a text description of what the number is measuring, `changename` and `changeamount`, optional fields to define whether the number has changed and when the change happened, and `link`, an optional URL for more information.

Example (which would show that the number of closed issues has dropped by 12 since November):

```
options.templates.bignumber({
    title: "Closed Issues",
    bignumber: 35,
    unit: "issues",
    changename: "November",
    changeamount: -12,
    link: "https://github.com/myorg/myrepo/issues"
}, callback);
```

### `options.templates.bignumberstats`

As `bignumber`, but allows three extra parameters as strings: `mean`, `median`, and `pc95` for showing the mean, median, and 95th percentile of the statistic. (See "Widget utilities" below for utility functions to calculate these statistics).

### `options.templates.table`

For rendering tabular information. Expects `columns`, an Array of objects with `name` key, and `rows`, an Array of objects with `cells` key, each of which has one object with `text` and optional `link` key.

Example:

```
options.templates.table({
    title: "Events timeline",
    columns: [{name:"Event"}, {name:"Type"}, {name: "Date"}],
    rows: [
        {cells: [{text: "Sent a PR", link: pr_url}, {text: "PR"}, {text: "2 days ago"}]},
        {cells: [{text: "Filed an issue"}, {text: "issue"}, {text: "5 days ago"}]},
        {cells: [{text: "Joined the company"}, {text: "staff"}, {text: "125 days ago"}]},
    ]
}, callback);
```

## Selecting a dashboard

There are dashboards for repositories, organizations, teams, and contributors, and for everything collectively. To place a widget on a particular type of dashboard, add it to the `widgets/contributor`, `widgets/org`, `widgets/repo`, or `widgets/root` directories. (The "front page", which shows summaries for all repositories, is "root"). If a widget should show on more than one type of dashboard, place it in one and add a symlink in the others; don't duplicate the actual widget file if you can avoid it because it makes maintenance harder. Dashboards assemble widgets in alphabetical order by widget filename, so it can be useful to name your widgets as 10_mywidgetname.js or similar.

## Widget utilities

Widgets have access to various utility functions to avoid reimplementing them lots of times.

### `options.url`

The `options.url` function is to be used to make a link to another dashboard. It takes two parameters, a `type` (`contributor`, `repo`, `org`, or `team`) and a name. If a widget lists a contributor name, that name should be a link, thus:

```'<a href="' + options.url("contributor", contributor_name) + '">' + contributor_name + "</a>"```

### `widgetUtils`

To get access to these widget utility functions, add `var widgetUtils = require("../widgetUtils");` to your widget.

#### `widgetUtils.averageArray`, `widgetUtils.medianArray`, `widgetUtils.pc95Array`

Take an array of numbers and return a mean, a median, and a 95th percentile respectively.

#### `widgetUtils.datesBetween: function(startString, endString, format, increment)`

Works out which "time periods" are between two dates. For example, say a bug is opened on 19th August and it is currently December 12th. Which months should get credit for that bug being open in a graph? Answer: August, September, October, November, December. Calculating this is more annoying than it at first seems, so this function does it for you. Call as `widgetUtils.datesBetween("2017-08-19", "2017-12-12", "YYYY-ww", "weeks")` or `widgetUtils.datesBetween("2017-08-19", "2017-12-12", "YYYY-MM", "months")`.

## Adjustable charts

Measure provides a Chart.js extension to allow charts with a slider, which adjusts the time period shows on the graph. It also allows multiple different sets of chart data to be available on one graph and toggleable, so the graph can be switched between (for example) data by month and data by week.

A normal graph template config object looks roughly like this:

```
options.templates.graph({
    title: "Total open issues",
    graphdata: JSON.stringify({
        type: "line",
        data: {
            labels: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
            datasets: [{
                data: [10, 5, 4, 15, 6, 9, 9, 4, 5, 10, 10, 12],
                borderColor: options.COLORS[0],
                borderWidth: 2,
                pointStyle: "rect",
                label: "Open issues"
            }]
        }
    })
}, callback);
```

If we wish this graph to be adjustable, then we nest graph data inside a new `adjustable` key:

```
options.templates.graph({
    title: "Total open issues",
    graphdata: JSON.stringify({
        type: "line",
        data: {
            adjustable: {
                Monthly: widgetUtils.fillGaps({
                    minimumLength: 5,
                    default: true,
                    labels: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
                    datasets: [{
                        data: [10, 5, 4, 15, 6, 9, 9, 4, 5, 10, 10, 12],
                        borderColor: options.COLORS[0],
                        borderWidth: 2,
                        pointStyle: "rect",
                        label: "Open issues"
                    }],
                    sliderInitial: 6
                })
            }
        }
    })
}, callback)
```

Here we add one data series, `Monthly`, which will present with a slider to adjust the amount of data shown on the graph. The slider will not allow going below `minimumLength` units, and will slide all the way to showing all the data on the graph, so this slider will allow setting the graph's range from "all twelve months" to "the most recent five months". The initial value of the slider will be "the most recent six months", as defined by `sliderInitial`. The title of the graph will be the key used in the dictionary (this is why `Monthly` has a capital letter).

Wrapping the dataset in `widgetUtils.fillGaps()` is not compulsory but recommended; this will provide zero values for "missing" months or weeks in the dataset (so if the database query returned no data at all for August, this call will add a 0 value to `datasets.data` and a label at the appropriate place).

Further complete graph definitions can be added as additional keys in the `data` directory (many of the Measure widgets also aggregate the data weekly and provide a `Weekly` key, for example). When multiple graphs are added thus, the one with `default: true` is displayed by default (if none specify, then the first is displayed).
