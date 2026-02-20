(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'visual-search',
        experimentName: 'Visual Search / Pop-Out',
        setSizes: [4, 8, 16, 32],
        repsPerCell: 2,  // per searchType x setSize x targetPresent
        fixationDuration: 500,
        maxResponseTime: 5000,
        interTrialInterval: 500,
        barWidth: 6,
        barHeight: 28,
        canvasW: 600,
        canvasH: 500,
        padding: 50
    };

    var state = { session: null, trials: [], running: false };
    var canvas, ctx, stimArea;

    function init() {
        canvas = document.getElementById('vs-canvas');
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

    function generatePositions(n, w, h, pad) {
        var positions = [];
        var cellSize = 40;
        var cols = Math.floor((w - 2 * pad) / cellSize);
        var rows = Math.floor((h - 2 * pad) / cellSize);
        var allCells = [];
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                allCells.push({
                    x: pad + c * cellSize + cellSize / 2 + (Math.random() - 0.5) * 10,
                    y: pad + r * cellSize + cellSize / 2 + (Math.random() - 0.5) * 10
                });
            }
        }
        shuffle(allCells);
        for (var i = 0; i < Math.min(n, allCells.length); i++) {
            positions.push(allCells[i]);
        }
        return positions;
    }

    function drawBar(x, y, color, vertical) {
        ctx.save();
        ctx.translate(x, y);
        if (!vertical) ctx.rotate(Math.PI / 2);
        ctx.fillStyle = color;
        ctx.fillRect(-CONFIG.barWidth / 2, -CONFIG.barHeight / 2, CONFIG.barWidth, CONFIG.barHeight);
        ctx.restore();
    }

    function drawDisplay(trial) {
        ctx.clearRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);

        var positions = generatePositions(trial.setSize, CONFIG.canvasW, CONFIG.canvasH, CONFIG.padding);
        var items = [];

        if (trial.targetPresent) {
            // Target: red vertical
            items.push({ color: '#dc2626', vertical: true, isTarget: true });
        }

        var numDistractors = trial.setSize - (trial.targetPresent ? 1 : 0);

        if (trial.searchType === 'feature') {
            // Feature search: target is red vertical, distractors are green vertical
            for (var f = 0; f < numDistractors; f++) {
                items.push({ color: '#16a34a', vertical: true, isTarget: false });
            }
        } else {
            // Conjunction search: distractors are red horizontal AND green vertical
            for (var c = 0; c < numDistractors; c++) {
                if (c % 2 === 0) {
                    items.push({ color: '#dc2626', vertical: false, isTarget: false }); // red horizontal
                } else {
                    items.push({ color: '#16a34a', vertical: true, isTarget: false }); // green vertical
                }
            }
        }

        shuffle(items);

        for (var i = 0; i < items.length && i < positions.length; i++) {
            drawBar(positions[i].x, positions[i].y, items[i].color, items[i].vertical);
        }
    }

    function generateTrials() {
        var trials = [];
        var types = ['feature', 'conjunction'];
        for (var t = 0; t < types.length; t++) {
            for (var s = 0; s < CONFIG.setSizes.length; s++) {
                for (var p = 0; p < 2; p++) { // present / absent
                    for (var r = 0; r < CONFIG.repsPerCell; r++) {
                        trials.push({
                            searchType: types[t],
                            setSize: CONFIG.setSizes[s],
                            targetPresent: p === 0
                        });
                    }
                }
            }
        }
        // Shuffle within search type blocks
        var featureTrials = shuffle(trials.filter(function (t) { return t.searchType === 'feature'; }));
        var conjTrials = shuffle(trials.filter(function (t) { return t.searchType === 'conjunction'; }));
        // Alternate blocks (feature first)
        return featureTrials.concat(conjTrials);
    }

    async function runTrial(idx) {
        var trial = state.trials[idx];
        var total = state.trials.length;
        PsychLab.UI.showProgress(idx + 1, total);

        var blockLabel = document.getElementById('block-label');
        if (idx === 0) {
            blockLabel.textContent = 'Block 1: Feature Search (color pop-out)';
        } else if (trial.searchType === 'conjunction' && (idx === 0 || state.trials[idx - 1].searchType === 'feature')) {
            // Show transition
            stimArea.innerHTML = '<div class="rt-message" style="padding:2rem"><strong>Block 1 complete!</strong><br><br>Block 2: Conjunction Search<br>Target is still a red vertical bar, but now distractors share features with it.<br><br>Press Space to continue.</div>';
            await PsychLab.Timing.waitForKey([' ']);
            stimArea.innerHTML = '';
            stimArea.appendChild(canvas);
            blockLabel.textContent = 'Block 2: Conjunction Search';
        }

        // Fixation
        ctx.clearRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#333';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', CONFIG.canvasW / 2, CONFIG.canvasH / 2);
        await PsychLab.Timing.frameDelay(CONFIG.fixationDuration);

        // Display
        drawDisplay(trial);
        var stimOnset = PsychLab.Timing.now();
        var resp = await PsychLab.Timing.waitForKeyWithTimeout(['f', 'j'], CONFIG.maxResponseTime);

        var rt = resp.timedOut ? CONFIG.maxResponseTime : resp.timestamp - stimOnset;
        var responsePresent = resp.key === 'f';
        var correct = !resp.timedOut && (responsePresent === trial.targetPresent);

        var trialData = {
            trialNumber: idx + 1,
            searchType: trial.searchType,
            setSize: trial.setSize,
            targetPresent: trial.targetPresent,
            response: resp.key,
            responsePresent: responsePresent,
            correct: correct,
            rt: Math.round(rt * 10) / 10,
            timedOut: resp.timedOut
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        // Brief feedback
        ctx.clearRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = correct ? '#059669' : '#dc2626';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(correct ? 'Correct' : 'Incorrect', CONFIG.canvasW / 2, CONFIG.canvasH / 2);
        await PsychLab.Timing.delay(CONFIG.interTrialInterval);
    }

    async function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.running = true;

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

        function getMeanRT(type, setSize, present) {
            var rts = trials
                .filter(function (t) {
                    return t.searchType === type && t.setSize === setSize && t.targetPresent === present && t.correct && !t.timedOut && t.rt >= 150;
                })
                .map(function (t) { return t.rt; });
            return { mean: PsychLab.Stats.mean(rts), se: PsychLab.Stats.standardError(rts), n: rts.length };
        }

        // Build series for line chart
        var featurePresentPts = [], featureAbsentPts = [], conjPresentPts = [], conjAbsentPts = [];
        for (var s = 0; s < CONFIG.setSizes.length; s++) {
            var ss = CONFIG.setSizes[s];
            var fp = getMeanRT('feature', ss, true);
            var fa = getMeanRT('feature', ss, false);
            var cp = getMeanRT('conjunction', ss, true);
            var ca = getMeanRT('conjunction', ss, false);
            featurePresentPts.push({ x: ss, y: fp.mean, error: fp.se });
            featureAbsentPts.push({ x: ss, y: fa.mean, error: fa.se });
            conjPresentPts.push({ x: ss, y: cp.mean, error: cp.se });
            conjAbsentPts.push({ x: ss, y: ca.mean, error: ca.se });
        }

        // Compute slopes
        var fpX = CONFIG.setSizes, fpY = featurePresentPts.map(function (p) { return p.y; });
        var cpX = CONFIG.setSizes, cpY = conjPresentPts.map(function (p) { return p.y; });
        var featureSlope = PsychLab.Stats.linearRegression(fpX, fpY);
        var conjSlope = PsychLab.Stats.linearRegression(cpX, cpY);

        session.summary = {
            featureSearchSlope: featureSlope.slope.toFixed(1),
            conjunctionSearchSlope: conjSlope.slope.toFixed(1)
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Feature Slope', featureSlope.slope.toFixed(1), 'ms/item'));
        summary.appendChild(PsychLab.UI.createStatCard('Conjunction Slope', conjSlope.slope.toFixed(1), 'ms/item'));

        PsychLab.Charts.lineChart(document.getElementById('chart-lines'), [
            { label: 'Feature Present', points: featurePresentPts, color: '#22c55e' },
            { label: 'Feature Absent', points: featureAbsentPts, color: '#86efac' },
            { label: 'Conjunction Present', points: conjPresentPts, color: '#dc2626' },
            { label: 'Conjunction Absent', points: conjAbsentPts, color: '#fca5a5' }
        ], {
            title: 'RT × Set Size Functions',
            xLabel: 'Set Size',
            yLabel: 'Reaction Time (ms)',
            width: 500,
            height: 360
        });

        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>Your <strong>feature search slope</strong> was <strong>' + featureSlope.slope.toFixed(1) + ' ms/item</strong>. ';
        if (Math.abs(featureSlope.slope) < 10) {
            text += 'This near-zero slope confirms <strong>parallel/pop-out search</strong>: the red target "pops out" from the green distractors regardless of how many items are in the display.</p>';
        } else {
            text += 'This is somewhat higher than the expected near-zero slope for feature search, possibly due to response variability.</p>';
        }

        text += '<p>Your <strong>conjunction search slope</strong> was <strong>' + conjSlope.slope.toFixed(1) + ' ms/item</strong>. ';
        if (conjSlope.slope > 10) {
            text += 'This positive slope indicates <strong>serial or guided search</strong>: you needed to inspect items one by one (or in small groups) because the target shares features with both types of distractors.</p>';
        } else {
            text += 'This is lower than typically expected (20\u201340 ms/item), which might indicate some degree of guided search or practice effects.</p>';
        }

        text += '<p>The classic prediction from Feature Integration Theory (Treisman & Gelade, 1980) is that feature search slopes should be near 0, while conjunction slopes should be 20\u201340 ms/item.</p>';
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
