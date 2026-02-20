(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'stevens-power-law',
        experimentName: "Stevens' Power Law (Line Length)",
        standardLength: 150, // px
        modulus: 10,
        repetitions: 3,
        // Ratios relative to standard: 0.25 to 4.0
        ratios: [0.25, 0.35, 0.5, 0.7, 1.0, 1.4, 2.0, 2.8, 3.5, 4.0],
        theoreticalExponent: 1.0 // For line length
    };

    var state = { session: null, trials: [], currentTrial: 0, running: false };
    var canvas, ctx, inputEl;

    function init() {
        canvas = document.getElementById('spl-canvas');
        inputEl = document.getElementById('magnitude-value');

        document.getElementById('btn-start').addEventListener('click', startExperiment);
        document.getElementById('btn-submit').addEventListener('click', submitResponse);
        document.getElementById('btn-restart').addEventListener('click', restart);

        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submitResponse();
        });

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
        var w = 700, h = 350;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
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

    function generateTrials() {
        var trials = [];
        for (var r = 0; r < CONFIG.repetitions; r++) {
            for (var i = 0; i < CONFIG.ratios.length; i++) {
                trials.push({ ratio: CONFIG.ratios[i], testLength: CONFIG.standardLength * CONFIG.ratios[i] });
            }
        }
        return shuffle(trials);
    }

    function draw(testLength) {
        var w = 700, h = 350;
        var cx = w / 2;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);

        // Standard line (top)
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - CONFIG.standardLength / 2, 100);
        ctx.lineTo(cx + CONFIG.standardLength / 2, 100);
        ctx.stroke();

        ctx.fillStyle = '#6b7280';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Standard = ' + CONFIG.modulus, cx, 75);

        // Test line (bottom)
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - testLength / 2, 240);
        ctx.lineTo(cx + testLength / 2, 240);
        ctx.stroke();

        ctx.fillStyle = '#2563eb';
        ctx.font = '13px sans-serif';
        ctx.fillText('Test line = ?', cx, 275);
    }

    function showTrial() {
        var trial = state.trials[state.currentTrial];
        PsychLab.UI.showProgress(state.currentTrial + 1, state.trials.length);
        draw(trial.testLength);
        inputEl.value = '';
        inputEl.focus();
    }

    function submitResponse() {
        if (!state.running) return;
        var value = parseFloat(inputEl.value);
        if (isNaN(value) || value <= 0) {
            inputEl.style.borderColor = '#dc2626';
            return;
        }
        inputEl.style.borderColor = '';

        var trial = state.trials[state.currentTrial];

        var trialData = {
            trialNumber: state.currentTrial + 1,
            physicalLength: Math.round(trial.testLength),
            standardLength: CONFIG.standardLength,
            ratio: trial.ratio,
            modulus: CONFIG.modulus,
            estimatedMagnitude: value,
            logPhysical: Math.log10(trial.ratio),
            logEstimate: Math.log10(value / CONFIG.modulus)
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        state.currentTrial++;
        if (state.currentTrial < state.trials.length) {
            showTrial();
        } else {
            showResults();
        }
    }

    function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.currentTrial = 0;
        state.running = true;

        PsychLab.UI.showPhase('phase-running');
        setupCanvas();
        showTrial();
    }

    function showResults() {
        state.running = false;
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        var trials = session.trials;

        // Average estimates per ratio
        var ratioData = {};
        for (var i = 0; i < trials.length; i++) {
            var t = trials[i];
            if (!ratioData[t.ratio]) ratioData[t.ratio] = [];
            ratioData[t.ratio].push(t.estimatedMagnitude);
        }

        var logX = [], logY = [], scatterData = [];
        var sortedRatios = CONFIG.ratios.slice().sort(function (a, b) { return a - b; });

        for (var j = 0; j < sortedRatios.length; j++) {
            var ratio = sortedRatios[j];
            var estimates = ratioData[ratio];
            if (!estimates) continue;
            var meanEst = PsychLab.Stats.mean(estimates);
            var lx = Math.log10(ratio);
            var ly = Math.log10(meanEst / CONFIG.modulus);
            logX.push(lx);
            logY.push(ly);
            scatterData.push({ x: lx, y: ly });
        }

        // Fit power law via log-log regression
        var reg = PsychLab.Stats.linearRegression(logX, logY);
        var fittedExponent = reg.slope;

        session.summary = {
            fittedExponent: fittedExponent.toFixed(2),
            theoreticalExponent: CONFIG.theoreticalExponent,
            r2: reg.r2.toFixed(3)
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Your Exponent', fittedExponent.toFixed(2)));
        summary.appendChild(PsychLab.UI.createStatCard('Theoretical', CONFIG.theoreticalExponent.toFixed(2)));
        summary.appendChild(PsychLab.UI.createStatCard('R\u00B2', reg.r2.toFixed(3)));

        PsychLab.Charts.scatterPlot(document.getElementById('chart-scatter'), scatterData, {
            title: "Stevens' Power Law: Log-Log Plot",
            xLabel: 'log\u2081\u2080(Physical Ratio)',
            yLabel: 'log\u2081\u2080(Perceived Ratio)',
            regression: reg,
            width: 480,
            height: 380
        });

        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>Your data was fit with the power law &psi; = k &middot; I<sup>n</sup> using log-log regression.</p>';
        text += '<p>Your fitted <strong>exponent n = ' + fittedExponent.toFixed(2) + '</strong> ';

        var diff = Math.abs(fittedExponent - CONFIG.theoreticalExponent);
        if (diff < 0.15) {
            text += 'is close to the theoretical value of ' + CONFIG.theoreticalExponent.toFixed(1) + ' for line length. ';
            text += 'This means your perception of length is approximately <strong>veridical</strong> \u2014 doubling the physical length roughly doubles the perceived length.</p>';
        } else if (fittedExponent < CONFIG.theoreticalExponent) {
            text += 'is below the theoretical value of ' + CONFIG.theoreticalExponent.toFixed(1) + ', suggesting some <strong>compression</strong> \u2014 longer lines are perceived as less long than they physically are.</p>';
        } else {
            text += 'is above the theoretical value of ' + CONFIG.theoreticalExponent.toFixed(1) + ', suggesting some <strong>expansion</strong> \u2014 you may be overestimating longer lines.</p>';
        }

        text += '<p>The <strong>R\u00B2 = ' + reg.r2.toFixed(3) + '</strong> indicates how well the power law describes your data ';
        text += '(1.0 = perfect fit). Stevens\' power law predicts a linear relationship on log-log coordinates, and the slope gives the exponent.</p>';
        text += '<p>For comparison, the exponent for apparent area is about 0.7 (compression), and for electric shock about 3.5 (extreme expansion).</p>';
        interp.innerHTML = text;
    }

    function restart() {
        state = { session: null, trials: [], currentTrial: 0, running: false };
        PsychLab.UI.showPhase('phase-instructions');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
