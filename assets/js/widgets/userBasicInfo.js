function getBasicInfoOverrides() {
    API("GET", "getBasicInfoOverrides", {
        login: document.querySelector('article[data-widget="basicInfo"] section').getAttribute("data-login")
    }, function(err, basicInfo) {
        if (err) { return flash("Couldn't load bio information", err); }
        if (basicInfo.success && basicInfo.rows.length > 0) {
            for (var k in basicInfo.rows[0]) {
                var val = basicInfo.rows[0][k];
                if (val == "") val = "-";
                var dt = document.querySelector('article[data-widget="basicInfo"] form dt[data-edit-name="' + k + '"]');
                if (dt) {
                    var dd = dt.nextElementSibling;
                    dd.innerHTML = "";
                    dd.appendChild(document.createTextNode(val));
                }
            }
        }
    });
}

document.querySelector('article[data-widget="basicInfo"] h1 button').onclick = function(e) {
    e.preventDefault();
    var btn = this;
    var editables = Array.prototype.slice.call(document.querySelectorAll('article[data-widget="basicInfo"] form dt[data-edit-name]'));
    if (btn.textContent == "Edit") {
        editables.forEach(function(ed) {
            var dd = ed.nextElementSibling;
            var inp = document.createElement("input");
            inp.value = dd.textContent == "-" ? "" : dd.textContent;
            dd.innerHTML = "";
            dd.appendChild(inp);
        })
        btn.innerHTML = "Save";
    } else {
        var data = {
            login: document.querySelector('article[data-widget="basicInfo"] section').getAttribute("data-login")
        };
        editables.forEach(function(ed) {
            var name = ed.getAttribute("data-edit-name");
            var dd = ed.nextElementSibling;
            var inp = dd.querySelector("input");
            data[name] = inp.value;
            dd.innerHTML = "Saving...";
            btn.innerHTML = "Saving...";
        });
        API("POST", "setBasicInfoOverrides", data, function(err) {
            if (err) return flash("Couldn't save biographical info", err);
            btn.innerHTML = "Edit";
            getBasicInfoOverrides();
        })
    }
}
document.addEventListener("DOMContentLoaded", getBasicInfoOverrides, false);
