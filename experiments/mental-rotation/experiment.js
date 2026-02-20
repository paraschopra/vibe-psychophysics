(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'mental-rotation',
        experimentName: 'Mental Rotation',
        rotationAngles: [0, 45, 90, 135, 180],
        trialsPerCell: 8,   // per angle x same/mirror = 5 x 2 x 8 = 80 total
        fixationDuration: 500,
        maxResponseTime: 8000,
        feedbackDuration: 300,
        blankDuration: 400,
        canvasW: 600,
        canvasH: 350
    };

    // 2D block shapes defined as arrays of [row, col] grid positions
    var SHAPES = [
        [[0,0],[0,1],[0,2],[1,0]],            // L-shape
        [[0,0],[0,1],[0,2],[1,1]],            // T-shape
        [[0,0],[0,1],[1,1],[1,2]],            // Z-shape
        [[0,0],[1,0],[1,1],[2,1]],            // S-shape
        [[0,0],[0,1],[1,0],[2,0],[2,1]]       // U-shape
    ];

    var VALID_KEYS = ['f', 'j'];

    var state = { session: null, trials: [], running: false };
    var canvas, ctx, stimArea;

    function init() {
        canvas = document.getElementById('rotation-canvas');
        stimArea = document.getElementById('stimulus-area');
        document.getElementById('btn-start').addEventListener('click', startExperiment);
        document.getElementById('btn-restart').addEventListener('click', restart);
        document.getElementById('btn-export-csv').addEventListener('click', function () {
            PsychLab.Export.downloadCSV(PsychLab.Storage.getSession(state.session.sessionId));
        });
        document.getElementById('btn-export-json').addEventListener('click', function () {
            PsychLab.Export.downloadJSON(PsychLab.Storage.getSession(state.session.sessionId));
        });
        PsychLab.UI.initExperimentPage();
    }

    function setupCanvas() {
        var dpr = window.devicePixelRatio || 1;
        canvas.width = CONFIG.canvasW * dpr;
        canvas.height = CONFIG.canvasH * dpr;
        canvas.style.width = CONFIG.canvasW + 'px';
        canvas.style.height = CONFIG.canvasH + 'px';
        ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    /**
     * Mirror a shape horizontally: negate the column coordinates,
     * then shift so minimum col is 0.
     */
    function mirrorShape(blocks) {
        var mirrored = [];
        var maxCol = -Infinity;
        for (var i = 0; i < blocks.length; i++) {
            if (blocks[i][1] > maxCol) maxCol = blocks[i][1];
        }
        for (var j = 0; j < blocks.length; j++) {
            mirrored.push([blocks[j][0], maxCol - blocks[j][1]]);
        }
        return mirrored;
    }

    /**
     * Check if two block arrays represent the same shape
     * (needed to avoid trivially identical mirror shapes).
     */
    function shapesIdentical(a, b) {
        if (a.length !== b.length) return false;
        var setA = {};
        for (var i = 0; i < a.length; i++) {
            setA[a[i][0] + ',' + a[i][1]] = true;
        }
        for (var j = 0; j < b.length; j++) {
            if (!setA[b[j][0] + ',' + b[j][1]]) return false;
        }
        return true;
    }

    /**
     * Draw a block shape on the canvas.
     * cx, cy: center position on canvas
     * angle: rotation angle in radians
     * blockSize: pixel size of each block cell
     */
    function drawShape(ctx, blocks, cx, cy, angle, blockSize) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        // Compute the bounding center of the shape for centering
        var minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
        for (var i = 0; i < blocks.length; i++) {
            if (blocks[i][0] < minR) minR = blocks[i][0];
            if (blocks[i][0] > maxR) maxR = blocks[i][0];
            if (blocks[i][1] < minC) minC = blocks[i][1];
            if (blocks[i][1] > maxC) maxC = blocks[i][1];
        }
        var centerR = (minR + maxR + 1) / 2;
        var centerC = (minC + maxC + 1) / 2;

        // Draw each block as a filled rounded rectangle
        var gap = 2;
        var radius = 3;
        ctx.fillStyle = '#2563eb';
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 1.5;

        for (var j = 0; j < blocks.length; j++) {
            var bx = (blocks[j][1] - centerC) * blockSize;
            var by = (blocks[j][0] - centerR) * blockSize;
            var x = bx + gap / 2;
            var y = by + gap / 2;
            var w = blockSize - gap;
            var h = blockSize - gap;

            // Draw rounded rectangle
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + h - radius);
            ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }

    function generateTrials() {
        var trials = [];

        for (var a = 0; a < CONFIG.rotationAngles.length; a++) {
            var angle = CONFIG.rotationAngles[a];
            var half = CONFIG.trialsPerCell / 2;

            // 4 "same" trials for this angle
            for (var s = 0; s < half; s++) {
                var sIdx = Math.floor(Math.random() * SHAPES.length);
                trials.push({
                    shapeIdx: sIdx,
                    rotationAngle: angle,
                    isSame: true,
                    correctKey: 'f'
                });
            }

            // 4 "different" (mirror) trials for this angle
            for (var d = 0; d < half; d++) {
                // Pick a shape whose mirror is actually different
                var dIdx;
                var attempts = 0;
                do {
                    dIdx = Math.floor(Math.random() * SHAPES.length);
                    attempts++;
                } while (shapesIdentical(SHAPES[dIdx], mirrorShape(SHAPES[dIdx])) && attempts < 20);

                trials.push({
                    shapeIdx: dIdx,
                    rotationAngle: angle,
                    isSame: false,
                    correctKey: 'j'
                });
            }
        }

        return shuffle(trials);
    }

    function clearCanvas() {
        ctx.clearRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
    }

    async function runTrial(idx) {
        var trial = state.trials[idx];
        var total = state.trials.length;
        PsychLab.UI.showProgress(idx + 1, total);

        var blockSize = 30;
        var leftCx = CONFIG.canvasW * 0.25;
        var rightCx = CONFIG.canvasW * 0.75;
        var centerY = CONFIG.canvasH / 2;

        // Fixation
        clearCanvas();
        ctx.fillStyle = '#333';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', CONFIG.canvasW / 2, CONFIG.canvasH / 2);
        await PsychLab.Timing.frameDelay(CONFIG.fixationDuration);

        // Draw stimuli
        clearCanvas();

        var blocks = SHAPES[trial.shapeIdx];
        var angleRad = trial.rotationAngle * (Math.PI / 180);

        // Left shape: always at 0 degrees rotation
        drawShape(ctx, blocks, leftCx, centerY, 0, blockSize);

        // Right shape: rotated by trial angle
        if (trial.isSame) {
            // Same shape, just rotated
            drawShape(ctx, blocks, rightCx, centerY, angleRad, blockSize);
        } else {
            // Mirror image of the shape, rotated
            var mirrored = mirrorShape(blocks);
            drawShape(ctx, mirrored, rightCx, centerY, angleRad, blockSize);
        }

        // Divider line between the two shapes
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(CONFIG.canvasW / 2, 20);
        ctx.lineTo(CONFIG.canvasW / 2, CONFIG.canvasH - 20);
        ctx.stroke();
        ctx.setLineDash([]);

        var stimOnset = PsychLab.Timing.now();
        var resp = await PsychLab.Timing.waitForKeyWithTimeout(VALID_KEYS, CONFIG.maxResponseTime);

        var rt = resp.timedOut ? CONFIG.maxResponseTime : resp.timestamp - stimOnset;
        var response = resp.key;
        var correct = response === trial.correctKey;

        var trialData = {
            trialNumber: idx + 1,
            rotationAngle: trial.rotationAngle,
            isSame: trial.isSame,
            shapeIdx: trial.shapeIdx,
            response: response,
            correct: correct,
            rt: Math.round(rt * 10) / 10,
            timedOut: resp.timedOut,
            stimulusOnset: stimOnset,
            responseTime: resp.timestamp
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        // Feedback
        if (!resp.timedOut) {
            clearCanvas();
            ctx.fillStyle = correct ? '#059669' : '#dc2626';
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(correct ? 'Correct' : 'Incorrect', CONFIG.canvasW / 2, CONFIG.canvasH / 2);
            await PsychLab.Timing.delay(CONFIG.feedbackDuration);
        } else {
            clearCanvas();
            ctx.fillStyle = '#dc2626';
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Too slow!', CONFIG.canvasW / 2, CONFIG.canvasH / 2);
            await PsychLab.Timing.delay(CONFIG.feedbackDuration);
        }

        // Blank
        clearCanvas();
        await PsychLab.Timing.delay(CONFIG.blankDuration);
    }

    async function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.running = true;

        var session = PsychLab.Storage.getSession(state.session.sessionId);
        session.config = {
            rotationAngles: CONFIG.rotationAngles,
            trialsPerCell: CONFIG.trialsPerCell,
            totalTrials: state.trials.length
        };
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-running');
        setupCanvas();

        await PsychLab.UI.showCountdown(stimArea, 3);
        stimArea.innerHTML = '';
        stimArea.appendChild(canvas);

        for (var i = 0; i < state.trials.length; i++) {
            if (!state.running) break;
            await runTrial(i);
        }

        showResults();
    }

    function showResults() {
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        var trials = session.trials;

        // Filter valid RTs: correct, not timed out, within range
        function getValidRTs(angle, isSame) {
            return trials
                .filter(function (t) {
                    return t.rotationAngle === angle && t.isSame === isSame &&
                           t.correct && !t.timedOut && t.rt >= 300 && t.rt <= 6000;
                })
                .map(function (t) { return t.rt; });
        }

        // Build data points for line chart
        var samePoints = [];
        var diffPoints = [];
        var sameXs = [];
        var sameYs = [];
        var allValidRTs = [];

        for (var a = 0; a < CONFIG.rotationAngles.length; a++) {
            var angle = CONFIG.rotationAngles[a];

            var sameRTs = getValidRTs(angle, true);
            var diffRTs = getValidRTs(angle, false);

            var sameMean = PsychLab.Stats.mean(sameRTs);
            var diffMean = PsychLab.Stats.mean(diffRTs);
            var sameSE = PsychLab.Stats.standardError(sameRTs);
            var diffSE = PsychLab.Stats.standardError(diffRTs);

            samePoints.push({ x: angle, y: sameMean, error: sameSE });
            diffPoints.push({ x: angle, y: diffMean, error: diffSE });

            sameXs.push(angle);
            sameYs.push(sameMean);

            allValidRTs = allValidRTs.concat(sameRTs).concat(diffRTs);
        }

        // Linear regression on "same" trials (standard measure)
        var regression = PsychLab.Stats.linearRegression(sameXs, sameYs);
        var rotationRate = Math.round(regression.slope * 100) / 100;  // ms per degree
        var rSquared = Math.round(regression.r2 * 1000) / 1000;

        var overallMeanRT = PsychLab.Stats.mean(allValidRTs);
        var overallAccuracy = trials.filter(function (t) { return t.correct; }).length / trials.length * 100;

        // Save summary
        session.summary = {
            rotationRate: rotationRate,
            rSquared: rSquared,
            overallMeanRT: Math.round(overallMeanRT),
            overallAccuracy: Math.round(overallAccuracy * 10) / 10
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        // Stat cards
        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Rotation Rate', rotationRate, 'ms/deg'));
        summary.appendChild(PsychLab.UI.createStatCard('Mean RT', Math.round(overallMeanRT), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('R\u00B2', rSquared));
        summary.appendChild(PsychLab.UI.createStatCard('Accuracy', Math.round(overallAccuracy) + '%'));

        // Line chart: RT x rotation angle
        PsychLab.Charts.lineChart(document.getElementById('chart-lines'), [
            { label: 'Same', points: samePoints, color: '#2563eb' },
            { label: 'Different (Mirror)', points: diffPoints, color: '#dc2626' }
        ], {
            title: 'RT \u00D7 Rotation Angle',
            xLabel: 'Rotation Angle (\u00B0)',
            yLabel: 'Reaction Time (ms)',
            width: 520,
            height: 360
        });

        // Interpretation
        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';

        text += '<p>Your <strong>rotation rate</strong> (slope for same trials) was <strong>' + rotationRate + ' ms/degree</strong> ';
        text += '(R\u00B2 = ' + rSquared + '). ';

        if (regression.slope >= 2 && regression.slope <= 8) {
            text += 'This falls within the typical range of ~3\u20136 ms/degree reported for 2D mental rotation tasks (Cooper, 1975). ';
            text += 'The linear increase in RT with rotation angle is strong evidence that you are mentally rotating an internal representation of the shape, ';
            text += 'as if physically turning it through space.';
        } else if (regression.slope > 8) {
            text += 'This is somewhat slower than the typical ~3\u20136 ms/degree reported in the literature. ';
            text += 'Individual differences in spatial ability, unfamiliarity with the shapes, or a cautious response strategy could account for a steeper slope.';
        } else if (regression.slope > 0) {
            text += 'This is faster than the typical ~3\u20136 ms/degree, suggesting efficient spatial processing. ';
            text += 'Some individuals with high spatial ability show shallower slopes.';
        } else {
            text += 'An unexpected flat or negative slope was observed. This may indicate a response strategy that does not involve mental rotation, ';
            text += 'or it could reflect a speed\u2013accuracy trade-off.';
        }
        text += '</p>';

        if (rSquared >= 0.85) {
            text += '<p>The high R\u00B2 value (' + rSquared + ') indicates a strong linear relationship between rotation angle and response time, ';
            text += 'which is the hallmark of the mental rotation effect and supports the analog rotation hypothesis.</p>';
        } else if (rSquared >= 0.5) {
            text += '<p>The moderate R\u00B2 value (' + rSquared + ') indicates a reasonably linear relationship. ';
            text += 'Some variability is expected with a limited number of trials per condition.</p>';
        } else {
            text += '<p>The low R\u00B2 value (' + rSquared + ') suggests considerable variability. ';
            text += 'More trials or practice might yield a cleaner linear function.</p>';
        }

        text += '<p>Published studies (Shepard &amp; Metzler, 1971; Cooper, 1975) consistently report a linear increase in RT with angular disparity, ';
        text += 'with slopes typically in the range of 3\u20136 ms/degree for 2D shapes and somewhat steeper for 3D objects.</p>';
        interp.innerHTML = text;
    }

    function restart() {
        state = { session: null, trials: [], running: false };
        PsychLab.UI.showPhase('phase-instructions');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
