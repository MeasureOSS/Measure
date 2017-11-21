
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
            c.canvas.parentNode.insertBefore(ul, c.canvas);
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
