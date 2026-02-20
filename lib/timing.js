/**
 * PsychLab.Timing — High-resolution timing utilities
 */
(function () {
    'use strict';

    var Timing = {};

    /** High-resolution timestamp in ms */
    Timing.now = function () {
        return performance.now();
    };

    /** ISO 8601 wall-clock timestamp */
    Timing.getTimestamp = function () {
        return new Date().toISOString();
    };

    /** Promise that resolves on next animation frame, returning the frame timestamp */
    Timing.waitForFrame = function () {
        return new Promise(function (resolve) {
            requestAnimationFrame(resolve);
        });
    };

    /** Promise-based delay (uses setTimeout — not frame-accurate) */
    Timing.delay = function (ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    };

    /**
     * Frame-accurate delay: waits approximately `ms` milliseconds
     * by counting requestAnimationFrame callbacks.
     * Returns a promise that resolves with the actual elapsed time.
     */
    Timing.frameDelay = function (ms) {
        return new Promise(function (resolve) {
            var start = performance.now();
            function tick() {
                if (performance.now() - start >= ms) {
                    resolve(performance.now() - start);
                } else {
                    requestAnimationFrame(tick);
                }
            }
            requestAnimationFrame(tick);
        });
    };

    /** Measure RT from a start timestamp */
    Timing.measureRT = function (startTime) {
        return performance.now() - startTime;
    };

    /**
     * Estimate display refresh rate by timing rAF callbacks.
     * Returns a promise resolving to { fps, frameDuration }.
     */
    Timing.estimateRefreshRate = function (sampleFrames) {
        sampleFrames = sampleFrames || 60;
        return new Promise(function (resolve) {
            var times = [];
            var count = 0;
            function tick(ts) {
                times.push(ts);
                count++;
                if (count >= sampleFrames + 1) {
                    var durations = [];
                    for (var i = 1; i < times.length; i++) {
                        durations.push(times[i] - times[i - 1]);
                    }
                    var sum = 0;
                    for (var j = 0; j < durations.length; j++) sum += durations[j];
                    var avgDuration = sum / durations.length;
                    resolve({
                        fps: Math.round(1000 / avgDuration),
                        frameDuration: avgDuration
                    });
                } else {
                    requestAnimationFrame(tick);
                }
            }
            requestAnimationFrame(tick);
        });
    };

    /**
     * Wait for a keypress from a set of valid keys.
     * Returns a promise resolving to { key, timestamp }.
     */
    Timing.waitForKey = function (validKeys) {
        return new Promise(function (resolve) {
            function handler(e) {
                var k = e.key.toLowerCase();
                if (!validKeys || validKeys.indexOf(k) !== -1) {
                    document.removeEventListener('keydown', handler);
                    resolve({ key: k, timestamp: performance.now() });
                }
            }
            document.addEventListener('keydown', handler);
        });
    };

    /**
     * Wait for a keypress or timeout.
     * Returns { key, timestamp, timedOut }.
     */
    Timing.waitForKeyWithTimeout = function (validKeys, timeoutMs) {
        return new Promise(function (resolve) {
            var timer = null;
            function handler(e) {
                var k = e.key.toLowerCase();
                if (!validKeys || validKeys.indexOf(k) !== -1) {
                    clearTimeout(timer);
                    document.removeEventListener('keydown', handler);
                    resolve({ key: k, timestamp: performance.now(), timedOut: false });
                }
            }
            document.addEventListener('keydown', handler);
            timer = setTimeout(function () {
                document.removeEventListener('keydown', handler);
                resolve({ key: null, timestamp: performance.now(), timedOut: true });
            }, timeoutMs);
        });
    };

    PsychLab.Timing = Timing;
})();
