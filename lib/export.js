/**
 * PsychLab.Export — CSV/JSON export and download
 */
(function () {
    'use strict';

    var Export = {};

    /** Convert session data to CSV string */
    Export.toCSV = function (session) {
        var trials = session.trials;
        if (!trials || !trials.length) return '';

        // Collect all unique keys across trials
        var keys = {};
        for (var i = 0; i < trials.length; i++) {
            for (var k in trials[i]) {
                keys[k] = true;
            }
        }
        var headers = Object.keys(keys);

        // Build CSV
        var rows = [headers.join(',')];
        for (var j = 0; j < trials.length; j++) {
            var row = [];
            for (var h = 0; h < headers.length; h++) {
                var val = trials[j][headers[h]];
                if (val === undefined || val === null) {
                    row.push('');
                } else if (typeof val === 'string') {
                    row.push('"' + val.replace(/"/g, '""') + '"');
                } else {
                    row.push(String(val));
                }
            }
            rows.push(row.join(','));
        }
        return rows.join('\n');
    };

    /** Convert session data to pretty JSON string */
    Export.toJSON = function (session) {
        return JSON.stringify(session, null, 2);
    };

    /** Trigger a browser download */
    Export.download = function (content, filename, mimeType) {
        var blob = new Blob([content], { type: mimeType || 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    /** Download session as CSV */
    Export.downloadCSV = function (session, filenamePrefix) {
        var prefix = filenamePrefix || session.experimentId || 'psychlab';
        var filename = prefix + '_' + session.sessionId + '.csv';
        Export.download(Export.toCSV(session), filename, 'text/csv');
    };

    /** Download session as JSON */
    Export.downloadJSON = function (session, filenamePrefix) {
        var prefix = filenamePrefix || session.experimentId || 'psychlab';
        var filename = prefix + '_' + session.sessionId + '.json';
        Export.download(Export.toJSON(session), filename, 'application/json');
    };

    PsychLab.Export = Export;
})();
