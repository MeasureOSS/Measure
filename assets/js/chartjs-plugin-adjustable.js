
/* Adjustable charts */
Chart.plugins.register({
    beforeInit: function(c) {
        /* If this is a normal chart without adjustable data,
           then we have nothing to do; exit. */
        if (!c.config.data.adjustable) return;

        var currentDataType;
        var rememberedSliderValues = {};
        var currentSliderPercentage = 100;
        function choose(dataType, options) {
            var ndatasets = JSON.parse(JSON.stringify(c.config.data.adjustable[dataType || currentDataType].datasets));
            var nlabels = JSON.parse(JSON.stringify(c.config.data.adjustable[dataType || currentDataType].labels));

            if (currentDataType == dataType || !dataType) {
                // we're displaying the dataType we've already got, so
                // this is a slider change. Crop the lists, and crop them
                // from the right-hand end
                var pointsToShow;
                ndatasets.forEach(function(nd) {
                    pointsToShow = Math.ceil(nd.data.length * slider.valueAsNumber / 100);
                    var minPointsToShow = c.config.data.adjustable[dataType || currentDataType].minimumLength || 1;
                    if (pointsToShow < minPointsToShow) pointsToShow = minPointsToShow;
                    //console.log("showing", pointsToShow, "data points for type",
                    //    dataType, "for slider val", slider.valueAsNumber, "pc of", nd.data.length);
                    nd.data = nd.data.slice(nd.data.length - pointsToShow);
                })
                nlabels = nlabels.slice(nlabels.length - pointsToShow);
            } else {
                setTimeout(function() {
                    choose(null, {update: true});
                }, 20);
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
            inp.min = 0;
            inp.max = 100;
            // fullscreened graphs put the current slider percentage in the options; pick it up
            if (c.config && c.config.options && c.config.options.Measure && c.config.options.Measure.sliderPercentage != undefined) {
                inp.value = c.config.options.Measure.sliderPercentage;
            }
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
            var fullscreenedGraphType;
            if (c.config.options && c.config.options.Measure && c.config.options.Measure.graphType) {
                fullscreenedGraphType = c.config.options.Measure.graphType;
            }
            Object.keys(c.config.data.adjustable).forEach(function(dataType) {
                counter += 1;
                var li = document.createElement("li");
                var lbl = document.createElement("label");
                var r = document.createElement("input");
                r.type = "radio";
                r.name = "adj-chooser-" + c.id;
                r.id = "adj-chooser-" + c.id + "-" + counter;
                lbl.htmlFor = r.id;
                if (c.config.data.adjustable[dataType].default && !fullscreenedGraphType) {
                    defaultKey = dataType;
                    r.checked = true;
                }
                if (fullscreenedGraphType && dataType == fullscreenedGraphType) {
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
            var chartContainerWrapper = document.createElement("div");
            chartContainerWrapper.className = "chart-container-wrapper";
            c.canvas.parentNode.insertBefore(chartContainerWrapper, c.canvas);
            chartContainerWrapper.appendChild(c.canvas);
            chartContainerWrapper.parentNode.insertBefore(ul, chartContainerWrapper);
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
