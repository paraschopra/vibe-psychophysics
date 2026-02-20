(function () {
    'use strict';

    var CONFIG = {
        experimentId: 'change-blindness',
        experimentName: 'Change Blindness (Flicker)',
        numTrials: 8,
        displayDuration: 250,
        blankDuration: 250,
        maxTrialTime: 45000,
        canvasW: 600,
        canvasH: 450,
        numObjects: 12,
        clickRadius: 35
    };

    var COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5'];
    var SHAPES = ['circle', 'rect', 'triangle'];

    var state = { session: null, trials: [], currentTrial: 0, running: false, flickering: false };
    var canvas, ctx;

    function init() {
        canvas = document.getElementById('cb-canvas');
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
        canvas.width = CONFIG.canvasW * dpr;
        canvas.height = CONFIG.canvasH * dpr;
        canvas.style.width = CONFIG.canvasW + 'px';
        canvas.style.height = CONFIG.canvasH + 'px';
        ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    function generateScene() {
        var objects = [];
        var pad = 50;
        for (var i = 0; i < CONFIG.numObjects; i++) {
            var obj = {
                id: i,
                x: randomInt(pad, CONFIG.canvasW - pad),
                y: randomInt(pad, CONFIG.canvasH - pad),
                size: randomInt(20, 40),
                color: COLORS[i % COLORS.length],
                shape: SHAPES[randomInt(0, SHAPES.length - 1)]
            };
            objects.push(obj);
        }
        return objects;
    }

    function generateChange(objects) {
        var changeIdx = randomInt(0, objects.length - 1);
        var changeType = ['color', 'position', 'removal'][randomInt(0, 2)];

        var modified = objects.map(function (o) {
            return { id: o.id, x: o.x, y: o.y, size: o.size, color: o.color, shape: o.shape };
        });

        if (changeType === 'color') {
            var newColor;
            do {
                newColor = COLORS[randomInt(0, COLORS.length - 1)];
            } while (newColor === modified[changeIdx].color);
            modified[changeIdx].color = newColor;
        } else if (changeType === 'position') {
            modified[changeIdx].x = modified[changeIdx].x + randomInt(-60, 60);
            modified[changeIdx].y = modified[changeIdx].y + randomInt(-60, 60);
            modified[changeIdx].x = Math.max(40, Math.min(CONFIG.canvasW - 40, modified[changeIdx].x));
            modified[changeIdx].y = Math.max(40, Math.min(CONFIG.canvasH - 40, modified[changeIdx].y));
        } else {
            // removal - mark as hidden
            modified[changeIdx].hidden = true;
        }

        return {
            changeIdx: changeIdx,
            changeType: changeType,
            targetX: objects[changeIdx].x,
            targetY: objects[changeIdx].y,
            modified: modified
        };
    }

    function drawScene(objects) {
        ctx.clearRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);

        for (var i = 0; i < objects.length; i++) {
            var o = objects[i];
            if (o.hidden) continue;

            ctx.fillStyle = o.color;
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;

            if (o.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else if (o.shape === 'rect') {
                ctx.fillRect(o.x - o.size, o.y - o.size, o.size * 2, o.size * 2);
                ctx.strokeRect(o.x - o.size, o.y - o.size, o.size * 2, o.size * 2);
            } else if (o.shape === 'triangle') {
                ctx.beginPath();
                ctx.moveTo(o.x, o.y - o.size);
                ctx.lineTo(o.x - o.size, o.y + o.size);
                ctx.lineTo(o.x + o.size, o.y + o.size);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        }
    }

    function drawBlank() {
        ctx.clearRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
        ctx.fillStyle = '#888';
        ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
    }

    async function runTrial(idx) {
        PsychLab.UI.showProgress(idx + 1, CONFIG.numTrials);

        var original = generateScene();
        var change = generateChange(original);
        var trialStart = PsychLab.Timing.now();
        state.flickering = true;
        var found = false;
        var clickX = 0, clickY = 0;
        var cycles = 0;

        // Click handler
        var clickResolve = null;
        var clickPromise = new Promise(function (resolve) { clickResolve = resolve; });

        function handleClick(e) {
            var rect = canvas.getBoundingClientRect();
            var x = (e.clientX - rect.left) * (CONFIG.canvasW / rect.width);
            var y = (e.clientY - rect.top) * (CONFIG.canvasH / rect.height);
            clickX = x;
            clickY = y;

            // Check if click is near the changed object
            var dx = x - change.targetX;
            var dy = y - change.targetY;
            if (Math.sqrt(dx * dx + dy * dy) < CONFIG.clickRadius) {
                found = true;
                clickResolve();
            }
        }
        canvas.addEventListener('click', handleClick);

        // Timer display
        var timerEl = document.getElementById('trial-timer');
        var timerInterval = setInterval(function () {
            var elapsed = (PsychLab.Timing.now() - trialStart) / 1000;
            timerEl.textContent = 'Time: ' + elapsed.toFixed(1) + 's';
        }, 100);

        // Flicker loop
        var timedOut = false;
        while (!found && !timedOut) {
            drawScene(original);
            await PsychLab.Timing.delay(CONFIG.displayDuration);
            if (found) break;

            drawBlank();
            await PsychLab.Timing.delay(CONFIG.blankDuration);
            if (found) break;

            drawScene(change.modified);
            await PsychLab.Timing.delay(CONFIG.displayDuration);
            if (found) break;

            drawBlank();
            await PsychLab.Timing.delay(CONFIG.blankDuration);
            cycles++;

            if (PsychLab.Timing.now() - trialStart > CONFIG.maxTrialTime) {
                timedOut = true;
            }
        }

        canvas.removeEventListener('click', handleClick);
        clearInterval(timerInterval);
        state.flickering = false;

        var detectionTime = PsychLab.Timing.now() - trialStart;

        // Show the change briefly
        drawScene(original);
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(change.targetX, change.targetY, CONFIG.clickRadius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        timerEl.textContent = found ? 'Found in ' + (detectionTime / 1000).toFixed(1) + 's!' : 'Time\'s up! Change circled in red.';
        await PsychLab.Timing.delay(2000);

        var trialData = {
            trialNumber: idx + 1,
            changeType: change.changeType,
            changedObjectId: change.changeIdx,
            found: found,
            timedOut: timedOut,
            detectionTime: Math.round(detectionTime),
            numCycles: cycles,
            clickX: Math.round(clickX),
            clickY: Math.round(clickY)
        };

        PsychLab.Storage.saveTrialData(state.session.sessionId, trialData);
        timerEl.textContent = '';
    }

    async function startExperiment() {
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        state.currentTrial = 0;
        state.running = true;

        PsychLab.UI.showPhase('phase-running');
        setupCanvas();

        for (var i = 0; i < CONFIG.numTrials; i++) {
            if (!state.running) break;
            await runTrial(i);
        }

        showResults();
    }

    function showResults() {
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        var trials = session.trials;

        var foundTrials = trials.filter(function (t) { return t.found; });
        var detectionTimes = foundTrials.map(function (t) { return t.detectionTime / 1000; });
        var meanTime = detectionTimes.length > 0 ? PsychLab.Stats.mean(detectionTimes) : 0;
        var detectionRate = (foundTrials.length / trials.length) * 100;
        var meanCycles = PsychLab.Stats.mean(foundTrials.map(function (t) { return t.numCycles; }));

        session.summary = {
            detectionRate: Math.round(detectionRate),
            meanDetectionTime: meanTime.toFixed(1),
            meanCycles: Math.round(meanCycles)
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);

        PsychLab.UI.showPhase('phase-results');

        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Detection Rate', Math.round(detectionRate) + '%'));
        summary.appendChild(PsychLab.UI.createStatCard('Mean Detection Time', meanTime.toFixed(1), 's'));
        summary.appendChild(PsychLab.UI.createStatCard('Mean Flicker Cycles', Math.round(meanCycles)));

        // Bar chart of detection times per trial
        var barData = trials.map(function (t, i) {
            return {
                label: 'T' + (i + 1),
                value: t.found ? t.detectionTime / 1000 : CONFIG.maxTrialTime / 1000,
                color: t.found ? '#2563eb' : '#dc2626'
            };
        });

        PsychLab.Charts.barChart(document.getElementById('chart-bars'), barData, {
            title: 'Detection Time per Trial (red = not found)',
            yLabel: 'Time (seconds)',
            width: 480,
            height: 300
        });

        var interp = document.getElementById('results-interpretation');
        var text = '<h3>Interpretation</h3>';
        text += '<p>You detected changes in <strong>' + Math.round(detectionRate) + '%</strong> of trials, with an average detection time of <strong>' + meanTime.toFixed(1) + ' seconds</strong>.</p>';
        text += '<p>Change blindness demonstrates that without the transient motion signal that normally accompanies changes, detecting even large, obvious alterations requires <strong>focused attention</strong> at the location of the change. This challenges the intuition that we have a rich, detailed representation of our visual world.</p>';
        text += '<p>In published studies using natural photographs, detection times typically range from <strong>5 to 30+ seconds</strong>, with some changes going undetected entirely (Rensink et al., 1997).</p>';
        interp.innerHTML = text;
    }

    function restart() {
        state = { session: null, trials: [], currentTrial: 0, running: false, flickering: false };
        PsychLab.UI.showPhase('phase-instructions');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
