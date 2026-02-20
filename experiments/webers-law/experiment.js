(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'webers-law',
        experimentName: "Weber's Law",
        standards: [100, 150, 200],
        // For each standard, generate 7 comparison levels from -15% to +15%
        comparisonSteps: 7,
        comparisonRange: 0.15,
        repsPerComparison: 4,
        fixationDuration: 500,
        displayDuration: 0, // unlimited — stays until response
        blankDuration: 400,
        canvasW: 600,
        canvasH: 300,
        lineThickness: 4
    };

    // Pre-compute comparison levels for each standard
    CONFIG.comparisons = {};
    for (var s = 0; s < CONFIG.standards.length; s++) {
        var std = CONFIG.standards[s];
        var levels = [];
        for (var c = 0; c < CONFIG.comparisonSteps; c++) {
            var frac = -CONFIG.comparisonRange + (2 * CONFIG.comparisonRange * c / (CONFIG.comparisonSteps - 1));
            levels.push(Math.round(std * (1 + frac)));
        }
        CONFIG.comparisons[std] = levels;
    }

    // Total trials = 3 standards x 7 comparisons x 4 reps = 84
    var TOTAL_TRIALS = CONFIG.standards.length * CONFIG.comparisonSteps * CONFIG.repsPerComparison;

    var state = { session: null, trials: [], running: false };
    var canvas, ctx;

    function init() {
        canvas = document.getElementById('weber-canvas');

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
        for (var s = 0; s < CONFIG.standards.length; s++) {
            var std = CONFIG.standards[s];
            var levels = CONFIG.comparisons[std];
            for (var c = 0; c < levels.length; c++) {
                var comp = levels[c];
                for (var r = 0; r < CONFIG.repsPerComparison; r++) {
                    var standardSide = Math.random() < 0.5 ? 'left' : 'right';
                    // The longer line determines the correct key
                    var longerSide;
                    if (comp > std) {
                        longerSide = standardSide === 'left' ? 'right' : 'left';
                    } else if (comp < std) {
                        longerSide = standardSide;
                    } else {
                        // Equal: either response is fine, pick randomly
                        longerSide = Math.random() < 0.5 ? 'left' : 'right';
                    }
                    var correctKey = longerSide === 'left' ? 'arrowleft' : 'arrowright';
                    trials.push({
                        standard: std,
                        comparison: comp,
                        standardSide: standardSide,
                        correctKey: correctKey
                    });
                }
            }
        }
        return shuffle(trials);
    }

    function drawFixation() {
        var w = CONFIG.canvasW, h = CONFIG.canvasH;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#666';
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', w / 2, h / 2);
    }

    function drawStimuli(trial) {
        var w = CONFIG.canvasW, h = CONFIG.canvasH;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, w, h);

        var leftLen = trial.standardSide === 'left' ? trial.standard : trial.comparison;
        var rightLen = trial.standardSide === 'right' ? trial.standard : trial.comparison;
        var cy = h / 2;

        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = CONFIG.lineThickness;
        ctx.lineCap = 'round';

        // Left line centered at x = w * 0.25
        ctx.beginPath();
        ctx.moveTo(w * 0.25 - leftLen / 2, cy);
        ctx.lineTo(w * 0.25 + leftLen / 2, cy);
        ctx.stroke();

        // Right line centered at x = w * 0.75
        ctx.beginPath();
        ctx.moveTo(w * 0.75 - rightLen / 2, cy);
        ctx.lineTo(w * 0.75 + rightLen / 2, cy);
        ctx.stroke();
    }

    function drawBlank() {
        var w = CONFIG.canvasW, h = CONFIG.canvasH;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, w, h);
    }

    async function runTrial(idx) {
        var trial = state.trials[idx];
        PsychLab.UI.showProgress(idx + 1, TOTAL_TRIALS);

        // Fixation
        drawFixation();
        await PsychLab.Timing.frameDelay(CONFIG.fixationDuration);

        // Draw stimuli, wait for response
        drawStimuli(trial);
        var stimOnset = PsychLab.Timing.now();
        var resp = await PsychLab.Timing.waitForKey(['arrowleft', 'arrowright']);
        var rt = resp.timestamp - stimOnset;

        // Determine correctness
        var correct = resp.key === trial.correctKey;
        // If comparison === standard, count as correct regardless
        if (trial.comparison === trial.standard) correct = true;

        // Did they respond "comparison is longer"?
        var comparisonSide = trial.standardSide === 'left' ? 'right' : 'left';
        var respondedLongerComparison = (resp.key === 'arrowleft' && comparisonSide === 'left') ||
                                         (resp.key === 'arrowright' && comparisonSide === 'right');

        var trialData = {
            trialNumber: idx + 1,
            standard: trial.standard,
            comparison: trial.comparison,
            difference: trial.comparison - trial.standard,
            standardSide: trial.standardSide,
            response: resp.key,
            correct: correct,
            rt: Math.round(rt),
            respondedLongerComparison: respondedLongerComparison
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        // Brief blank
        drawBlank();
        await PsychLab.Timing.delay(CONFIG.blankDuration);
    }

    async function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.running = true;

        var session = PsychLab.Storage.getSession(state.session.sessionId);
        session.config = {
            standards: CONFIG.standards,
            comparisons: CONFIG.comparisons,
            repsPerComparison: CONFIG.repsPerComparison,
            totalTrials: TOTAL_TRIALS
        };
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-running');
        setupCanvas();

        for (var i = 0; i < state.trials.length; i++) {
            if (!state.running) break;
            await runTrial(i);
        }

        showResults();
    }

    function showResults() {
        state.running = false;
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        var trials = session.trials;

        // For each standard, group trials by comparison level and compute proportion "comparison longer"
        var psychData = {}; // { standard: [{ difference, proportion }] }
        var jndResults = [];
        var weberFractions = [];

        for (var s = 0; s < CONFIG.standards.length; s++) {
            var std = CONFIG.standards[s];
            var levels = CONFIG.comparisons[std];
            var xArr = [];
            var pArr = [];

            for (var c = 0; c < levels.length; c++) {
                var comp = levels[c];
                var diff = comp - std;
                var matching = trials.filter(function (t) {
                    return t.standard === std && t.comparison === comp;
                });
                var numLonger = 0;
                for (var m = 0; m < matching.length; m++) {
                    if (matching[m].respondedLongerComparison) numLonger++;
                }
                var proportion = matching.length > 0 ? numLonger / matching.length : 0;
                xArr.push(diff);
                pArr.push(proportion);
            }

            psychData[std] = { x: xArr, p: pArr };

            // Find JND at 75% threshold
            var jnd = PsychLab.Stats.psychometricThreshold(xArr, pArr, 0.75);
            if (jnd === null) {
                // Fallback: use the largest positive difference
                jnd = xArr[xArr.length - 1];
            }
            var weberFraction = jnd / std;
            jndResults.push({ standard: std, jnd: jnd, weberFraction: weberFraction });
            weberFractions.push(weberFraction);
        }

        var meanWeberFraction = PsychLab.Stats.mean(weberFractions);

        session.summary = {
            jndResults: jndResults,
            meanWeberFraction: Math.round(meanWeberFraction * 1000) / 1000
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        // Stat cards
        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        for (var j = 0; j < jndResults.length; j++) {
            var r = jndResults[j];
            summary.appendChild(PsychLab.UI.createStatCard(
                'JND (Std ' + r.standard + 'px)',
                r.jnd.toFixed(1),
                'px'
            ));
        }
        summary.appendChild(PsychLab.UI.createStatCard(
            'Mean Weber Fraction',
            meanWeberFraction.toFixed(3)
        ));

        // Bar chart: JND at each standard magnitude
        var barData = [];
        var barColors = ['#2563eb', '#059669', '#d97706'];
        for (var b = 0; b < jndResults.length; b++) {
            barData.push({
                label: jndResults[b].standard + ' px',
                value: jndResults[b].jnd,
                color: barColors[b]
            });
        }
        PsychLab.Charts.barChart(document.getElementById('chart-bars'), barData, {
            title: 'JND at Each Standard Magnitude',
            yLabel: 'JND (px)',
            width: 480,
            height: 300
        });

        // Psychometric function: proportion "comparison longer" vs difference for each standard
        var seriesColors = ['#2563eb', '#059669', '#d97706'];
        var series = [];
        for (var ps = 0; ps < CONFIG.standards.length; ps++) {
            var pStd = CONFIG.standards[ps];
            var pd = psychData[pStd];
            var points = [];
            for (var pi = 0; pi < pd.x.length; pi++) {
                points.push({ x: pd.x[pi], y: pd.p[pi] });
            }
            series.push({
                label: 'Std ' + pStd + ' px',
                points: points,
                color: seriesColors[ps]
            });
        }
        PsychLab.Charts.lineChart(document.getElementById('chart-psychometric'), series, {
            title: 'Psychometric Functions',
            xLabel: 'Difference from Standard (px)',
            yLabel: 'P("Comparison Longer")',
            yMin: 0,
            yMax: 1,
            width: 480,
            height: 300
        });

        // Interpretation
        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>Weber\'s Law predicts that the JND should increase proportionally with the standard magnitude, keeping the Weber fraction (&Delta;I / I) approximately constant.</p>';
        text += '<p>Your JNDs were: ';
        for (var k = 0; k < jndResults.length; k++) {
            if (k > 0) text += ', ';
            text += '<strong>' + jndResults[k].jnd.toFixed(1) + ' px</strong> (standard ' + jndResults[k].standard + ' px, k = ' + jndResults[k].weberFraction.toFixed(3) + ')';
        }
        text += '.</p>';

        text += '<p>Your mean <strong>Weber fraction = ' + meanWeberFraction.toFixed(3) + '</strong>. ';

        var fractionRange = Math.max.apply(null, weberFractions) - Math.min.apply(null, weberFractions);
        if (fractionRange < 0.03) {
            text += 'The Weber fractions are fairly consistent across standard magnitudes, supporting Weber\'s Law.</p>';
        } else {
            text += 'The Weber fractions vary somewhat across standard magnitudes, which may reflect noise with limited trials or a deviation from strict Weber\'s Law.</p>';
        }

        text += '<p>The typical Weber fraction for line length discrimination is approximately 0.03\u20130.06 (Gescheider, 1997). ';
        if (meanWeberFraction >= 0.02 && meanWeberFraction <= 0.08) {
            text += 'Your result falls within the expected range.</p>';
        } else if (meanWeberFraction < 0.02) {
            text += 'Your result suggests unusually fine discrimination ability.</p>';
        } else {
            text += 'Your result is somewhat higher than the typical range, which can happen with brief exposures or individual differences.</p>';
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
