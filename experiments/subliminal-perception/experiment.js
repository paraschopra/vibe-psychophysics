(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'subliminal-perception',
        experimentName: 'Subliminal Perception',
        // Stimulus durations in frames (at 60Hz: 1≈17ms, 2≈33ms, 3≈50ms, 6≈100ms)
        durationFrames: [1, 2, 3, 6],
        trialsPerDuration: 30,          // 15 left + 15 right per duration
        practiceDurations: [3, 6],      // practice at visible durations only
        practiceTrialsPerDuration: 2,
        fixationDurationBase: 500,
        fixationJitter: 200,            // ±100ms uniform jitter
        forwardMaskDurationMs: 200,
        backwardMaskDurationMs: 200,
        interTrialInterval: 400,
        canvasW: 500,
        canvasH: 400,
        arrowShaftLength: 50,
        arrowHeadDepth: 15,
        arrowHeadWidth: 20,
        arrowLineWidth: 4,
        maskSegments: 12,
        maskRadius: 55,
        bgColor: '#333333',
        fgColor: '#ffffff'
    };

    var state = {
        session: null,
        trials: [],
        practiceTrials: [],
        running: false,
        frameDuration: 16.67,
        fps: 60
    };

    var canvas, ctx;
    var canvasW = CONFIG.canvasW;
    var canvasH = CONFIG.canvasH;

    // ----- Initialization -----

    function init() {
        canvas = document.getElementById('sp-canvas');
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
        canvas.width = canvasW * dpr;
        canvas.height = canvasH * dpr;
        canvas.style.width = canvasW + 'px';
        canvas.style.height = canvasH + 'px';
        ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    // ----- Drawing Functions -----

    function clearCanvas() {
        ctx.fillStyle = CONFIG.bgColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    function drawFixation() {
        clearCanvas();
        ctx.fillStyle = CONFIG.fgColor;
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', canvasW / 2, canvasH / 2);
    }

    function drawMask() {
        clearCanvas();
        var cx = canvasW / 2;
        var cy = canvasH / 2;
        var radius = CONFIG.maskRadius;

        ctx.strokeStyle = CONFIG.fgColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        for (var i = 0; i < CONFIG.maskSegments; i++) {
            var angle = Math.random() * Math.PI * 2;
            var len = 15 + Math.random() * 25;
            var ox = (Math.random() - 0.5) * radius * 2;
            var oy = (Math.random() - 0.5) * radius * 0.8;
            ctx.beginPath();
            ctx.moveTo(cx + ox - Math.cos(angle) * len / 2, cy + oy - Math.sin(angle) * len / 2);
            ctx.lineTo(cx + ox + Math.cos(angle) * len / 2, cy + oy + Math.sin(angle) * len / 2);
            ctx.stroke();
        }
    }

    function drawArrow(direction) {
        clearCanvas();
        var cx = canvasW / 2;
        var cy = canvasH / 2;
        var shaftLen = CONFIG.arrowShaftLength;
        var headDepth = CONFIG.arrowHeadDepth;
        var headWidth = CONFIG.arrowHeadWidth;
        var dir = direction === 'left' ? -1 : 1;

        ctx.strokeStyle = CONFIG.fgColor;
        ctx.fillStyle = CONFIG.fgColor;
        ctx.lineWidth = CONFIG.arrowLineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Shaft
        ctx.beginPath();
        ctx.moveTo(cx - dir * shaftLen / 2, cy);
        ctx.lineTo(cx + dir * shaftLen / 2, cy);
        ctx.stroke();

        // Arrowhead (filled triangle)
        ctx.beginPath();
        ctx.moveTo(cx + dir * (shaftLen / 2 + headDepth), cy);
        ctx.lineTo(cx + dir * shaftLen / 2, cy - headWidth / 2);
        ctx.lineTo(cx + dir * shaftLen / 2, cy + headWidth / 2);
        ctx.closePath();
        ctx.fill();
    }

    function drawText(text, fontSize) {
        clearCanvas();
        ctx.fillStyle = CONFIG.fgColor;
        ctx.font = (fontSize || 20) + 'px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Handle multi-line text
        var lines = text.split('\n');
        var lineHeight = (fontSize || 20) * 1.4;
        var startY = canvasH / 2 - (lines.length - 1) * lineHeight / 2;
        for (var i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], canvasW / 2, startY + i * lineHeight);
        }
    }

    function drawFeedback(correct) {
        clearCanvas();
        ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = correct ? '#22c55e' : '#dc2626';
        ctx.fillText(correct ? 'Correct' : 'Incorrect', canvasW / 2, canvasH / 2);
    }

    // ----- Frame-Accurate Masked Presentation -----

    function presentMaskedArrow(trial) {
        return new Promise(function (resolve) {
            var forwardMaskFrames = Math.round(CONFIG.forwardMaskDurationMs / state.frameDuration);
            var backwardMaskFrames = Math.round(CONFIG.backwardMaskDurationMs / state.frameDuration);
            var arrowFrames = trial.durationFrames;

            var phase = 'forwardMask';
            var frameCount = 0;
            var timings = {};

            function tick(ts) {
                if (phase === 'forwardMask') {
                    if (frameCount === 0) {
                        drawMask();
                        timings.forwardMaskOnset = ts;
                    }
                    frameCount++;
                    if (frameCount >= forwardMaskFrames) {
                        phase = 'arrow';
                        frameCount = 0;
                    }
                    requestAnimationFrame(tick);
                } else if (phase === 'arrow') {
                    if (frameCount === 0) {
                        drawArrow(trial.direction);
                        timings.arrowOnset = ts;
                    }
                    frameCount++;
                    if (frameCount >= arrowFrames) {
                        phase = 'backwardMask';
                        frameCount = 0;
                    }
                    requestAnimationFrame(tick);
                } else if (phase === 'backwardMask') {
                    if (frameCount === 0) {
                        drawMask();
                        timings.backwardMaskOnset = ts;
                    }
                    frameCount++;
                    if (frameCount >= backwardMaskFrames) {
                        timings.backwardMaskOffset = ts;
                        resolve(timings);
                        return;
                    }
                    requestAnimationFrame(tick);
                }
            }

            requestAnimationFrame(tick);
        });
    }

    // ----- Key Handling -----

    function waitForArrowKey() {
        return new Promise(function (resolve) {
            function handler(e) {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    document.removeEventListener('keydown', handler);
                    resolve({
                        key: e.key === 'ArrowLeft' ? 'left' : 'right',
                        timestamp: performance.now()
                    });
                }
            }
            document.addEventListener('keydown', handler);
        });
    }

    function waitForAwarenessKey() {
        return new Promise(function (resolve) {
            function handler(e) {
                var k = e.key.toLowerCase();
                if (k === 'y' || k === 'n') {
                    document.removeEventListener('keydown', handler);
                    resolve({ key: k, timestamp: performance.now() });
                }
            }
            document.addEventListener('keydown', handler);
        });
    }

    // ----- Trial Generation -----

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    function generateTrials() {
        var trials = [];
        for (var d = 0; d < CONFIG.durationFrames.length; d++) {
            var frames = CONFIG.durationFrames[d];
            for (var r = 0; r < CONFIG.trialsPerDuration; r++) {
                trials.push({
                    durationFrames: frames,
                    direction: r < CONFIG.trialsPerDuration / 2 ? 'left' : 'right'
                });
            }
        }
        return shuffle(trials);
    }

    function generatePracticeTrials() {
        var trials = [];
        for (var d = 0; d < CONFIG.practiceDurations.length; d++) {
            var frames = CONFIG.practiceDurations[d];
            for (var r = 0; r < CONFIG.practiceTrialsPerDuration; r++) {
                trials.push({
                    durationFrames: frames,
                    direction: r % 2 === 0 ? 'left' : 'right'
                });
            }
        }
        return shuffle(trials);
    }

    // ----- Trial Execution -----

    async function runTrial(idx, isPractice) {
        var trialList = isPractice ? state.practiceTrials : state.trials;
        var trial = trialList[idx];

        if (!isPractice) {
            PsychLab.UI.showProgress(idx + 1, state.trials.length);
        }

        // 1. Fixation with jitter
        var jitter = Math.random() * CONFIG.fixationJitter - CONFIG.fixationJitter / 2;
        drawFixation();
        await PsychLab.Timing.frameDelay(CONFIG.fixationDurationBase + jitter);

        // 2-4. Forward mask → Arrow → Backward mask (frame-counted)
        var timings = await presentMaskedArrow(trial);

        // 5. Direction response
        drawText('\u2190  or  \u2192 ?', 22);
        var dirResp = await waitForArrowKey();
        var dirRT = dirResp.timestamp - timings.arrowOnset;
        var correct = dirResp.key === trial.direction;

        // 6. Awareness response
        drawText('Did you see the arrow?\nY = Yes    N = No', 18);
        var awareResp = await waitForAwarenessKey();
        var seen = awareResp.key === 'y';

        // 7. Feedback (practice only)
        if (isPractice) {
            drawFeedback(correct);
            await PsychLab.Timing.delay(500);
        }

        // 8. Save trial data (main trials only)
        if (!isPractice) {
            var trialData = {
                trialNumber: idx + 1,
                durationFrames: trial.durationFrames,
                durationMs: Math.round(trial.durationFrames * state.frameDuration * 10) / 10,
                direction: trial.direction,
                response: dirResp.key,
                correct: correct,
                rt: Math.round(dirRT * 10) / 10,
                seen: seen,
                actualArrowDurationMs: Math.round((timings.backwardMaskOnset - timings.arrowOnset) * 10) / 10
            };
            PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);
        }

        // 9. ITI
        clearCanvas();
        await PsychLab.Timing.delay(CONFIG.interTrialInterval);
    }

    // ----- Experiment Flow -----

    async function startExperiment() {
        // 1. Estimate refresh rate
        var refreshInfo = await PsychLab.Timing.estimateRefreshRate(60);
        state.frameDuration = refreshInfo.frameDuration;
        state.fps = refreshInfo.fps;

        // 2. Create session
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        session.config = {
            durationFrames: CONFIG.durationFrames,
            trialsPerDuration: CONFIG.trialsPerDuration,
            estimatedFPS: state.fps,
            frameDuration: state.frameDuration
        };
        PsychLab.Storage.updateSession(session);

        state.trials = generateTrials();
        state.practiceTrials = generatePracticeTrials();
        state.running = true;

        PsychLab.UI.showPhase('phase-running');
        setupCanvas();

        // 3. Show refresh rate
        var fpsNote = document.getElementById('fps-note');
        fpsNote.textContent = 'Display: ' + state.fps + ' Hz (' + state.frameDuration.toFixed(1) + ' ms/frame)';

        // 4. Countdown
        var stimArea = document.getElementById('stimulus-area');
        await PsychLab.UI.showCountdown(stimArea, 3);
        stimArea.innerHTML = '';
        stimArea.appendChild(canvas);
        setupCanvas();

        // 5. Practice trials
        drawText('Practice: ' + state.practiceTrials.length + ' trials with feedback\nPress Space to start', 18);
        await PsychLab.Timing.waitForKey([' ']);

        for (var p = 0; p < state.practiceTrials.length; p++) {
            if (!state.running) break;
            await runTrial(p, true);
        }

        // 6. Transition to main experiment
        drawText('Practice complete!\n\nMain experiment: ' + state.trials.length + ' trials\nNo feedback will be given.\n\nPress Space to begin', 18);
        await PsychLab.Timing.waitForKey([' ']);

        // 7. Main trials
        for (var i = 0; i < state.trials.length; i++) {
            if (!state.running) break;
            await runTrial(i, false);
        }

        showResults();
    }

    // ----- Results -----

    function binomialZTest(k, n) {
        if (n === 0) return { z: 0, p: 1 };
        var z = (k - n * 0.5) / Math.sqrt(n * 0.25);
        var p = 1 - PsychLab.Stats._normalCDF(z); // one-tailed
        return { z: z, p: p };
    }

    function showResults() {
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        var trials = session.trials;

        // Aggregate by duration
        var durations = CONFIG.durationFrames;
        var byDuration = {};
        for (var d = 0; d < durations.length; d++) {
            byDuration[durations[d]] = {
                correct: 0, total: 0,
                seenCorrect: 0, seenTotal: 0,
                unseenCorrect: 0, unseenTotal: 0
            };
        }
        for (var i = 0; i < trials.length; i++) {
            var t = trials[i];
            var bd = byDuration[t.durationFrames];
            bd.total++;
            if (t.correct) bd.correct++;
            if (t.seen) {
                bd.seenTotal++;
                if (t.correct) bd.seenCorrect++;
            } else {
                bd.unseenTotal++;
                if (t.correct) bd.unseenCorrect++;
            }
        }

        // Compute duration labels in ms
        var durationMs = durations.map(function (f) {
            return Math.round(f * state.frameDuration);
        });

        // ----- Chart 1: Psychometric function -----
        var allPoints = [];
        var unseenPoints = [];
        for (var d1 = 0; d1 < durations.length; d1++) {
            var bd1 = byDuration[durations[d1]];
            var ms = durationMs[d1];
            var accAll = bd1.total > 0 ? (bd1.correct / bd1.total) * 100 : 50;
            var seP = bd1.total > 0 ? Math.sqrt(accAll / 100 * (1 - accAll / 100) / bd1.total) * 100 : 0;
            allPoints.push({ x: ms, y: accAll, error: seP });

            var accUnseen = bd1.unseenTotal > 0 ? (bd1.unseenCorrect / bd1.unseenTotal) * 100 : 50;
            var seU = bd1.unseenTotal > 0 ? Math.sqrt(accUnseen / 100 * (1 - accUnseen / 100) / bd1.unseenTotal) * 100 : 0;
            unseenPoints.push({ x: ms, y: accUnseen, error: seU });
        }

        var psychChart = document.getElementById('chart-psychometric');
        PsychLab.Charts.lineChart(psychChart, [
            { label: 'All Trials', points: allPoints, color: '#2563eb' },
            { label: 'Unseen Trials', points: unseenPoints, color: '#dc2626' }
        ], {
            title: 'Accuracy by Stimulus Duration',
            xLabel: 'Duration (ms)',
            yLabel: 'Accuracy (%)',
            yMin: 0,
            yMax: 100,
            width: 500,
            height: 360
        });

        // Draw 50% chance line on psychometric chart
        // lineChart adjusts: minY -= yRange*0.05, maxY += yRange*0.1
        // With yMin=0, yMax=100: minY=-5, maxY=110, yRange=115
        var pCtx = psychChart.getContext('2d');
        var dpr = window.devicePixelRatio || 1;
        pCtx.save();
        pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var pad = { top: 50, right: 30, bottom: 60, left: 65 };
        var plotH = 360 - pad.top - pad.bottom;
        var chartMinY = -5, chartYRange = 115;
        var chanceY = 360 - pad.bottom - ((50 - chartMinY) / chartYRange) * plotH;
        pCtx.strokeStyle = '#888';
        pCtx.lineWidth = 1;
        pCtx.setLineDash([6, 4]);
        pCtx.beginPath();
        pCtx.moveTo(pad.left, chanceY);
        pCtx.lineTo(500 - pad.right, chanceY);
        pCtx.stroke();
        pCtx.setLineDash([]);
        pCtx.fillStyle = '#888';
        pCtx.font = '10px system-ui, sans-serif';
        pCtx.textAlign = 'right';
        pCtx.fillText('chance', 500 - pad.right - 2, chanceY - 4);
        pCtx.restore();

        // ----- Chart 2: Seen vs Unseen accuracy per duration -----
        var barData = [];
        for (var d2 = 0; d2 < durations.length; d2++) {
            var bd2 = byDuration[durations[d2]];
            var ms2 = durationMs[d2];
            barData.push({
                label: ms2 + 'ms Seen',
                value: bd2.seenTotal > 0 ? (bd2.seenCorrect / bd2.seenTotal) * 100 : 0,
                color: '#2563eb'
            });
            barData.push({
                label: ms2 + 'ms Unseen',
                value: bd2.unseenTotal > 0 ? (bd2.unseenCorrect / bd2.unseenTotal) * 100 : 0,
                color: '#dc2626'
            });
        }

        PsychLab.Charts.barChart(document.getElementById('chart-awareness'), barData, {
            title: 'Accuracy: Seen vs Unseen Trials',
            yLabel: 'Accuracy (%)',
            width: 520,
            height: 320
        });

        // ----- Stat cards -----
        var overallCorrect = trials.filter(function (t) { return t.correct; }).length;
        var overallAcc = (overallCorrect / trials.length) * 100;

        // Threshold: interpolate duration at 75% accuracy
        var xArr = durationMs;
        var pArr = allPoints.map(function (p) { return p.y / 100; });
        var threshold = PsychLab.Stats.psychometricThreshold(xArr, pArr, 0.75);

        // Blindsight index: accuracy on unseen trials at shortest 2 durations
        var shortUnseen = byDuration[1].unseenCorrect + byDuration[2].unseenCorrect;
        var shortUnseenTotal = byDuration[1].unseenTotal + byDuration[2].unseenTotal;
        var blindsightAcc = shortUnseenTotal > 0 ? (shortUnseen / shortUnseenTotal) * 100 : null;

        PsychLab.UI.showPhase('phase-results');

        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Overall Accuracy', Math.round(overallAcc) + '%'));
        if (threshold !== null) {
            summary.appendChild(PsychLab.UI.createStatCard('75% Threshold', Math.round(threshold) + ' ms'));
        }
        if (blindsightAcc !== null) {
            summary.appendChild(PsychLab.UI.createStatCard('Blindsight Accuracy', Math.round(blindsightAcc) + '%', 'unseen, short'));
        }

        // ----- Interpretation -----
        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>Your accuracy rose from <strong>' + Math.round(allPoints[0].y) + '%</strong> at the shortest duration (' + durationMs[0] + ' ms) to <strong>' + Math.round(allPoints[allPoints.length - 1].y) + '%</strong> at ' + durationMs[durationMs.length - 1] + ' ms.</p>';

        // Binomial test table — all trials
        text += '<h4>Statistical Tests (Binomial, one-tailed vs 50% chance)</h4>';
        text += '<table><tr><th style="text-align:left">Duration</th><th>Accuracy</th><th>N</th><th>p-value</th><th>Sig?</th></tr>';
        for (var d3 = 0; d3 < durations.length; d3++) {
            var bd3 = byDuration[durations[d3]];
            var btest = binomialZTest(bd3.correct, bd3.total);
            var sig = btest.p < 0.05 ? '\u2713' : 'n.s.';
            text += '<tr><td style="text-align:left">' + durationMs[d3] + ' ms</td>';
            text += '<td>' + (bd3.total > 0 ? Math.round(bd3.correct / bd3.total * 100) : '-') + '%</td>';
            text += '<td>' + bd3.total + '</td>';
            text += '<td>' + (btest.p < 0.001 ? '<.001' : btest.p.toFixed(3)) + '</td>';
            text += '<td style="font-weight:bold">' + sig + '</td></tr>';
        }
        text += '</table>';

        // Binomial test table — unseen trials only
        text += '<h4>Unconscious Processing Test (Unseen Trials Only)</h4>';
        text += '<table><tr><th style="text-align:left">Duration</th><th>Accuracy</th><th>N</th><th>p-value</th><th>Sig?</th></tr>';

        var subliminalEvidence = false;
        for (var d4 = 0; d4 < durations.length; d4++) {
            var bd4 = byDuration[durations[d4]];
            var btest2 = binomialZTest(bd4.unseenCorrect, bd4.unseenTotal);
            var sig2 = bd4.unseenTotal > 0 && btest2.p < 0.05 ? '\u2713' : 'n.s.';
            if (btest2.p < 0.05 && durations[d4] <= 3) subliminalEvidence = true;
            text += '<tr><td style="text-align:left">' + durationMs[d4] + ' ms</td>';
            text += '<td>' + (bd4.unseenTotal > 0 ? Math.round(bd4.unseenCorrect / bd4.unseenTotal * 100) : '-') + '%</td>';
            text += '<td>' + bd4.unseenTotal + '</td>';
            text += '<td>' + (bd4.unseenTotal === 0 ? '-' : btest2.p < 0.001 ? '<.001' : btest2.p.toFixed(3)) + '</td>';
            text += '<td style="font-weight:bold">' + (bd4.unseenTotal === 0 ? '-' : sig2) + '</td></tr>';
        }
        text += '</table>';

        if (subliminalEvidence) {
            text += '<p>Your data shows <strong>evidence for subliminal perception</strong>: even on trials where you reported not seeing the arrow, your direction judgments were significantly above chance at short durations. This dissociation between objective performance and subjective awareness is consistent with findings by Marcel (1983) and Greenwald et al. (1996).</p>';
        } else {
            text += '<p>Your data does not show strong evidence for subliminal perception in this session. Accuracy on unseen trials was not significantly above chance. This could reflect effective masking, a tendency to report "seen" on most trials, or individual differences in subliminal processing sensitivity.</p>';
        }

        text += '<p>The classic finding in this paradigm is a <strong>dissociation</strong>: participants perform above chance even when they report no conscious awareness of the stimulus, suggesting visual information is processed below the threshold of awareness (Marcel, 1983; Dehaene et al., 1998).</p>';

        interp.innerHTML = text;

        // Save summary
        session.summary = {
            overallAccuracy: Math.round(overallAcc),
            threshold75: threshold ? Math.round(threshold) : null,
            blindsightAccuracy: blindsightAcc !== null ? Math.round(blindsightAcc) : null,
            fps: state.fps,
            frameDuration: state.frameDuration
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);
    }

    function restart() {
        state = {
            session: null,
            trials: [],
            practiceTrials: [],
            running: false,
            frameDuration: 16.67,
            fps: 60
        };
        PsychLab.UI.showPhase('phase-instructions');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
