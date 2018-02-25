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
                return done(new Error(e));
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
        var authtoken = window.localStorage.getItem("jp-authtoken");
        if (method == "POST" && authtoken) { nparams.authtoken = authtoken; }
        xhr(method, nparams, done);
    }

    var TOKEN;
    query("GET", "token", {}, function(err, res) {
        if (err) { return flash("Couldn't contact server", err); }
        TOKEN = res.token;
    })

    return query;
})();

function storeAuthToken(authtoken) {
    window.localStorage.setItem("jp-authtoken", authtoken);
}

var flash = (function() {
    var fm = document.getElementById("flash_messages");
    var remembered = document.createElement("ul");
    remembered.className = "remembered";
    var displaying = document.createElement("ul");
    displaying.className = "displaying";
    var btn = document.createElement("button");
    btn.appendChild(document.createTextNode("!"));
    fm.appendChild(btn);
    fm.appendChild(remembered);
    fm.appendChild(displaying);
    btn.style.display = "none";
    btn.onclick = function() {
        remembered.style.display = "block";
    }
    remembered.onclick = function() {
        remembered.style.display = "none";
    }
    function f(message, err) {
        if (err) console.error(err);
        btn.style.display = "block";
        var displaying_li = document.createElement("li");
        displaying_li.textContent = message;
        displaying.appendChild(displaying_li);
        var dt = (new Date()).toLocaleTimeString();
        var removeTimer = setTimeout(function() {
            displaying_li.style.opacity = 0;
            setTimeout(function() {
                displaying.removeChild(displaying_li);
            }, 250);
            var li = document.createElement("li");
            li.appendChild(document.createTextNode("[" + dt + "] " + message));
            if (remembered.childNodes.length == 0) {
                remembered.appendChild(li);
            } else {
                remembered.insertBefore(li, remembered.firstChild);
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

// check if auth is required
var authRequired = false, authDetails;
(function() {
    var authParams = {};
    var authtoken = window.localStorage.getItem("jp-authtoken");
    if (authtoken) { authParams.authtoken = authtoken; }
    API("GET", "auth", authParams, function(err, res) {
        if (err) { return flash("Couldn't contact server", err); }
        authDetails = res;
        if (res.present && !res.valid) {
            console.log("Provided auth token is invalid; removing it");
            window.localStorage.removeItem("jp-authtoken");
        }
        authRequired = res.required;
        if (authRequired && !res.valid) {
            var a = document.createElement("a");
            a.href = "../login.php";
            a.className = "login-required-link";
            a.appendChild(document.createTextNode("Login required"));
            Array.prototype.slice.call(document.querySelectorAll("section[data-auth-required]")).forEach(function(s) {
                s.appendChild(a.cloneNode(true));
            })
        }
    })
})();

function setInclude(val) {
    if (window.localStorage) {
        window.localStorage.setItem("jp-redirect", val);
    }
}

function expandGraph(node, graphdata) {
    function remove(e) {
        e.preventDefault();
        e.stopPropagation();
        dc.parentNode.removeChild(dc);
    }
    var dc = document.createElement("div");
    var d = document.createElement("div");
    dc.className = "expanded-graph-container";
    d.className = "expanded-graph";
    d.appendChild(node.querySelector("h1").cloneNode(true));
    var a = document.createElement("a");
    a.href = "#";
    a.className = "graph-collapse";
    a.addEventListener("click", remove, false);
    dc.addEventListener("click", function(e) {
        if (e.target === dc) { remove(e); }
    }, false);
    d.appendChild(a);
    var cv = document.createElement("canvas");
    d.appendChild(cv);
    dc.appendChild(d);
    document.body.appendChild(dc);
    graphdata.options.maintainAspectRatio = false;

    var dashboardType = document.querySelector("nav h2").dataset.dashboardType;
    var graphtitle = {
        repo: "Repository",
        contributor: "Contributor",
        team: "Team",
        org: "Organization"
    }[dashboardType] || dashboardType;
    graphdata.options.title = {
        display: true, 
        text: node.querySelector("h1").textContent + ": " + 
            graphtitle + " " + document.querySelector("nav h2").textContent,
        fontColor: "white"
    };
    new Chart(cv, graphdata);
}

Chart.defaults.global.responsive = true;
Chart.defaults.global.maintainAspectRatio = true;
