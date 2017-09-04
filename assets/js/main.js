var API = (function() {
    function xhr(method, url, body, headers, done) {
        var x = new XMLHttpRequest();
        x.open(method, BASE_API_URL + "/" + url, true);
        if (headers) {
            for (var k in headers) {
                x.setRequestHeader(k, headers[k]);
            }
        }
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
            if (j.error) {
                if (j.error.code == 204) {
                    return done(null, []);
                }
                return done(j.error);
            }
            done(null, j);
        }
        x.onerror = done;
        x.send(body);
    }
    function encodeQS(dict) {
        return Object.keys(dict)
            .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(dict[k]))
            .join('&');
    }
    function get(table, column, value, queryOptions, done) {
        var url = encodeURIComponent(table);
        if (column != "" && value != "" && column && value) url += "/" + encodeURIComponent(column) + "/" + encodeURIComponent(value);
        var qs = encodeQS(queryOptions);
        if (qs.length > 0) url += "?" + qs;
        xhr("GET", url, null, null, done);
    }
    function post(table, fields_and_values, done) {
        var url = encodeURIComponent(table) + "/";
        xhr("POST", url, encodeQS(fields_and_values), {"Content-Type": "application/x-www-form-urlencoded"}, done);
    }
    function _delete(table, id, done) {
        var url = encodeURIComponent(table) + "/" + encodeURIComponent(id);
        xhr("DELETE", url, {}, null, done);
    }

    var available = true;
    get("notes", null, null, {limit: 1}, function(err, v) {
        if (err && err.code == 503 && err.exception == "could not find driver") {
            console.log("Warning: admin database is not available. You may need to install the PHP SQLite driver.");
        }
        if (err) {
            available = false;
        }
    });
    return {
        get: get,
        post: post,
        delete: _delete,
        isAvailable: function() { return available; }
    }
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

Array.prototype.slice.call(document.querySelectorAll("section.notes")).forEach(function(ns) {
    var login = ns.getAttribute("data-login");
    var ul = ns.querySelector("ul");

    function updateNotes() {
        API.get("notes", "login", login, {by: "timestamp"}, function(err, notes) {
            if (err) return flash(err);
            var frag = document.createDocumentFragment();
            notes.forEach(function(n) {
                var li = document.createElement("li");
                var a = document.createElement("a");
                a.appendChild(document.createTextNode("×"));
                a.href = "#";
                a.onclick = function() {
                    API.delete("notes", n.id, function(err) {
                        if (err) return flash("Couldn't delete note", err);
                        updateNotes();
                    })
                }
                li.appendChild(document.createTextNode(n.note + " "));
                li.appendChild(a);
                frag.appendChild(li);
            })
            ul.innerHTML = "";
            ul.appendChild(frag);
        })
    }

    ns.querySelector("button").onclick = function() {
        var n = prompt("Add a note?");
        if (n) {
            API.post("notes", {login: login, note: n}, function(err) {
                if (err) { return flash("Couldn't save note", err); }
                updateNotes();
            })
        }
    }
    updateNotes();
})

