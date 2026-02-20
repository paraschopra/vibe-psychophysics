/**
 * PsychLab.Charts — Vanilla Canvas charting for experiment results
 */
(function () {
    'use strict';

    var Charts = {};

    var COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];

    function getColor(i) {
        return COLORS[i % COLORS.length];
    }

    /** Setup canvas for HiDPI */
    function setupCanvas(canvas, width, height) {
        var dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return ctx;
    }

    /** Draw axes with labels */
    function drawAxes(ctx, opts) {
        var pad = opts.padding;
        var w = opts.width;
        var h = opts.height;

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Y axis
        ctx.moveTo(pad.left, pad.top);
        ctx.lineTo(pad.left, h - pad.bottom);
        // X axis
        ctx.lineTo(w - pad.right, h - pad.bottom);
        ctx.stroke();

        // Axis labels
        ctx.fillStyle = '#333';
        ctx.font = '13px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';

        if (opts.xLabel) {
            ctx.fillText(opts.xLabel, pad.left + (w - pad.left - pad.right) / 2, h - 8);
        }
        if (opts.yLabel) {
            ctx.save();
            ctx.translate(16, pad.top + (h - pad.top - pad.bottom) / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(opts.yLabel, 0, 0);
            ctx.restore();
        }
    }

    /** Draw Y-axis tick marks and gridlines */
    function drawYTicks(ctx, opts, minVal, maxVal, numTicks) {
        numTicks = numTicks || 5;
        var pad = opts.padding;
        var plotH = opts.height - pad.top - pad.bottom;
        var range = maxVal - minVal;

        ctx.fillStyle = '#666';
        ctx.strokeStyle = '#e5e7eb';
        ctx.font = '11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.lineWidth = 0.5;

        for (var i = 0; i <= numTicks; i++) {
            var val = minVal + (range * i / numTicks);
            var y = opts.height - pad.bottom - (i / numTicks) * plotH;

            ctx.fillText(Math.round(val * 100) / 100, pad.left - 8, y + 4);

            if (i > 0 && i < numTicks) {
                ctx.beginPath();
                ctx.moveTo(pad.left, y);
                ctx.lineTo(opts.width - pad.right, y);
                ctx.stroke();
            }
        }
    }

    /**
     * Bar chart with error bars
     * data: [{ label, value, error?, color? }]
     */
    Charts.barChart = function (canvas, data, options) {
        options = options || {};
        var width = options.width || canvas.clientWidth || 500;
        var height = options.height || canvas.clientHeight || 350;
        var ctx = setupCanvas(canvas, width, height);

        var pad = { top: 40, right: 30, bottom: 60, left: 65 };
        var opts = { width: width, height: height, padding: pad, xLabel: options.xLabel, yLabel: options.yLabel };

        // Find value range
        var maxVal = 0;
        for (var i = 0; i < data.length; i++) {
            var top = data[i].value + (data[i].error || 0);
            if (top > maxVal) maxVal = top;
        }
        maxVal = maxVal * 1.15; // headroom

        // Clear and draw background
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);

        drawAxes(ctx, opts);
        drawYTicks(ctx, opts, 0, maxVal);

        // Title
        if (options.title) {
            ctx.fillStyle = '#1a1a2e';
            ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(options.title, width / 2, 22);
        }

        // Draw bars
        var plotW = width - pad.left - pad.right;
        var plotH = height - pad.top - pad.bottom;
        var barGap = plotW * 0.15 / (data.length + 1);
        var barW = (plotW - barGap * (data.length + 1)) / data.length;

        for (var j = 0; j < data.length; j++) {
            var x = pad.left + barGap + j * (barW + barGap);
            var barH = (data[j].value / maxVal) * plotH;
            var y = height - pad.bottom - barH;

            ctx.fillStyle = data[j].color || getColor(j);
            ctx.fillRect(x, y, barW, barH);

            // Error bar
            if (data[j].error) {
                var errPx = (data[j].error / maxVal) * plotH;
                var cx = x + barW / 2;
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(cx, y - errPx);
                ctx.lineTo(cx, y + errPx);
                ctx.moveTo(cx - 6, y - errPx);
                ctx.lineTo(cx + 6, y - errPx);
                ctx.moveTo(cx - 6, y + errPx);
                ctx.lineTo(cx + 6, y + errPx);
                ctx.stroke();
            }

            // X label
            ctx.fillStyle = '#333';
            ctx.font = '11px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(data[j].label, x + barW / 2, height - pad.bottom + 18);
        }
    };

    /**
     * Line chart
     * series: [{ label, points: [{x, y}], color? }]
     */
    Charts.lineChart = function (canvas, series, options) {
        options = options || {};
        var width = options.width || canvas.clientWidth || 500;
        var height = options.height || canvas.clientHeight || 350;
        var ctx = setupCanvas(canvas, width, height);

        var pad = { top: 50, right: 30, bottom: 60, left: 65 };
        var opts = { width: width, height: height, padding: pad, xLabel: options.xLabel, yLabel: options.yLabel };

        // Find data ranges
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (var s = 0; s < series.length; s++) {
            for (var p = 0; p < series[s].points.length; p++) {
                var pt = series[s].points[p];
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
            }
        }
        if (options.yMin !== undefined) minY = options.yMin;
        if (options.yMax !== undefined) maxY = options.yMax;
        var yRange = maxY - minY || 1;
        var xRange = maxX - minX || 1;
        minY -= yRange * 0.05;
        maxY += yRange * 0.1;
        yRange = maxY - minY;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);

        drawAxes(ctx, opts);
        drawYTicks(ctx, opts, minY, maxY);

        // X ticks
        var plotW = width - pad.left - pad.right;
        var xValues = [];
        if (series.length > 0) {
            for (var pp = 0; pp < series[0].points.length; pp++) {
                xValues.push(series[0].points[pp].x);
            }
        }
        ctx.fillStyle = '#666';
        ctx.font = '11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        for (var xi = 0; xi < xValues.length; xi++) {
            var xPos = pad.left + ((xValues[xi] - minX) / xRange) * plotW;
            ctx.fillText(xValues[xi], xPos, height - pad.bottom + 18);
        }

        // Title
        if (options.title) {
            ctx.fillStyle = '#1a1a2e';
            ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(options.title, width / 2, 22);
        }

        var plotH = height - pad.top - pad.bottom;

        function toCanvasX(v) { return pad.left + ((v - minX) / xRange) * plotW; }
        function toCanvasY(v) { return height - pad.bottom - ((v - minY) / yRange) * plotH; }

        // Draw each series
        for (var si = 0; si < series.length; si++) {
            var ser = series[si];
            var color = ser.color || getColor(si);
            var pts = ser.points;

            // Line
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (var pi = 0; pi < pts.length; pi++) {
                var cx = toCanvasX(pts[pi].x);
                var cy = toCanvasY(pts[pi].y);
                if (pi === 0) ctx.moveTo(cx, cy);
                else ctx.lineTo(cx, cy);
            }
            ctx.stroke();

            // Points
            ctx.fillStyle = color;
            for (var pk = 0; pk < pts.length; pk++) {
                ctx.beginPath();
                ctx.arc(toCanvasX(pts[pk].x), toCanvasY(pts[pk].y), 4, 0, Math.PI * 2);
                ctx.fill();

                // Error bars
                if (pts[pk].error) {
                    var ey = (pts[pk].error / yRange) * plotH;
                    var ecx = toCanvasX(pts[pk].x);
                    var ecy = toCanvasY(pts[pk].y);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(ecx, ecy - ey);
                    ctx.lineTo(ecx, ecy + ey);
                    ctx.moveTo(ecx - 4, ecy - ey);
                    ctx.lineTo(ecx + 4, ecy - ey);
                    ctx.moveTo(ecx - 4, ecy + ey);
                    ctx.lineTo(ecx + 4, ecy + ey);
                    ctx.stroke();
                }
            }
        }

        // Legend
        if (series.length > 1) {
            var legX = pad.left + 10;
            var legY = pad.top + 5;
            ctx.font = '11px system-ui, -apple-system, sans-serif';
            for (var li = 0; li < series.length; li++) {
                ctx.fillStyle = series[li].color || getColor(li);
                ctx.fillRect(legX, legY + li * 18, 12, 12);
                ctx.fillStyle = '#333';
                ctx.textAlign = 'left';
                ctx.fillText(series[li].label, legX + 18, legY + li * 18 + 10);
            }
        }
    };

    /**
     * Scatter plot with optional regression line
     * data: [{ x, y }]
     */
    Charts.scatterPlot = function (canvas, data, options) {
        options = options || {};
        var width = options.width || canvas.clientWidth || 500;
        var height = options.height || canvas.clientHeight || 350;
        var ctx = setupCanvas(canvas, width, height);

        var pad = { top: 40, right: 30, bottom: 60, left: 65 };
        var opts = { width: width, height: height, padding: pad, xLabel: options.xLabel, yLabel: options.yLabel };

        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (var i = 0; i < data.length; i++) {
            if (data[i].x < minX) minX = data[i].x;
            if (data[i].x > maxX) maxX = data[i].x;
            if (data[i].y < minY) minY = data[i].y;
            if (data[i].y > maxY) maxY = data[i].y;
        }
        var xRange = maxX - minX || 1;
        var yRange = maxY - minY || 1;
        minX -= xRange * 0.05; maxX += xRange * 0.05;
        minY -= yRange * 0.05; maxY += yRange * 0.1;
        xRange = maxX - minX; yRange = maxY - minY;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);

        drawAxes(ctx, opts);
        drawYTicks(ctx, opts, minY, maxY);

        if (options.title) {
            ctx.fillStyle = '#1a1a2e';
            ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(options.title, width / 2, 22);
        }

        var plotW = width - pad.left - pad.right;
        var plotH = height - pad.top - pad.bottom;
        function toX(v) { return pad.left + ((v - minX) / xRange) * plotW; }
        function toY(v) { return height - pad.bottom - ((v - minY) / yRange) * plotH; }

        // Points
        ctx.fillStyle = options.pointColor || '#2563eb';
        for (var j = 0; j < data.length; j++) {
            ctx.beginPath();
            ctx.arc(toX(data[j].x), toY(data[j].y), 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Regression line
        if (options.regression) {
            var reg = options.regression;
            var x1 = minX, y1 = reg.slope * x1 + reg.intercept;
            var x2 = maxX, y2 = reg.slope * x2 + reg.intercept;
            ctx.strokeStyle = options.regressionColor || '#dc2626';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(toX(x1), toY(y1));
            ctx.lineTo(toX(x2), toY(y2));
            ctx.stroke();
            ctx.setLineDash([]);

            // R² annotation
            if (reg.r2 !== undefined) {
                ctx.fillStyle = '#dc2626';
                ctx.font = '12px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText('R\u00B2 = ' + reg.r2.toFixed(3), width - pad.right - 5, pad.top + 15);
            }
        }
    };

    /**
     * Histogram
     * values: array of numbers
     */
    Charts.histogram = function (canvas, values, options) {
        options = options || {};
        var numBins = options.bins || 15;
        var width = options.width || canvas.clientWidth || 500;
        var height = options.height || canvas.clientHeight || 350;
        var ctx = setupCanvas(canvas, width, height);

        var pad = { top: 40, right: 30, bottom: 60, left: 65 };
        var opts = { width: width, height: height, padding: pad, xLabel: options.xLabel, yLabel: options.yLabel || 'Count' };

        var min = Math.min.apply(null, values);
        var max = Math.max.apply(null, values);
        var range = max - min || 1;
        var binWidth = range / numBins;

        // Build bins
        var bins = [];
        for (var b = 0; b < numBins; b++) bins[b] = 0;
        for (var i = 0; i < values.length; i++) {
            var idx = Math.min(Math.floor((values[i] - min) / binWidth), numBins - 1);
            bins[idx]++;
        }
        var maxCount = Math.max.apply(null, bins);

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);

        drawAxes(ctx, opts);
        drawYTicks(ctx, opts, 0, maxCount * 1.1);

        if (options.title) {
            ctx.fillStyle = '#1a1a2e';
            ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(options.title, width / 2, 22);
        }

        var plotW = width - pad.left - pad.right;
        var plotH = height - pad.top - pad.bottom;
        var bw = plotW / numBins;

        ctx.fillStyle = options.color || '#2563eb';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;

        for (var j = 0; j < numBins; j++) {
            var barH = (bins[j] / (maxCount * 1.1)) * plotH;
            var x = pad.left + j * bw;
            var y = height - pad.bottom - barH;
            ctx.fillRect(x, y, bw, barH);
            ctx.strokeRect(x, y, bw, barH);
        }

        // X labels (start, mid, end)
        ctx.fillStyle = '#666';
        ctx.font = '11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(min), pad.left, height - pad.bottom + 18);
        ctx.fillText(Math.round(min + range / 2), pad.left + plotW / 2, height - pad.bottom + 18);
        ctx.fillText(Math.round(max), pad.left + plotW, height - pad.bottom + 18);
    };

    PsychLab.Charts = Charts;
})();
