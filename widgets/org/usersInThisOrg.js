module.exports = function(options, callback) {
    var in_now = [], in_then = [];
    options.org2People[options.limitedToTitle].forEach(u => {
        if (u.left && u.left != "") {
            in_then.push(u);
        } else {
            in_now.push(u);
        }
    })
    in_now.sort((a,b) => { return a.login.localeCompare(b.login); })
    in_then.sort((a,b) => { return a.left.localeCompare(b.left); })
    in_now = in_now.map(u => { return {html: '<a href="' + options.url("contributor", u.login) + '">' + u.login + '</a>'}});
    in_then = in_then.map(u => { return {
        html: '<a href="' + options.url("contributor", u.login) + '">' + u.login + '</a> (' +
            u.joined + " &ndash; " + u.left + ")"
    }});

    var list;
    if (in_now.length > 0 && in_then.length > 0) {
        list = in_now.concat([{html: "<strong>Previous members</strong>"}]).concat(in_then);
    } else if (in_now.length > 0) {
        list = in_now;
    } else if (in_then.length > 0) {
        list = in_then;
    } else {
        list = [{html: "(no members)"}];
    }

    let result = {
        title: "This organization",
        list: list
    }
    options.templates.list(result, callback);
}