(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'simon-effect',
        experimentName: 'Simon Effect',
        trialsPerCell: 20,
        fixationDuration: 500,
        blankDuration: 400,
        maxResponseTime: 2000,
        feedbackDuration: 300,
        circleRadius: 40,
        colors: {
            red: '#dc2626',
            blue: '#2563eb'
        },
        colorKeys: { f: 'red', j: 'blue' }
    };

    var VALID_KEYS = Object.keys(CONFIG.colorKeys);

    var state = { session: null, trials: [], running: false };
    var stimArea;

    function init() {
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

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    function generateTrials() {
        var trials = [];
        var colors = ['red', 'blue'];
        var sides = ['left', 'right'];

        for (var c = 0; c < colors.length; c++) {
            for (var s = 0; s < sides.length; s++) {
                var color = colors[c];
                var side = sides[s];

                // Congruency: red+left = congruent (F key is left hand),
                // red+right = incongruent, blue+right = congruent (J key is right hand),
                // blue+left = incongruent
                var congruency;
                if ((color === 'red' && side === 'left') || (color === 'blue' && side === 'right')) {
                    congruency = 'congruent';
                } else {
                    congruency = 'incongruent';
                }

                var correctKey = color === 'red' ? 'f' : 'j';

                for (var r = 0; r < CONFIG.trialsPerCell; r++) {
                    trials.push({
                        color: color,
                        side: side,
                        congruency: congruency,
                        correctKey: correctKey
                    });
                }
            }
        }

        return shuffle(trials);
    }

    async function runTrial(idx) {
        var trial = state.trials[idx];
        var total = state.trials.length;
        PsychLab.UI.showProgress(idx + 1, total);

        // Fixation
        await PsychLab.UI.showFixation(stimArea, CONFIG.fixationDuration);

        // Show stimulus: colored circle on left or right
        var container = document.createElement('div');
        container.className = 'simon-container';

        var circle = document.createElement('div');
        circle.className = 'simon-circle';
        circle.className += trial.side === 'left' ? ' simon-left' : ' simon-right';
        circle.style.backgroundColor = CONFIG.colors[trial.color];

        container.appendChild(circle);
        stimArea.innerHTML = '';
        stimArea.appendChild(container);

        var stimOnset = PsychLab.Timing.now();
        var resp = await PsychLab.Timing.waitForKeyWithTimeout(VALID_KEYS, CONFIG.maxResponseTime);

        var rt = resp.timedOut ? CONFIG.maxResponseTime : resp.timestamp - stimOnset;
        var response = resp.key;
        var correct = response === trial.correctKey;

        var trialData = {
            trialNumber: idx + 1,
            color: trial.color,
            side: trial.side,
            congruency: trial.congruency,
            correctResponse: trial.correctKey,
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
            await PsychLab.UI.showFeedback(stimArea, correct, CONFIG.feedbackDuration);
        } else {
            stimArea.innerHTML = '<div class="feedback incorrect">Too slow!</div>';
            await PsychLab.Timing.delay(CONFIG.feedbackDuration);
        }

        await PsychLab.Timing.delay(CONFIG.blankDuration);
    }

    async function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.running = true;

        var session = PsychLab.Storage.getSession(state.session.sessionId);
        session.config = { trialsPerCell: CONFIG.trialsPerCell, conditions: ['congruent', 'incongruent'] };
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-running');
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

        function getValidRTs(cond) {
            return trials
                .filter(function (t) { return t.congruency === cond && t.correct && !t.timedOut && t.rt >= 150 && t.rt <= 2000; })
                .map(function (t) { return t.rt; });
        }

        var congRTs = getValidRTs('congruent');
        var incongRTs = getValidRTs('incongruent');

        var congMean = PsychLab.Stats.mean(congRTs);
        var incongMean = PsychLab.Stats.mean(incongRTs);
        var congSE = PsychLab.Stats.standardError(congRTs);
        var incongSE = PsychLab.Stats.standardError(incongRTs);

        var simonEffect = incongMean - congMean;

        var overallAccuracy = trials.filter(function (t) { return t.correct; }).length / trials.length * 100;

        session.summary = {
            congruentMeanRT: Math.round(congMean),
            incongruentMeanRT: Math.round(incongMean),
            simonEffect: Math.round(simonEffect),
            overallAccuracy: Math.round(overallAccuracy * 10) / 10
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        // Stat cards
        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Congruent RT', Math.round(congMean), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Incongruent RT', Math.round(incongMean), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Simon Effect', Math.round(simonEffect), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Accuracy', Math.round(overallAccuracy) + '%'));

        // Bar chart
        PsychLab.Charts.barChart(document.getElementById('chart-bars'), [
            { label: 'Congruent', value: congMean, error: congSE, color: '#22c55e' },
            { label: 'Incongruent', value: incongMean, error: incongSE, color: '#dc2626' }
        ], {
            title: 'Mean RT by Condition',
            yLabel: 'Reaction Time (ms)',
            width: 480,
            height: 300
        });

        // Interpretation
        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>The <strong>Simon effect</strong> (incongruent \u2212 congruent) was <strong>' + Math.round(simonEffect) + ' ms</strong>. ';
        if (simonEffect > 40) {
            text += 'This is a large Simon effect, exceeding the typical range of 20\u201340 ms. Stimulus position strongly interfered with your response selection, suggesting robust automatic spatial coding.';
        } else if (simonEffect > 20) {
            text += 'This falls within the typical range of 20\u201340 ms reported in the literature. It confirms that irrelevant spatial information automatically influences response selection.';
        } else if (simonEffect > 0) {
            text += 'This is a small but positive Simon effect. While below the typical 20\u201340 ms range, it still suggests some influence of spatial position on response selection.';
        } else {
            text += 'Interestingly, no clear Simon effect was observed. This can happen with extensive practice, strong attentional control, or if accuracy was traded for speed.';
        }
        text += '</p>';
        text += '<p>Published studies typically report Simon effects of 20\u201340 ms (Lu &amp; Proctor, 1995). The effect reflects automatic spatial coding that occurs even when stimulus location is task-irrelevant.</p>';
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
