(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'reaction-time',
        experimentName: 'Simple & Choice Reaction Time',
        simpleTrials: 20,
        choiceTrials: 40,
        foreperiodMin: 1000,
        foreperiodMax: 3000,
        fixationDuration: 500,
        anticipationThreshold: 150,
        lapseThreshold: 1500,
        stimulusTimeout: 2000,
        interTrialInterval: 500,
        colors: { green: '#22c55e', blue: '#3b82f6' }
    };

    var state = {
        session: null,
        trials: [],
        currentTrial: 0,
        running: false,
        currentBlock: null
    };

    var stimArea, progressFill, progressText, blockLabel, keyReminder;

    function init() {
        stimArea = document.getElementById('stimulus-area');
        progressFill = document.getElementById('progress-fill');
        progressText = document.getElementById('progress-text');
        blockLabel = document.getElementById('block-label');
        keyReminder = document.getElementById('key-reminder');

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

    function generateTrials() {
        var trials = [];

        // Simple RT block
        for (var i = 0; i < CONFIG.simpleTrials; i++) {
            trials.push({
                block: 'simple',
                stimulus: 'green',
                correctKey: ' ',
                foreperiod: CONFIG.foreperiodMin + Math.random() * (CONFIG.foreperiodMax - CONFIG.foreperiodMin)
            });
        }

        // Choice RT block
        var choiceStimuli = [];
        for (var j = 0; j < CONFIG.choiceTrials / 2; j++) {
            choiceStimuli.push('green');
            choiceStimuli.push('blue');
        }
        // Shuffle
        for (var k = choiceStimuli.length - 1; k > 0; k--) {
            var r = Math.floor(Math.random() * (k + 1));
            var tmp = choiceStimuli[k];
            choiceStimuli[k] = choiceStimuli[r];
            choiceStimuli[r] = tmp;
        }

        for (var m = 0; m < choiceStimuli.length; m++) {
            trials.push({
                block: 'choice',
                stimulus: choiceStimuli[m],
                correctKey: choiceStimuli[m] === 'green' ? 'f' : 'j',
                foreperiod: CONFIG.foreperiodMin + Math.random() * (CONFIG.foreperiodMax - CONFIG.foreperiodMin)
            });
        }

        return trials;
    }

    function showStimulus(trial) {
        var circle = document.createElement('div');
        circle.className = 'rt-circle ' + trial.stimulus;
        stimArea.innerHTML = '';
        stimArea.appendChild(circle);

        var stimOnset = PsychLab.Timing.now();

        return new Promise(function (resolve) {
            var validKeys = trial.block === 'simple' ? [' '] : ['f', 'j'];

            // Also handle early responses during foreperiod via the same handler
            PsychLab.Timing.waitForKeyWithTimeout(validKeys, CONFIG.stimulusTimeout)
                .then(function (resp) {
                    resolve({
                        key: resp.key,
                        timestamp: resp.timestamp,
                        stimOnset: stimOnset,
                        timedOut: resp.timedOut
                    });
                });
        });
    }

    function classifyRT(rt) {
        if (rt < CONFIG.anticipationThreshold) return 'anticipation';
        if (rt > CONFIG.lapseThreshold) return 'lapse';
        return 'valid';
    }

    async function runTrial(trialIndex) {
        var trial = state.trials[trialIndex];
        var totalTrials = state.trials.length;

        PsychLab.UI.showProgress(trialIndex + 1, totalTrials);

        // Update block label if block changed
        if (state.currentBlock !== trial.block) {
            state.currentBlock = trial.block;
            if (trial.block === 'simple') {
                blockLabel.textContent = 'Block 1: Simple RT';
                keyReminder.textContent = 'Press Space when you see the green circle';
            } else {
                blockLabel.textContent = 'Block 2: Choice RT';
                keyReminder.textContent = 'Press F for green, J for blue';

                // Show block transition message
                if (trialIndex === CONFIG.simpleTrials) {
                    stimArea.innerHTML = '<div class="rt-message"><strong>Block 1 complete!</strong><br><br>Block 2: Choice RT<br>Press <strong>F</strong> for green, <strong>J</strong> for blue.<br><br>Press Space to continue.</div>';
                    await PsychLab.Timing.waitForKey([' ']);
                }
            }
        }

        // Fixation
        await PsychLab.UI.showFixation(stimArea, CONFIG.fixationDuration);

        // Random foreperiod (blank screen with fixation)
        stimArea.innerHTML = '<div class="fixation-cross">+</div>';
        await PsychLab.Timing.delay(trial.foreperiod);

        // Show stimulus and wait for response
        var response = await showStimulus(trial);
        var rt = response.timestamp - response.stimOnset;
        var rtClass = classifyRT(rt);
        var correct = trial.block === 'simple' ? true : (response.key === trial.correctKey);

        if (response.timedOut) {
            rtClass = 'lapse';
            correct = false;
            rt = CONFIG.stimulusTimeout;
        }

        // Record trial data
        var trialData = {
            trialNumber: trialIndex + 1,
            block: trial.block,
            stimulus: trial.stimulus,
            correctKey: trial.correctKey,
            response: response.key,
            correct: correct,
            rt: Math.round(rt * 10) / 10,
            rtClassification: rtClass,
            foreperiod: Math.round(trial.foreperiod),
            stimulusOnset: response.stimOnset,
            responseTime: response.timestamp
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        // Brief feedback
        var feedbackClass = rtClass === 'anticipation' ? 'anticipation' :
            rtClass === 'lapse' ? 'lapse' :
            rt < 250 ? 'fast' : 'normal';

        var feedbackText = rtClass === 'anticipation' ? 'Too fast! (' + Math.round(rt) + ' ms)' :
            rtClass === 'lapse' ? 'Too slow!' :
            !correct ? 'Wrong key! (' + Math.round(rt) + ' ms)' :
            Math.round(rt) + ' ms';

        stimArea.innerHTML = '<div class="rt-feedback ' + feedbackClass + '">' + feedbackText + '</div>';
        await PsychLab.Timing.delay(CONFIG.interTrialInterval);
    }

    async function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.currentTrial = 0;
        state.currentBlock = null;
        state.running = true;

        var session = PsychLab.Storage.getSession(state.session.sessionId);
        session.config = Object.assign({}, CONFIG);
        delete session.config.colors;
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-running');

        // Countdown
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

        // Separate blocks
        var simpleTrials = trials.filter(function (t) { return t.block === 'simple' && t.rtClassification === 'valid'; });
        var choiceTrials = trials.filter(function (t) { return t.block === 'choice' && t.rtClassification === 'valid' && t.correct; });

        var simpleRTs = simpleTrials.map(function (t) { return t.rt; });
        var choiceRTs = choiceTrials.map(function (t) { return t.rt; });

        var simpleMean = PsychLab.Stats.mean(simpleRTs);
        var choiceMean = PsychLab.Stats.mean(choiceRTs);
        var simpleSE = PsychLab.Stats.standardError(simpleRTs);
        var choiceSE = PsychLab.Stats.standardError(choiceRTs);
        var simpleMedian = PsychLab.Stats.median(simpleRTs);
        var choiceMedian = PsychLab.Stats.median(choiceRTs);
        var hickEffect = choiceMean - simpleMean;

        var choiceAccuracy = trials.filter(function (t) { return t.block === 'choice'; });
        var choiceCorrect = choiceAccuracy.filter(function (t) { return t.correct; }).length;
        var accuracy = choiceAccuracy.length > 0 ? (choiceCorrect / choiceAccuracy.length * 100) : 0;

        // Summary
        session.summary = {
            simpleMeanRT: Math.round(simpleMean),
            simpleMedianRT: Math.round(simpleMedian),
            simpleSD: Math.round(PsychLab.Stats.standardDeviation(simpleRTs)),
            choiceMeanRT: Math.round(choiceMean),
            choiceMedianRT: Math.round(choiceMedian),
            choiceSD: Math.round(PsychLab.Stats.standardDeviation(choiceRTs)),
            hickEffect: Math.round(hickEffect),
            choiceAccuracy: Math.round(accuracy * 10) / 10,
            validSimpleTrials: simpleRTs.length,
            validChoiceTrials: choiceRTs.length
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        // Stat cards
        var summaryEl = document.getElementById('results-summary');
        summaryEl.innerHTML = '';
        summaryEl.appendChild(PsychLab.UI.createStatCard('Simple RT (Mean)', Math.round(simpleMean), 'ms'));
        summaryEl.appendChild(PsychLab.UI.createStatCard('Choice RT (Mean)', Math.round(choiceMean), 'ms'));
        summaryEl.appendChild(PsychLab.UI.createStatCard('Hick Effect', Math.round(hickEffect), 'ms'));
        summaryEl.appendChild(PsychLab.UI.createStatCard('Choice Accuracy', Math.round(accuracy) + '%'));

        // Bar chart
        PsychLab.Charts.barChart(document.getElementById('chart-bars'), [
            { label: 'Simple RT', value: simpleMean, error: simpleSE, color: '#22c55e' },
            { label: 'Choice RT', value: choiceMean, error: choiceSE, color: '#3b82f6' }
        ], {
            title: 'Mean Reaction Time by Condition',
            yLabel: 'Reaction Time (ms)',
            width: 420,
            height: 300
        });

        // Histogram of all valid RTs
        var allRTs = simpleRTs.concat(choiceRTs);
        PsychLab.Charts.histogram(document.getElementById('chart-hist'), allRTs, {
            title: 'RT Distribution (All Valid Trials)',
            xLabel: 'Reaction Time (ms)',
            bins: 12,
            width: 420,
            height: 300
        });

        // Interpretation
        var interp = document.getElementById('results-interpretation');
        var interpText = '<h3>Interpretation</h3>';
        interpText += '<p>Your simple RT was <strong>' + Math.round(simpleMean) + ' ms</strong> ';
        if (simpleMean < 250) {
            interpText += '(faster than typical — nice!). ';
        } else if (simpleMean < 350) {
            interpText += '(within the typical range of 200\u2013300 ms). ';
        } else {
            interpText += '(somewhat slower than the typical 200\u2013300 ms range). ';
        }

        interpText += 'Your choice RT was <strong>' + Math.round(choiceMean) + ' ms</strong>, ';
        interpText += 'making the <strong>Hick effect ' + Math.round(hickEffect) + ' ms</strong>.</p>';

        if (hickEffect > 30) {
            interpText += '<p>This positive difference is consistent with Hick\'s Law: the additional decision (which key to press) adds processing time. ';
            interpText += 'The typical effect in lab settings is 50\u2013100 ms for 2-choice vs simple RT.</p>';
        } else if (hickEffect > 0) {
            interpText += '<p>The small positive difference suggests a modest Hick effect. With more trials or practice, the difference often becomes more pronounced.</p>';
        } else {
            interpText += '<p>Interestingly, your choice RT was not much slower than simple RT. This can happen with practice or if attention lapses occurred during simple RT trials.</p>';
        }

        if (accuracy < 90) {
            interpText += '<p>Your choice accuracy was ' + Math.round(accuracy) + '%. A speed-accuracy tradeoff may be inflating your choice RTs — try to maintain accuracy above 90%.</p>';
        }
        interp.innerHTML = interpText;
    }

    function restart() {
        state = { session: null, trials: [], currentTrial: 0, running: false, currentBlock: null };
        PsychLab.UI.showPhase('phase-instructions');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
