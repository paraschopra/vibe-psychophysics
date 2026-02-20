/**
 * PsychLab.UI — Shared UI components for experiment pages
 */
(function () {
    'use strict';

    var UI = {};

    /** Show a specific phase, hide others */
    UI.showPhase = function (phaseId) {
        var phases = document.querySelectorAll('.phase');
        for (var i = 0; i < phases.length; i++) {
            phases[i].classList.add('hidden');
        }
        var target = document.getElementById(phaseId);
        if (target) target.classList.remove('hidden');
    };

    /** Update progress bar (0 to 1) */
    UI.showProgress = function (current, total) {
        var fill = document.getElementById('progress-fill');
        var text = document.getElementById('progress-text');
        if (fill) {
            fill.style.width = ((current / total) * 100) + '%';
        }
        if (text) {
            text.textContent = current + ' / ' + total;
        }
    };

    /**
     * Show fixation cross for a specified duration.
     * Returns a promise that resolves after the duration.
     */
    UI.showFixation = function (el, durationMs) {
        el.innerHTML = '<div class="fixation-cross">+</div>';
        return PsychLab.Timing.frameDelay(durationMs).then(function () {
            el.innerHTML = '';
        });
    };

    /** Show brief feedback */
    UI.showFeedback = function (el, correct, durationMs) {
        durationMs = durationMs || 300;
        el.innerHTML = '<div class="feedback ' + (correct ? 'correct' : 'incorrect') + '">' +
            (correct ? 'Correct' : 'Incorrect') + '</div>';
        return PsychLab.Timing.delay(durationMs).then(function () {
            el.innerHTML = '';
        });
    };

    /** 3-2-1 countdown */
    UI.showCountdown = function (el, seconds) {
        seconds = seconds || 3;
        var count = seconds;
        return new Promise(function (resolve) {
            function tick() {
                if (count <= 0) {
                    el.innerHTML = '';
                    resolve();
                    return;
                }
                el.innerHTML = '<div class="countdown">' + count + '</div>';
                count--;
                setTimeout(tick, 1000);
            }
            tick();
        });
    };

    /** Clear the stimulus area */
    UI.clear = function (el) {
        el.innerHTML = '';
    };

    /** Toggle theory panel visibility (for mobile) */
    UI.setupTheoryToggle = function () {
        var toggle = document.getElementById('btn-toggle-theory');
        var panel = document.getElementById('panel-theory');
        if (toggle && panel) {
            toggle.addEventListener('click', function () {
                panel.classList.toggle('collapsed');
                toggle.textContent = panel.classList.contains('collapsed') ? 'Show Background' : 'Hide Background';
            });
        }
    };

    /** Request fullscreen for an element */
    UI.requestFullscreen = function (el) {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
    };

    /** Setup fullscreen button */
    UI.setupFullscreen = function () {
        var btn = document.getElementById('btn-fullscreen');
        var container = document.querySelector('.experiment-container');
        if (btn && container) {
            btn.addEventListener('click', function () {
                UI.requestFullscreen(container);
            });
        }
    };

    /** Format milliseconds to a display string */
    UI.formatMs = function (ms) {
        return Math.round(ms) + ' ms';
    };

    /** Format a number to fixed decimal places */
    UI.formatNumber = function (n, decimals) {
        decimals = decimals !== undefined ? decimals : 1;
        return Number(n).toFixed(decimals);
    };

    /** Create a results stat card */
    UI.createStatCard = function (label, value, unit) {
        var card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML =
            '<div class="stat-value">' + value + (unit ? '<span class="stat-unit">' + unit + '</span>' : '') + '</div>' +
            '<div class="stat-label">' + label + '</div>';
        return card;
    };

    /** Initialize common experiment page features */
    UI.initExperimentPage = function () {
        UI.setupTheoryToggle();
        UI.setupFullscreen();
    };

    PsychLab.UI = UI;
})();
