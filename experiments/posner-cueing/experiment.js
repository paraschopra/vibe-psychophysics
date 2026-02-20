(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'posner-cueing',
        experimentName: 'Posner Cueing Task',
        totalTrials: 80,
        validProportion: 0.7,
        soa: 300,
        fixationDuration: 500,
        maxResponseTime: 1500,
        interTrialInterval: 600,
        boxSize: 70,
        boxGap: 200
    };

    var state = { session: null, trials: [], running: false };
    var canvas, ctx;

    function init() {
        canvas = document.getElementById('posner-canvas');
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
        var w = 700, h = 300;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    function drawBoxes() {
        var w = 700, h = 300;
        var cx = w / 2, cy = h / 2;
        var bs = CONFIG.boxSize;
        var gap = CONFIG.boxGap;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);

        // Three boxes
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        // Left box
        ctx.strokeRect(cx - gap - bs / 2, cy - bs / 2, bs, bs);
        // Center box
        ctx.strokeRect(cx - bs / 2, cy - bs / 2, bs, bs);
        // Right box
        ctx.strokeRect(cx + gap - bs / 2, cy - bs / 2, bs, bs);

        // Fixation
        ctx.fillStyle = '#333';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', cx, cy);
    }

    function drawCue(direction) {
        var w = 700, h = 300;
        var cx = w / 2, cy = h / 2;

        ctx.fillStyle = '#333';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(direction === 'left' ? '\u2190' : '\u2192', cx, cy);
    }

    function drawTarget(side) {
        var w = 700, h = 300;
        var cx = w / 2, cy = h / 2;
        var gap = CONFIG.boxGap;

        var tx = side === 'left' ? cx - gap : cx + gap;

        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('*', tx, cy);
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
        var numValid = Math.round(CONFIG.totalTrials * CONFIG.validProportion);
        var numInvalid = CONFIG.totalTrials - numValid;

        for (var v = 0; v < numValid; v++) {
            var side = v % 2 === 0 ? 'left' : 'right';
            trials.push({ cueDirection: side, targetSide: side, validity: 'valid' });
        }
        for (var iv = 0; iv < numInvalid; iv++) {
            var cueSide = iv % 2 === 0 ? 'left' : 'right';
            var targetSide = cueSide === 'left' ? 'right' : 'left';
            trials.push({ cueDirection: cueSide, targetSide: targetSide, validity: 'invalid' });
        }

        return shuffle(trials);
    }

    async function runTrial(idx) {
        var trial = state.trials[idx];
        PsychLab.UI.showProgress(idx + 1, CONFIG.totalTrials);

        setupCanvas();

        // Draw boxes + fixation
        drawBoxes();
        await PsychLab.Timing.frameDelay(CONFIG.fixationDuration);

        // Show cue (arrow in center box)
        drawBoxes();
        drawCue(trial.cueDirection);
        await PsychLab.Timing.frameDelay(100); // Cue visible for 100ms

        // Remove cue, show boxes only during remaining SOA
        drawBoxes();
        await PsychLab.Timing.frameDelay(CONFIG.soa - 100);

        // Show target (cue no longer visible)
        drawBoxes();
        drawTarget(trial.targetSide);

        var stimOnset = PsychLab.Timing.now();
        var resp = await PsychLab.Timing.waitForKeyWithTimeout([' '], CONFIG.maxResponseTime);

        var rt = resp.timedOut ? CONFIG.maxResponseTime : resp.timestamp - stimOnset;

        var trialData = {
            trialNumber: idx + 1,
            cueDirection: trial.cueDirection,
            targetSide: trial.targetSide,
            validity: trial.validity,
            soa: CONFIG.soa,
            rt: Math.round(rt * 10) / 10,
            timedOut: resp.timedOut,
            anticipation: rt < 100
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        // Brief blank
        ctx.clearRect(0, 0, 700, 300);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 700, 300);
        await PsychLab.Timing.delay(CONFIG.interTrialInterval);
    }

    async function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.running = true;

        var session = PsychLab.Storage.getSession(state.session.sessionId);
        session.config = { totalTrials: CONFIG.totalTrials, validProportion: CONFIG.validProportion, soa: CONFIG.soa };
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

        function getValidRTs(validity) {
            return trials
                .filter(function (t) { return t.validity === validity && !t.timedOut && !t.anticipation && t.rt >= 100 && t.rt <= 1500; })
                .map(function (t) { return t.rt; });
        }

        var validRTs = getValidRTs('valid');
        var invalidRTs = getValidRTs('invalid');
        var validMean = PsychLab.Stats.mean(validRTs);
        var invalidMean = PsychLab.Stats.mean(invalidRTs);
        var validSE = PsychLab.Stats.standardError(validRTs);
        var invalidSE = PsychLab.Stats.standardError(invalidRTs);
        var cueingEffect = invalidMean - validMean;

        session.summary = {
            validMeanRT: Math.round(validMean),
            invalidMeanRT: Math.round(invalidMean),
            cueingEffect: Math.round(cueingEffect),
            validTrials: validRTs.length,
            invalidTrials: invalidRTs.length
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Valid RT', Math.round(validMean), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Invalid RT', Math.round(invalidMean), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Cueing Effect', Math.round(cueingEffect), 'ms'));

        PsychLab.Charts.barChart(document.getElementById('chart-bars'), [
            { label: 'Valid Cue', value: validMean, error: validSE, color: '#22c55e' },
            { label: 'Invalid Cue', value: invalidMean, error: invalidSE, color: '#dc2626' }
        ], {
            title: 'Mean RT by Cue Validity',
            yLabel: 'Reaction Time (ms)',
            width: 400,
            height: 300
        });

        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>The <strong>cueing effect</strong> (invalid \u2212 valid) was <strong>' + Math.round(cueingEffect) + ' ms</strong>. ';
        if (cueingEffect > 15) {
            text += 'This positive cueing effect demonstrates <strong>covert attentional orienting</strong>: your attention shifted to the cued location before the target appeared, speeding detection at valid locations and slowing it at invalid locations.</p>';
            text += '<p>Published studies typically report cueing effects of 20\u201350 ms with endogenous (arrow) cues at 300 ms SOA (Posner, 1980).</p>';
        } else if (cueingEffect > 0) {
            text += 'This is a small but positive cueing effect, suggesting some attentional orienting occurred.</p>';
        } else {
            text += 'No clear cueing effect was observed. This can happen if the cue was not attended, or if response times were highly variable.</p>';
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
