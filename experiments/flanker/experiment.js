(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'flanker',
        experimentName: 'Flanker Task',
        trialsPerCondition: 12,
        fixationDuration: 500,
        blankDuration: 300,
        maxResponseTime: 2500,
        feedbackDuration: 300
    };

    var VALID_KEYS = ['f', 'j'];

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
        var targets = ['H', 'S'];
        var conditions = ['congruent', 'incongruent', 'neutral'];

        for (var c = 0; c < conditions.length; c++) {
            var condition = conditions[c];
            for (var t = 0; t < targets.length; t++) {
                var target = targets[t];
                var opposite = target === 'H' ? 'S' : 'H';
                var correctKey = target === 'H' ? 'f' : 'j';
                var flanker, displayString;

                if (condition === 'congruent') {
                    flanker = target;
                } else if (condition === 'incongruent') {
                    flanker = opposite;
                } else {
                    flanker = 'X';
                }

                displayString = flanker + flanker + target + flanker + flanker;

                for (var r = 0; r < CONFIG.trialsPerCondition; r++) {
                    trials.push({
                        condition: condition,
                        targetLetter: target,
                        flankerLetters: flanker,
                        displayString: displayString,
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

        // Show stimulus — center letter highlighted
        var display = document.createElement('div');
        display.className = 'flanker-display';
        var left = trial.displayString.substring(0, 2);
        var center = trial.displayString.substring(2, 3);
        var right = trial.displayString.substring(3, 5);
        display.innerHTML = '<span>' + left + '</span><span class="flanker-target">' + center + '</span><span>' + right + '</span>';
        stimArea.innerHTML = '';
        stimArea.appendChild(display);

        var stimOnset = PsychLab.Timing.now();
        var resp = await PsychLab.Timing.waitForKeyWithTimeout(VALID_KEYS, CONFIG.maxResponseTime);

        var rt = resp.timedOut ? CONFIG.maxResponseTime : resp.timestamp - stimOnset;
        var response = resp.key;
        var correct = response === trial.correctKey;

        var trialData = {
            trialNumber: idx + 1,
            condition: trial.condition,
            targetLetter: trial.targetLetter,
            flankerLetters: trial.flankerLetters,
            displayString: trial.displayString,
            correctKey: trial.correctKey,
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
        session.config = { trialsPerCondition: CONFIG.trialsPerCondition, conditions: ['congruent', 'incongruent', 'neutral'] };
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
                .filter(function (t) { return t.condition === cond && t.correct && !t.timedOut && t.rt >= 150 && t.rt <= 2000; })
                .map(function (t) { return t.rt; });
        }

        var congRTs = getValidRTs('congruent');
        var incongRTs = getValidRTs('incongruent');
        var neutRTs = getValidRTs('neutral');

        var congMean = PsychLab.Stats.mean(congRTs);
        var incongMean = PsychLab.Stats.mean(incongRTs);
        var neutMean = PsychLab.Stats.mean(neutRTs);
        var congSE = PsychLab.Stats.standardError(congRTs);
        var incongSE = PsychLab.Stats.standardError(incongRTs);
        var neutSE = PsychLab.Stats.standardError(neutRTs);

        var fce = incongMean - congMean;

        var overallAccuracy = trials.filter(function (t) { return t.correct; }).length / trials.length * 100;

        session.summary = {
            congruentMeanRT: Math.round(congMean),
            incongruentMeanRT: Math.round(incongMean),
            neutralMeanRT: Math.round(neutMean),
            flankerCompatibilityEffect: Math.round(fce),
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
        summary.appendChild(PsychLab.UI.createStatCard('Neutral RT', Math.round(neutMean), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Incongruent RT', Math.round(incongMean), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('FCE', Math.round(fce), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Accuracy', Math.round(overallAccuracy) + '%'));

        // Bar chart
        PsychLab.Charts.barChart(document.getElementById('chart-bars'), [
            { label: 'Congruent', value: congMean, error: congSE, color: '#22c55e' },
            { label: 'Neutral', value: neutMean, error: neutSE, color: '#6b7280' },
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
        text += '<p>The <strong>flanker compatibility effect</strong> (incongruent \u2212 congruent) was <strong>' + Math.round(fce) + ' ms</strong>. ';
        if (fce >= 50) {
            text += 'This is consistent with the typical FCE of 50\u2013100 ms reported in the literature. Incongruent flankers that map to the opposite response create significant interference, confirming that flanking stimuli are processed involuntarily even when irrelevant to the task.';
        } else if (fce > 0) {
            text += 'This is a modest flanker effect, somewhat smaller than the typical 50\u2013100 ms reported in published studies. Individual differences in attentional focus, practice effects, or speed\u2013accuracy trade-offs may account for the reduced magnitude.';
        } else {
            text += 'Interestingly, no clear flanker compatibility effect was observed. This can occur with extensive practice, very wide letter spacing, or if accuracy was traded for speed.';
        }
        text += '</p>';
        text += '<p>Published studies typically report FCE magnitudes of 50\u2013100 ms (Eriksen &amp; Eriksen, 1974). The effect tends to decrease as the distance between flankers and target increases.</p>';
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
