(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'ebbinghaus',
        experimentName: 'Ebbinghaus Illusion',
        standardRadius: 30,
        numContext: 6,
        contextRadii: { large: 45, small: 12, none: 0 },
        contextDistance: 75,
        repetitions: 6,
        conditions: ['large-surround', 'small-surround', 'no-surround']
    };

    var state = { session: null, trials: [], currentTrial: 0, running: false, adjustedRadius: 30, trialStart: 0 };
    var canvas, ctx, slider;

    function init() {
        canvas = document.getElementById('eb-canvas');
        slider = document.getElementById('size-slider');

        slider.addEventListener('input', function () {
            state.adjustedRadius = parseInt(slider.value);
            draw();
        });

        document.addEventListener('keydown', function (e) {
            if (!state.running) return;
            if (e.key === 'ArrowLeft') {
                state.adjustedRadius = Math.max(10, state.adjustedRadius - 1);
                slider.value = state.adjustedRadius;
                draw();
            } else if (e.key === 'ArrowRight') {
                state.adjustedRadius = Math.min(60, state.adjustedRadius + 1);
                slider.value = state.adjustedRadius;
                draw();
            } else if (e.key === 'Enter') {
                confirmTrial();
            }
        });

        document.getElementById('btn-start').addEventListener('click', startExperiment);
        document.getElementById('btn-confirm').addEventListener('click', confirmTrial);
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
        var w = 700, h = 400;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    function drawCircleGroup(cx, cy, centralRadius, contextRadius, fillColor) {
        // Context circles
        if (contextRadius > 0) {
            var dist = CONFIG.contextDistance;
            if (contextRadius > 30) dist = contextRadius + centralRadius + 15;
            else dist = contextRadius + centralRadius + 10;

            ctx.fillStyle = '#cbd5e1';
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            for (var i = 0; i < CONFIG.numContext; i++) {
                var angle = (i / CONFIG.numContext) * Math.PI * 2 - Math.PI / 2;
                var x = cx + Math.cos(angle) * dist;
                var y = cy + Math.sin(angle) * dist;
                ctx.beginPath();
                ctx.arc(x, y, contextRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }

        // Central circle
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, centralRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    function draw() {
        var w = 700, h = 400;
        var trial = state.trials[state.currentTrial];
        if (!trial) return;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);

        // Left: standard with large or small surround
        var leftContextR = CONFIG.contextRadii[trial.leftContext];
        drawCircleGroup(200, 200, CONFIG.standardRadius, leftContextR, '#f97316');

        // Right: adjustable with opposite or no surround
        var rightContextR = CONFIG.contextRadii[trial.rightContext];
        drawCircleGroup(500, 200, state.adjustedRadius, rightContextR, '#3b82f6');

        // Labels
        ctx.fillStyle = '#999';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Standard (fixed)', 200, 350);
        ctx.fillText('Comparison (adjust)', 500, 350);
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
        for (var r = 0; r < CONFIG.repetitions; r++) {
            // Large surround on left (standard appears smaller) — comparison on right with small surround
            trials.push({ condition: 'large-surround', leftContext: 'large', rightContext: 'small' });
            // Small surround on left (standard appears larger) — comparison on right with large surround
            trials.push({ condition: 'small-surround', leftContext: 'small', rightContext: 'large' });
            // No surround control
            trials.push({ condition: 'no-surround', leftContext: 'none', rightContext: 'none' });
        }
        return shuffle(trials);
    }

    function startTrial() {
        var startPos = CONFIG.standardRadius + Math.floor((Math.random() - 0.5) * 20);
        startPos = Math.max(15, Math.min(55, startPos));
        state.adjustedRadius = startPos;
        slider.value = startPos;
        state.trialStart = PsychLab.Timing.now();

        PsychLab.UI.showProgress(state.currentTrial + 1, state.trials.length);
        draw();
    }

    function confirmTrial() {
        if (!state.running) return;

        var trial = state.trials[state.currentTrial];
        var adjustmentTime = PsychLab.Timing.now() - state.trialStart;
        var illusionMagnitude = (state.adjustedRadius - CONFIG.standardRadius) / CONFIG.standardRadius;

        var trialData = {
            trialNumber: state.currentTrial + 1,
            condition: trial.condition,
            leftContext: trial.leftContext,
            rightContext: trial.rightContext,
            standardRadius: CONFIG.standardRadius,
            adjustedRadius: state.adjustedRadius,
            illusionMagnitude: Math.round(illusionMagnitude * 1000) / 1000,
            illusionPercent: Math.round(illusionMagnitude * 1000) / 10,
            adjustmentTime: Math.round(adjustmentTime)
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);

        state.currentTrial++;
        if (state.currentTrial < state.trials.length) {
            startTrial();
        } else {
            showResults();
        }
    }

    function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.trials = generateTrials();
        state.currentTrial = 0;
        state.running = true;

        PsychLab.UI.showPhase('phase-running');
        setupCanvas();
        startTrial();
    }

    function showResults() {
        state.running = false;
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        var trials = session.trials;

        function getPercents(cond) {
            return trials.filter(function (t) { return t.condition === cond; })
                .map(function (t) { return t.illusionPercent; });
        }

        var large = getPercents('large-surround');
        var small = getPercents('small-surround');
        var none = getPercents('no-surround');

        var largeMean = PsychLab.Stats.mean(large);
        var smallMean = PsychLab.Stats.mean(small);
        var noneMean = PsychLab.Stats.mean(none);
        var largeSE = PsychLab.Stats.standardError(large);
        var smallSE = PsychLab.Stats.standardError(small);
        var noneSE = PsychLab.Stats.standardError(none);

        session.summary = { largeSurroundBias: largeMean.toFixed(1), smallSurroundBias: smallMean.toFixed(1), controlBias: noneMean.toFixed(1) };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Large Surround', largeMean.toFixed(1) + '%', 'bias'));
        summary.appendChild(PsychLab.UI.createStatCard('Small Surround', smallMean.toFixed(1) + '%', 'bias'));
        summary.appendChild(PsychLab.UI.createStatCard('No Surround', noneMean.toFixed(1) + '%', 'bias'));

        PsychLab.Charts.barChart(document.getElementById('chart-bars'), [
            { label: 'Large Surround', value: largeMean, error: largeSE, color: '#7c3aed' },
            { label: 'No Surround', value: noneMean, error: noneSE, color: '#6b7280' },
            { label: 'Small Surround', value: smallMean, error: smallSE, color: '#0891b2' }
        ], {
            title: 'Size Bias by Context Condition',
            yLabel: 'Perceived Size Bias (%)',
            width: 460,
            height: 300
        });

        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>When the standard was surrounded by <strong>large circles</strong>, you set the comparison ';
        text += largeMean > 0 ? 'larger' : 'smaller';
        text += ' (' + Math.abs(largeMean).toFixed(1) + '% bias), suggesting the standard appeared ';
        text += largeMean > 0 ? '<em>smaller</em> than it was (you overcompensated).' : '<em>larger</em> than it was.';
        text += '</p>';
        text += '<p>When surrounded by <strong>small circles</strong>, the bias was ' + smallMean.toFixed(1) + '%, ';
        text += 'consistent with the Ebbinghaus prediction that small surrounds make the central circle appear larger.</p>';
        text += '<p>Published studies report illusion magnitudes of approximately 5\u201310% depending on context size ratios (Roberts et al., 2005).</p>';
        interp.innerHTML = text;
    }

    function restart() {
        state = { session: null, trials: [], currentTrial: 0, running: false, adjustedRadius: 30, trialStart: 0 };
        PsychLab.UI.showPhase('phase-instructions');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
