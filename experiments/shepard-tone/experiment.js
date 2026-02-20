(function () {
    'use strict';

    var SEMITONE = Math.pow(2, 1 / 12);
    // 12 pitch classes starting from C (base freq ~65 Hz)
    var BASE_FREQ = 65.41; // C2

    var CONFIG = {
        experimentId: 'shepard-tone',
        experimentName: 'Shepard Tone Illusion',
        toneDuration: 0.5,
        gapDuration: 0.3,
        interTrialInterval: 1000,
        intervals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 6], // semitones (6 = tritone, duplicated for extra data)
        repsPerInterval: 2
    };

    var state = { session: null, trials: [], running: false };
    var toneStatus, responseButtons;

    function init() {
        toneStatus = document.getElementById('tone-status');
        responseButtons = document.getElementById('response-buttons');

        document.getElementById('btn-start').addEventListener('click', function () {
            PsychLab.Audio.initContext();
            startExperiment();
        });
        document.getElementById('btn-restart').addEventListener('click', restart);

        document.getElementById('btn-higher').addEventListener('click', function () {
            if (state.responseResolve) { state.responseResolve('higher'); state.responseResolve = null; }
        });
        document.getElementById('btn-lower').addEventListener('click', function () {
            if (state.responseResolve) { state.responseResolve('lower'); state.responseResolve = null; }
        });

        document.addEventListener('keydown', function (e) {
            if (!state.running || !state.responseResolve) return;
            if (e.key === 'ArrowUp') { state.responseResolve('higher'); state.responseResolve = null; }
            else if (e.key === 'ArrowDown') { state.responseResolve('lower'); state.responseResolve = null; }
        });

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

    function generateTrials() {
        var trials = [];
        for (var r = 0; r < CONFIG.repsPerInterval; r++) {
            for (var i = 0; i < CONFIG.intervals.length; i++) {
                var interval = CONFIG.intervals[i];
                var startNote = Math.floor(Math.random() * 12); // random starting pitch class
                trials.push({
                    startNote: startNote,
                    interval: interval,
                    isTritone: interval === 6
                });
            }
        }
        return shuffle(trials);
    }

    function noteToBaseFreq(noteIdx) {
        return BASE_FREQ * Math.pow(SEMITONE, noteIdx % 12);
    }

    async function runTrial(idx) {
        var trial = state.trials[idx];
        PsychLab.UI.showProgress(idx + 1, state.trials.length);
        responseButtons.classList.add('hidden');

        // Play first tone
        toneStatus.textContent = 'Tone 1...';
        var freq1 = noteToBaseFreq(trial.startNote);
        await PsychLab.Audio.playShepardTone(freq1, CONFIG.toneDuration);

        await PsychLab.Timing.delay(CONFIG.gapDuration * 1000);

        // Play second tone (interval semitones higher)
        toneStatus.textContent = 'Tone 2...';
        var freq2 = noteToBaseFreq(trial.startNote + trial.interval);
        await PsychLab.Audio.playShepardTone(freq2, CONFIG.toneDuration);

        // Get response
        toneStatus.textContent = 'Higher or Lower?';
        responseButtons.classList.remove('hidden');

        var response = await new Promise(function (resolve) {
            state.responseResolve = resolve;
        });

        responseButtons.classList.add('hidden');

        var trialData = {
            trialNumber: idx + 1,
            startNote: trial.startNote,
            interval: trial.interval,
            isTritone: trial.isTritone,
            response: response,
            perceivedAscending: response === 'higher'
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        toneStatus.textContent = '';
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

        // Compute % "ascending" responses per interval
        var intervalData = {};
        for (var i = 0; i < trials.length; i++) {
            var t = trials[i];
            if (!intervalData[t.interval]) {
                intervalData[t.interval] = { ascending: 0, total: 0 };
            }
            intervalData[t.interval].total++;
            if (t.perceivedAscending) intervalData[t.interval].ascending++;
        }

        var points = [];
        var intervals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        for (var j = 0; j < intervals.length; j++) {
            var iv = intervals[j];
            var d = intervalData[iv];
            var pct = d ? (d.ascending / d.total) * 100 : 50;
            points.push({ x: iv, y: pct });
        }

        var tritoneData = intervalData[6];
        var tritonePctAscending = tritoneData ? (tritoneData.ascending / tritoneData.total) * 100 : 50;

        session.summary = {
            tritonePctAscending: Math.round(tritonePctAscending),
            ascendingResponsesByInterval: points
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Tritone "Higher"', Math.round(tritonePctAscending) + '%'));

        PsychLab.Charts.lineChart(document.getElementById('chart-lines'), [
            { label: '% Ascending', points: points, color: '#d97706' }
        ], {
            title: '% "Higher" Responses by Interval (semitones)',
            xLabel: 'Interval (semitones)',
            yLabel: '% "Higher" Responses',
            yMin: 0,
            yMax: 100,
            width: 500,
            height: 350
        });

        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>The graph shows how often you judged the second tone as "higher" for each interval size.</p>';
        text += '<p>For small intervals (1\u20134 semitones), most people consistently hear the second tone as higher. For large intervals (8\u201311 semitones), most hear it as lower (since going 8 semitones up is equivalent to going 4 semitones down in Shepard-tone space).</p>';
        text += '<p>The critical interval is the <strong>tritone (6 semitones)</strong> \u2014 exactly half an octave. For this interval, you responded "higher" <strong>' + Math.round(tritonePctAscending) + '%</strong> of the time. ';

        if (tritonePctAscending > 65) {
            text += 'You tend to hear tritone pairs as ascending, which Deutsch (1986) linked to speech patterns and linguistic background.</p>';
        } else if (tritonePctAscending < 35) {
            text += 'You tend to hear tritone pairs as descending.</p>';
        } else {
            text += 'This near-chance responding confirms the genuine ambiguity of the tritone paradox \u2014 the same pair of tones can sound ascending or descending.</p>';
        }

        text += '<p>The Shepard tone illusion demonstrates that pitch perception has a <strong>circular (helical) structure</strong>: pitch height (high vs. low) is separate from pitch chroma (note name), and the illusion exploits this distinction.</p>';
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
