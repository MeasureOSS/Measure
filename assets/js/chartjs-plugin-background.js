
/* Chart background colour
   Charts have a transparent background, which is a problem if they're
   saved as an image. Explicitly fill a background rectangle to avoid.
*/
Chart.plugins.register({
    beforeDraw: function(c) {
        var ctx = c.chart.ctx;
        ctx.save();
        ctx.fillStyle = "#393e44";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
    }
});
