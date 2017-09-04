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


/* Linkable charts */
Chart.plugins.register({
    beforeInit: function(c) {
        c.canvas.addEventListener("click", function(e) {
            var el = c.getElementAtEvent(e);
            if (el.length != 1) return;
            el = el[0];
            var ds = el._chart.config.data.datasets[el._datasetIndex];
            if (!ds || !ds.links) return;
            var link = ds.links[el._index];
            if (link) { location.href = link; }
        }, false);
    }
});


/* Adjustable charts */
Chart.plugins.register({
    beforeInit: function(c) {
        /* If this is a normal chart without adjustable data,
           then we have nothing to do; exit. */
        if (!c.config.data.adjustable) return;

        var currentDataType;
        var rememberedSliderValues = {};
        function choose(dataType, options) {
            var ndatasets = JSON.parse(JSON.stringify(c.config.data.adjustable[dataType || currentDataType].datasets));
            var nlabels = JSON.parse(JSON.stringify(c.config.data.adjustable[dataType || currentDataType].labels));

            if (currentDataType == dataType || !dataType) {
                // we're displaying the dataType we've already got, so
                // this is a slider change. Crop the lists, and crop them
                // from the right-hand end
                ndatasets.forEach(function(nd) {
                    nd.data = nd.data.slice(nd.data.length - slider.valueAsNumber);
                })
                console.log("slidermax", slider.max, "sliderval", slider.valueAsNumber, "len", nlabels.length, "so show from", nlabels.length - slider.valueAsNumber);
                nlabels = nlabels.slice(nlabels.length - slider.valueAsNumber);
            } else {
                // this is a change to the dataType
                rememberedSliderValues[currentDataType] = slider.valueAsNumber;
                slider.max = nlabels.length;
                slider.min = c.config.data.adjustable[dataType].minimumLength || 1;
                slider.value = rememberedSliderValues[dataType] || slider.max;
            }
            if (dataType) currentDataType = dataType;

            c.data.datasets = ndatasets;
            c.data.labels = nlabels;
            if (options.update) c.update(0);
        }

        function createSlider() {
            /* A slider for changing the number of dataitems displayed */
            var inp = document.createElement("input");
            inp.type = "range";
            inp.className = "adjustable-graph-slider";
            inp.step = 1;
            if (c.canvas.nextElementSibling) {
                c.canvas.parentNode.insertBefore(inp, c.canvas.nextElementSibling);
            } else {
                c.canvas.parentNode.appendChild(inp);
            }
            inp.onchange = function() {
                choose(null, {update: true}); // don't pass a dataType to stick with the current one
            }
            return inp;
        }

        function createChooser() {
            /* A set of radio buttons for switching between different datasets,
               the names of which are the dataTypes */
            var ul = document.createElement("ul");
            ul.className = "adjustable-graph-chooser";
            var defaultKey, keysToRadio = {};
            var counter = 0;
            Object.keys(c.config.data.adjustable).forEach(function(dataType) {
                counter += 1;
                var li = document.createElement("li");
                var lbl = document.createElement("label");
                var r = document.createElement("input");
                r.type = "radio";
                r.name = "adj-chooser-" + c.id;
                r.id = "adj-chooser-" + c.id + "-" + counter;
                lbl.htmlFor = r.id;
                if (c.config.data.adjustable[dataType].default) {
                    defaultKey = dataType;
                    r.checked = true;
                }
                r.onchange = function() { choose(dataType, {update: true}); }
                keysToRadio[dataType] = r;
                li.appendChild(r);
                lbl.appendChild(document.createTextNode(dataType));
                li.appendChild(lbl);
                ul.appendChild(li);
            })
            if (c.canvas.nextElementSibling) {
                c.canvas.parentNode.insertBefore(ul, c.canvas.nextElementSibling);
            } else {
                c.canvas.parentNode.appendChild(ul);
            }
            if (!defaultKey) {
                defaultKey = Object.keys(c.config.data.adjustable)[0];
                keysToRadio[defaultKey].checked = true;
            }
            choose(defaultKey, {update: false});
            return ul;
        }

        var slider = createSlider(); // slider must be created first
        var chooser = createChooser();
    }
});

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

