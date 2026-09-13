"use strict";
(() => {
  // src/meal-analysis/types.ts
  var MEAL_BIN_MS = 5 * 6e4;
  var MEAL_DETECTOR_VERSION = "meal-detector-v1";
  var MEAL_METRIC_VERSION = "meal-metrics-v1";
  var MEAL_ANALYSIS_VERSION = "meal-analysis-v1";

  // src/meal-analysis/detect.ts
  var DEFAULT_MEAL_PARAMS = {
    triggerRateMgdlPerMin: 1,
    mustIncrease: 30,
    mealBlockoutMinutes: 120,
    numConsecutiveIncrease: 3,
    confirmWindowMinutes: 60
  };
  function validateParams(params) {
    if (!Number.isFinite(params.triggerRateMgdlPerMin) || params.triggerRateMgdlPerMin < 0 || !Number.isFinite(params.mustIncrease) || params.mustIncrease < 0 || !Number.isFinite(params.mealBlockoutMinutes) || params.mealBlockoutMinutes < 0 || !Number.isInteger(params.numConsecutiveIncrease) || params.numConsecutiveIncrease < 1 || !Number.isFinite(params.confirmWindowMinutes ?? 60) || (params.confirmWindowMinutes ?? 60) < 0) {
      throw new Error("Meal detector parameters are invalid.");
    }
  }
  function detectMeals(grid, params = DEFAULT_MEAL_PARAMS) {
    validateParams(params);
    const bins = grid.bins;
    if (bins.length < 3) return [];
    const glucose = bins.map((bin) => bin.glucose);
    const deltas = glucose.map((value, index) => index > 0 && value !== null && glucose[index - 1] !== null ? value - glucose[index - 1] : null);
    const confirmBins = Math.floor((params.confirmWindowMinutes ?? 60) / 5);
    const blackoutBins = Math.max(1, Math.round(params.mealBlockoutMinutes / 5));
    const results = [];
    let nextAllowedIndex = 1;
    for (let index = 1; index < bins.length; index++) {
      if (index < nextAllowedIndex) continue;
      const delta = deltas[index];
      if (delta === null || delta / 5 < params.triggerRateMgdlPerMin) continue;
      if (index + params.numConsecutiveIncrease - 1 >= bins.length) continue;
      let streakAccepted = true;
      let missingStreakBins = 0;
      for (let streakIndex = index; streakIndex < index + params.numConsecutiveIncrease; streakIndex++) {
        const streakDelta = deltas[streakIndex];
        if (streakDelta === null) missingStreakBins++;
        else if (streakDelta <= 0) {
          streakAccepted = false;
          break;
        }
      }
      if (!streakAccepted) continue;
      const onsetIndex = index - 1;
      const baseline = glucose[onsetIndex];
      if (baseline === null) continue;
      const confirmationEnd = Math.min(bins.length - 1, index + confirmBins);
      let confirmationIndex = -1;
      for (let candidate = index; candidate <= confirmationEnd; candidate++) {
        if (glucose[candidate] !== null && glucose[candidate] - baseline >= params.mustIncrease) {
          confirmationIndex = candidate;
          break;
        }
      }
      if (confirmationIndex < 0) continue;
      const peakEnd = Math.min(bins.length - 1, onsetIndex + confirmBins + 12);
      let peakIndex = onsetIndex;
      let peak = baseline;
      for (let candidate = onsetIndex; candidate <= peakEnd; candidate++) {
        if (glucose[candidate] !== null && glucose[candidate] > peak) {
          peak = glucose[candidate];
          peakIndex = candidate;
        }
      }
      const areaEnd = Math.min(bins.length - 1, onsetIndex + 24);
      let area2h = 0;
      for (let candidate = onsetIndex + 1; candidate <= areaEnd; candidate++) {
        const left = glucose[candidate - 1];
        const right = glucose[candidate];
        if (left !== null && right !== null) area2h += (left + right) * 0.5 * 5;
      }
      const warnings = missingStreakBins ? ["missing_observation_in_accepted_streak"] : [];
      results.push({
        detectorVersion: MEAL_DETECTOR_VERSION,
        timestamp: bins[onsetIndex].time,
        t0: bins[onsetIndex].time,
        tConfirm: bins[confirmationIndex].time,
        timeToConfirmMin: (bins[confirmationIndex].time - bins[onsetIndex].time) / 6e4,
        tPeak: bins[peakIndex].time,
        peak,
        peakOneHour: peak - baseline,
        area2h,
        triggerIndex: index,
        confirmationIndex,
        peakIndex,
        missingStreakBins,
        warnings
      });
      nextAllowedIndex = onsetIndex + blackoutBins;
    }
    return results;
  }

  // src/meal-analysis/summarize.ts
  function coverage(rows, start, end) {
    const expected = Math.floor((end - start) / 5) + 1;
    const observed = rows.filter((row) => row.minute >= start && row.minute <= end && row.glucose !== null).length;
    return { expected, observed, pct: expected ? observed / expected * 100 : 0 };
  }
  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }
  function fitLinear(rows) {
    const points = rows.filter((row) => row.glucose !== null);
    if (points.length < 2 || new Set(points.map((point) => point.minute)).size < 2) return null;
    const meanX = points.reduce((sum, point) => sum + point.minute, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.glucose, 0) / points.length;
    const denominator = points.reduce((sum, point) => sum + (point.minute - meanX) ** 2, 0);
    if (!denominator) return null;
    const slope = points.reduce((sum, point) => sum + (point.minute - meanX) * (point.glucose - meanY), 0) / denominator;
    return { slope, intercept: meanY - slope * meanX, startMinute: points[0].minute, endMinute: points[points.length - 1].minute };
  }
  function integratePositive(rows, baseline, endMinute) {
    let area = 0;
    let minutes = 0;
    for (let index = 1; index < rows.length; index++) {
      const left = rows[index - 1];
      const right = rows[index];
      if (left.minute < 0 || right.minute > endMinute || left.glucose === null || right.glucose === null) continue;
      const width = right.minute - left.minute;
      if (width <= 0 || width > 5.000001) continue;
      area += (Math.max(left.glucose - baseline, 0) + Math.max(right.glucose - baseline, 0)) * 0.5 * width;
      minutes += width;
    }
    return { area: minutes > 0 ? area : null, minutes };
  }
  function percentAbove(rows, threshold) {
    const values = rows.filter((row) => row.minute >= 0 && row.minute <= 240 && row.glucose !== null).map((row) => row.glucose);
    return values.length ? values.filter((value) => value > threshold).length / values.length * 100 : null;
  }
  function longestMissingRun(rows) {
    let longest = 0;
    let current = 0;
    for (const row of rows) {
      if (row.glucose === null) {
        current += 5;
        longest = Math.max(longest, current);
      } else current = 0;
    }
    return longest;
  }
  function summarizeMeal(grid, detection) {
    const expectedStart = detection.t0 - 30 * 6e4;
    const expectedEnd = detection.t0 + 240 * 6e4;
    const rows = [];
    for (let time = expectedStart; time <= expectedEnd; time += MEAL_BIN_MS) {
      const index = Math.round((time - grid.bins[0].time) / MEAL_BIN_MS);
      rows.push({
        minute: (time - detection.t0) / 6e4,
        time,
        glucose: index >= 0 && index < grid.bins.length ? grid.bins[index].glucose : null
      });
    }
    const baselineRows = rows.filter((row) => row.minute >= -30 && row.minute <= 0 && row.glucose !== null);
    const baseline = mean(baselineRows.map((row) => row.glucose));
    const postRows = rows.filter((row) => row.minute >= 0 && row.minute <= 240);
    const observedPost = postRows.filter((row) => row.glucose !== null);
    const coverageBaseline = coverage(rows, -30, 0);
    const coveragePost2h = coverage(rows, 0, 120);
    const coveragePost4h = coverage(rows, 0, 240);
    const coverageFull = coverage(rows, -30, 240);
    const warnings = [];
    if (coverageBaseline.observed < coverageBaseline.expected) warnings.push("incomplete_baseline_coverage");
    if (coveragePost2h.observed < coveragePost2h.expected) warnings.push("incomplete_2h_coverage");
    if (coveragePost4h.observed < coveragePost4h.expected) warnings.push("incomplete_4h_coverage");
    const truncatedBefore = expectedStart < grid.bins[0].time;
    const truncatedAfter = expectedEnd > grid.bins[grid.bins.length - 1].time;
    if (truncatedBefore) warnings.push("dataset_truncated_before_meal");
    if (truncatedAfter) warnings.push("dataset_truncated_after_meal");
    let peakRow = null;
    let nearest2h = null;
    let halfRow = null;
    let returnRow = null;
    let gHalf = null;
    let upFit = null;
    let downFit = null;
    let auc2 = { area: null, minutes: 0 };
    let auc4 = { area: null, minutes: 0 };
    if (baseline !== null) {
      const peakRows = observedPost.filter((row) => row.minute <= 120);
      for (const row of peakRows) {
        if (!peakRow || row.glucose > peakRow.glucose) peakRow = row;
      }
      for (const row of observedPost) {
        if (!nearest2h) nearest2h = row;
        else {
          const difference = Math.abs(row.minute - 120) - Math.abs(nearest2h.minute - 120);
          if (difference < 0 || difference === 0 && row.minute < nearest2h.minute) nearest2h = row;
        }
      }
      if (peakRow) {
        gHalf = baseline + (peakRow.glucose - baseline) / 2;
        halfRow = observedPost.find((row) => row.minute > peakRow.minute && row.glucose <= gHalf) ?? null;
        returnRow = observedPost.find((row) => row.minute > peakRow.minute && row.glucose <= baseline) ?? null;
        upFit = fitLinear(postRows.filter((row) => row.minute <= peakRow.minute));
        if (halfRow) downFit = fitLinear(postRows.filter((row) => row.minute >= peakRow.minute && row.minute <= halfRow.minute));
      }
      auc2 = integratePositive(postRows, baseline, 120);
      auc4 = integratePositive(postRows, baseline, 240);
    } else warnings.push("baseline_unavailable");
    if (nearest2h && nearest2h.minute !== 120) warnings.push("approximate_2h_sample");
    if (auc2.minutes < 120) warnings.push("incomplete_2h_auc");
    if (auc4.minutes < 240) warnings.push("incomplete_4h_auc");
    const nearestReference = grid.references.reduce((best, reference) => !best || Math.abs(reference.time - detection.t0) < Math.abs(best.time - detection.t0) ? reference : best, null);
    const returnCandidates2h = peakRow ? observedPost.filter((row) => row.minute > peakRow.minute && row.minute <= 120) : [];
    const returnCandidates4h = peakRow ? observedPost.filter((row) => row.minute > peakRow.minute && row.minute <= 240) : [];
    return {
      metricVersion: MEAL_METRIC_VERSION,
      gBaseline: baseline,
      baselineObserved: baselineRows.length,
      gPeak: peakRow?.glucose ?? null,
      peakTime: peakRow?.time ?? null,
      timeToPeakMin: peakRow?.minute ?? null,
      deltaPeak: baseline !== null && peakRow ? peakRow.glucose - baseline : null,
      delta2h: baseline !== null && nearest2h ? nearest2h.glucose - baseline : null,
      sample2hTime: nearest2h?.time ?? null,
      sample2hOffsetMin: nearest2h ? nearest2h.minute - 120 : null,
      approximate2hSample: nearest2h ? nearest2h.minute !== 120 : null,
      gHalf,
      timeToHalfMin: halfRow?.minute ?? null,
      peakToHalfMin: peakRow && halfRow ? halfRow.minute - peakRow.minute : null,
      slopeUpMgdlPerMin: upFit?.slope ?? null,
      slopeDownMgdlPerMin: downFit?.slope ?? null,
      slopeUpFit: upFit,
      slopeDownFit: downFit,
      returnedToBaseline2h: peakRow && returnCandidates2h.length ? returnCandidates2h.some((row) => row.glucose <= baseline) : null,
      returnedToBaseline4h: peakRow && returnCandidates4h.length ? returnCandidates4h.some((row) => row.glucose <= baseline) : null,
      timeBackToBaselineMin: returnRow?.minute ?? null,
      aucPositive2h: auc2.area,
      aucPositive4h: auc4.area,
      aucIntegrated2hMin: auc2.minutes,
      aucIntegrated4hMin: auc4.minutes,
      timeAbove140Pct: percentAbove(postRows, 140),
      timeAbove180Pct: percentAbove(postRows, 180),
      observedPostSamples: observedPost.length,
      referenceOffsetMin: nearestReference ? (nearestReference.time - detection.t0) / 6e4 : null,
      referenceTime: nearestReference?.time ?? null,
      referenceLabel: nearestReference?.label ?? null,
      coverageBaseline,
      coveragePost2h,
      coveragePost4h,
      coverageFull,
      maxGapMinutes: longestMissingRun(rows),
      truncatedBefore,
      truncatedAfter,
      warnings: [...new Set(warnings)]
    };
  }
  function buildMealEvents(grid, detections) {
    return detections.map((detection, index) => {
      const summary = summarizeMeal(grid, detection);
      return {
        ...detection,
        ...summary,
        warnings: [.../* @__PURE__ */ new Set([...detection.warnings, ...summary.warnings])],
        eventId: `${detection.detectorVersion}:${detection.t0}`,
        overlapWithin4h: detections.some((other, otherIndex) => otherIndex !== index && other.t0 > detection.t0 && other.t0 <= detection.t0 + 240 * 6e4)
      };
    });
  }

  // src/meal-analysis/optimize.ts
  function defaultMealOptimizationGrid() {
    const result = [];
    for (let triggerStep = 0; triggerStep <= 9; triggerStep++) {
      for (let mustIncrease = 10; mustIncrease <= 55; mustIncrease += 5) {
        for (let numConsecutiveIncrease = 1; numConsecutiveIncrease <= 8; numConsecutiveIncrease++) {
          result.push({
            triggerRateMgdlPerMin: Number((triggerStep * 0.2).toFixed(1)),
            mustIncrease,
            numConsecutiveIncrease,
            mealBlockoutMinutes: 120,
            confirmWindowMinutes: 60
          });
        }
      }
    }
    return result;
  }
  function compareMealOptimizationRows(left, right) {
    return right.score - left.score || left.mustIncrease - right.mustIncrease || left.numConsecutiveIncrease - right.numConsecutiveIncrease || left.triggerRateMgdlPerMin - right.triggerRateMgdlPerMin || left.mealBlockoutMinutes - right.mealBlockoutMinutes;
  }
  function dayKey(time) {
    return new Date(time).toISOString().slice(0, 10);
  }
  function gridForMealScope(grid, scope) {
    const bins = grid.bins.filter((bin) => bin.time >= scope.startMs && bin.time <= scope.endMs);
    const validDayKeys = [...new Set(bins.filter((bin) => bin.glucose !== null).map((bin) => dayKey(bin.time)))];
    return { ...grid, bins, validDayKeys };
  }
  function optimizeMealParams(grid, options) {
    if (!Number.isFinite(options.targetMealsPerDay) || options.targetMealsPerDay <= 0) {
      throw new Error("Target meals per day must be a positive finite number.");
    }
    const analyzedDayCount = grid.validDayKeys.length;
    if (!grid.bins.length || analyzedDayCount < 1) throw new Error("The meal analysis scope contains no valid CGM observations.");
    const candidates = defaultMealOptimizationGrid();
    const rows = [];
    for (let index = 0; index < candidates.length; index++) {
      if (options.isCancelled?.()) throw new Error("Meal analysis cancelled.");
      const params = candidates[index];
      const detectedCount = detectMeals(grid, params).length;
      const achievedMealsPerDay = detectedCount / analyzedDayCount;
      const countPenalty = ((achievedMealsPerDay - options.targetMealsPerDay) / options.targetMealsPerDay) ** 2;
      rows.push({ ...params, detectedCount, achievedMealsPerDay, countPenalty, score: countPenalty === 0 ? 0 : -countPenalty });
      options.onProgress?.({ evaluated: index + 1, total: candidates.length });
    }
    rows.sort(compareMealOptimizationRows);
    return { best: rows[0], rows, analyzedDayCount };
  }
  function buildOptimizedMealRun(fullGrid, options) {
    const detectionGrid = gridForMealScope(fullGrid, options.scope);
    const optimization = optimizeMealParams(detectionGrid, options);
    if (options.isCancelled?.()) throw new Error("Meal analysis cancelled.");
    const params = {
      triggerRateMgdlPerMin: optimization.best.triggerRateMgdlPerMin,
      mustIncrease: optimization.best.mustIncrease,
      mealBlockoutMinutes: optimization.best.mealBlockoutMinutes,
      numConsecutiveIncrease: optimization.best.numConsecutiveIncrease,
      confirmWindowMinutes: optimization.best.confirmWindowMinutes
    };
    const run = buildParameterMealRun(fullGrid, { ...options, params, targetMealsPerDay: null });
    return { run: { ...run, targetMealsPerDay: options.targetMealsPerDay }, optimization };
  }
  function buildParameterMealRun(fullGrid, options) {
    const detectionGrid = gridForMealScope(fullGrid, options.scope);
    const analyzedDayCount = detectionGrid.validDayKeys.length;
    if (!detectionGrid.bins.length || analyzedDayCount < 1) throw new Error("The meal analysis scope contains no valid CGM observations.");
    const params = { ...options.params };
    const detections = detectMeals(detectionGrid, params);
    const events = buildMealEvents(fullGrid, detections);
    const run = {
      analysisVersion: MEAL_ANALYSIS_VERSION,
      detectorVersion: detections[0]?.detectorVersion ?? "meal-detector-v1",
      metricVersion: MEAL_METRIC_VERSION,
      datasetRevision: options.datasetRevision,
      exclusionRevision: options.exclusionRevision,
      runId: options.runId,
      timeBasis: fullGrid.timeBasis,
      scope: { ...options.scope },
      targetMealsPerDay: options.targetMealsPerDay ?? null,
      params,
      analyzedDayCount,
      detectedCount: events.length,
      achievedMealsPerDay: events.length / analyzedDayCount,
      sourceIds: [...fullGrid.sourceIds],
      analysisBounds: { startMs: detectionGrid.bins[0].time, endMs: detectionGrid.bins[detectionGrid.bins.length - 1].time },
      gridWarnings: [...fullGrid.warnings],
      events
    };
    return run;
  }

  // src/meal-analysis/worker.ts
  var workerScope = globalThis;
  workerScope.onmessage = (event) => {
    const request = event.data;
    try {
      if (request.operation === "optimize") {
        const result = buildOptimizedMealRun(request.grid, {
          ...request.options,
          onProgress: (progress) => workerScope.postMessage({ type: "progress", token: request.token, ...progress })
        });
        workerScope.postMessage({ type: "complete", token: request.token, run: result.run, best: result.optimization.best });
      } else {
        const run = buildParameterMealRun(request.grid, request.options);
        workerScope.postMessage({ type: "complete", token: request.token, run });
      }
    } catch (error) {
      workerScope.postMessage({
        type: "error",
        token: request.token,
        message: error instanceof Error ? error.message : "Meal analysis failed."
      });
    }
  };
})();
