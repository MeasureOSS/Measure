var API = (function() {
    function xhr(method, params, done) {
        var x = new XMLHttpRequest();
        x.open(method, BASE_API_URL + "?" + encodeQS(params), true);
        var t = setTimeout(function() {
            x.abort();
            done(new Error("timeout"));
        }, 3000);
        x.onload = function() {
            var j;
            clearTimeout(t);
            try {
                j = JSON.parse(x.responseText);
            } catch(e) {
                done(new Error(e));
            }
            if (j.exception) {
                return done(j.error);
            }
            done(null, j);
        }
        x.onerror = done;
        x.send();
    }
    function encodeQS(dict) {
        return Object.keys(dict)
            .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(dict[k]))
            .join('&');
    }
    function query(method, queryname, params, done) {
        var nparams = Object.assign({query: queryname}, params);
        if (queryname != "token") {
            if (TOKEN) {
                nparams.token = TOKEN;
            } else {
                // spin until we've got a token
                setTimeout(function() {
                    query(method, queryname, params, done);
                }, 100);
                return;
            }
        }
        xhr(method, nparams, done);
    }

    var TOKEN;
    query("GET", "token", {}, function(err, res) {
        if (err) { return flash("Couldn't contact server", err); }
        TOKEN = res.token;
    })

    return query;
})();

var flash = (function() {
    var fm = document.getElementById("flash_messages");
    var p = document.createElement("p")
    var ul = document.createElement("ul");
    var btn = document.createElement("button");
    btn.appendChild(document.createTextNode("☰"));
    fm.appendChild(btn);
    fm.appendChild(p);
    fm.appendChild(ul);
    btn.onclick = function() { ul.style.display = "block"; }
    ul.onclick = function() { ul.style.display = "none"; }
    function f(message, err) {
        if (err) console.error(err);
        p.textContent = message;
        p.className = "showing";
        var dt = (new Date()).toLocaleTimeString();
        var removeTimer = setTimeout(function() {
            p.className = "";
            p.innerHTML = "";
            var li = document.createElement("li");
            li.appendChild(document.createTextNode("[" + dt + "] " + message));
            if (ul.childNodes.length == 0) {
                ul.appendChild(li);
            } else {
                ul.insertBefore(li, ul.firstChild);
            }
        }, 2000);
    }
    return f;
})();

// tooltips for ellipsized text
(function() {
    Array.prototype.slice.call(document.querySelectorAll("a")).forEach(function(a) {
        var ws = document.defaultView.getComputedStyle(a).whiteSpace;
        var pw = a.parentNode.offsetWidth;
        if ((a.offsetWidth > pw) && ws == "nowrap" && !a.title) a.title = a.textContent;
    })
})()
