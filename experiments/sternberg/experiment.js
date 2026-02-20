(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'sternberg',
        experimentName: 'Sternberg Memory Search',
        setSizes: [1, 2, 4, 6],
        trialsPerCell: 12,
        fixationDuration: 500,
        retentionInterval: 1000,
        maxResponseTime: 3000,
        feedbackDuration: 300,
        blankDuration: 400
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

    /** Calculate memory display duration based on set size */
    function memoryDisplayDuration(setSize) {
        return 1000 + setSize * 300;
    }

    /** Pick n unique random digits from 1-9 */
    function pickDigits(n) {
        var pool = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        shuffle(pool);
        return pool.slice(0, n);
    }

    function generateTrials() {
        var trials = [];

        for (var s = 0; s < CONFIG.setSizes.length; s++) {
            var setSize = CONFIG.setSizes[s];

            // Present trials
            for (var p = 0; p < CONFIG.trialsPerCell; p++) {
                var memSet = pickDigits(setSize);
                var probeIdx = Math.floor(Math.random() * memSet.length);
                trials.push({
                    setSize: setSize,
                    memorySet: memSet.slice(),
                    probeDigit: memSet[probeIdx],
                    probePresent: true,
                    correctKey: 'f'
                });
            }

            // Absent trials
            for (var a = 0; a < CONFIG.trialsPerCell; a++) {
                var memSetA = pickDigits(setSize);
                // Pick a digit NOT in the memory set
                var available = [];
                for (var d = 1; d <= 9; d++) {
                    if (memSetA.indexOf(d) === -1) {
                        available.push(d);
                    }
                }
                var absentProbe = available[Math.floor(Math.random() * available.length)];
                trials.push({
                    setSize: setSize,
                    memorySet: memSetA.slice(),
                    probeDigit: absentProbe,
                    probePresent: false,
                    correctKey: 'j'
                });
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

        // Show memory set
        var memEl = document.createElement('div');
        memEl.className = 'memory-set';
        memEl.textContent = trial.memorySet.join(' ');
        stimArea.innerHTML = '';
        stimArea.appendChild(memEl);

        await PsychLab.Timing.frameDelay(memoryDisplayDuration(trial.setSize));

        // Retention interval (blank)
        stimArea.innerHTML = '<div class="retention-blank"></div>';
        await PsychLab.Timing.frameDelay(CONFIG.retentionInterval);

        // Show probe digit
        var probeEl = document.createElement('div');
        probeEl.className = 'probe-digit';
        probeEl.textContent = trial.probeDigit;
        stimArea.innerHTML = '';
        stimArea.appendChild(probeEl);

        var stimOnset = PsychLab.Timing.now();
        var resp = await PsychLab.Timing.waitForKeyWithTimeout(VALID_KEYS, CONFIG.maxResponseTime);

        var rt = resp.timedOut ? CONFIG.maxResponseTime : resp.timestamp - stimOnset;
        var response = resp.key;
        var correct = response === trial.correctKey;

        var trialData = {
            trialNumber: idx + 1,
            setSize: trial.setSize,
            memorySet: trial.memorySet.join(','),
            probeDigit: trial.probeDigit,
            probePresent: trial.probePresent,
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
        session.config = {
            setSizes: CONFIG.setSizes,
            trialsPerCell: CONFIG.trialsPerCell,
            totalTrials: state.trials.length
        };
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

        // Filter valid trials: correct, not timed out, RT in range
        function getValidRTs(setSize, present) {
            return trials
                .filter(function (t) {
                    return t.setSize === setSize && t.probePresent === present &&
                           t.correct && !t.timedOut && t.rt >= 200 && t.rt <= 2500;
                })
                .map(function (t) { return t.rt; });
        }

        // Compute mean RTs and build chart data
        var presentPoints = [];
        var absentPoints = [];
        var presentRTsForSlope = [];
        var absentRTsForSlope = [];
        var presentSizesForSlope = [];
        var absentSizesForSlope = [];
        var allValidRTs = [];

        for (var s = 0; s < CONFIG.setSizes.length; s++) {
            var setSize = CONFIG.setSizes[s];

            var presRTs = getValidRTs(setSize, true);
            var absRTs = getValidRTs(setSize, false);

            var presMean = PsychLab.Stats.mean(presRTs);
            var absMean = PsychLab.Stats.mean(absRTs);
            var presSE = PsychLab.Stats.standardError(presRTs);
            var absSE = PsychLab.Stats.standardError(absRTs);

            presentPoints.push({ x: setSize, y: presMean, error: presSE });
            absentPoints.push({ x: setSize, y: absMean, error: absSE });

            presentRTsForSlope.push(presMean);
            absentRTsForSlope.push(absMean);
            presentSizesForSlope.push(setSize);
            absentSizesForSlope.push(setSize);

            allValidRTs = allValidRTs.concat(presRTs).concat(absRTs);
        }

        // Linear regressions
        var presentReg = PsychLab.Stats.linearRegression(presentSizesForSlope, presentRTsForSlope);
        var absentReg = PsychLab.Stats.linearRegression(absentSizesForSlope, absentRTsForSlope);

        var overallMeanRT = PsychLab.Stats.mean(allValidRTs);
        var overallAccuracy = trials.filter(function (t) { return t.correct; }).length / trials.length * 100;

        // Save summary
        session.summary = {
            presentSlope: Math.round(presentReg.slope * 10) / 10,
            absentSlope: Math.round(absentReg.slope * 10) / 10,
            presentIntercept: Math.round(presentReg.intercept),
            absentIntercept: Math.round(absentReg.intercept),
            presentR2: Math.round(presentReg.r2 * 1000) / 1000,
            absentR2: Math.round(absentReg.r2 * 1000) / 1000,
            overallMeanRT: Math.round(overallMeanRT),
            overallAccuracy: Math.round(overallAccuracy * 10) / 10
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        // Stat cards
        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Present Slope', Math.round(presentReg.slope * 10) / 10, 'ms/item'));
        summary.appendChild(PsychLab.UI.createStatCard('Absent Slope', Math.round(absentReg.slope * 10) / 10, 'ms/item'));
        summary.appendChild(PsychLab.UI.createStatCard('Mean RT', Math.round(overallMeanRT), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Accuracy', Math.round(overallAccuracy) + '%'));

        // Line chart with two series
        PsychLab.Charts.lineChart(document.getElementById('chart-lines'), [
            { label: 'Present', points: presentPoints, color: '#22c55e' },
            { label: 'Absent', points: absentPoints, color: '#dc2626' }
        ], {
            title: 'Mean RT by Set Size',
            xLabel: 'Set Size',
            yLabel: 'Reaction Time (ms)',
            width: 520,
            height: 360
        });

        // Interpretation
        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        var presSlope = Math.round(presentReg.slope * 10) / 10;
        var absSlope = Math.round(absentReg.slope * 10) / 10;
        var avgSlope = Math.round((presSlope + absSlope) / 2 * 10) / 10;

        text += '<p>Your <strong>search slope</strong> was <strong>' + presSlope + ' ms/item</strong> for present trials and <strong>' + absSlope + ' ms/item</strong> for absent trials. ';

        if (avgSlope > 20 && avgSlope < 60) {
            text += 'This is in the range of Sternberg\'s classic finding of ~38 ms/item, consistent with serial memory scanning.';
        } else if (avgSlope >= 60) {
            text += 'This is somewhat steeper than Sternberg\'s classic finding of ~38 ms/item, which may reflect individual differences or the demands of this particular implementation.';
        } else if (avgSlope > 0) {
            text += 'This is shallower than Sternberg\'s classic ~38 ms/item, possibly suggesting more efficient or partially parallel search.';
        } else {
            text += 'An unexpected flat or negative slope was observed. This may indicate a speed-accuracy trade-off or strategic differences.';
        }
        text += '</p>';

        var slopeDiff = Math.abs(presSlope - absSlope);
        text += '<p>';
        if (slopeDiff < 15) {
            text += 'The present and absent slopes are <strong>similar</strong> (difference: ' + Math.round(slopeDiff) + ' ms/item), consistent with Sternberg\'s <strong>exhaustive search</strong> model &mdash; all items are scanned before a decision is made, regardless of whether the probe is in the set.';
        } else {
            text += 'The present and absent slopes <strong>differ</strong> by ' + Math.round(slopeDiff) + ' ms/item. If the absent slope is roughly double the present slope, this would suggest <strong>self-terminating search</strong> rather than exhaustive search.';
        }
        text += '</p>';

        text += '<p>Sternberg (1966) reported slopes of approximately 38 ms/item with roughly equal slopes for present and absent trials, supporting serial exhaustive search through short-term memory.</p>';
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
