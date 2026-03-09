(function () {
    'use strict';

    // --- Highly associated word pairs (Nelson et al. word association norms) ---
    var WORD_PAIRS = [
        { prime: 'DOCTOR', target: 'NURSE' },
        { prime: 'BREAD', target: 'BUTTER' },
        { prime: 'KING', target: 'QUEEN' },
        { prime: 'TABLE', target: 'CHAIR' },
        { prime: 'SALT', target: 'PEPPER' },
        { prime: 'HAMMER', target: 'NAIL' },
        { prime: 'BLACK', target: 'WHITE' },
        { prime: 'HOT', target: 'COLD' },
        { prime: 'MOON', target: 'STAR' },
        { prime: 'CAT', target: 'DOG' },
        { prime: 'NIGHT', target: 'DAY' },
        { prime: 'LOCK', target: 'KEY' },
        { prime: 'SPIDER', target: 'WEB' },
        { prime: 'FOOT', target: 'SHOE' },
        { prime: 'LION', target: 'TIGER' },
        { prime: 'MUSIC', target: 'SONG' },
        { prime: 'RAIN', target: 'CLOUD' },
        { prime: 'HAND', target: 'FINGER' },
        { prime: 'FIRE', target: 'FLAME' },
        { prime: 'BED', target: 'SLEEP' },
        { prime: 'TREE', target: 'LEAF' },
        { prime: 'BIRD', target: 'NEST' },
        { prime: 'BOAT', target: 'SAIL' },
        { prime: 'COP', target: 'BADGE' },
        { prime: 'WINTER', target: 'SNOW' },
        { prime: 'NEEDLE', target: 'THREAD' },
        { prime: 'ARMY', target: 'SOLDIER' },
        { prime: 'OCEAN', target: 'WAVE' },
        { prime: 'CAKE', target: 'ICING' },
        { prime: 'HORSE', target: 'RIDER' }
    ];

    // --- Pronounceable nonwords for lexical decision ---
    var NONWORDS = [
        'FLIRP', 'BRELL', 'SNELD', 'GRILT', 'PRASK',
        'CLUMB', 'SPARN', 'TWORF', 'FROBE', 'GLENT',
        'PLUND', 'TRISK', 'CREFT', 'SKALM', 'DRINT',
        'FLUSP', 'GHELB', 'BROST', 'QUAMP', 'SWELD',
        'THROP', 'NARSE', 'ZOLFT', 'KREEL', 'VENCH',
        'DWELF', 'DRELK', 'GRAWN', 'JORVE', 'BLASK'
    ];

    var CONFIG = {
        experimentId: 'semantic-priming',
        experimentName: 'Semantic Priming',
        primeDurationFrames: 2,         // ~33ms at 60Hz (subliminal)
        forwardMaskDurationMs: 300,
        backwardMaskDurationMs: 150,
        blankAfterMaskMs: 50,
        fixationDurationBase: 500,
        fixationJitter: 200,
        maxResponseTime: 2500,
        interTrialInterval: 500,
        canvasW: 600,
        canvasH: 400,
        maskLength: 10,
        bgColor: '#333333',
        fgColor: '#ffffff'
    };

    var state = {
        session: null,
        trials: [],
        practiceList: [],
        running: false,
        frameDuration: 16.67,
        fps: 60,
        awarenessResponse: null
    };

    var canvas, ctx;
    var CW = CONFIG.canvasW;
    var CH = CONFIG.canvasH;

    // ----- Initialization -----

    function init() {
        canvas = document.getElementById('prime-canvas');
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
        canvas.width = CW * dpr;
        canvas.height = CH * dpr;
        canvas.style.width = CW + 'px';
        canvas.style.height = CH + 'px';
        ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    // ----- Drawing Functions -----

    function clear() {
        ctx.fillStyle = CONFIG.bgColor;
        ctx.fillRect(0, 0, CW, CH);
    }

    function drawFixation() {
        clear();
        ctx.fillStyle = CONFIG.fgColor;
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', CW / 2, CH / 2);
    }

    function drawMask() {
        clear();
        var chars = '#%@&$*';
        var mask = '';
        for (var i = 0; i < CONFIG.maskLength; i++) {
            mask += chars[Math.floor(Math.random() * chars.length)];
        }
        ctx.fillStyle = CONFIG.fgColor;
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(mask, CW / 2, CH / 2);
    }

    function drawWord(word, size) {
        clear();
        ctx.fillStyle = CONFIG.fgColor;
        ctx.font = 'bold ' + (size || 36) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word, CW / 2, CH / 2);
    }

    function drawText(text, fontSize) {
        clear();
        ctx.fillStyle = CONFIG.fgColor;
        ctx.font = (fontSize || 20) + 'px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var lines = text.split('\n');
        var lineHeight = (fontSize || 20) * 1.4;
        var startY = CH / 2 - (lines.length - 1) * lineHeight / 2;
        for (var i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], CW / 2, startY + i * lineHeight);
        }
    }

    function drawFeedback(correct) {
        clear();
        ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = correct ? '#22c55e' : '#dc2626';
        ctx.fillText(correct ? 'Correct' : 'Incorrect', CW / 2, CH / 2);
    }

    // ----- Frame-Accurate Masked Presentation -----

    function presentMaskedPrime(trial) {
        return new Promise(function (resolve) {
            var fwdFrames = Math.round(CONFIG.forwardMaskDurationMs / state.frameDuration);
            var bwdFrames = Math.round(CONFIG.backwardMaskDurationMs / state.frameDuration);
            var primeFrames = CONFIG.primeDurationFrames;

            var phase = 'forward';
            var frameCount = 0;
            var timings = {};

            function tick(ts) {
                if (phase === 'forward') {
                    if (frameCount === 0) {
                        drawMask();
                        timings.forwardOnset = ts;
                    }
                    frameCount++;
                    if (frameCount >= fwdFrames) {
                        phase = 'prime';
                        frameCount = 0;
                    }
                    requestAnimationFrame(tick);
                } else if (phase === 'prime') {
                    if (frameCount === 0) {
                        drawWord(trial.prime, 36);
                        timings.primeOnset = ts;
                    }
                    frameCount++;
                    if (frameCount >= primeFrames) {
                        phase = 'backward';
                        frameCount = 0;
                    }
                    requestAnimationFrame(tick);
                } else if (phase === 'backward') {
                    if (frameCount === 0) {
                        drawMask();
                        timings.backwardOnset = ts;
                    }
                    frameCount++;
                    if (frameCount >= bwdFrames) {
                        timings.maskOffset = ts;
                        resolve(timings);
                        return;
                    }
                    requestAnimationFrame(tick);
                }
            }

            requestAnimationFrame(tick);
        });
    }

    // ----- Helpers -----

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    // ----- Trial Generation -----

    function generateTrials() {
        var pairs = WORD_PAIRS.slice();
        shuffle(pairs);

        var relatedPairs = pairs.slice(0, 15);
        var unrelatedPairs = pairs.slice(15, 30);
        var trials = [];

        // Related word trials: prime is the associated word
        for (var i = 0; i < relatedPairs.length; i++) {
            trials.push({
                prime: relatedPairs[i].prime,
                target: relatedPairs[i].target,
                condition: 'related',
                isWord: true,
                correctKey: 'f'
            });
        }

        // Unrelated word trials: derange primes within the unrelated group
        var unrelPrimes = unrelatedPairs.map(function (p) { return p.prime; });
        var attempts = 0;
        do {
            shuffle(unrelPrimes);
            attempts++;
        } while (
            attempts < 200 &&
            unrelPrimes.some(function (pr, idx) { return pr === unrelatedPairs[idx].prime; })
        );

        for (var j = 0; j < unrelatedPairs.length; j++) {
            trials.push({
                prime: unrelPrimes[j],
                target: unrelatedPairs[j].target,
                condition: 'unrelated',
                isWord: true,
                correctKey: 'f'
            });
        }

        // Nonword trials with random primes
        var nw = NONWORDS.slice();
        shuffle(nw);
        var primePool = WORD_PAIRS.map(function (p) { return p.prime; });
        shuffle(primePool);
        for (var k = 0; k < nw.length; k++) {
            trials.push({
                prime: primePool[k % primePool.length],
                target: nw[k],
                condition: 'nonword',
                isWord: false,
                correctKey: 'j'
            });
        }

        return shuffle(trials);
    }

    function generatePractice() {
        return shuffle([
            { prime: 'APPLE', target: 'FRUIT', condition: 'related', isWord: true, correctKey: 'f' },
            { prime: 'DESK', target: 'RIVER', condition: 'unrelated', isWord: true, correctKey: 'f' },
            { prime: 'LAMP', target: 'BLORF', condition: 'nonword', isWord: false, correctKey: 'j' },
            { prime: 'STONE', target: 'CRUND', condition: 'nonword', isWord: false, correctKey: 'j' }
        ]);
    }

    // ----- Trial Execution -----

    async function runTrial(idx, isPractice) {
        var list = isPractice ? state.practiceList : state.trials;
        var trial = list[idx];

        if (!isPractice) {
            PsychLab.UI.showProgress(idx + 1, state.trials.length);
        }

        // 1. Fixation with jitter
        var jitter = Math.random() * CONFIG.fixationJitter - CONFIG.fixationJitter / 2;
        drawFixation();
        await PsychLab.Timing.frameDelay(CONFIG.fixationDurationBase + jitter);

        // 2. Forward mask → Prime → Backward mask (frame-counted)
        await presentMaskedPrime(trial);

        // 3. Brief blank between mask and target
        clear();
        await PsychLab.Timing.delay(CONFIG.blankAfterMaskMs);

        // 4. Show target and wait for lexical decision
        drawWord(trial.target, 42);
        var targetOnset = performance.now();
        var resp = await PsychLab.Timing.waitForKeyWithTimeout(['f', 'j'], CONFIG.maxResponseTime);

        var rt = resp.timedOut ? CONFIG.maxResponseTime : resp.timestamp - targetOnset;
        var correct = !resp.timedOut && resp.key === trial.correctKey;

        // 5. Feedback (practice only) or timeout message
        if (isPractice) {
            drawFeedback(correct);
            await PsychLab.Timing.delay(500);
        } else if (resp.timedOut) {
            drawText('Too slow!', 22);
            await PsychLab.Timing.delay(400);
        }

        // 6. Save trial data (main only)
        if (!isPractice) {
            PsychLab.Storage.saveTrialData(state.session.sessionId, {
                trialNumber: idx + 1,
                prime: trial.prime,
                target: trial.target,
                condition: trial.condition,
                isWord: trial.isWord,
                correctKey: trial.correctKey,
                response: resp.key,
                correct: correct,
                rt: Math.round(rt * 10) / 10,
                timedOut: resp.timedOut,
                primeDurationMs: Math.round(CONFIG.primeDurationFrames * state.frameDuration * 10) / 10
            });
        }

        // 7. ITI
        clear();
        await PsychLab.Timing.delay(CONFIG.interTrialInterval);
    }

    // ----- Experiment Flow -----

    async function startExperiment() {
        // 1. Estimate refresh rate
        var refreshInfo = await PsychLab.Timing.estimateRefreshRate(60);
        state.frameDuration = refreshInfo.frameDuration;
        state.fps = refreshInfo.fps;

        // 2. Create session
        state.session = PsychLab.Storage.createSession(CONFIG.experimentId, CONFIG.experimentName);
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        session.config = {
            primeDurationFrames: CONFIG.primeDurationFrames,
            estimatedFPS: state.fps,
            frameDuration: state.frameDuration
        };
        PsychLab.Storage.updateSession(session);

        state.trials = generateTrials();
        state.practiceList = generatePractice();
        state.running = true;

        PsychLab.UI.showPhase('phase-running');
        setupCanvas();

        // 3. Show refresh rate and prime duration
        var fpsNote = document.getElementById('fps-note');
        fpsNote.textContent = 'Display: ' + state.fps + ' Hz (' +
            state.frameDuration.toFixed(1) + ' ms/frame) | Prime: ' +
            Math.round(CONFIG.primeDurationFrames * state.frameDuration) + ' ms';

        // 4. Countdown
        var stimArea = document.getElementById('stimulus-area');
        await PsychLab.UI.showCountdown(stimArea, 3);
        stimArea.innerHTML = '';
        stimArea.appendChild(canvas);
        setupCanvas();

        // 5. Practice trials
        drawText('Practice: ' + state.practiceList.length + ' trials with feedback\nPress Space to start', 18);
        await PsychLab.Timing.waitForKey([' ']);

        for (var p = 0; p < state.practiceList.length; p++) {
            if (!state.running) break;
            await runTrial(p, true);
        }

        // 6. Transition to main experiment
        drawText('Practice complete!\n\nMain experiment: ' + state.trials.length + ' trials\nNo feedback will be given.\n\nPress Space to begin', 18);
        await PsychLab.Timing.waitForKey([' ']);

        // 7. Main trials
        for (var i = 0; i < state.trials.length; i++) {
            if (!state.running) break;
            await runTrial(i, false);
        }

        // 8. Awareness check
        drawText('Did you notice any words flashing briefly\nbefore each target appeared?\n\nY = Yes, I noticed words\nN = No, I did not notice', 18);
        var awareResp = await PsychLab.Timing.waitForKey(['y', 'n']);
        state.awarenessResponse = awareResp.key === 'y';

        showResults();
    }

    // ----- Results -----

    function showResults() {
        var session = PsychLab.Storage.getSession(state.session.sessionId);
        var trials = session.trials;

        // Valid RTs for word trials by condition (correct, not timed out, 200-2000ms)
        function getWordRTs(condition) {
            return trials
                .filter(function (t) {
                    return t.condition === condition && t.correct && !t.timedOut &&
                        t.rt >= 200 && t.rt <= 2000;
                })
                .map(function (t) { return t.rt; });
        }

        var relRTs = getWordRTs('related');
        var unrelRTs = getWordRTs('unrelated');

        var relMean = PsychLab.Stats.mean(relRTs);
        var unrelMean = PsychLab.Stats.mean(unrelRTs);
        var relSE = PsychLab.Stats.standardError(relRTs);
        var unrelSE = PsychLab.Stats.standardError(unrelRTs);
        var primingEffect = unrelMean - relMean;

        // Accuracy
        var wordTrials = trials.filter(function (t) { return t.isWord; });
        var nonwordTrials = trials.filter(function (t) { return !t.isWord; });
        var wordAcc = wordTrials.length > 0
            ? wordTrials.filter(function (t) { return t.correct; }).length / wordTrials.length * 100
            : 0;
        var nonwordAcc = nonwordTrials.length > 0
            ? nonwordTrials.filter(function (t) { return t.correct; }).length / nonwordTrials.length * 100
            : 0;
        var overallAcc = trials.length > 0
            ? trials.filter(function (t) { return t.correct; }).length / trials.length * 100
            : 0;

        // T-test: related vs unrelated RTs
        var tResult = PsychLab.Stats.tTestIndependent(relRTs, unrelRTs);

        PsychLab.UI.showPhase('phase-results');

        // Stat cards
        var summary = document.getElementById('results-summary');
        summary.innerHTML = '';
        summary.appendChild(PsychLab.UI.createStatCard('Related RT', Math.round(relMean), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Unrelated RT', Math.round(unrelMean), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Priming Effect', Math.round(primingEffect), 'ms'));
        summary.appendChild(PsychLab.UI.createStatCard('Accuracy', Math.round(overallAcc) + '%'));

        // Bar chart
        PsychLab.Charts.barChart(document.getElementById('chart-priming'), [
            { label: 'Related', value: relMean, error: relSE, color: '#2563eb' },
            { label: 'Unrelated', value: unrelMean, error: unrelSE, color: '#dc2626' }
        ], {
            title: 'Mean RT by Prime Condition (Word Targets)',
            yLabel: 'Reaction Time (ms)',
            width: 480,
            height: 320
        });

        // Interpretation
        var interp = document.getElementById('results-interpretation');
        var primeDurMs = Math.round(CONFIG.primeDurationFrames * state.frameDuration);
        var text = '<h3>Interpretation</h3>';

        text += '<p>The <strong>semantic priming effect</strong> (unrelated \u2212 related) was <strong>' + Math.round(primingEffect) + ' ms</strong>. ';
        if (primingEffect > 15) {
            text += 'This positive priming effect shows that a briefly flashed related word sped up your recognition of the target, even though the prime was presented for only ~' + primeDurMs + ' ms &mdash; well below typical conscious detection thresholds.</p>';
        } else if (primingEffect > 0) {
            text += 'This is a modest priming effect. In lab settings with precise timing, typical effects range from 20\u201360 ms. Browser-based timing limitations may reduce the measured effect.</p>';
        } else {
            text += 'No clear priming effect was observed. This can happen due to timing imprecision in the browser, high error rates, or individual differences in subliminal processing.</p>';
        }

        // Stats table
        text += '<h4>Statistical Test</h4>';
        text += '<table>';
        text += '<tr><th style="text-align:left">Condition</th><th>Mean RT</th><th>SE</th><th>N</th></tr>';
        text += '<tr><td style="text-align:left">Related prime</td><td>' + Math.round(relMean) + ' ms</td><td>\u00B1' + Math.round(relSE) + '</td><td>' + relRTs.length + '</td></tr>';
        text += '<tr><td style="text-align:left">Unrelated prime</td><td>' + Math.round(unrelMean) + ' ms</td><td>\u00B1' + Math.round(unrelSE) + '</td><td>' + unrelRTs.length + '</td></tr>';
        text += '</table>';

        text += '<p><strong>Welch\'s t-test:</strong> t(' + (tResult.df).toFixed(1) + ') = ' + (tResult.t).toFixed(2) + ', p = ' + (tResult.p < 0.001 ? '<.001' : tResult.p.toFixed(3));
        text += tResult.p < 0.05 ? ' (significant)' : ' (not significant)';
        text += '</p>';

        // Accuracy breakdown
        text += '<h4>Accuracy</h4>';
        text += '<p>Word targets: <strong>' + Math.round(wordAcc) + '%</strong> | Nonword targets: <strong>' + Math.round(nonwordAcc) + '%</strong></p>';

        // Awareness
        text += '<h4>Prime Awareness</h4>';
        if (state.awarenessResponse) {
            text += '<p>You reported <strong>noticing</strong> the primes. At ~' + primeDurMs + ' ms, some people can detect that something flashed, though identifying the specific word is typically difficult. ';
            if (primingEffect > 15) {
                text += 'Regardless, the priming effect demonstrates that semantic content was processed rapidly enough to facilitate target recognition.</p>';
            } else {
                text += '</p>';
            }
        } else {
            text += '<p>You reported <strong>not noticing</strong> the primes. ';
            if (primingEffect > 15) {
                text += 'Yet the priming effect was positive, providing evidence for <strong>unconscious semantic processing</strong> &mdash; word meaning was extracted even without conscious awareness, consistent with Dehaene et al. (1998).</p>';
            } else {
                text += 'The primes may have been effectively masked at this display rate.</p>';
            }
        }

        text += '<p>Published masked semantic priming studies typically find effects of 20\u201360 ms using precise CRT displays and SOAs of 40\u201370 ms (Dehaene et al., 1998; Marcel, 1983). Browser-based timing introduces variability that may attenuate the observed effect.</p>';

        interp.innerHTML = text;

        // Save summary
        session.summary = {
            relatedMeanRT: Math.round(relMean),
            unrelatedMeanRT: Math.round(unrelMean),
            primingEffect: Math.round(primingEffect),
            tValue: tResult.t.toFixed(2),
            pValue: tResult.p.toFixed(4),
            overallAccuracy: Math.round(overallAcc),
            primeAwareness: state.awarenessResponse,
            fps: state.fps,
            frameDuration: state.frameDuration
        };
        session.completed = true;
        session.endTime = PsychLab.Timing.getTimestamp();
        PsychLab.Storage.updateSession(session);
    }

    function restart() {
        state = {
            session: null,
            trials: [],
            practiceList: [],
            running: false,
            frameDuration: 16.67,
            fps: 60,
            awarenessResponse: null
        };
        PsychLab.UI.showPhase('phase-instructions');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
