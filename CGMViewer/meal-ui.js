"use strict";
var MealReviewBundle = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/meal-ui/controller.ts
  var controller_exports = {};
  __export(controller_exports, {
    MealReview: () => bridge
  });

  // src/meal-analysis/types.ts
  var MEAL_BIN_MS = 5 * 6e4;

  // src/anonymize/csv.ts
  function serializeCsv(table) {
    const encode = (value) => {
      const normalized = String(value ?? "");
      if (/[",\r\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
      }
      return normalized;
    };
    return [table.headers, ...table.rows].map((row) => row.map(encode).join(",")).join("\r\n") + "\r\n";
  }

  // src/anonymize/date-mapping.ts
  function parseLocalDateTime(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!match) return null;
    return validateParts({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] ?? 0),
      includedSeconds: match[6] !== void 0
    });
  }
  function validateParts(parts) {
    if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31 || parts.hour < 0 || parts.hour > 23 || parts.minute < 0 || parts.minute > 59 || parts.second < 0 || parts.second > 59) {
      return null;
    }
    const candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (candidate.getUTCFullYear() !== parts.year || candidate.getUTCMonth() !== parts.month - 1 || candidate.getUTCDate() !== parts.day) {
      return null;
    }
    return parts;
  }

  // src/hypoglycemia/types.ts
  var BIN_MS = 5 * 6e4;

  // src/hypoglycemia/normalize.ts
  function parseTimestamp(value) {
    const match = /^(.*?)(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value.trim());
    const parts = parseLocalDateTime(match[1]);
    if (!parts) throw new Error(`Invalid timestamp: ${value}`);
    let time2 = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    if (match[2]) time2 += Number(match[2].padEnd(3, "0"));
    const suffix = match[3];
    if (suffix && suffix !== "Z") {
      const hours = Number(suffix.slice(1, 3));
      const minutes = Number(suffix.slice(4, 6));
      if (hours > 14 || minutes > 59 || hours === 14 && minutes !== 0) {
        throw new Error(`Invalid timestamp offset: ${value}`);
      }
      time2 -= (suffix[0] === "-" ? -1 : 1) * (hours * 60 + minutes) * 6e4;
    }
    return { time: time2, basis: suffix ? "utc" : "local_unspecified" };
  }

  // src/meal-analysis/grid.ts
  function formatMealTimestamp(time2, basis) {
    const iso = new Date(time2).toISOString();
    return basis === "utc" ? iso : iso.slice(0, 19);
  }

  // src/meal-analysis/export.ts
  var time = (run, value) => value === null ? null : formatMealTimestamp(value, run.timeBasis);
  var coverageColumns = (prefix, key) => [
    { key: `cgm_expected_${prefix}_n`, description: `Expected five-minute samples in the ${prefix} window.`, value: (_run, event) => event[key].expected },
    { key: `cgm_observed_${prefix}_n`, description: `Observed finite samples in the ${prefix} window.`, value: (_run, event) => event[key].observed },
    { key: `cgm_coverage_${prefix}_pct`, description: `Observed sample coverage percentage in the ${prefix} window.`, value: (_run, event) => event[key].pct }
  ];
  var MEAL_EVENT_CSV_COLUMNS = [
    { key: "run_id", description: "Unique run identity.", value: (run) => run.runId },
    { key: "analysis_version", description: "Meal analysis pipeline version.", value: (run) => run.analysisVersion },
    { key: "detector_version", description: "Meal detector version.", value: (run) => run.detectorVersion },
    { key: "metric_version", description: "Meal summary metric version.", value: (run) => run.metricVersion },
    { key: "dataset_revision", description: "Source dataset revision.", value: (run) => run.datasetRevision },
    { key: "exclusion_revision", description: "Implausible-bin exclusion revision.", value: (run) => run.exclusionRevision },
    { key: "time_basis", description: "Declared timestamp basis.", value: (run) => run.timeBasis },
    { key: "scope_kind", description: "Frozen whole-dataset or window scope.", value: (run) => run.scope.kind },
    { key: "scope_start", description: "Frozen detection scope start.", value: (run) => time(run, run.scope.startMs) },
    { key: "scope_end", description: "Frozen detection scope end.", value: (run) => time(run, run.scope.endMs) },
    { key: "analysis_start", description: "First retained grid bin analyzed.", value: (run) => time(run, run.analysisBounds.startMs) },
    { key: "analysis_end", description: "Last retained grid bin analyzed.", value: (run) => time(run, run.analysisBounds.endMs) },
    { key: "target_meals_per_day", description: "Requested optimization target; blank for parameter-only runs.", value: (run) => run.targetMealsPerDay },
    { key: "optimization_objective", description: "Target-count or pump-report matching objective.", value: (run) => run.optimizationObjective },
    { key: "optimization_score", description: "Winning meal-detect-core distance-weighted score for report matching.", value: (run) => run.optimizationScore },
    { key: "matched_report_count", description: "One-to-one matched eligible reports.", value: (run) => run.matchedReportCount },
    { key: "unmatched_detection_count", description: "Eligible detections without a report match.", value: (run) => run.unmatchedDetectionCount },
    { key: "unmatched_report_count", description: "Eligible reports without a detection match.", value: (run) => run.unmatchedReportCount },
    { key: "eligible_report_count", description: "Reports with usable CGM context.", value: (run) => run.eligibleReportCount },
    { key: "excluded_report_count", description: "Reports excluded from scoring.", value: (run) => run.excludedReportCount },
    { key: "excluded_report_reasons", description: "Pipe-separated report exclusion reasons.", value: (run) => run.excludedReportReasons.join("|") },
    { key: "report_coverage_status", description: "Imported pump-report coverage status.", value: (run) => run.reportCoverageStatus },
    { key: "report_coverage_basis", description: "Basis for report coverage status.", value: (run) => run.reportCoverageBasis },
    { key: "report_policy_version", description: "Canonical report extraction policy.", value: (run) => run.reportPolicyVersion },
    { key: "matching_version", description: "One-to-one matching policy version.", value: (run) => run.matchingVersion },
    { key: "scoring_version", description: "Optimization scoring policy version.", value: (run) => run.scoringVersion },
    { key: "reference_eligibility_version", description: "CGM eligibility policy version.", value: (run) => run.referenceEligibilityVersion },
    { key: "match_tolerance_before_minutes", description: "Inclusive detection lead tolerance.", value: (run) => run.matchToleranceBeforeMinutes },
    { key: "match_tolerance_after_minutes", description: "Inclusive detection lag tolerance.", value: (run) => run.matchToleranceAfterMinutes },
    { key: "optimizer_matches", description: "Stable report/detection assignments as report_id@offset.", value: (run) => run.optimizerMatches.map((match) => `${match.reportId}@${match.offsetMinutes}`).join("|") },
    { key: "achieved_meals_per_day", description: "Detected count divided by observed analysis days.", value: (run) => run.achievedMealsPerDay },
    { key: "analyzed_day_count", description: "Distinct source-calendar days with valid unmasked CGM.", value: (run) => run.analyzedDayCount },
    { key: "run_detected_count", description: "Total events in the complete run.", value: (run) => run.detectedCount },
    { key: "source_ids", description: "Pipe-separated retained source identifiers.", value: (run) => run.sourceIds.join("|") },
    { key: "grid_warnings", description: "Pipe-separated run grid warnings.", value: (run) => run.gridWarnings.join("|") },
    { key: "trigger_rate_mgdl_per_min", description: "Detector trigger-rate parameter.", value: (run) => run.params.triggerRateMgdlPerMin },
    { key: "must_increase_mgdl", description: "Detector required-rise parameter.", value: (run) => run.params.mustIncrease },
    { key: "num_consecutive_increase", description: "Detector increasing-step parameter.", value: (run) => run.params.numConsecutiveIncrease },
    { key: "meal_blockout_minutes", description: "Detector event blackout parameter.", value: (run) => run.params.mealBlockoutMinutes },
    { key: "confirm_window_minutes", description: "Detector confirmation-window parameter.", value: (run) => run.params.confirmWindowMinutes ?? 60 },
    { key: "event_id", description: "Stable event identity within the dataset.", value: (_run, event) => event.eventId },
    { key: "meal_start", description: "Detected onset at the beginning of the triggering rise.", value: (run, event) => time(run, event.t0) },
    { key: "t_confirm", description: "Detector confirmation time.", value: (run, event) => time(run, event.tConfirm) },
    { key: "time_to_confirm_min", description: "Minutes from onset to confirmation.", value: (_run, event) => event.timeToConfirmMin },
    { key: "detector_t_peak", description: "Legacy detector peak time.", value: (run, event) => time(run, event.tPeak) },
    { key: "detector_peak_mgdl", description: "Legacy detector peak glucose.", value: (_run, event) => event.peak },
    { key: "detector_peak_one_hour_mgdl", description: "Legacy detector peak minus onset glucose.", value: (_run, event) => event.peakOneHour },
    { key: "detector_total_auc_2h", description: "Legacy total-glucose AUC; not positive incremental AUC.", value: (_run, event) => event.area2h },
    { key: "trigger_index", description: "Trigger bin index in the frozen detection grid.", value: (_run, event) => event.triggerIndex },
    { key: "confirmation_index", description: "Confirmation bin index in the frozen detection grid.", value: (_run, event) => event.confirmationIndex },
    { key: "peak_index", description: "Detector peak bin index in the frozen detection grid.", value: (_run, event) => event.peakIndex },
    { key: "missing_streak_bins", description: "Missing deltas accepted in the increasing streak.", value: (_run, event) => event.missingStreakBins },
    { key: "g_baseline", description: "Mean finite glucose in minutes -30 through 0.", value: (_run, event) => event.gBaseline },
    { key: "baseline_observed_n", description: "Finite observations contributing to baseline.", value: (_run, event) => event.baselineObserved },
    { key: "g_peak", description: "Earliest maximum glucose in minutes 0 through 120.", value: (_run, event) => event.gPeak },
    { key: "peak_time", description: "Summary peak time.", value: (run, event) => time(run, event.peakTime) },
    { key: "time_to_peak_min", description: "Minutes from onset to summary peak.", value: (_run, event) => event.timeToPeakMin },
    { key: "delta_peak", description: "Summary peak minus mean baseline.", value: (_run, event) => event.deltaPeak },
    { key: "delta_2h", description: "Nearest observed post-meal sample to +120 minus baseline.", value: (_run, event) => event.delta2h },
    { key: "sample_2h_time", description: "Actual sample used for delta_2h.", value: (run, event) => time(run, event.sample2hTime) },
    { key: "sample_2h_offset_min", description: "Actual sample offset from +120 minutes.", value: (_run, event) => event.sample2hOffsetMin },
    { key: "approximate_2h_sample", description: "Whether delta_2h uses a non-exact sample.", value: (_run, event) => event.approximate2hSample },
    { key: "g_half", description: "Baseline plus half of peak rise.", value: (_run, event) => event.gHalf },
    { key: "time_to_half_min", description: "Minutes from onset to observed half-return.", value: (_run, event) => event.timeToHalfMin },
    { key: "peak_to_half_min", description: "Minutes from peak to observed half-return.", value: (_run, event) => event.peakToHalfMin },
    { key: "slope_up_mgdl_per_min", description: "OLS slope from onset through summary peak.", value: (_run, event) => event.slopeUpMgdlPerMin },
    { key: "slope_down_mgdl_per_min", description: "OLS slope from peak through half-return.", value: (_run, event) => event.slopeDownMgdlPerMin },
    { key: "slope_up_intercept", description: "OLS rising fit intercept.", value: (_run, event) => event.slopeUpFit?.intercept ?? null },
    { key: "slope_down_intercept", description: "OLS falling fit intercept.", value: (_run, event) => event.slopeDownFit?.intercept ?? null },
    { key: "returned_to_baseline_2h", description: "Observed at or below baseline after peak through 2h.", value: (_run, event) => event.returnedToBaseline2h },
    { key: "returned_to_baseline_4h", description: "Observed at or below baseline after peak through 4h.", value: (_run, event) => event.returnedToBaseline4h },
    { key: "time_back_to_baseline_min", description: "Minutes from onset to first observed baseline return.", value: (_run, event) => event.timeBackToBaselineMin },
    { key: "auc_pos_2h", description: "Positive incremental trapezoidal AUC through 2h.", value: (_run, event) => event.aucPositive2h },
    { key: "auc_pos_4h", description: "Cumulative positive incremental trapezoidal AUC through 4h.", value: (_run, event) => event.aucPositive4h },
    { key: "auc_integrated_2h_min", description: "Minutes represented by valid adjacent 2h AUC segments.", value: (_run, event) => event.aucIntegrated2hMin },
    { key: "auc_integrated_4h_min", description: "Minutes represented by valid adjacent 4h AUC segments.", value: (_run, event) => event.aucIntegrated4hMin },
    { key: "meal_time_above_140_pct", description: "Percent of observed 0-240 minute samples strictly above 140.", value: (_run, event) => event.timeAbove140Pct },
    { key: "meal_time_above_180_pct", description: "Percent of observed 0-240 minute samples strictly above 180.", value: (_run, event) => event.timeAbove180Pct },
    { key: "observed_post_samples_n", description: "Finite observed samples in minutes 0 through 240.", value: (_run, event) => event.observedPostSamples },
    { key: "ref_offset_min", description: "Nearest reported meal time minus detected onset.", value: (_run, event) => event.referenceOffsetMin },
    { key: "reference_time", description: "Nearest imported reference time.", value: (run, event) => time(run, event.referenceTime) },
    { key: "reference_label", description: "Nearest imported reference annotation.", value: (_run, event) => event.referenceLabel },
    ...coverageColumns("baseline", "coverageBaseline"),
    ...coverageColumns("post_2h", "coveragePost2h"),
    ...coverageColumns("post_4h", "coveragePost4h"),
    ...coverageColumns("full", "coverageFull"),
    { key: "max_gap_minutes", description: "Longest run of missing expected five-minute bins.", value: (_run, event) => event.maxGapMinutes },
    { key: "truncated_before", description: "Dataset ends inside the expected pre-meal context.", value: (_run, event) => event.truncatedBefore },
    { key: "truncated_after", description: "Dataset ends inside the expected post-meal context.", value: (_run, event) => event.truncatedAfter },
    { key: "overlap_within_4h", description: "Another detected onset occurs in the next four hours.", value: (_run, event) => event.overlapWithin4h },
    { key: "event_warnings", description: "Pipe-separated detector and summary warnings.", value: (_run, event) => event.warnings.join("|") }
  ];

  // src/event-trends/chart.ts
  var EventTrendChartManager = class {
    constructor() {
      this.chart = null;
    }
    clear() {
      this.chart?.destroy();
      this.chart = null;
    }
    render(canvas, model, selectedId, selectEvent2) {
      this.clear();
      const Chart = window.Chart;
      const context = canvas.getContext("2d");
      if (!Chart || !context) return false;
      if (model.mode !== "over_time") {
        const combined = model.mode === "combined_daily_counts";
        const points = (rows, average2 = false) => rows.map((row) => ({
          x: row.xValue,
          y: average2 ? row.trailingAverage : row.eventCount,
          row
        }));
        const counts = model.dailyRows.filter((row) => row.eventCount !== null).map((row) => ({ x: row.xValue, y: row.eventCount, row }));
        const average = model.dailyRows.filter((row) => row.trailingAverage !== null).map((row) => ({ x: row.xValue, y: row.trailingAverage, row }));
        const datasets = combined ? [
          {
            type: "bar",
            label: "Pump-reported meals/day",
            data: points(model.pumpMealDailyRows ?? []),
            backgroundColor: "rgba(36, 87, 167, .3)",
            borderColor: "#2457a7",
            borderWidth: 1,
            order: 3
          },
          {
            type: "line",
            label: "Hypoglycemia events/day",
            data: points(model.dailyRows),
            borderColor: "#d55e00",
            backgroundColor: "#d55e00",
            borderWidth: 2,
            pointRadius: 3,
            pointStyle: "triangle",
            tension: 0,
            order: 2
          },
          {
            type: "line",
            label: `${model.movingAverageDays}-day average: pump meals`,
            data: points(model.pumpMealDailyRows ?? [], true),
            borderColor: "#2457a7",
            borderWidth: 3,
            borderDash: [8, 4],
            pointRadius: 0,
            tension: 0,
            spanGaps: false,
            order: 1
          },
          {
            type: "line",
            label: `${model.movingAverageDays}-day average: hypoglycemia`,
            data: points(model.dailyRows, true),
            borderColor: "#d55e00",
            borderWidth: 3,
            borderDash: [3, 3],
            pointRadius: 0,
            tension: 0,
            spanGaps: false,
            order: 0
          }
        ] : [
          { type: "bar", label: model.dailyMetricLabel ?? "Daily count", data: counts, backgroundColor: "rgba(36, 87, 167, .55)", borderColor: "#2457a7", borderWidth: 1 },
          {
            type: "line",
            label: `${model.movingAverageDays}-day trailing average`,
            data: average,
            borderColor: "#d55e00",
            backgroundColor: "#d55e00",
            borderWidth: 2,
            pointRadius: 2,
            tension: 0
          }
        ];
        this.chart = new Chart(context, { type: "bar", data: { datasets }, options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          parsing: false,
          interaction: combined ? { mode: "index", intersect: false } : void 0,
          plugins: { legend: { display: true }, tooltip: { callbacks: { label: (ctx) => `${ctx.raw.row.date} \xB7 ${ctx.dataset.label}: ${Number(ctx.raw.y.toFixed(3))}` } } },
          scales: {
            x: {
              type: "linear",
              title: { display: true, text: model.timeBasis === "calendar" ? "Source-calendar day" : "Elapsed days from origin" },
              ticks: model.timeBasis === "calendar" ? { callback: (value) => new Date(value).toISOString().slice(0, 10) } : {}
            },
            y: { beginAtZero: true, title: { display: true, text: combined ? "Count per day" : model.dailyMetricLabel ?? "Daily count" } }
          }
        } });
        return true;
      }
      const data = model.rows.map((row) => ({ x: row.xValue, y: row.yValue, row }));
      this.chart = new Chart(context, {
        type: "scatter",
        data: { datasets: [{
          label: "Events",
          data,
          pointRadius: model.rows.map((row) => row.eventId === selectedId ? 7 : 5),
          pointBorderWidth: model.rows.map((row) => row.eventId === selectedId ? 3 : row.qualityFlags.length ? 2 : 1),
          pointStyle: model.rows.map((row) => row.qualityFlags.length ? "triangle" : "circle"),
          backgroundColor: "#2457a7",
          borderColor: "#263646"
        }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          parsing: false,
          onClick: (_event, elements2) => {
            const point = elements2[0];
            if (point) selectEvent2(model.rows[point.index].eventId);
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => {
              const row = ctx.raw.row;
              return [
                `${row.onset}`,
                `${row.yMetricKey}: ${row.yValue} ${row.yUnits}`,
                `Elapsed: ${Number(row.elapsedDays.toFixed(2))} days`,
                ...row.contextTimestamps.map((value) => `Context: ${value}`),
                ...row.qualityFlags.map((value) => `Quality: ${value}`)
              ];
            } } }
          },
          scales: {
            x: {
              type: "linear",
              title: { display: true, text: model.timeBasis === "calendar" ? "Event onset (calendar time)" : "Elapsed days from origin" },
              ticks: model.timeBasis === "calendar" && model.mode === "over_time" ? { callback: (value) => new Date(value).toISOString().slice(0, 10) } : {}
            },
            y: { title: { display: true, text: `${model.rows[0]?.yMetricKey ?? "Value"} (${model.rows[0]?.yUnits ?? ""})` } }
          }
        }
      });
      return true;
    }
  };

  // src/event-trends/model.ts
  function buildEventTrendModel(options) {
    const origin = parseTimestamp(options.origin);
    let qualityExcluded = 0;
    let unavailable = 0;
    const rows = options.events.map((event, inputIndex) => ({
      event,
      inputIndex,
      onset: parseTimestamp(options.accessor.onset(event)),
      warnings: [...new Set(options.accessor.warnings(event))].sort()
    })).sort((a, b) => a.onset.time - b.onset.time || options.accessor.id(a.event).localeCompare(options.accessor.id(b.event)) || a.inputIndex - b.inputIndex).flatMap((item) => {
      if (options.qualityFilter === "unflagged" && item.warnings.length) {
        qualityExcluded++;
        return [];
      }
      const elapsedDays = (item.onset.time - origin.time) / 864e5;
      const xValue = options.timeBasis === "calendar" ? item.onset.time : elapsedDays;
      const yValue = options.metric.value(item.event);
      if (xValue === null || yValue === null || !Number.isFinite(xValue) || !Number.isFinite(yValue)) {
        unavailable++;
        return [];
      }
      const context = options.metric.context?.(item.event);
      return [{
        eventId: options.accessor.id(item.event),
        onset: options.accessor.onset(item.event),
        xMetricKey: options.timeBasis,
        xUnits: options.timeBasis === "calendar" ? "timestamp_ms" : "days",
        xValue,
        yMetricKey: options.metric.key,
        yUnits: options.metric.units,
        yValue,
        elapsedDays,
        contextMethod: context?.method ?? null,
        contextTimestamps: context?.timestamps ?? [],
        qualityFlags: item.warnings
      }];
    });
    return {
      mode: options.mode,
      timeBasis: options.timeBasis,
      origin: options.origin,
      originKind: options.originKind,
      scopeCount: options.events.length,
      qualityExcluded,
      unavailable,
      rows,
      dailyRows: [],
      movingAverageDays: null,
      dailyMetricKey: null,
      dailyMetricLabel: null,
      dailyMetricUnits: null
    };
  }
  var DAY_MS = 864e5;
  function calendarDayStart(time2) {
    const value = new Date(time2);
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  function buildDailyCountTrendModel(options) {
    const start = parseTimestamp(options.start).time;
    const end = parseTimestamp(options.end).time;
    const origin = parseTimestamp(options.origin).time;
    const movingAverageDays = options.movingAverageDays ?? 7;
    if (!Number.isInteger(movingAverageDays) || movingAverageDays < 1) throw new Error("Moving-average days must be a positive integer.");
    let qualityExcluded = 0;
    const eligibleOnsets = options.events.flatMap((event) => {
      const warnings = options.accessor.warnings(event);
      if (options.qualityFilter === "unflagged" && warnings.length) {
        qualityExcluded++;
        return [];
      }
      return [parseTimestamp(options.accessor.onset(event)).time];
    });
    const firstDay = calendarDayStart(start);
    const lastDay = calendarDayStart(Math.max(start, end - 1));
    const counts = [];
    const dailyRows = [];
    for (let day = firstDay; day <= lastDay; day += DAY_MS) {
      const eventCount = eligibleOnsets.filter((onset) => onset >= day && onset < day + DAY_MS).length;
      counts.push(eventCount);
      const trailingAverage = counts.length < movingAverageDays ? null : counts.slice(-movingAverageDays).reduce((sum, value) => sum + value, 0) / movingAverageDays;
      dailyRows.push({
        date: new Date(day).toISOString().slice(0, 10),
        xValue: options.timeBasis === "calendar" ? day : (day - origin) / DAY_MS,
        eventCount,
        trailingAverage,
        availabilityStatus: "available",
        qualityFlags: []
      });
    }
    return {
      mode: "daily_counts",
      timeBasis: options.timeBasis,
      origin: options.origin,
      originKind: options.originKind,
      scopeCount: options.events.length,
      qualityExcluded,
      unavailable: 0,
      rows: [],
      dailyRows,
      movingAverageDays,
      dailyMetricKey: "hypoglycemia_event_count",
      dailyMetricLabel: "Detected events per day",
      dailyMetricUnits: "events"
    };
  }
  var TREND_CSV_HEADERS = [
    "event_id",
    "onset",
    "x_metric_key",
    "x_units",
    "x_value",
    "y_metric_key",
    "y_units",
    "y_value",
    "elapsed_days",
    "context_method",
    "context_timestamps",
    "time_basis",
    "origin_kind",
    "origin",
    "quality_flags"
  ];
  function exportTrendCsv(model) {
    if (model.mode === "combined_daily_counts") {
      const meals = new Map(model.pumpMealDailyRows?.map((row) => [row.date, row]));
      const value = (n) => n == null ? "" : String(n);
      return serializeCsv({
        headers: [
          "date",
          "hypoglycemia_event_count",
          "pump_meal_report_count",
          "hypoglycemia_trailing_average",
          "pump_meal_trailing_average",
          "moving_average_days",
          "time_basis",
          "x_value",
          "origin_kind",
          "origin",
          "pump_meal_availability_status",
          "pump_meal_quality_flags"
        ],
        rows: model.dailyRows.map((row) => {
          const meal = meals.get(row.date);
          return [
            row.date,
            value(row.eventCount),
            value(meal?.eventCount),
            value(row.trailingAverage),
            value(meal?.trailingAverage),
            String(model.movingAverageDays),
            model.timeBasis,
            String(row.xValue),
            model.originKind,
            model.origin,
            meal?.availabilityStatus ?? "unavailable",
            meal?.qualityFlags.join("; ") ?? ""
          ];
        })
      });
    }
    if (model.mode === "daily_counts" || model.mode === "pump_meal_daily_counts") {
      const countHeader = model.mode === "daily_counts" ? "event_count" : model.dailyMetricKey ?? "value";
      const headers = [
        "date",
        countHeader,
        "trailing_average",
        "moving_average_days",
        "time_basis",
        "x_value",
        "origin_kind",
        "origin",
        "availability_status",
        "quality_flags"
      ];
      return serializeCsv({ headers, rows: model.dailyRows.map((row) => [
        row.date,
        row.eventCount === null ? "" : String(row.eventCount),
        row.trailingAverage === null ? "" : String(row.trailingAverage),
        String(model.movingAverageDays),
        model.timeBasis,
        String(row.xValue),
        model.originKind,
        model.origin,
        row.availabilityStatus,
        row.qualityFlags.join("; ")
      ]) });
    }
    return serializeCsv({ headers: TREND_CSV_HEADERS, rows: model.rows.map((row) => [
      row.eventId,
      row.onset,
      row.xMetricKey,
      row.xUnits,
      String(row.xValue),
      row.yMetricKey,
      row.yUnits,
      String(row.yValue),
      String(row.elapsedDays),
      row.contextMethod ?? "",
      row.contextTimestamps.join("; "),
      model.timeBasis,
      model.originKind,
      model.origin,
      row.qualityFlags.join("; ")
    ]) });
  }

  // src/meal-ui/trends.ts
  var MEAL_TREND_METRICS = [
    { key: "delta_peak", label: "Peak rise", units: "mg/dL", value: (event) => event.deltaPeak },
    { key: "auc_positive_2h", label: "0\u20132h positive AUC", units: "mg\xB7min/dL", value: (event) => event.aucPositive2h },
    { key: "delta_2h", label: "2h change", units: "mg/dL", value: (event) => event.delta2h },
    { key: "time_to_peak", label: "Time to peak", units: "minutes", value: (event) => event.timeToPeakMin },
    { key: "time_to_half", label: "Time to half-return", units: "minutes", value: (event) => event.timeToHalfMin }
  ];
  var MEAL_TREND_ACCESSOR = {
    id: (event) => event.eventId,
    onset: (event) => new Date(event.t0).toISOString(),
    warnings: (event) => [
      ...event.warnings,
      ...event.overlapWithin4h ? ["overlap_within_4h"] : [],
      ...event.truncatedBefore ? ["truncated_before"] : [],
      ...event.truncatedAfter ? ["truncated_after"] : [],
      ...event.coveragePost2h.observed < event.coveragePost2h.expected ? ["incomplete_2h_coverage"] : []
    ]
  };
  function mealTrendMetric(key) {
    return MEAL_TREND_METRICS.find((metric2) => metric2.key === key) ?? MEAL_TREND_METRICS[0];
  }

  // src/meal-ui/chart.ts
  var markerColors = {
    onset: "#202b33",
    peak: "#b64a35",
    half: "#13795b",
    baseline_return: "#005bbb",
    reference: "#805d00"
  };
  function guidePlugin(model) {
    return {
      id: "meal-response-guides",
      beforeDraw(chart2) {
        const { ctx, chartArea, scales } = chart2;
        ctx.save();
        const baselineStart = scales.x.getPixelForValue(-30);
        const onset = scales.x.getPixelForValue(0);
        ctx.fillStyle = "rgba(92, 105, 116, .08)";
        ctx.fillRect(baselineStart, chartArea.top, onset - baselineStart, chartArea.bottom - chartArea.top);
        [120, 240].forEach((value) => {
          const x = scales.x.getPixelForValue(value);
          ctx.strokeStyle = "rgba(79, 94, 108, .35)";
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
        });
        if (model.baseline !== null) {
          const y = scales.y.getPixelForValue(model.baseline);
          ctx.strokeStyle = "#596b79";
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#596b79";
          ctx.font = "11px sans-serif";
          ctx.fillText(`Baseline ${Number(model.baseline.toFixed(1))}`, chartArea.left + 5, y - 5);
        }
        ctx.restore();
      },
      afterDatasetsDraw(chart2) {
        const { ctx, chartArea, scales } = chart2;
        ctx.save();
        model.markers.forEach((marker, index) => {
          if (marker.x < model.bounds.leftMinutes || marker.x > model.bounds.rightMinutes) return;
          const x = scales.x.getPixelForValue(marker.x);
          ctx.strokeStyle = markerColors[marker.kind];
          ctx.setLineDash(marker.kind === "reference" ? [3, 3] : []);
          ctx.lineWidth = marker.kind === "onset" ? 2 : 1;
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          if (marker.y !== null) {
            const y = scales.y.getPixelForValue(marker.y);
            ctx.fillStyle = markerColors[marker.kind];
            ctx.beginPath();
            if (marker.kind === "peak") {
              ctx.moveTo(x, y - 6);
              ctx.lineTo(x + 6, y);
              ctx.lineTo(x, y + 6);
              ctx.lineTo(x - 6, y);
              ctx.closePath();
            } else ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.setLineDash([]);
          ctx.fillStyle = markerColors[marker.kind];
          ctx.font = "10px sans-serif";
          ctx.fillText(marker.label, Math.min(chartArea.right - 70, Math.max(chartArea.left, x + 4)), chartArea.top + 12 + index % 3 * 12);
        });
        ctx.restore();
      }
    };
  }
  function tooltipLabel(context) {
    const point = context.raw;
    if (!point || typeof point.x !== "number") return [];
    const result = [`${context.dataset.label}: ${point.y === null ? "Unavailable" : `${point.y} mg/dL`}`];
    if ("clock" in point) result.push(point.clock, ...point.warnings.map((warning) => warning.replace(/_/g, " ")));
    return result;
  }
  var MealChartManager = class {
    constructor() {
      this.chart = null;
    }
    clear() {
      this.chart?.destroy();
      this.chart = null;
    }
    render(canvas, model) {
      this.clear();
      const Chart = window.Chart;
      const context = canvas.getContext("2d");
      if (!Chart || !context) return;
      const baseline = model.baseline === null ? [] : [{ x: 0, y: model.baseline }, { x: 240, y: model.baseline }];
      const datasets = [
        { label: "Baseline", data: baseline, borderColor: "#596b79", borderWidth: 0, pointRadius: 0 },
        {
          label: "0-2h pAUC",
          data: model.auc2hUpper,
          borderColor: "rgba(0, 91, 187, .35)",
          backgroundColor: "rgba(0, 91, 187, .22)",
          borderWidth: 1,
          pointRadius: 0,
          spanGaps: false,
          fill: { target: 0 }
        },
        {
          label: "2-4h contribution",
          data: model.auc2to4hUpper,
          borderColor: "rgba(0, 137, 123, .4)",
          backgroundColor: "rgba(0, 137, 123, .20)",
          borderWidth: 1,
          pointRadius: 0,
          spanGaps: false,
          fill: { target: 0 }
        }
      ];
      if (model.risingFit) datasets.push({
        label: "Rising OLS fit",
        data: [model.risingFit.from, model.risingFit.to],
        borderColor: "#b64a35",
        borderDash: [7, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      });
      if (model.fallingFit) datasets.push({
        label: "Falling OLS fit",
        data: [model.fallingFit.from, model.fallingFit.to],
        borderColor: "#13795b",
        borderDash: [7, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      });
      datasets.push({
        label: "Glucose",
        data: model.glucose,
        borderColor: "#202b33",
        backgroundColor: "#202b33",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: false,
        tension: 0,
        fill: false
      });
      this.chart = new Chart(context, {
        type: "line",
        data: { datasets },
        plugins: [guidePlugin(model)],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          parsing: false,
          normalized: true,
          interaction: { mode: "nearest", intersect: false },
          plugins: {
            legend: { display: true, labels: { filter: (item) => item.text !== "Baseline" } },
            tooltip: { callbacks: { label: tooltipLabel } }
          },
          scales: {
            x: {
              type: "linear",
              min: model.bounds.leftMinutes,
              max: model.bounds.rightMinutes,
              title: { display: true, text: "Minutes relative to detected onset" },
              ticks: {
                stepSize: 60,
                autoSkip: false,
                maxRotation: 0,
                callback: (value) => `${Number(value) > 0 ? "+" : ""}${value}`
              }
            },
            y: {
              min: model.bounds.glucoseMin,
              max: model.bounds.glucoseMax,
              title: { display: true, text: "Glucose (mg/dL)" },
              afterFit: (axis) => {
                axis.width = 66;
              }
            }
          }
        }
      });
    }
  };

  // src/meal-ui/view-model.ts
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function formatMealEventTime(time2, basis) {
    if (time2 === null) return "Unknown";
    const date = new Date(time2);
    const label = `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
    return basis === "utc" ? `${label} UTC` : label;
  }
  function mealDateKey(time2, basis) {
    return formatMealTimestamp(time2, basis).slice(0, 10);
  }
  function getMealDateKeys(events, basis) {
    return [...new Set(events.map((event) => mealDateKey(event.t0, basis)))].sort();
  }
  function nullableNumber(event, key) {
    if (key === "onset") return event.t0;
    if (key === "peak") return event.gPeak;
    return event.aucPositive2h;
  }
  function filterAndSortMealEvents(events, basis, dateKey, sortKey, direction) {
    const filtered = dateKey === "all" ? events : events.filter((event) => mealDateKey(event.t0, basis) === dateKey);
    return [...filtered].sort((left, right) => {
      const leftValue = nullableNumber(left, sortKey);
      const rightValue = nullableNumber(right, sortKey);
      if (leftValue === null && rightValue === null) return left.t0 - right.t0;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      const result = leftValue - rightValue;
      return (direction === "asc" ? result : -result) || left.t0 - right.t0;
    });
  }
  function reconcileSelectedMealId(events, selectedId) {
    if (!events.length) return null;
    return selectedId && events.some((event) => event.eventId === selectedId) ? selectedId : events[0].eventId;
  }
  function relativeMinute(time2, onset) {
    return (time2 - onset) / 6e4;
  }
  function binsForEvent(grid, event) {
    const start = event.t0 - 60 * 6e4;
    const end = event.t0 + 240 * 6e4;
    return grid.bins.filter((bin) => bin.time >= start && bin.time <= end);
  }
  function getCommonMealChartBounds(events, grid) {
    return { leftMinutes: -60, rightMinutes: 240, glucoseMin: 40, glucoseMax: 400 };
  }
  function areaPoints(glucose, baseline, from, to) {
    if (baseline === null) return [];
    const result = [];
    glucose.forEach((point, index) => {
      if (point.x < from || point.x > to || point.y === null) {
        if (result.length && result[result.length - 1].y !== null) result.push({ x: point.x, y: null });
        return;
      }
      const previous = glucose[index - 1];
      const next = glucose[index + 1];
      const connected = previous && previous.x >= from && previous.y !== null && point.time - previous.time === MEAL_BIN_MS || next && next.x <= to && next.y !== null && next.time - point.time === MEAL_BIN_MS;
      result.push({ x: point.x, y: connected ? baseline + Math.max(point.y - baseline, 0) : null });
    });
    return result;
  }
  function fitSegment(fit) {
    if (!fit) return null;
    return {
      from: { x: fit.startMinute, y: fit.intercept + fit.slope * fit.startMinute },
      to: { x: fit.endMinute, y: fit.intercept + fit.slope * fit.endMinute }
    };
  }
  function buildMealChartModel(event, grid, bounds) {
    const glucose = binsForEvent(grid, event).map((bin) => ({
      x: relativeMinute(bin.time, event.t0),
      y: bin.glucose,
      time: bin.time,
      clock: formatMealEventTime(bin.time, grid.timeBasis),
      warnings: [...bin.warnings]
    }));
    const markers = [{
      kind: "onset",
      x: 0,
      y: grid.bins.find((bin) => bin.time === event.t0)?.glucose ?? null,
      label: "Detected onset"
    }];
    if (event.peakTime !== null && event.gPeak !== null) markers.push({ kind: "peak", x: event.timeToPeakMin, y: event.gPeak, label: "Peak" });
    if (event.timeToHalfMin !== null && event.gHalf !== null) markers.push({ kind: "half", x: event.timeToHalfMin, y: event.gHalf, label: "Half-return" });
    if (event.timeBackToBaselineMin !== null) markers.push({
      kind: "baseline_return",
      x: event.timeBackToBaselineMin,
      y: event.gBaseline,
      label: "Baseline return"
    });
    if (event.referenceTime !== null) markers.push({
      kind: "reference",
      x: relativeMinute(event.referenceTime, event.t0),
      y: null,
      label: event.referenceLabel || "Reported meal"
    });
    return {
      bounds,
      timeBasis: grid.timeBasis,
      glucose,
      baseline: event.gBaseline,
      auc2hUpper: areaPoints(glucose, event.gBaseline, 0, 120),
      auc2to4hUpper: areaPoints(glucose, event.gBaseline, 120, 240),
      risingFit: fitSegment(event.slopeUpFit),
      fallingFit: fitSegment(event.slopeDownFit),
      markers,
      incompleteContext: event.truncatedBefore || event.truncatedAfter || event.coverageFull.observed < event.coverageFull.expected
    };
  }
  function formatMealGlucose(value) {
    return value === null ? "Unknown" : `${Number(value.toFixed(1))} mg/dL`;
  }
  function formatMealMinutes(value) {
    return value === null ? "Not observed" : `${Number(value.toFixed(1))} min`;
  }
  function formatMealArea(value) {
    return value === null ? "Unknown" : `${Number(value.toFixed(1))} mg\xB7min/dL`;
  }
  function formatMealSlope(value) {
    return value === null ? "Unknown" : `${Number(value.toFixed(2))} mg/dL/min`;
  }

  // src/meal-ui/view.ts
  function byId(id, constructor) {
    const element = document.getElementById(id);
    return element instanceof constructor ? element : null;
  }
  function getMealReviewElements() {
    const values = {
      root: byId("mealReview", HTMLElement),
      date: byId("mealReviewDate", HTMLSelectElement),
      sort: byId("mealReviewSort", HTMLSelectElement),
      sortDirection: byId("mealReviewSortDirection", HTMLButtonElement),
      exportButton: byId("mealReviewExport", HTMLButtonElement),
      counts: byId("mealReviewCounts", HTMLElement),
      results: byId("mealReviewResults", HTMLElement),
      tableBody: byId("mealReviewRows", HTMLTableSectionElement),
      empty: byId("mealReviewEmpty", HTMLElement),
      detail: byId("mealReviewDetail", HTMLElement),
      title: byId("mealReviewDetailTitle", HTMLElement),
      position: byId("mealReviewPosition", HTMLElement),
      previous: byId("mealReviewPrevious", HTMLButtonElement),
      next: byId("mealReviewNext", HTMLButtonElement),
      metrics: byId("mealReviewMetrics", HTMLElement),
      quality: byId("mealReviewQuality", HTMLElement),
      technical: byId("mealReviewTechnical", HTMLElement),
      chartCanvas: byId("mealReviewChart", HTMLCanvasElement),
      chartNote: byId("mealReviewChartNote", HTMLElement),
      live: byId("mealReviewLive", HTMLElement),
      compactSummary: byId("mealReviewCompactSummary", HTMLElement),
      fullDetails: byId("mealReviewFullDetails", HTMLDetailsElement),
      eventCount: byId("mealEventsDisclosureCount", HTMLElement)
    };
    return Object.values(values).every(Boolean) ? values : null;
  }
  function text(parent, tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    parent.append(element);
    return element;
  }
  function metric(container, label, value, detail = "", warning = false, trendKey, actions) {
    const item = document.createElement("div");
    item.className = `meal-review__metric${warning ? " meal-review__metric--warning" : ""}`;
    text(item, "dt", label);
    text(item, "dd", value, "meal-review__metric-value");
    if (detail) text(item, "dd", detail, "meal-review__metric-detail");
    if (trendKey && actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "meal-review__metric-action";
      button.textContent = trendKey === "daily_counts" ? "View events per day" : "View over time";
      button.addEventListener("click", () => trendKey === "daily_counts" ? actions.selectDailyCounts() : actions.selectTrendMetric(trendKey));
      item.append(button);
    }
    container.append(item);
  }
  function returnValue(value, incomplete) {
    if (value === true) return { value: "Observed", detail: "", warning: false };
    if (value === null) return { value: "Unknown", detail: "No usable post-peak observation.", warning: true };
    return incomplete ? { value: "Not observed", detail: "Coverage is incomplete; this is not a definitive non-return.", warning: true } : { value: "Not observed", detail: "Complete observed window.", warning: false };
  }
  function renderMetrics(container, event, run, actions) {
    container.replaceChildren();
    metric(
      container,
      "Detected onset",
      formatMealEventTime(event.t0, run.timeBasis),
      `Confirmed in ${formatMealMinutes(event.timeToConfirmMin)}`,
      false,
      "daily_counts",
      actions
    );
    metric(
      container,
      "Baseline",
      formatMealGlucose(event.gBaseline),
      `${event.baselineObserved}/${event.coverageBaseline.expected} samples from -30 to 0 min`,
      event.gBaseline === null
    );
    metric(
      container,
      "Peak / rise",
      formatMealGlucose(event.gPeak),
      `${event.deltaPeak === null ? "Unknown rise" : `+${Number(event.deltaPeak.toFixed(1))} mg/dL`} at ${formatMealMinutes(event.timeToPeakMin)} \xB7 ${formatMealEventTime(event.peakTime, run.timeBasis)}`,
      event.gPeak === null,
      "delta_peak",
      actions
    );
    metric(
      container,
      "2h change",
      formatMealGlucose(event.delta2h),
      event.sample2hOffsetMin === null ? "No post-meal sample" : `${event.approximate2hSample ? "Approximate sample" : "Exact sample"} \xB7 offset ${event.sample2hOffsetMin > 0 ? "+" : ""}${event.sample2hOffsetMin} min`,
      event.approximate2hSample === true,
      "delta_2h",
      actions
    );
    metric(
      container,
      "0-2h pAUC",
      formatMealArea(event.aucPositive2h),
      `${event.aucIntegrated2hMin}/120 integrated minutes`,
      event.aucIntegrated2hMin < 120,
      "auc_positive_2h",
      actions
    );
    metric(
      container,
      "0-4h pAUC",
      formatMealArea(event.aucPositive4h),
      `${event.aucIntegrated4hMin}/240 integrated minutes`,
      event.aucIntegrated4hMin < 240
    );
    metric(
      container,
      "Half-return",
      formatMealMinutes(event.timeToHalfMin),
      `${formatMealGlucose(event.gHalf)} \xB7 ${event.peakToHalfMin === null ? "peak-to-half unknown" : `${event.peakToHalfMin} min after peak`}`,
      event.timeToHalfMin === null,
      "time_to_half",
      actions
    );
    metric(
      container,
      "Time to peak",
      formatMealMinutes(event.timeToPeakMin),
      "",
      event.timeToPeakMin === null,
      "time_to_peak",
      actions
    );
    const returned2h = returnValue(event.returnedToBaseline2h, event.coveragePost2h.observed < event.coveragePost2h.expected);
    metric(container, "Baseline return by 2h", returned2h.value, returned2h.detail, returned2h.warning);
    const returned4h = returnValue(event.returnedToBaseline4h, event.coveragePost4h.observed < event.coveragePost4h.expected);
    metric(
      container,
      "Baseline return by 4h",
      returned4h.value,
      event.timeBackToBaselineMin === null ? returned4h.detail : `First return at ${formatMealMinutes(event.timeBackToBaselineMin)}`,
      returned4h.warning
    );
    metric(container, "Rising OLS slope", formatMealSlope(event.slopeUpMgdlPerMin), "Finite samples from onset through peak.");
    metric(container, "Falling OLS slope", formatMealSlope(event.slopeDownMgdlPerMin), "Finite samples from peak through half-return.", event.slopeDownMgdlPerMin === null);
    metric(
      container,
      "Observed samples >140",
      event.timeAbove140Pct === null ? "Unknown" : `${Number(event.timeAbove140Pct.toFixed(1))}%`,
      `${event.observedPostSamples} observed samples from 0 to 240 min`
    );
    metric(
      container,
      "Observed samples >180",
      event.timeAbove180Pct === null ? "Unknown" : `${Number(event.timeAbove180Pct.toFixed(1))}%`,
      `${event.observedPostSamples} observed samples from 0 to 240 min`
    );
    metric(
      container,
      "Nearest reported meal",
      event.referenceOffsetMin === null ? "None" : `${event.referenceOffsetMin > 0 ? "+" : ""}${event.referenceOffsetMin} min`,
      event.referenceTime === null ? "Nearest reported meal offset; not a validated match." : `${event.referenceLabel || "Reported meal"} \xB7 ${formatMealEventTime(event.referenceTime, run.timeBasis)} \xB7 not a validated match.`
    );
  }
  function renderRows(elements2, model, actions) {
    elements2.tableBody.replaceChildren();
    model.displayedEvents.forEach((event) => {
      const row = document.createElement("tr");
      if (event.eventId === model.selectedEvent?.eventId) {
        row.className = "is-selected";
        row.setAttribute("aria-current", "true");
      }
      const onset = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "meal-review__event-select";
      button.textContent = formatMealEventTime(event.t0, model.run.timeBasis);
      button.addEventListener("click", () => actions.selectEvent(event.eventId));
      onset.append(button);
      row.append(onset);
      text(row, "td", event.gPeak === null ? "Unknown" : String(Number(event.gPeak.toFixed(1))));
      text(row, "td", event.deltaPeak === null ? "Unknown" : String(Number(event.deltaPeak.toFixed(1))));
      text(row, "td", event.aucPositive2h === null ? "Unknown" : String(Number(event.aucPositive2h.toFixed(1))));
      elements2.tableBody.append(row);
    });
  }
  function renderDetail(elements2, model, actions) {
    const event = model.selectedEvent;
    elements2.detail.classList.toggle("hidden", !event);
    elements2.fullDetails.classList.toggle("hidden", !event);
    if (!event || !model.run) return;
    elements2.title.textContent = `Meal ${formatMealEventTime(event.t0, model.run.timeBasis)}`;
    elements2.position.textContent = `${model.selectedIndex + 1} of ${model.displayedEvents.length}`;
    elements2.previous.disabled = model.selectedIndex <= 0;
    elements2.next.disabled = model.selectedIndex < 0 || model.selectedIndex >= model.displayedEvents.length - 1;
    elements2.compactSummary.replaceChildren();
    metric(elements2.compactSummary, "Peak / rise", `${formatMealGlucose(event.gPeak)} / ${event.deltaPeak === null ? "Unknown" : `+${Number(event.deltaPeak.toFixed(1))} mg/dL`}`);
    metric(elements2.compactSummary, "2h pAUC", formatMealArea(event.aucPositive2h), `${event.aucIntegrated2hMin}/120 integrated minutes`, event.aucIntegrated2hMin < 120);
    metric(elements2.compactSummary, "Time to peak", formatMealMinutes(event.timeToPeakMin), "", event.timeToPeakMin === null);
    elements2.chartNote.textContent = model.chart?.incompleteContext ? "Response context is incomplete. The trace preserves missing bins and pAUC does not bridge gaps." : "Response uses fixed -60 to +240 minute bounds. pAUC shading is cumulative at 2h and 4h.";
    renderMetrics(elements2.metrics, event, model.run, actions);
    elements2.quality.replaceChildren();
    text(elements2.quality, "p", `Coverage: baseline ${Number(event.coverageBaseline.pct.toFixed(1))}% \xB7 2h ${Number(event.coveragePost2h.pct.toFixed(1))}% \xB7 4h ${Number(event.coveragePost4h.pct.toFixed(1))}% \xB7 maximum gap ${event.maxGapMinutes} min.`);
    if (event.overlapWithin4h) text(elements2.quality, "p", "Another detected meal begins within this four-hour response window.", "meal-review__warning");
    if (event.warnings.length) {
      const list = document.createElement("ul");
      event.warnings.forEach((warning) => text(list, "li", warning.replace(/_/g, " ")));
      elements2.quality.append(list);
    }
    elements2.technical.replaceChildren();
    text(elements2.technical, "p", `Run ${model.run.runId} \xB7 analysis ${model.run.analysisVersion} \xB7 detector ${model.run.detectorVersion} \xB7 metrics ${model.run.metricVersion}`);
    text(elements2.technical, "p", `Time basis: ${model.run.timeBasis === "utc" ? "UTC" : "unspecified local wall clock"} \xB7 sources: ${model.run.sourceIds.join(", ") || "None"}`);
    text(elements2.technical, "p", `Trigger ${model.run.params.triggerRateMgdlPerMin} mg/dL/min \xB7 rise ${model.run.params.mustIncrease} mg/dL \xB7 ${model.run.params.numConsecutiveIncrease} increasing steps \xB7 blackout ${model.run.params.mealBlockoutMinutes} min.`);
    text(elements2.technical, "p", `Detector peak ${formatMealGlucose(event.peak)} \xB7 legacy peak rise ${formatMealGlucose(event.peakOneHour)} \xB7 detector total 2h AUC ${Number(event.area2h.toFixed(1))} mg\xB7min/dL.`);
  }
  function renderMealReview(elements2, model, actions) {
    elements2.root.classList.toggle("hidden", !model.active || !model.run);
    elements2.date.replaceChildren(new Option("All dates", "all"), ...model.dateKeys.map((key) => new Option(key, key)));
    elements2.date.value = model.dateKey;
    elements2.sort.value = model.sortKey;
    elements2.sortDirection.textContent = model.sortDirection === "asc" ? "Ascending" : "Descending";
    elements2.exportButton.disabled = !model.run;
    elements2.exportButton.textContent = `Export ${model.displayedEvents.length} shown meals CSV`;
    elements2.counts.textContent = model.run ? `${model.displayedEvents.length} shown \xB7 ${model.run.detectedCount} detected \xB7 ${model.run.achievedMealsPerDay.toFixed(2)}/day` : "";
    elements2.eventCount.textContent = String(model.displayedEvents.length);
    elements2.results.classList.toggle("hidden", !model.run);
    elements2.eventCount.textContent = String(model.displayedEvents.length);
    const empty = Boolean(model.run && !model.displayedEvents.length);
    elements2.empty.classList.toggle("hidden", !empty);
    elements2.empty.textContent = !empty ? "" : model.run.detectedCount === 0 ? "No meals were detected in this run." : "No meals match this date filter.";
    renderRows(elements2, model, actions);
    renderDetail(elements2, model, actions);
  }

  // src/meal-ui/controller.ts
  var elements = null;
  var initialized = false;
  var chart = new MealChartManager();
  var trendChart = new EventTrendChartManager();
  var overviewSelectionListener = null;
  var state = {
    active: false,
    run: null,
    grid: null,
    displayedEventIds: [],
    selectedEventId: null,
    dateKey: "all",
    sortKey: "onset",
    sortDirection: "asc",
    chartBounds: null,
    trendMetricKey: "delta_peak",
    trendMode: "over_time",
    trendTimeBasis: "calendar",
    trendQuality: "all",
    trendOrigin: null,
    trendOriginKind: "first_observed_cgm",
    focusPanel: "event"
  };
  var chartRenderGeneration = 0;
  function focusElements() {
    return {
      eventTab: document.getElementById("mealEventTab"),
      trendsTab: document.getElementById("mealTrendsTab")
    };
  }
  function setFocusPanel(panel, focus = false) {
    state.focusPanel = panel;
    render();
    if (focus) focusElements()[panel === "event" ? "eventTab" : "trendsTab"]?.focus({ preventScroll: true });
  }
  function displayedEvents() {
    if (!state.run) return [];
    return filterAndSortMealEvents(state.run.events, state.run.timeBasis, state.dateKey, state.sortKey, state.sortDirection);
  }
  function syncSelection() {
    const displayed = displayedEvents();
    state.displayedEventIds = displayed.map((event) => event.eventId);
    state.selectedEventId = reconcileSelectedMealId(displayed, state.selectedEventId);
    return displayed;
  }
  function mealTrendElements() {
    const get = (id) => document.getElementById(id);
    return {
      root: get("mealEventTrends"),
      mode: get("mealTrendMode"),
      metric: get("mealTrendMetric"),
      timeBasis: get("mealTrendTimeBasis"),
      origin: get("mealTrendOrigin"),
      quality: get("mealTrendQuality"),
      counts: get("mealTrendCounts"),
      scope: get("mealTrendScopeLabel"),
      canvas: get("mealTrendChart"),
      fallback: get("mealTrendFallback"),
      download: get("mealTrendDownload")
    };
  }
  function currentMealTrendModel() {
    if (!state.run || !state.trendOrigin) return null;
    if (state.trendMode === "daily_counts") return buildDailyCountTrendModel({
      events: state.run.events,
      accessor: MEAL_TREND_ACCESSOR,
      start: formatMealTimestamp(state.run.analysisBounds.startMs, state.run.timeBasis),
      end: formatMealTimestamp(state.run.analysisBounds.endMs + MEAL_BIN_MS, state.run.timeBasis),
      timeBasis: state.trendTimeBasis,
      origin: state.trendOrigin,
      originKind: state.trendOriginKind,
      qualityFilter: state.trendQuality,
      movingAverageDays: 7
    });
    return buildEventTrendModel({
      events: displayedEvents(),
      accessor: MEAL_TREND_ACCESSOR,
      mode: "over_time",
      timeBasis: state.trendTimeBasis,
      origin: state.trendOrigin,
      originKind: state.trendOriginKind,
      qualityFilter: state.trendQuality,
      metric: mealTrendMetric(state.trendMetricKey)
    });
  }
  function renderMealTrends(generation) {
    const el = mealTrendElements();
    if (!el.root) return;
    const visible = state.active && Boolean(state.run) && state.focusPanel === "trends";
    el.root.classList.toggle("hidden", !visible);
    if (!visible) {
      trendChart.clear();
      return;
    }
    const model = currentMealTrendModel();
    if (!model || !el.mode || !el.metric || !el.timeBasis || !el.origin || !el.quality || !el.counts || !el.scope || !el.canvas || !el.fallback || !el.download) return;
    if (!el.metric.options.length) MEAL_TREND_METRICS.forEach((metric2) => el.metric.add(new Option(metric2.label, metric2.key)));
    el.mode.value = state.trendMode;
    el.metric.value = state.trendMetricKey;
    el.metric.disabled = state.trendMode === "daily_counts";
    el.timeBasis.value = state.trendTimeBasis;
    el.quality.value = state.trendQuality;
    el.origin.value = model.origin.replace(/Z$/, "").slice(0, 16);
    el.scope.textContent = state.trendMode === "daily_counts" ? `All detected events from frozen run ${state.run.runId}; the review-date filter does not narrow this daily overview. The 7-day trailing average is descriptive, not a reported-meal rate.` : `${state.dateKey === "all" ? "All detected meals" : `Meals on ${state.dateKey}`} from frozen run ${state.run.runId}; origin remains the original analysis start unless explicitly changed.`;
    el.counts.textContent = state.trendMode === "daily_counts" ? `${model.dailyRows.length} calendar days \xB7 ${model.scopeCount - model.qualityExcluded} detected events counted \xB7 ${model.qualityExcluded} quality-filter exclusions` : `${model.rows.length} plotted / ${model.scopeCount} in scope \xB7 ${model.qualityExcluded} quality-filter exclusions \xB7 ${model.unavailable} unavailable required values${state.selectedEventId && !model.rows.some((row) => row.eventId === state.selectedEventId) ? " \xB7 Selected event is not plotted: required value unavailable or excluded" : ""}`;
    const hasData = state.trendMode === "daily_counts" ? model.dailyRows.length > 0 : model.rows.length > 0;
    el.canvas.classList.toggle("hidden", !hasData);
    el.fallback.classList.toggle("hidden", hasData);
    el.fallback.textContent = hasData ? "Chart.js is unavailable. Download the plotted rows CSV to inspect the values." : model.scopeCount ? "No meals have valid values for this metric and quality filter." : "No meals are in the selected date scope.";
    el.download.disabled = !hasData;
    if (hasData) requestAnimationFrame(() => {
      if (generation !== chartRenderGeneration || state.focusPanel !== "trends" || el.root?.classList.contains("hidden")) return;
      const available = trendChart.render(el.canvas, model, state.selectedEventId, (id) => selectEvent(id, "keep-panel"));
      el.canvas.classList.toggle("hidden", !available);
      el.fallback.classList.toggle("hidden", available);
    });
  }
  function downloadMealTrend() {
    const model = currentMealTrendModel();
    if (!model || (model.mode === "daily_counts" ? !model.dailyRows.length : !model.rows.length)) return;
    const url = URL.createObjectURL(new Blob([exportTrendCsv(model)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "meal-event-trend.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function render() {
    if (!elements) return;
    const displayed = syncSelection();
    const selectedIndex = displayed.findIndex((event) => event.eventId === state.selectedEventId);
    const selected = selectedIndex < 0 ? null : displayed[selectedIndex];
    const model = selected && state.grid && state.chartBounds ? buildMealChartModel(selected, state.grid, state.chartBounds) : null;
    const generation = ++chartRenderGeneration;
    renderMealReview(elements, {
      active: state.active,
      run: state.run,
      displayedEvents: displayed,
      selectedEvent: selected,
      selectedIndex,
      dateKey: state.dateKey,
      dateKeys: state.run ? getMealDateKeys(state.run.events, state.run.timeBasis) : [],
      sortKey: state.sortKey,
      sortDirection: state.sortDirection,
      chart: model
    }, {
      selectEvent: (id) => selectEvent(id, "inspect"),
      selectTrendMetric(key) {
        state.trendMetricKey = key;
        state.trendMode = "over_time";
        setFocusPanel("trends", true);
      },
      selectDailyCounts() {
        state.trendMode = "daily_counts";
        setFocusPanel("trends", true);
      }
    });
    const focus = focusElements();
    focus.eventTab?.setAttribute("aria-selected", String(state.focusPanel === "event"));
    focus.eventTab?.setAttribute("tabindex", state.focusPanel === "event" ? "0" : "-1");
    focus.trendsTab?.setAttribute("aria-selected", String(state.focusPanel === "trends"));
    focus.trendsTab?.setAttribute("tabindex", state.focusPanel === "trends" ? "0" : "-1");
    document.getElementById("mealFocusHeader")?.classList.toggle("hidden", !selected);
    elements.detail.classList.toggle("hidden", state.focusPanel !== "event" || !selected);
    if (state.active && model && state.focusPanel === "event") requestAnimationFrame(() => {
      if (generation === chartRenderGeneration && state.focusPanel === "event" && !elements.detail.classList.contains("hidden")) chart.render(elements.chartCanvas, model);
    });
    else chart.clear();
    renderMealTrends(generation);
    overviewSelectionListener?.(state.active && state.run && selected ? {
      eventId: selected.eventId,
      onset: selected.t0,
      datasetStart: state.run.analysisBounds.startMs,
      datasetEnd: state.run.analysisBounds.endMs,
      timeBasis: state.run.timeBasis
    } : null);
  }
  function selectEvent(id, intent = "inspect") {
    const displayed = syncSelection();
    const index = displayed.findIndex((event) => event.eventId === id);
    if (index < 0) return;
    state.selectedEventId = id;
    if (intent === "inspect") state.focusPanel = "event";
    render();
    if (intent === "inspect" && matchMedia("(max-width: 1099px)").matches) {
      const disclosure = document.getElementById("mealEventsDisclosure");
      if (disclosure) disclosure.open = false;
      document.getElementById("mealReviewTitle")?.focus({ preventScroll: true });
    }
    if (elements) elements.live.textContent = `Selected meal ${index + 1} of ${displayed.length}.`;
  }
  function navigate(change) {
    const displayed = syncSelection();
    const index = displayed.findIndex((event) => event.eventId === state.selectedEventId);
    const next = index + change;
    if (next >= 0 && next < displayed.length) selectEvent(displayed[next].eventId, "keep-panel");
  }
  function exportDisplayed() {
    if (!state.run) return;
    const csv = window.MealAnalysis.mealRunToCsv(state.run, syncSelection());
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "meal-events-shown.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function initialize() {
    if (initialized) return;
    elements = getMealReviewElements();
    if (!elements) return;
    initialized = true;
    const eventsDisclosure = document.getElementById("mealEventsDisclosure");
    if (eventsDisclosure && matchMedia("(max-width: 1099px)").matches) eventsDisclosure.open = false;
    elements.date.addEventListener("change", () => {
      state.dateKey = elements.date.value;
      render();
    });
    elements.sort.addEventListener("change", () => {
      state.sortKey = elements.sort.value;
      render();
    });
    elements.sortDirection.addEventListener("click", () => {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      render();
    });
    elements.previous.addEventListener("click", () => navigate(-1));
    elements.next.addEventListener("click", () => navigate(1));
    elements.exportButton.addEventListener("click", exportDisplayed);
    const trend = mealTrendElements();
    trend.mode?.addEventListener("change", () => {
      state.trendMode = trend.mode.value;
      render();
    });
    trend.metric?.addEventListener("change", () => {
      state.trendMetricKey = trend.metric.value;
      render();
    });
    trend.timeBasis?.addEventListener("change", () => {
      state.trendTimeBasis = trend.timeBasis.value;
      render();
    });
    trend.quality?.addEventListener("change", () => {
      state.trendQuality = trend.quality.value;
      render();
    });
    trend.origin?.addEventListener("change", () => {
      if (!state.run || !trend.origin.value) return;
      state.trendOrigin = `${trend.origin.value}:00${state.run.timeBasis === "utc" ? "Z" : ""}`;
      state.trendOriginKind = "user_supplied";
      render();
    });
    trend.download?.addEventListener("click", downloadMealTrend);
    const focus = focusElements();
    focus.eventTab?.addEventListener("click", () => setFocusPanel("event"));
    focus.trendsTab?.addEventListener("click", () => setFocusPanel("trends"));
    [focus.eventTab, focus.trendsTab].forEach((tab) => tab?.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      setFocusPanel(event.key === "ArrowLeft" || event.key === "Home" ? "event" : "trends", true);
    }));
    elements.detail.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (["input", "select", "textarea", "button"].includes(target?.tagName.toLowerCase() ?? "") || target?.isContentEditable) return;
      navigate(event.key === "ArrowLeft" ? -1 : 1);
      event.preventDefault();
    });
    render();
  }
  var bridge = {
    initialize,
    setActive(active) {
      state.active = active;
      render();
    },
    publishRun(run, grid) {
      state.run = run;
      state.grid = grid;
      state.dateKey = "all";
      state.selectedEventId = run.events[0]?.eventId ?? null;
      state.focusPanel = "event";
      state.trendOrigin = formatMealTimestamp(run.analysisBounds.startMs, run.timeBasis);
      state.trendOriginKind = "first_observed_cgm";
      state.chartBounds = getCommonMealChartBounds(run.events, grid);
      render();
    },
    clearRun() {
      state.run = null;
      state.grid = null;
      state.displayedEventIds = [];
      state.selectedEventId = null;
      state.dateKey = "all";
      state.chartBounds = null;
      state.trendOrigin = null;
      state.trendOriginKind = "first_observed_cgm";
      state.focusPanel = "event";
      render();
    },
    getSelectedEventId() {
      return state.selectedEventId;
    },
    selectEvent,
    setOverviewSelectionListener(listener) {
      overviewSelectionListener = listener;
      render();
    }
  };
  window.MealReview = bridge;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
  return __toCommonJS(controller_exports);
})();
