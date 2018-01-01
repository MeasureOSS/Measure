(function() {
    var ns = document.querySelector("section.orgs");
    var login = ns.getAttribute("data-login");
    var orgsin = document.querySelector("ul.orgsin");
    var deets = ns.querySelector("details");
    var orglist = ns.querySelector("select");
    var orgdatalist = ns.querySelector("datalist");
    var addbtn = ns.querySelector("button");
    var neworg = document.getElementsByName("neworg")[0];
    var joined = document.getElementsByName("org-start")[0];
    var left = document.getElementsByName("org-end")[0];

    function enableDisableButton() {
        if (neworg.value == "" && orglist.selectedIndex == 0) {
            addbtn.disabled = true;
            addbtn.title = "Select an organization first";
        } else {
            addbtn.disabled = false;
            addbtn.title = "";
        }
    }

    deets.addEventListener("toggle", function(e) {
        if (!e.target.open) return;
        orglist.innerHTML = "";
        orgdatalist.innerHTML = "";
        API("GET", "getAllOrgs", {}, function(err, allorgs) {
            if (err) return flash(err);
            if (!allorgs.success) return flash("Couldn't fetch organizations");
            var frag = document.createDocumentFragment();
            var frag2 = document.createDocumentFragment();
            var op = document.createElement("option");
            op.value = "-1";
            op.text = "Choose an org";
            frag.appendChild(op);
            allorgs.rows.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            }).forEach(function(o) {
                var op = document.createElement("option");
                op.value = o.id;
                op.text = o.name;
                frag.appendChild(op);
                var op2 = document.createElement("option");
                op2.value = o.name;
                frag2.appendChild(op2);
            });
            orglist.appendChild(frag);
            orgdatalist.appendChild(frag2);
            enableDisableButton()
        });
    }, false);

    function fdate(d) { return d.split(" ")[0]; }
    function updateOrgs() {
        API("GET", "getMyOrgs", {login: login}, function(err, orgs) {
            if (err) return flash(err);
            if (!orgs.success) return flash("Couldn't fetch organizations");
            orgsin.innerHTML = "";
            var frag = document.createDocumentFragment();
            orgs.rows.forEach(function(o) {
                var li = document.createElement("li");

                var alink = document.createElement("a");
                alink.href = "../org/" + o.name.toLowerCase() + ".html";
                alink.appendChild(document.createTextNode(" ⬀"));

                var adel = document.createElement("a");
                adel.href = "#";
                adel.appendChild(document.createTextNode("×"));
                adel.className = "remove";
                adel.onclick = function(e) {
                    e.preventDefault();
                    API("POST", "removeFromOrg", {login: login, org: o.id}, function(err) {
                        if (err) return flash("Couldn't remove from org", err);
                        updateOrgs();
                    })
                }
                var strong = document.createElement("strong");
                var em = document.createElement("em");
                strong.appendChild(document.createTextNode(o.name));
                var dstr = "(" + fdate(o.joined) + "—";
                em.appendChild(document.createTextNode(dstr));
                if (o.left) {
                    em.appendChild(document.createTextNode(fdate(o.left)));
                } else {
                    var aend = document.createElement("a");
                    aend.href = "#";
                    aend.appendChild(document.createTextNode("date"));
                    em.appendChild(aend);
                    aend.onclick = function(e) {
                        e.preventDefault();
                        API("POST", "leaveOrg", {login: login, org: o.id}, function(err) {
                            if (err) return flash("Couldn't leave org", err);
                            updateOrgs();
                        })
                    }
                }
                em.appendChild(document.createTextNode(")"));
                li.appendChild(strong);
                li.appendChild(alink);
                li.appendChild(adel);
                li.appendChild(em);
                frag.appendChild(li);
            })
            orgsin.appendChild(frag);
        });
    }

    orglist.onchange = enableDisableButton;
    neworg.onkeyup = enableDisableButton;

    addbtn.onclick = function() {
        var orgid;
        if (orglist.selectedIndex !== 0) {
            orgid = orglist.options[orglist.selectedIndex].value;
        }
        if (neworg.value != "") {
            // check if they've entered a name that's already in the list
            var matches = Array.prototype.slice.call(orglist.options).filter(function(o) {
                return o.text.toLowerCase() == neworg.value.trim();
            })
            if (matches.length > 0) {
                orgid = matches[0].value;
            }
        }
        if (orgid) {
            console.log("add to org id", orgid);
            API("POST", "addToOrg", {login: login, org: orgid, joined: joined.value, left: left.value}, function(err) {
                if (err) { return flash("Couldn't add " + login + " to org", err); }
                updateOrgs();
                deets.open = false;
            })
        } else if (neworg.value) {
            console.log("add to new org", neworg.value);
            API("POST", "addOrg", {name: neworg.value}, function(err, ret) {
                if (err) { return flash("Couldn't add " + login + " to org", err); }
                if (!ret.insert_id) { return flash("Couldn't add " + login + " to org", err); }
                API("POST", "addToOrg", {login: login, org: ret.insert_id, joined: joined.value, left: left.value}, function(err) {
                    if (err) { return flash("Couldn't add " + login + " to org", err); }
                    updateOrgs();
                    deets.open = false;
                })
            })
        } else {
            // shouldn't ever get here because we should be disabled
            flash("Unable to add to organization");
        }
    }

    document.addEventListener("DOMContentLoaded", updateOrgs, false);
})();

