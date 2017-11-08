module.exports = function(options, callback) {
    let result = {
        title: "This organization",
        list: options.limitedTo.sort().map(u => { 
            return {html: '<a href="' + options.url("contributor", u) + '">' + u + '</a>'}; 
        })
    }
    options.templates.list(result, callback);
}