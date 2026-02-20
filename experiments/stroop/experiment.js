(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'stroop',
        experimentName: 'Stroop Effect',
        trialsPerCondition: 16,
        fixationDuration: 500,
        blankDuration: 300,
        maxResponseTime: 3000,
        feedbackDuration: 300,
        colors: {
            red: '#dc2626',
            blue: '#2563eb',
            green: '#16a34a',
            yellow: '#ca8a04'
        },
        colorKeys: { r: 'red', b: 'blue', g: 'green', y: 'yellow' },
        neutralWords: ['CHAIR', 'HOUSE', 'TREE', 'BOOK']
    };

    var COLOR_NAMES = Object.keys(CONFIG.colors);
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

        // Congruent: word == ink
        for (var c = 0; c < CONFIG.trialsPerCondition; c++) {
            var color = COLOR_NAMES[c % COLOR_NAMES.length];
            trials.push({ condition: 'congruent', word: color.toUpperCase(), inkColor: color, correctKey: color[0] });
        }

        // Incongruent: word != ink
        for (var ic = 0; ic < CONFIG.trialsPerCondition; ic++) {
            var inkColor = COLOR_NAMES[ic % COLOR_NAMES.length];
            var wordColor;
            do {
                wordColor = COLOR_NAMES[Math.floor(Math.random() * COLOR_NAMES.length)];
            } while (wordColor === inkColor);
            trials.push({ condition: 'incongruent', word: wordColor.toUpperCase(), inkColor: inkColor, correctKey: inkColor[0] });
        }

        // Neutral: non-color word in color ink
        for (var n = 0; n < CONFIG.trialsPerCondition; n++) {
            var nInk = COLOR_NAMES[n % COLOR_NAMES.length];
            var neutralWord = CONFIG.neutralWords[n % CONFIG.neutralWords.length];
            trials.push({ condition: 'neutral', word: neutralWord, inkColor: nInk, correctKey: nInk[0] });
        }

        return shuffle(trials);
    }

    async function runTrial(idx) {
        var trial = state.trials[idx];
        var total = state.trials.length;
        PsychLab.UI.showProgress(idx + 1, total);

        // Fixation
        await PsychLab.UI.showFixation(stimArea, CONFIG.fixationDuration);

        // Show stimulus
        var wordEl = document.createElement('div');
        wordEl.className = 'stroop-word';
        wordEl.textContent = trial.word;
        wordEl.style.color = CONFIG.colors[trial.inkColor];
        stimArea.innerHTML = '';
        stimArea.appendChild(wordEl);

        var stimOnset = PsychLab.Timing.now();
        var resp = await PsychLab.Timing.waitForKeyWithTimeout(VALID_KEYS, CONFIG.maxResponseTime);

        var rt = resp.timedOut ? CONFIG.maxResponseTime : resp.timestamp - stimOnset;
        var response = resp.key;
        var correct = response === trial.correctKey;

        var trialData = {
            trialNumber: idx + 1,
            condition: trial.condition,
            word: trial.word,
            inkColor: trial.inkColor,
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

        var interference = incongMean - congMean;
        var facilitation = neutMean - congMean;

        var overallAccuracy = trials.filter(function (t) { return t.correct; }).length / trials.length * 100;

        session.summary = {
            congruentMeanRT: Math.round(congMean),
            incongruentMeanRT: Math.round(incongMean),
            neutralMeanRT: Math.round(neutMean),
            interferenceEffect: Math.round(interference),
            facilitationEffect: Math.round(facilitation),
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
        summary.appendChild(PsychLab.UI.createStatCard('Interference', Math.round(interference), 'ms'));
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
        text += '<p>The <strong>Stroop interference effect</strong> (incongruent \u2212 congruent) was <strong>' + Math.round(interference) + ' ms</strong>. ';
        if (interference > 30) {
            text += 'This positive interference confirms the classic Stroop effect: naming ink colors is harder when the word spells a different color, because reading is automatic and creates response conflict.';
        } else if (interference > 0) {
            text += 'This is a modest interference effect. The keyboard version of the Stroop task sometimes produces smaller effects than the vocal version.';
        } else {
            text += 'Interestingly, no clear interference was observed. This can happen with extensive practice or if accuracy was traded for speed.';
        }
        text += '</p>';
        text += '<p>Published studies using vocal naming typically report interference effects of 50\u2013100 ms (MacLeod, 1991). Keyboard versions may show somewhat different magnitudes.</p>';
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
