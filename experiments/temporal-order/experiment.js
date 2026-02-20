(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'temporal-order',
        experimentName: 'Temporal Order Judgment',
        soas: [-200, -120, -60, -30, 0, 30, 60, 120, 200],
        repsPerSOA: 8,
        fixationDuration: 800,
        flashDuration: 50,
        postFlashDelay: 500,
        maxResponseTime: 3000,
        blankDuration: 600,
        canvasW: 600,
        canvasH: 300,
        squareSize: 60
    };

    var totalTrials = CONFIG.soas.length * CONFIG.repsPerSOA; // 72

    var state = { session: null, trials: [], running: false };
    var canvas, ctx;

    function init() {
        canvas = document.getElementById('toj-canvas');
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
        var w = CONFIG.canvasW, h = CONFIG.canvasH;
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
        for (var s = 0; s < CONFIG.soas.length; s++) {
            var soa = CONFIG.soas[s];
            for (var r = 0; r < CONFIG.repsPerSOA; r++) {
                trials.push({
                    soa: soa,
                    absSOA: Math.abs(soa),
                    firstSide: soa <= 0 ? 'left' : 'right'
                });
            }
        }
        return shuffle(trials);
    }

    function clearCanvas() {
        ctx.fillStyle = '#374151';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
    }

    function drawFixation() {
        var cx = CONFIG.canvasW / 2;
        var cy = CONFIG.canvasH / 2;
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy);
        ctx.lineTo(cx + 12, cy);
        ctx.moveTo(cx, cy - 12);
        ctx.lineTo(cx, cy + 12);
        ctx.stroke();
    }

    function drawFlash(side) {
        var sz = CONFIG.squareSize;
        var cy = CONFIG.canvasH / 2;
        var x;
        if (side === 'left') {
            x = CONFIG.canvasW * 0.25 - sz / 2;
        } else {
            x = CONFIG.canvasW * 0.75 - sz / 2;
        }
        var y = cy - sz / 2;
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(x, y, sz, sz);
    }

    async function runTrial(idx) {
        var trial = state.trials[idx];
        var soa = trial.soa;

        PsychLab.UI.showProgress(idx + 1, totalTrials);

        setupCanvas();

        // Show fixation
        clearCanvas();
        drawFixation();
        await PsychLab.Timing.frameDelay(CONFIG.fixationDuration);

        // Dark background for stimulus presentation
        clearCanvas();

        // Present flashes with SOA timing
        if (soa <= 0) {
            // Left first (or simultaneous)
            drawFlash('left');
            if (Math.abs(soa) > 0) {
                await PsychLab.Timing.frameDelay(Math.abs(soa));
            }
            drawFlash('right');
        } else {
            // Right first
            drawFlash('right');
            await PsychLab.Timing.frameDelay(soa);
            drawFlash('left');
        }

        // Both squares visible for flashDuration
        await PsychLab.Timing.frameDelay(CONFIG.flashDuration);

        // Clear after flash
        clearCanvas();

        // Post-flash delay
        await PsychLab.Timing.frameDelay(CONFIG.postFlashDelay);

        // Show response prompt
        clearCanvas();
        ctx.fillStyle = '#d1d5db';
        ctx.font = '18px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Which flashed first?  F = Left  /  J = Right', CONFIG.canvasW / 2, CONFIG.canvasH / 2);

        var stimOnset = PsychLab.Timing.now();
        var resp = await PsychLab.Timing.waitForKeyWithTimeout(['f', 'j'], CONFIG.maxResponseTime);

        var rt = resp.timedOut ? CONFIG.maxResponseTime : resp.timestamp - stimOnset;
        var respondedLeftFirst = resp.key === 'f';

        // Determine correctness (undefined for SOA = 0)
        var correct;
        if (soa === 0) {
            correct = undefined;
        } else if (soa < 0) {
            // Left actually came first
            correct = respondedLeftFirst;
        } else {
            // Right actually came first
            correct = !respondedLeftFirst;
        }

        var trialData = {
            trialNumber: idx + 1,
            soa: soa,
            firstSide: trial.firstSide,
            response: resp.timedOut ? 'none' : resp.key,
            respondedLeftFirst: resp.timedOut ? undefined : respondedLeftFirst,
            correct: correct,
            rt: Math.round(rt * 10) / 10,
            timedOut: resp.timedOut
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        // Blank interval
        clearCanvas();
        await PsychLab.Timing.delay(CONFIG.blankDuration);
    }

    async function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.running = true;

        var session = PsychLab.Storage.getSession(state.session.sessionId);
        session.config = {
            soas: CONFIG.soas,
            repsPerSOA: CONFIG.repsPerSOA,
            totalTrials: totalTrials,
            flashDuration: CONFIG.flashDuration,
            fixationDuration: CONFIG.fixationDuration
        };
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-running');
        setupCanvas();

        var stimArea = document.getElementById('stimulus-area');
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

        // For each SOA, compute proportion of "left first" responses
        var soaData = {};
        for (var s = 0; s < CONFIG.soas.length; s++) {
            soaData[CONFIG.soas[s]] = { total: 0, leftFirst: 0 };
        }
        for (var i = 0; i < trials.length; i++) {
            var t = trials[i];
            if (t.timedOut) continue;
            soaData[t.soa].total++;
            if (t.respondedLeftFirst) {
                soaData[t.soa].leftFirst++;
            }
        }

        var soaValues = [];
        var proportions = [];
        for (var j = 0; j < CONFIG.soas.length; j++) {
            var soa = CONFIG.soas[j];
            var d = soaData[soa];
            var prop = d.total > 0 ? d.leftFirst / d.total : 0.5;
            soaValues.push(soa);
            proportions.push(prop);
        }

        // PSS: SOA where P("left first") = 0.5
        var pss = PsychLab.Stats.psychometricThreshold(soaValues, proportions, 0.5);

        // JND: (SOA at 75% "left" - SOA at 25% "left") / 2
        var soa75 = PsychLab.Stats.psychometricThreshold(soaValues, proportions, 0.75);
        var soa25 = PsychLab.Stats.psychometricThreshold(soaValues, proportions, 0.25);
        var jnd = (soa75 !== null && soa25 !== null) ? Math.abs(soa75 - soa25) / 2 : null;

        // Accuracy for extreme SOAs (|SOA| >= 120)
        var extremeCorrect = 0;
        var extremeTotal = 0;
        for (var k = 0; k < trials.length; k++) {
            var tr = trials[k];
            if (tr.timedOut) continue;
            if (Math.abs(tr.soa) >= 120) {
                extremeTotal++;
                if (tr.correct) extremeCorrect++;
            }
        }
        var accuracy = extremeTotal > 0 ? Math.round((extremeCorrect / extremeTotal) * 100) : 0;

        // Save summary
        session.summary = {
            pss: pss !== null ? Math.round(pss * 10) / 10 : null,
            jnd: jnd !== null ? Math.round(jnd * 10) / 10 : null,
            accuracyExtreme: accuracy,
            soaValues: soaValues,
            proportions: proportions
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        // Stat cards
        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('PSS', pss !== null ? Math.round(pss) : 'N/A', 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('JND', jnd !== null ? Math.round(jnd) : 'N/A', 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Accuracy', accuracy, '%'));

        // Psychometric function chart
        var points = [];
        for (var p = 0; p < soaValues.length; p++) {
            points.push({ x: soaValues[p], y: proportions[p] });
        }

        PsychLab.Charts.lineChart(document.getElementById('chart-psychometric'), [
            { label: 'P("Left First")', points: points, color: '#2563eb' }
        ], {
            title: 'Psychometric Function: Temporal Order Judgment',
            xLabel: 'SOA (ms)  [negative = left first]',
            yLabel: 'P("Left First")',
            yMin: 0,
            yMax: 1,
            width: 520,
            height: 360
        });

        // Interpretation
        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';

        if (pss !== null) {
            text += '<p>Your <strong>Point of Subjective Simultaneity (PSS)</strong> was <strong>' + Math.round(pss) + ' ms</strong>. ';
            if (Math.abs(pss) <= 15) {
                text += 'A PSS near zero indicates <strong>no spatial bias</strong> &mdash; you perceived simultaneity accurately.</p>';
            } else if (pss < -15) {
                text += 'A negative PSS suggests a slight <strong>bias toward reporting "right first"</strong> &mdash; the left stimulus needed to lead by more to be perceived as simultaneous.</p>';
            } else {
                text += 'A positive PSS suggests a slight <strong>bias toward reporting "left first"</strong> &mdash; the right stimulus needed to lead by more to be perceived as simultaneous.</p>';
            }
        } else {
            text += '<p>The PSS could not be estimated from the data. This may occur if responses did not cross the 50% threshold.</p>';
        }

        if (jnd !== null) {
            text += '<p>Your <strong>JND</strong> was <strong>' + Math.round(jnd) + ' ms</strong>. ';
            if (jnd <= 50) {
                text += 'This is within the typical range of 20&ndash;50 ms for visual temporal order judgments (Hirsh &amp; Sherrick, 1961), indicating <strong>good temporal resolution</strong>.</p>';
            } else if (jnd <= 100) {
                text += 'This is somewhat above the typical range of 20&ndash;50 ms, suggesting <strong>moderate temporal resolution</strong>.</p>';
            } else {
                text += 'This is above the typical range, suggesting <strong>difficulty discriminating temporal order</strong> at short intervals.</p>';
            }
        } else {
            text += '<p>The JND could not be reliably estimated from the data.</p>';
        }

        text += '<p>Your accuracy on extreme SOAs (&ge; 120 ms) was <strong>' + accuracy + '%</strong>, confirming that you could reliably judge order at large separations.</p>';

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
