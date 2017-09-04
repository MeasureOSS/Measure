
/* Linkable charts 
   Define a links: [] property, one link per point, and then each point
   will become clickable and open that link.
*/
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
