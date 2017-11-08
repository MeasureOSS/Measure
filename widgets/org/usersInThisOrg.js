module.exports = function(options, callback) {
    let result = {
        title: "This organization",
        list: options.limitedTo.sort((a,b) => { return a.login.localeCompare(b.login); }).map(u => { 
            return {html: '<a href="' + options.url("contributor", u.login) + '">' + u.login + '</a>'}; 
        })
    }
    options.templates.list(result, callback);
}