/**
 * PsychLab.Storage — localStorage-based session and trial data management
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'psychlab_sessions';
    var Storage = {};

    function _loadAll() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            console.warn('PsychLab.Storage: failed to load data', e);
            return {};
        }
    }

    function _saveAll(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('PsychLab.Storage: failed to save data', e);
        }
    }

    function _generateId(experimentId) {
        var ts = Date.now();
        var rand = Math.random().toString(36).substring(2, 8);
        return experimentId + '_' + ts + '_' + rand;
    }

    /** Create a new session and return the session object */
    Storage.createSession = function (experimentId, experimentName) {
        var session = {
            sessionId: _generateId(experimentId),
            experimentId: experimentId,
            experimentName: experimentName || experimentId,
            version: PsychLab.VERSION,
            startTime: new Date().toISOString(),
            endTime: null,
            completed: false,
            participantId: 'anonymous',
            metadata: {
                userAgent: navigator.userAgent,
                screenWidth: screen.width,
                screenHeight: screen.height,
                windowWidth: window.innerWidth,
                windowHeight: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio || 1
            },
            config: {},
            trials: [],
            summary: {}
        };
        var all = _loadAll();
        all[session.sessionId] = session;
        _saveAll(all);
        return session;
    };

    /** Append trial data to a session */
    Storage.saveTrialData = function (sessionId, trialData) {
        var all = _loadAll();
        if (!all[sessionId]) {
            console.warn('PsychLab.Storage: session not found:', sessionId);
            return;
        }
        all[sessionId].trials.push(trialData);
        _saveAll(all);
    };

    /** Update a session (e.g., mark completed, add summary) */
    Storage.updateSession = function (session) {
        var all = _loadAll();
        all[session.sessionId] = session;
        _saveAll(all);
    };

    /** Get a session by ID */
    Storage.getSession = function (sessionId) {
        var all = _loadAll();
        return all[sessionId] || null;
    };

    /** Get all sessions for an experiment */
    Storage.getAllSessions = function (experimentId) {
        var all = _loadAll();
        var results = [];
        for (var id in all) {
            if (all[id].experimentId === experimentId) {
                results.push(all[id]);
            }
        }
        results.sort(function (a, b) {
            return new Date(b.startTime) - new Date(a.startTime);
        });
        return results;
    };

    /** Delete a session */
    Storage.deleteSession = function (sessionId) {
        var all = _loadAll();
        delete all[sessionId];
        _saveAll(all);
    };

    /** Clear all PsychLab data */
    Storage.clearAll = function () {
        localStorage.removeItem(STORAGE_KEY);
    };

    /** Estimate storage usage in bytes */
    Storage.getUsage = function () {
        var raw = localStorage.getItem(STORAGE_KEY) || '';
        return new Blob([raw]).size;
    };

    PsychLab.Storage = Storage;
})();
