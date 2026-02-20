/**
 * PsychLab.Stats — Statistical computations
 */
(function () {
    'use strict';

    var Stats = {};

    Stats.mean = function (arr) {
        if (!arr.length) return 0;
        var sum = 0;
        for (var i = 0; i < arr.length; i++) sum += arr[i];
        return sum / arr.length;
    };

    Stats.median = function (arr) {
        if (!arr.length) return 0;
        var sorted = arr.slice().sort(function (a, b) { return a - b; });
        var mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    Stats.standardDeviation = function (arr) {
        if (arr.length < 2) return 0;
        var m = Stats.mean(arr);
        var sumSq = 0;
        for (var i = 0; i < arr.length; i++) {
            var d = arr[i] - m;
            sumSq += d * d;
        }
        return Math.sqrt(sumSq / (arr.length - 1));
    };

    Stats.standardError = function (arr) {
        if (arr.length < 2) return 0;
        return Stats.standardDeviation(arr) / Math.sqrt(arr.length);
    };

    Stats.percentile = function (arr, p) {
        if (!arr.length) return 0;
        var sorted = arr.slice().sort(function (a, b) { return a - b; });
        var idx = (p / 100) * (sorted.length - 1);
        var lower = Math.floor(idx);
        var upper = Math.ceil(idx);
        if (lower === upper) return sorted[lower];
        return sorted[lower] + (idx - lower) * (sorted[upper] - sorted[lower]);
    };

    /** Remove outliers beyond N standard deviations from mean */
    Stats.filterOutliers = function (arr, sdThreshold) {
        sdThreshold = sdThreshold || 2.5;
        var m = Stats.mean(arr);
        var sd = Stats.standardDeviation(arr);
        return arr.filter(function (v) {
            return Math.abs(v - m) <= sdThreshold * sd;
        });
    };

    /** Trimmed mean: remove top and bottom proportion */
    Stats.trimmedMean = function (arr, proportion) {
        proportion = proportion || 0.1;
        var sorted = arr.slice().sort(function (a, b) { return a - b; });
        var trimCount = Math.floor(sorted.length * proportion);
        var trimmed = sorted.slice(trimCount, sorted.length - trimCount);
        return Stats.mean(trimmed);
    };

    /** Linear regression: returns { slope, intercept, r2 } */
    Stats.linearRegression = function (xArr, yArr) {
        var n = xArr.length;
        if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
        var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
        for (var i = 0; i < n; i++) {
            sumX += xArr[i];
            sumY += yArr[i];
            sumXY += xArr[i] * yArr[i];
            sumX2 += xArr[i] * xArr[i];
            sumY2 += yArr[i] * yArr[i];
        }
        var denom = n * sumX2 - sumX * sumX;
        if (denom === 0) return { slope: 0, intercept: 0, r2: 0 };
        var slope = (n * sumXY - sumX * sumY) / denom;
        var intercept = (sumY - slope * sumX) / n;
        var ssRes = 0, ssTot = 0;
        var meanY = sumY / n;
        for (var j = 0; j < n; j++) {
            var pred = slope * xArr[j] + intercept;
            ssRes += (yArr[j] - pred) * (yArr[j] - pred);
            ssTot += (yArr[j] - meanY) * (yArr[j] - meanY);
        }
        var r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
        return { slope: slope, intercept: intercept, r2: r2 };
    };

    /** Power regression: y = a * x^b via log-log linear regression */
    Stats.powerRegression = function (xArr, yArr) {
        var logX = [], logY = [];
        for (var i = 0; i < xArr.length; i++) {
            if (xArr[i] > 0 && yArr[i] > 0) {
                logX.push(Math.log10(xArr[i]));
                logY.push(Math.log10(yArr[i]));
            }
        }
        var reg = Stats.linearRegression(logX, logY);
        return {
            exponent: reg.slope,
            coefficient: Math.pow(10, reg.intercept),
            r2: reg.r2
        };
    };

    /** One-sample t-test: test if mean of arr differs from mu */
    Stats.tTestOneSample = function (arr, mu) {
        mu = mu || 0;
        var n = arr.length;
        if (n < 2) return { t: 0, df: 0, p: 1 };
        var m = Stats.mean(arr);
        var se = Stats.standardError(arr);
        if (se === 0) return { t: Infinity, df: n - 1, p: 0 };
        var t = (m - mu) / se;
        var df = n - 1;
        // Approximate two-tailed p-value using normal for large df
        var p = 2 * (1 - Stats._normalCDF(Math.abs(t)));
        return { t: t, df: df, p: p, mean: m, se: se };
    };

    /** Independent samples t-test */
    Stats.tTestIndependent = function (arr1, arr2) {
        var n1 = arr1.length, n2 = arr2.length;
        if (n1 < 2 || n2 < 2) return { t: 0, df: 0, p: 1 };
        var m1 = Stats.mean(arr1), m2 = Stats.mean(arr2);
        var v1 = Stats.standardDeviation(arr1), v2 = Stats.standardDeviation(arr2);
        v1 = v1 * v1; v2 = v2 * v2;
        var se = Math.sqrt(v1 / n1 + v2 / n2);
        if (se === 0) return { t: Infinity, df: n1 + n2 - 2, p: 0 };
        var t = (m1 - m2) / se;
        // Welch's df
        var num = (v1 / n1 + v2 / n2) * (v1 / n1 + v2 / n2);
        var den = (v1 / n1) * (v1 / n1) / (n1 - 1) + (v2 / n2) * (v2 / n2) / (n2 - 1);
        var df = den === 0 ? n1 + n2 - 2 : num / den;
        var p = 2 * (1 - Stats._normalCDF(Math.abs(t)));
        return { t: t, df: df, p: p, mean1: m1, mean2: m2 };
    };

    /** 95% confidence interval */
    Stats.confidenceInterval = function (arr, alpha) {
        alpha = alpha || 0.05;
        var m = Stats.mean(arr);
        var se = Stats.standardError(arr);
        var z = Stats._normalQuantile(1 - alpha / 2);
        return { lower: m - z * se, upper: m + z * se, mean: m };
    };

    /** Standard normal CDF approximation (Abramowitz & Stegun) */
    Stats._normalCDF = function (x) {
        var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        var a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        var sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        var t = 1.0 / (1.0 + p * x);
        var y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    };

    /** Approximate standard normal quantile (inverse CDF) */
    Stats._normalQuantile = function (p) {
        // Rational approximation (Beasley-Springer-Moro)
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;
        if (p === 0.5) return 0;
        var t;
        if (p < 0.5) {
            t = Math.sqrt(-2 * Math.log(p));
        } else {
            t = Math.sqrt(-2 * Math.log(1 - p));
        }
        var c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
        var d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
        var result = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
        return p < 0.5 ? -result : result;
    };

    /** Signal Detection Theory: d-prime (sensitivity) */
    Stats.dPrime = function (hitRate, falseAlarmRate) {
        var h = Math.min(Math.max(hitRate, 0.01), 0.99);
        var f = Math.min(Math.max(falseAlarmRate, 0.01), 0.99);
        return Stats._normalQuantile(h) - Stats._normalQuantile(f);
    };

    /** Signal Detection Theory: criterion c (response bias) */
    Stats.criterion = function (hitRate, falseAlarmRate) {
        var h = Math.min(Math.max(hitRate, 0.01), 0.99);
        var f = Math.min(Math.max(falseAlarmRate, 0.01), 0.99);
        return -0.5 * (Stats._normalQuantile(h) + Stats._normalQuantile(f));
    };

    /** Estimate threshold from psychometric function via linear interpolation */
    Stats.psychometricThreshold = function (xArr, proportionArr, targetProportion) {
        targetProportion = targetProportion || 0.5;
        var pairs = [];
        for (var i = 0; i < xArr.length; i++) {
            pairs.push({ x: xArr[i], p: proportionArr[i] });
        }
        pairs.sort(function (a, b) { return a.x - b.x; });
        for (var j = 1; j < pairs.length; j++) {
            if ((pairs[j - 1].p <= targetProportion && pairs[j].p >= targetProportion) ||
                (pairs[j - 1].p >= targetProportion && pairs[j].p <= targetProportion)) {
                var frac = (targetProportion - pairs[j - 1].p) / (pairs[j].p - pairs[j - 1].p);
                return pairs[j - 1].x + frac * (pairs[j].x - pairs[j - 1].x);
            }
        }
        return null;
    };

    PsychLab.Stats = Stats;
})();
