/**
 * PsychLab.Audio — Web Audio API utilities
 */
(function () {
    'use strict';

    var Audio = {};
    var audioCtx = null;

    /** Initialize or resume AudioContext (must be called after user gesture) */
    Audio.initContext = function () {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    };

    Audio.getContext = function () {
        return audioCtx;
    };

    /**
     * Play a pure tone.
     * @param {number} frequency - Hz
     * @param {number} duration - seconds
     * @param {object} options - { gain, type, rampTime }
     * @returns {Promise} resolves when tone ends
     */
    Audio.playTone = function (frequency, duration, options) {
        options = options || {};
        var ctx = Audio.initContext();
        var gain = options.gain !== undefined ? options.gain : 0.3;
        var rampTime = options.rampTime !== undefined ? options.rampTime : 0.02;
        var type = options.type || 'sine';

        var osc = ctx.createOscillator();
        var gainNode = ctx.createGain();

        osc.type = type;
        osc.frequency.value = frequency;
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + rampTime);
        gainNode.gain.setValueAtTime(gain, ctx.currentTime + duration - rampTime);
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);

        return new Promise(function (resolve) {
            osc.onended = resolve;
        });
    };

    /**
     * Play a Shepard tone — stack of octave-spaced sinusoids with Gaussian spectral envelope.
     * @param {number} baseFreq - lowest frequency component
     * @param {number} duration - seconds
     * @param {object} options - { numComponents, centerLogFreq, sigma, gain }
     * @returns {Promise} resolves when tone ends
     */
    Audio.playShepardTone = function (baseFreq, duration, options) {
        options = options || {};
        var ctx = Audio.initContext();
        var numComponents = options.numComponents || 8;
        var centerLogFreq = options.centerLogFreq || Math.log2(500);
        var sigma = options.sigma || 1.5;
        var maxGain = options.gain || 0.15;
        var rampTime = 0.03;

        var oscillators = [];
        var gainNodes = [];

        for (var i = 0; i < numComponents; i++) {
            var freq = baseFreq * Math.pow(2, i);
            if (freq > 10000) break; // Don't go beyond hearing range

            var logFreq = Math.log2(freq);
            var gaussianWeight = Math.exp(-Math.pow(logFreq - centerLogFreq, 2) / (2 * sigma * sigma));
            var componentGain = maxGain * gaussianWeight;

            var osc = ctx.createOscillator();
            var gn = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            gn.gain.setValueAtTime(0, ctx.currentTime);
            gn.gain.linearRampToValueAtTime(componentGain, ctx.currentTime + rampTime);
            gn.gain.setValueAtTime(componentGain, ctx.currentTime + duration - rampTime);
            gn.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

            osc.connect(gn);
            gn.connect(ctx.destination);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);

            oscillators.push(osc);
            gainNodes.push(gn);
        }

        return new Promise(function (resolve) {
            if (oscillators.length > 0) {
                oscillators[0].onended = resolve;
            } else {
                resolve();
            }
        });
    };

    /**
     * Play a sequence of Shepard tones (ascending or descending).
     * @param {string} direction - 'ascending' or 'descending'
     * @param {number} steps - number of semitone steps
     * @param {number} toneDuration - duration of each tone in seconds
     * @param {number} gap - gap between tones in seconds
     */
    Audio.playShepardSequence = function (direction, steps, toneDuration, gap) {
        steps = steps || 12;
        toneDuration = toneDuration || 0.4;
        gap = gap || 0.1;

        var baseFreqs = [];
        var startFreq = 65.41; // C2
        var semitone = Math.pow(2, 1 / 12);

        for (var i = 0; i < steps; i++) {
            var step = direction === 'ascending' ? i : -i;
            baseFreqs.push(startFreq * Math.pow(semitone, step));
        }

        var idx = 0;
        return new Promise(function (resolve) {
            function playNext() {
                if (idx >= baseFreqs.length) {
                    resolve();
                    return;
                }
                Audio.playShepardTone(baseFreqs[idx], toneDuration).then(function () {
                    idx++;
                    setTimeout(playNext, gap * 1000);
                });
            }
            playNext();
        });
    };

    PsychLab.Audio = Audio;
})();
