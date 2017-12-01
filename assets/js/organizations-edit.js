window.addEventListener("DOMContentLoaded", function() {
    function mergeOrgs(fromId, intoId) {
        if (fromId == intoId) {
            return flash("You can't merge an organization with itself.");
        }
        API("POST", "mergeOrgs", {fromId: fromId, intoId: intoId}, function(err, data) {
            if (err) return flash("Couldn't merge organizations", err);
            if (data.success === false) return flash("Couldn't merge organizations", data.msg);
            location.reload();
        })
    }
    function deleteOrg(id) {
        API("POST", "deleteOrg", {id: id}, function(err, data) {
            if (err) return flash("Couldn't delete organization", err);
            if (data.success === false) return flash("Couldn't delete organization", data.msg);
            location.reload();
        })
    }
    function restoreOrg(id) {
        API("POST", "restoreOrg", {id: id}, function(err, data) {
            if (err) return flash("Couldn't restore organization", err);
            if (data.success === false) return flash("Couldn't restore organization", data.msg);
            location.reload();
        })
    }
    function unmergeOrg(id) {
        API("POST", "unmergeOrg", {id: id}, function(err, data) {
            if (err) return flash("Couldn't unmerge organization", err);
            if (data.success === false) return flash("Couldn't unmerge organizations", data.msg);
            location.reload();
        })
    }

    // make all the form widgets work
    var rows = document.querySelectorAll("table.orgtable tbody tr");
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(rows).forEach(function(r) {
        // create the list of orgs
        var opt = document.createElement("option");
        opt.text = r.getAttribute("data-org-title");
        opt.value = r.getAttribute("data-org-id");
        frag.appendChild(opt);

        // hook up the merge button
        var sel = r.querySelector("select");
        r.querySelector("button.merge").addEventListener("click", function() {
            var toId = sel.options[sel.selectedIndex].value;
            mergeOrgs(r.getAttribute("data-org-id"), toId);
        }, false);

        // hook up the delete button
        r.querySelector("button.remove").addEventListener("click", function() {
            deleteOrg(r.getAttribute("data-org-id"));
        }, false);

        // hook up the restore button
        r.querySelector("button.restore").addEventListener("click", function() {
            restoreOrg(r.getAttribute("data-org-id"));
        }, false);

        // hook up the unmerge button
        r.querySelector("button.unmerge").addEventListener("click", function() {
            unmergeOrg(r.getAttribute("data-org-id"));
        }, false);
    });
    var selects = document.querySelectorAll("table.orgtable select");
    Array.prototype.slice.call(selects).forEach(function(s) {
        var nfrag = frag.cloneNode(true);
        s.appendChild(nfrag);
    });

    // read the database for changes which we've done at edit level but which have
    // not yet actually been actioned by a run of makedash
    API("GET", "orgChanges", {}, function(err, results) {
        if (err) return flash("Couldn't fetch latest organization changes", err);
        if (!results.success) return flash("Couldn't fetch latest organization changes", results);
        results.rows.forEach(function(r) {
            if (r.change == "delete") {
                var tr = document.querySelector("table.orgtable tr[data-org-id='" + r.org + "']");
                if (tr) {
                    tr.classList.add("removed");
                }
            } else if (r.change == "merge") {
                var trFrom = document.querySelector("table.orgtable tr[data-org-id='" + r.org + "']");
                var trTo = document.querySelector("table.orgtable tr[data-org-id='" + r.destination + "']");
                if (trFrom && trTo) {
                    trFrom.classList.add("merged");
                    trFrom.setAttribute("data-merged-into", "Merged into " + trTo.getAttribute("data-org-title"));
                }
            }
        })
    })
}, false);
