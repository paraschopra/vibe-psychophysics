(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'mueller-lyer',
        experimentName: 'Müller-Lyer Illusion',
        standardLength: 200,
        finLength: 40,
        finAngle: 30 * Math.PI / 180,
        repetitions: 6,
        conditions: ['outward', 'inward', 'none'],
        lineWidth: 3
    };

    var state = { session: null, trials: [], currentTrial: 0, running: false, adjustedLength: 200, trialStart: 0 };
    var canvas, ctx, slider;

    function init() {
        canvas = document.getElementById('ml-canvas');
        slider = document.getElementById('length-slider');

        slider.addEventListener('input', function () {
            state.adjustedLength = parseInt(slider.value);
            draw();
        });

        document.addEventListener('keydown', function (e) {
            if (!state.running) return;
            if (e.key === 'ArrowLeft') {
                state.adjustedLength = Math.max(50, state.adjustedLength - 3);
                slider.value = state.adjustedLength;
                draw();
            } else if (e.key === 'ArrowRight') {
                state.adjustedLength = Math.min(400, state.adjustedLength + 3);
                slider.value = state.adjustedLength;
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
        var w = 700, h = 350;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    function drawLine(x, y, length) {
        ctx.beginPath();
        ctx.moveTo(x - length / 2, y);
        ctx.lineTo(x + length / 2, y);
        ctx.stroke();
    }

    function drawFins(x, y, length, type) {
        if (type === 'none') return;

        var leftX = x - length / 2;
        var rightX = x + length / 2;
        var fl = CONFIG.finLength;
        var angle = CONFIG.finAngle;

        if (type === 'outward') {
            // Outward fins (>---<) — fins point away from the line
            ctx.beginPath();
            ctx.moveTo(leftX - fl * Math.cos(angle), y - fl * Math.sin(angle));
            ctx.lineTo(leftX, y);
            ctx.lineTo(leftX - fl * Math.cos(angle), y + fl * Math.sin(angle));
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(rightX + fl * Math.cos(angle), y - fl * Math.sin(angle));
            ctx.lineTo(rightX, y);
            ctx.lineTo(rightX + fl * Math.cos(angle), y + fl * Math.sin(angle));
            ctx.stroke();
        } else if (type === 'inward') {
            // Inward fins (<--->) — fins point toward the line
            ctx.beginPath();
            ctx.moveTo(leftX + fl * Math.cos(angle), y - fl * Math.sin(angle));
            ctx.lineTo(leftX, y);
            ctx.lineTo(leftX + fl * Math.cos(angle), y + fl * Math.sin(angle));
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(rightX - fl * Math.cos(angle), y - fl * Math.sin(angle));
            ctx.lineTo(rightX, y);
            ctx.lineTo(rightX - fl * Math.cos(angle), y + fl * Math.sin(angle));
            ctx.stroke();
        }
    }

    function draw() {
        var w = 700, h = 350;
        var cx = w / 2;
        var trial = state.trials[state.currentTrial];
        if (!trial) return;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);

        // Standard line (top) with fins
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = CONFIG.lineWidth;
        ctx.lineCap = 'round';
        drawLine(cx, 120, CONFIG.standardLength);
        drawFins(cx, 120, CONFIG.standardLength, trial.condition);

        // Label
        ctx.fillStyle = '#999';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Standard', cx, 85);

        // Comparison line (bottom) — no fins
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = CONFIG.lineWidth;
        drawLine(cx, 240, state.adjustedLength);

        ctx.fillStyle = '#999';
        ctx.font = '12px sans-serif';
        ctx.fillText('Comparison (adjust to match)', cx, 275);
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
            for (var c = 0; c < CONFIG.conditions.length; c++) {
                trials.push({ condition: CONFIG.conditions[c] });
            }
        }
        return shuffle(trials);
    }

    function startTrial() {
        // Randomize starting position of slider
        var startPos = CONFIG.standardLength + Math.floor((Math.random() - 0.5) * 150);
        startPos = Math.max(80, Math.min(380, startPos));
        state.adjustedLength = startPos;
        slider.value = startPos;
        state.trialStart = PsychLab.Timing.now();

        PsychLab.UI.showProgress(state.currentTrial + 1, state.trials.length);
        draw();
    }

    function confirmTrial() {
        if (!state.running) return;

        var trial = state.trials[state.currentTrial];
        var adjustmentTime = PsychLab.Timing.now() - state.trialStart;
        var illusionMagnitude = (state.adjustedLength - CONFIG.standardLength) / CONFIG.standardLength;

        var trialData = {
            trialNumber: state.currentTrial + 1,
            condition: trial.condition,
            standardLength: CONFIG.standardLength,
            adjustedLength: state.adjustedLength,
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

        var session = PsychLab.Storage.getSession(state.session.sessionId);
        session.config = { standardLength: CONFIG.standardLength, finLength: CONFIG.finLength, repetitions: CONFIG.repetitions };
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-running');
        setupCanvas();
        startTrial();
    }

    function showResults() {
        state.running = false;
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        var trials = session.trials;

        function getMagnitudes(cond) {
            return trials.filter(function (t) { return t.condition === cond; })
                .map(function (t) { return t.illusionPercent; });
        }

        var outward = getMagnitudes('outward');
        var inward = getMagnitudes('inward');
        var none = getMagnitudes('none');

        var outMean = PsychLab.Stats.mean(outward);
        var inMean = PsychLab.Stats.mean(inward);
        var noneMean = PsychLab.Stats.mean(none);
        var outSE = PsychLab.Stats.standardError(outward);
        var inSE = PsychLab.Stats.standardError(inward);
        var noneSE = PsychLab.Stats.standardError(none);

        session.summary = {
            outwardMean: Math.round(outMean * 10) / 10,
            inwardMean: Math.round(inMean * 10) / 10,
            controlMean: Math.round(noneMean * 10) / 10
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Outward Fins', outMean.toFixed(1) + '%', 'bias'));
        summary.appendChild(PsychLab.UI.createStatCard('Inward Fins', inMean.toFixed(1) + '%', 'bias'));
        summary.appendChild(PsychLab.UI.createStatCard('No Fins (Control)', noneMean.toFixed(1) + '%', 'bias'));

        PsychLab.Charts.barChart(document.getElementById('chart-bars'), [
            { label: 'Outward (>—<)', value: outMean, error: outSE, color: '#2563eb' },
            { label: 'No Fins', value: noneMean, error: noneSE, color: '#6b7280' },
            { label: 'Inward (<—>)', value: inMean, error: inSE, color: '#dc2626' }
        ], {
            title: 'Illusion Magnitude by Fin Type',
            yLabel: 'Perceived Length Bias (%)',
            width: 460,
            height: 300
        });

        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>With <strong>outward fins</strong>, you set the comparison line to be about <strong>' + Math.abs(outMean).toFixed(1) + '%</strong> ';
        text += outMean > 0 ? 'longer' : 'shorter';
        text += ' than the standard, indicating you perceived the standard as ';
        text += outMean > 0 ? 'longer than it was (overestimation).' : 'near its true length.';
        text += '</p>';

        text += '<p>With <strong>inward fins</strong>, you set the comparison to be <strong>' + Math.abs(inMean).toFixed(1) + '%</strong> ';
        text += inMean < 0 ? 'shorter' : 'longer';
        text += ' than the standard, indicating ';
        text += inMean < 0 ? 'the expected underestimation.' : 'an unexpected direction.';
        text += '</p>';

        text += '<p>The classic Müller-Lyer illusion predicts overestimation with outward fins and underestimation with inward fins. ';
        text += 'Published studies typically report illusion magnitudes of 10\u201325% (Coren & Girgus, 1978), though this varies with stimulus parameters and individual differences.</p>';
        interp.innerHTML = text;
    }

    function restart() {
        state = { session: null, trials: [], currentTrial: 0, running: false, adjustedLength: 200, trialStart: 0 };
        PsychLab.UI.showPhase('phase-instructions');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
