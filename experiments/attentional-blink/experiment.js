(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'attentional-blink',
        experimentName: 'Attentional Blink (RSVP)',
        streamLength: 20,
        soaMs: 100,
        lags: [1, 2, 3, 4, 5, 7, 8],
        repsPerLag: 8,
        t1Position: 5, // T1 appears at position 5-7 (randomized slightly)
        t2Letter: 'X',
        fixationDuration: 500,
        interTrialInterval: 500
    };

    var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWYZ'.split(''); // No X (used as T2)
    var T1_POOL = 'BCDFGHJKLMNPQRSTVWYZ'.split(''); // Consonants only for T1

    var state = { session: null, trials: [], running: false, t1Response: null, t2Response: null };
    var rsvpDisplay, responsePanel, stimArea;

    function init() {
        rsvpDisplay = document.getElementById('rsvp-display');
        responsePanel = document.getElementById('response-panel');
        stimArea = document.getElementById('stimulus-area');

        // Build T1 letter buttons
        var t1Buttons = document.getElementById('t1-buttons');
        for (var i = 0; i < T1_POOL.length; i++) {
            var btn = document.createElement('button');
            btn.textContent = T1_POOL[i];
            btn.dataset.letter = T1_POOL[i];
            btn.addEventListener('click', function () {
                var btns = t1Buttons.querySelectorAll('button');
                for (var b = 0; b < btns.length; b++) btns[b].classList.remove('selected');
                this.classList.add('selected');
                state.t1Response = this.dataset.letter;
                checkSubmit();
            });
            t1Buttons.appendChild(btn);
        }

        document.getElementById('btn-t2-yes').addEventListener('click', function () {
            state.t2Response = true;
            document.getElementById('btn-t2-yes').classList.add('selected');
            document.getElementById('btn-t2-no').classList.remove('selected');
            checkSubmit();
        });
        document.getElementById('btn-t2-no').addEventListener('click', function () {
            state.t2Response = false;
            document.getElementById('btn-t2-no').classList.add('selected');
            document.getElementById('btn-t2-yes').classList.remove('selected');
            checkSubmit();
        });

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

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    var resolveResponse = null;

    function checkSubmit() {
        if (state.t1Response !== null && state.t2Response !== null && resolveResponse) {
            resolveResponse({ t1: state.t1Response, t2: state.t2Response });
            resolveResponse = null;
        }
    }

    function waitForResponse() {
        return new Promise(function (resolve) {
            resolveResponse = resolve;
        });
    }

    function generateTrials() {
        var trials = [];
        for (var l = 0; l < CONFIG.lags.length; l++) {
            // Half trials T2-present, half T2-absent
            var presentCount = Math.ceil(CONFIG.repsPerLag / 2);
            var absentCount = CONFIG.repsPerLag - presentCount;
            for (var r = 0; r < presentCount; r++) {
                trials.push({ lag: CONFIG.lags[l], t2Present: true });
            }
            for (var a = 0; a < absentCount; a++) {
                trials.push({ lag: CONFIG.lags[l], t2Present: false });
            }
        }
        return shuffle(trials);
    }

    function buildStream(trial) {
        var t1Pos = CONFIG.t1Position + Math.floor(Math.random() * 3); // 5, 6, or 7
        var t2Pos = t1Pos + trial.lag;
        var t1Letter = T1_POOL[Math.floor(Math.random() * T1_POOL.length)];
        var t2Present = trial.t2Present && t2Pos < CONFIG.streamLength;

        var stream = [];

        for (var i = 0; i < CONFIG.streamLength; i++) {
            if (i === t1Pos) {
                stream.push({ letter: t1Letter, isT1: true, isT2: false });
            } else if (i === t2Pos && t2Present) {
                stream.push({ letter: CONFIG.t2Letter, isT1: false, isT2: true });
            } else {
                var letter;
                do {
                    letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
                } while (letter === CONFIG.t2Letter);
                stream.push({ letter: letter, isT1: false, isT2: false });
            }
        }

        return { stream: stream, t1Letter: t1Letter, t1Pos: t1Pos, t2Pos: t2Pos, t2Present: t2Present };
    }

    async function presentStream(streamData) {
        var stream = streamData.stream;

        for (var i = 0; i < stream.length; i++) {
            var item = stream[i];
            rsvpDisplay.textContent = item.letter;

            if (item.isT1) {
                rsvpDisplay.className = 'rsvp-display t1-style';
            } else {
                rsvpDisplay.className = 'rsvp-display';
            }

            await PsychLab.Timing.frameDelay(CONFIG.soaMs);
        }

        rsvpDisplay.textContent = '';
        rsvpDisplay.className = 'rsvp-display';
    }

    async function runTrial(idx) {
        var trial = state.trials[idx];
        PsychLab.UI.showProgress(idx + 1, state.trials.length);

        // Reset response state
        state.t1Response = null;
        state.t2Response = null;
        responsePanel.classList.add('hidden');
        var t1Btns = document.getElementById('t1-buttons').querySelectorAll('button');
        for (var b = 0; b < t1Btns.length; b++) t1Btns[b].classList.remove('selected');
        document.getElementById('btn-t2-yes').classList.remove('selected');
        document.getElementById('btn-t2-no').classList.remove('selected');

        // Fixation
        rsvpDisplay.textContent = '+';
        rsvpDisplay.className = 'rsvp-display';
        await PsychLab.Timing.frameDelay(CONFIG.fixationDuration);

        // Build and present stream
        var streamData = buildStream(trial);
        await presentStream(streamData);

        // Show response panel
        responsePanel.classList.remove('hidden');
        var resp = await waitForResponse();

        var trialData = {
            trialNumber: idx + 1,
            lag: trial.lag,
            t1Identity: streamData.t1Letter,
            t2Present: streamData.t2Present,
            t1Response: resp.t1,
            t2Response: resp.t2,
            t1Correct: resp.t1 === streamData.t1Letter,
            t2Correct: resp.t2 === streamData.t2Present
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        responsePanel.classList.add('hidden');
        await PsychLab.Timing.delay(CONFIG.interTrialInterval);
    }

    async function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.running = true;

        PsychLab.UI.showPhase('phase-running');

        for (var i = 0; i < state.trials.length; i++) {
            if (!state.running) break;
            await runTrial(i);
        }

        showResults();
    }

    function showResults() {
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        var trials = session.trials;

        // T2 accuracy conditional on T1 correct, by lag
        var lagData = {};
        for (var l = 0; l < CONFIG.lags.length; l++) {
            lagData[CONFIG.lags[l]] = { t2Correct: 0, total: 0 };
        }

        for (var i = 0; i < trials.length; i++) {
            var t = trials[i];
            if (t.t1Correct && t.t2Present) {
                lagData[t.lag].total++;
                if (t.t2Correct) lagData[t.lag].t2Correct++;
            }
        }

        var points = [];
        for (var lag = 0; lag < CONFIG.lags.length; lag++) {
            var ld = lagData[CONFIG.lags[lag]];
            var acc = ld.total > 0 ? (ld.t2Correct / ld.total) * 100 : 0;
            points.push({ x: CONFIG.lags[lag], y: acc });
        }

        var t1Accuracy = trials.filter(function (t) { return t.t1Correct; }).length / trials.length * 100;

        session.summary = { t1Accuracy: Math.round(t1Accuracy), t2AccuracyByLag: points };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('T1 Accuracy', Math.round(t1Accuracy) + '%'));

        // Find min T2 accuracy (blink depth)
        var minAcc = 100;
        var minLag = 1;
        for (var p = 0; p < points.length; p++) {
            if (points[p].y < minAcc && CONFIG.lags[p] > 1) {
                minAcc = points[p].y;
                minLag = points[p].x;
            }
        }
        summary.appendChild(PsychLab.UI.createStatCard('Deepest Blink', Math.round(minAcc) + '%', 'at lag ' + minLag));

        PsychLab.Charts.lineChart(document.getElementById('chart-lines'), [
            { label: 'T2 Accuracy (T1 correct)', points: points, color: '#2563eb' }
        ], {
            title: 'Attentional Blink: T2 Accuracy by Lag',
            xLabel: 'Lag (items after T1)',
            yLabel: 'T2 Accuracy (%)',
            yMin: 0,
            yMax: 100,
            width: 480,
            height: 350
        });

        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>The graph shows your <strong>T2 detection accuracy</strong> (conditional on correct T1 identification) as a function of the lag between T1 and T2.</p>';

        if (minAcc < 70 && minLag >= 2 && minLag <= 5) {
            text += '<p>You show a clear <strong>attentional blink</strong>: T2 accuracy dropped to <strong>' + Math.round(minAcc) + '%</strong> at lag ' + minLag + ', then recovered at longer lags. This is the classic pattern described by Raymond et al. (1992).</p>';
        } else if (minAcc < 85) {
            text += '<p>You show a modest attentional blink effect. The dip in T2 accuracy suggests some processing limitation, though it may not be as dramatic as typically reported in lab settings.</p>';
        } else {
            text += '<p>Your T2 accuracy remained relatively high across all lags. Some individuals show minimal attentional blink, possibly due to efficient attentional allocation or the specific stimulus parameters used.</p>';
        }

        text += '<p>The classic attentional blink shows a U-shaped curve: accuracy drops at lags 2\u20135 (~200\u2013500 ms after T1) and recovers by lag 7\u20138. Lag-1 sparing (high accuracy at lag 1) is also commonly observed.</p>';
        interp.innerHTML = text;
    }

    function restart() {
        state = { session: null, trials: [], running: false, t1Response: null, t2Response: null };
        PsychLab.UI.showPhase('phase-instructions');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
