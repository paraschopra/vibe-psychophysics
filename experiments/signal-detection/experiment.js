(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'signal-detection',
        experimentName: 'Signal Detection',
        nTrials: 100,
        signalProportion: 0.5,
        fixationDuration: 500,
        displayDuration: 200,
        maxResponseTime: 3000,
        feedbackDuration: 300,
        blankDuration: 500,
        canvasW: 400,
        canvasH: 400,
        signalRadius: 40,
        signalContrast: 0.12,
        noiseLevel: 0.5
    };

    var state = {
        session: null,
        trials: [],
        running: false
    };

    var canvas, ctx;

    function init() {
        canvas = document.getElementById('sdt-canvas');

        document.getElementById('btn-start').addEventListener('click', startExperiment);
        document.getElementById('btn-restart').addEventListener('click', restart);
        document.getElementById('btn-export-csv').addEventListener('click', function () {
            var s = PsychLab.Storage.getSession(state.session.sessionId);
            PsychLab.Export.downloadCSV(s);
        });
        document.getElementById('btn-export-json').addEventListener('click', function () {
            var s = PsychLab.Storage.getSession(state.session.sessionId);
            PsychLab.Export.downloadJSON(s);
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

    function generateTrials() {
        var trials = [];
        var nSignal = Math.round(CONFIG.nTrials * CONFIG.signalProportion);
        var nNoise = CONFIG.nTrials - nSignal;

        for (var i = 0; i < nSignal; i++) {
            trials.push({ signalPresent: true });
        }
        for (var j = 0; j < nNoise; j++) {
            trials.push({ signalPresent: false });
        }

        // Fisher-Yates shuffle
        for (var k = trials.length - 1; k > 0; k--) {
            var r = Math.floor(Math.random() * (k + 1));
            var tmp = trials[k];
            trials[k] = trials[r];
            trials[r] = tmp;
        }

        return trials;
    }

    function drawNoise(w, h) {
        var imageData = ctx.createImageData(w, h);
        var data = imageData.data;
        for (var i = 0; i < data.length; i += 4) {
            var gray = Math.floor(Math.random() * 256 * CONFIG.noiseLevel + 128 * (1 - CONFIG.noiseLevel));
            data[i] = gray;       // R
            data[i + 1] = gray;   // G
            data[i + 2] = gray;   // B
            data[i + 3] = 255;    // A
        }
        return imageData;
    }

    function drawSignal(imageData, cx, cy, radius, contrast) {
        var data = imageData.data;
        var w = imageData.width;
        var sigma = radius / 2;

        for (var py = Math.max(0, cy - radius); py < Math.min(imageData.height, cy + radius); py++) {
            for (var px = Math.max(0, cx - radius); px < Math.min(w, cx + radius); px++) {
                var dx = px - cx;
                var dy = py - cy;
                var dist2 = dx * dx + dy * dy;

                if (dist2 < radius * radius) {
                    var weight = Math.exp(-dist2 / (2 * sigma * sigma));
                    var boost = weight * contrast * 255;
                    var idx = (py * w + px) * 4;

                    data[idx] = Math.min(255, data[idx] + boost);
                    data[idx + 1] = Math.min(255, data[idx + 1] + boost);
                    data[idx + 2] = Math.min(255, data[idx + 2] + boost);
                }
            }
        }
    }

    function drawFixation() {
        ctx.clearRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#333';
        ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', CONFIG.canvasW / 2, CONFIG.canvasH / 2);
    }

    function drawPrompt() {
        ctx.clearRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#333';
        ctx.font = '20px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Present?  F / J', CONFIG.canvasW / 2, CONFIG.canvasH / 2);
    }

    function clearCanvas() {
        ctx.clearRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
    }

    async function runTrial(idx) {
        var trial = state.trials[idx];

        // Update progress
        PsychLab.UI.showProgress(idx + 1, CONFIG.nTrials);

        // Fixation
        drawFixation();
        await PsychLab.Timing.delay(CONFIG.fixationDuration);

        // Draw noise (and signal if present) on canvas using HiDPI pixel dimensions
        var dpr = window.devicePixelRatio || 1;
        var pixelW = CONFIG.canvasW * dpr;
        var pixelH = CONFIG.canvasH * dpr;
        var imageData = drawNoise(pixelW, pixelH);

        if (trial.signalPresent) {
            var cx = Math.round(pixelW / 2);
            var cy = Math.round(pixelH / 2);
            var radius = Math.round(CONFIG.signalRadius * dpr);
            drawSignal(imageData, cx, cy, radius, CONFIG.signalContrast);
        }

        // Save and restore the transform so we can put raw pixel data
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.putImageData(imageData, 0, 0);
        ctx.restore();

        var stimOnset = PsychLab.Timing.now();

        // Display for specified duration
        await PsychLab.Timing.delay(CONFIG.displayDuration);

        // Show response prompt
        drawPrompt();

        // Wait for response
        var response = await PsychLab.Timing.waitForKeyWithTimeout(['f', 'j'], CONFIG.maxResponseTime);
        var rt = response.timestamp - stimOnset;
        var timedOut = response.timedOut;

        // Determine response and outcome
        var responsePresent = response.key === 'f';
        var outcome, correct;

        if (timedOut) {
            outcome = 'timeout';
            correct = false;
            responsePresent = null;
        } else if (trial.signalPresent && responsePresent) {
            outcome = 'hit';
            correct = true;
        } else if (trial.signalPresent && !responsePresent) {
            outcome = 'miss';
            correct = false;
        } else if (!trial.signalPresent && responsePresent) {
            outcome = 'falseAlarm';
            correct = false;
        } else {
            outcome = 'correctRejection';
            correct = true;
        }

        // Record trial data
        var trialData = {
            trialNumber: idx + 1,
            signalPresent: trial.signalPresent,
            response: response.key,
            responsePresent: responsePresent,
            outcome: outcome,
            correct: correct,
            rt: Math.round(rt * 10) / 10,
            timedOut: timedOut
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        // Brief feedback
        ctx.clearRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.font = '18px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (timedOut) {
            ctx.fillStyle = '#dc2626';
            ctx.fillText('Too slow!', CONFIG.canvasW / 2, CONFIG.canvasH / 2);
        } else if (correct) {
            ctx.fillStyle = '#16a34a';
            ctx.fillText('Correct', CONFIG.canvasW / 2, CONFIG.canvasH / 2);
        } else {
            ctx.fillStyle = '#dc2626';
            ctx.fillText('Incorrect', CONFIG.canvasW / 2, CONFIG.canvasH / 2);
        }

        await PsychLab.Timing.delay(CONFIG.feedbackDuration);

        // Blank
        clearCanvas();
        await PsychLab.Timing.delay(CONFIG.blankDuration);
    }

    async function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.running = true;

        var session = PsychLab.Storage.getSession(state.session.sessionId);
        session.config = Object.assign({}, CONFIG);
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-running');
        setupCanvas();

        // Countdown
        var stimArea = document.getElementById('stimulus-area');
        await PsychLab.UI.showCountdown(stimArea, 3);

        for (var i = 0; i < state.trials.length; i++) {
            if (!state.running) break;
            await runTrial(i);
        }

        showResults();
    }

    function showResults() {
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        var trials = session.trials;

        // Filter out timed-out trials for SDT analysis
        var validTrials = trials.filter(function (t) { return !t.timedOut; });

        // Count outcomes
        var hits = 0, misses = 0, falseAlarms = 0, correctRejections = 0;
        for (var i = 0; i < validTrials.length; i++) {
            switch (validTrials[i].outcome) {
                case 'hit': hits++; break;
                case 'miss': misses++; break;
                case 'falseAlarm': falseAlarms++; break;
                case 'correctRejection': correctRejections++; break;
            }
        }

        var signalTrials = hits + misses;
        var noiseTrials = falseAlarms + correctRejections;

        var hitRate = signalTrials > 0 ? hits / signalTrials : 0;
        var faRate = noiseTrials > 0 ? falseAlarms / noiseTrials : 0;

        // SDT measures
        var dPrime = PsychLab.Stats.dPrime(hitRate, faRate);
        var criterion = PsychLab.Stats.criterion(hitRate, faRate);
        var accuracy = validTrials.length > 0 ? (hits + correctRejections) / validTrials.length : 0;

        // Save summary
        session.summary = {
            hits: hits,
            misses: misses,
            falseAlarms: falseAlarms,
            correctRejections: correctRejections,
            hitRate: Math.round(hitRate * 1000) / 1000,
            falseAlarmRate: Math.round(faRate * 1000) / 1000,
            dPrime: Math.round(dPrime * 100) / 100,
            criterion: Math.round(criterion * 100) / 100,
            accuracy: Math.round(accuracy * 1000) / 1000,
            validTrials: validTrials.length,
            timedOutTrials: trials.length - validTrials.length
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        // Stat cards
        var summaryEl = document.getElementById('results-summary');
        summaryEl.innerHTML = '';
        summaryEl.appendChild(PsychLab.UI.createStatCard('Hit Rate', (hitRate * 100).toFixed(1) + '%'));
        summaryEl.appendChild(PsychLab.UI.createStatCard('FA Rate', (faRate * 100).toFixed(1) + '%'));
        summaryEl.appendChild(PsychLab.UI.createStatCard("d' (d-prime)", dPrime.toFixed(2)));
        summaryEl.appendChild(PsychLab.UI.createStatCard('Criterion (c)', criterion.toFixed(2)));
        summaryEl.appendChild(PsychLab.UI.createStatCard('Accuracy', (accuracy * 100).toFixed(1) + '%'));

        // Bar chart: outcome proportions
        var missRate = signalTrials > 0 ? misses / signalTrials : 0;
        var crRate = noiseTrials > 0 ? correctRejections / noiseTrials : 0;

        PsychLab.Charts.barChart(document.getElementById('chart-bars'), [
            { label: 'Hit Rate', value: hitRate, color: '#16a34a' },
            { label: 'Miss Rate', value: missRate, color: '#dc2626' },
            { label: 'FA Rate', value: faRate, color: '#d97706' },
            { label: 'CR Rate', value: crRate, color: '#2563eb' }
        ], {
            title: 'Response Outcome Proportions',
            yLabel: 'Proportion',
            width: 480,
            height: 300
        });

        // Interpretation
        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';

        // d-prime interpretation
        text += '<p>Your sensitivity (d&prime;) was <strong>' + dPrime.toFixed(2) + '</strong>. ';
        if (dPrime > 1.5) {
            text += 'This indicates <strong>good detection ability</strong> \u2014 you were able to reliably distinguish signal from noise.';
        } else if (dPrime > 0.5) {
            text += 'This indicates <strong>moderate detection ability</strong>. You could detect the signal above chance, but it was challenging.';
        } else {
            text += 'This is <strong>near chance performance</strong>. The signal was very difficult to distinguish from noise at this contrast level.';
        }
        text += '</p>';

        // Criterion interpretation
        text += '<p>Your criterion (c) was <strong>' + criterion.toFixed(2) + '</strong>. ';
        if (criterion > 0.3) {
            text += 'This indicates a <strong>conservative bias</strong> \u2014 you tended to say \u201cabsent\u201d more often, preferring to avoid false alarms at the cost of missing some signals.';
        } else if (criterion < -0.3) {
            text += 'This indicates a <strong>liberal bias</strong> \u2014 you tended to say \u201cpresent\u201d more often, catching more signals at the cost of more false alarms.';
        } else {
            text += 'This indicates a relatively <strong>unbiased</strong> response strategy \u2014 you balanced between saying \u201cpresent\u201d and \u201cabsent.\u201d';
        }
        text += '</p>';

        text += '<p>Your overall accuracy was <strong>' + (accuracy * 100).toFixed(1) + '%</strong> ';
        text += '(Hits: ' + hits + ', Misses: ' + misses + ', False Alarms: ' + falseAlarms + ', Correct Rejections: ' + correctRejections + ').</p>';

        if (trials.length - validTrials.length > 0) {
            text += '<p><em>' + (trials.length - validTrials.length) + ' trial(s) timed out and were excluded from the SDT analysis.</em></p>';
        }

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
