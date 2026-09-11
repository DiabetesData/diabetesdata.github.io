"use strict";
var HypoglycemiaReviewBundle = (() => {
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

  // src/hypoglycemia-ui/controller.ts
  var controller_exports = {};
  __export(controller_exports, {
    HypoglycemiaReview: () => bridge
  });

  // src/hypoglycemia/types.ts
  var BIN_MS = 5 * 6e4;
  var ANALYSIS_VERSION = "hypo-v4";

  // src/anonymize/csv.ts
  function parseCsv(csvText) {
    const text = csvText.replace(/^\uFEFF/, "");
    const records = [];
    let record = [];
    let field = "";
    let inQuotes = false;
    const pushField = () => {
      record.push(field);
      field = "";
    };
    const pushRecord = () => {
      pushField();
      records.push(record);
      record = [];
    };
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (inQuotes) {
        if (char === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }
      if (char === '"' && field.length === 0) {
        inQuotes = true;
      } else if (char === ",") {
        pushField();
      } else if (char === "\n") {
        pushRecord();
      } else if (char === "\r") {
        if (text[index + 1] === "\n") {
          index++;
        }
        pushRecord();
      } else {
        field += char;
      }
    }
    if (inQuotes) {
      throw new Error("CSV contains an unterminated quoted field.");
    }
    if (field.length > 0 || record.length > 0) {
      pushRecord();
    }
    while (records.length > 0 && records[records.length - 1].every((cell) => cell === "")) {
      records.pop();
    }
    if (records.length === 0) {
      throw new Error("CSV is empty.");
    }
    const headers = records.shift().map((header) => header.trim());
    if (headers.some((header) => header === "")) {
      throw new Error("CSV contains an empty column name.");
    }
    const normalizedHeaders = headers.map((header) => header.toLowerCase());
    if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
      throw new Error("CSV contains duplicate column names.");
    }
    const rows = records.map((sourceRow, rowIndex) => {
      if (sourceRow.length > headers.length) {
        throw new Error(`CSV row ${rowIndex + 2} has more fields than the header.`);
      }
      return [...sourceRow, ...new Array(headers.length - sourceRow.length).fill("")];
    });
    return { headers, rows };
  }
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
  function rowToObject(headers, row) {
    return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
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

  // src/hypoglycemia/normalize.ts
  function parseTimestamp(value) {
    const match = /^(.*?)(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value.trim());
    const parts = parseLocalDateTime(match[1]);
    if (!parts) throw new Error(`Invalid timestamp: ${value}`);
    let time = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    if (match[2]) time += Number(match[2].padEnd(3, "0"));
    const suffix = match[3];
    if (suffix && suffix !== "Z") {
      const hours = Number(suffix.slice(1, 3));
      const minutes = Number(suffix.slice(4, 6));
      if (hours > 14 || minutes > 59 || hours === 14 && minutes !== 0) {
        throw new Error(`Invalid timestamp offset: ${value}`);
      }
      time -= (suffix[0] === "-" ? -1 : 1) * (hours * 60 + minutes) * 6e4;
    }
    return { time, basis: suffix ? "utc" : "local_unspecified" };
  }
  function formatTimestamp(time, basis) {
    const iso = new Date(time).toISOString();
    return basis === "utc" ? iso : iso.slice(0, 19);
  }
  function normalizeSeriesCsv(files) {
    if (!files.length) throw new Error("Select at least one custom series CSV.");
    const records = [];
    let timeBasis;
    const warnings = /* @__PURE__ */ new Set();
    for (const [sourceFileIndex, file] of files.entries()) {
      const table = parseCsv(file.text);
      const headers = table.headers.map((header) => header.toLowerCase());
      for (const required of ["series", "datetime_local", "value"]) {
        if (!headers.includes(required)) throw new Error(`${file.name}: missing ${required} column.`);
      }
      table.rows.forEach((cells, index) => {
        if (cells.every((cell) => !cell.trim())) return;
        const row = rowToObject(headers, cells);
        let parsed;
        try {
          parsed = parseTimestamp(row.datetime_local);
        } catch {
          throw new Error(`${file.name}, row ${index + 2}: invalid datetime_local.`);
        }
        if (timeBasis && parsed.basis !== timeBasis) {
          throw new Error("Cannot mix offset-free and offset-aware timestamps. Supply a consistent time basis.");
        }
        timeBasis = parsed.basis;
        let reportedTime = null;
        if (row.reported_datetime_local?.trim()) {
          try {
            const reported = parseTimestamp(row.reported_datetime_local);
            if (reported.basis !== parsed.basis || reported.time < parsed.time || reported.time >= parsed.time + BIN_MS) throw new Error();
            reportedTime = reported.time;
          } catch {
            throw new Error(`${file.name}, row ${index + 2}: invalid reported_datetime_local or outside its source bin.`);
          }
        }
        const series = row.series.trim();
        const kind = series.toLowerCase() === "cgm" ? "cgm" : series.toLowerCase() === "insulin" ? "insulin" : "annotation";
        if (/insulin/i.test(series) && kind === "annotation") {
          throw new Error(`${file.name}, row ${index + 2}: unsupported insulin series "${series}"; define its units and policy first.`);
        }
        if (kind !== "annotation" && parsed.time % BIN_MS !== 0) {
          throw new Error(`${file.name}, row ${index + 2}: CGM/insulin timestamp must be on the five-minute grid.`);
        }
        const valueText = row.value.trim();
        const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(valueText) ? Number(valueText) : NaN;
        const value = Number.isFinite(numeric) && (kind === "cgm" ? numeric > 0 : numeric >= 0) ? numeric : null;
        if (kind !== "annotation" && value === null) warnings.add("invalid_or_blank_numeric_rows");
        records.push({
          sourceFile: file.name,
          sourceFileIndex,
          reportedTime,
          includedInAnalysis: true,
          row: index + 2,
          sourceTimestamp: row.datetime_local,
          time: parsed.time,
          series,
          kind,
          value,
          trace: row.source_trace_index || row.source_trace_name || "",
          eventType: row.event_type || "",
          metadata: row
        });
      });
    }
    const cgm = records.filter((record) => record.kind === "cgm");
    if (!cgm.length) throw new Error("No CGM rows found.");
    const times = records.filter((record) => record.kind !== "annotation").map((record) => record.time);
    const start = times.reduce((a, b) => Math.min(a, b));
    const end = times.reduce((a, b) => Math.max(a, b));
    const length = (end - start) / BIN_MS + 1;
    if (length > 11e5) throw new Error("Dataset span exceeds the ten-year analysis limit.");
    const bins = Array.from({ length }, (_, i) => ({
      time: start + i * BIN_MS,
      glucose: null,
      insulin: null,
      cgmRecords: [],
      insulinRecords: [],
      warnings: []
    }));
    for (const record of records) {
      if (record.kind === "annotation") continue;
      bins[(record.time - start) / BIN_MS][record.kind === "cgm" ? "cgmRecords" : "insulinRecords"].push(record);
    }
    let duplicateRows = 0;
    let conflictingCgmBins = 0;
    let averagedCgmBins = 0;
    let conflictingInsulinBins = 0;
    let summedInsulinBins = 0;
    for (const bin of bins) {
      for (const kind of ["cgm", "insulin"]) {
        const source = kind === "cgm" ? bin.cgmRecords : bin.insulinRecords;
        if (!source.length) continue;
        const unique = /* @__PURE__ */ new Map();
        const occurrences = /* @__PURE__ */ new Map();
        for (const record of source) {
          const identity = JSON.stringify([
            record.time,
            record.series.toLowerCase(),
            record.trace,
            record.value,
            record.reportedTime
          ]);
          const fileKey = JSON.stringify([record.sourceFileIndex, identity]);
          const occurrence = (occurrences.get(fileKey) ?? 0) + 1;
          occurrences.set(fileKey, occurrence);
          const key = kind === "insulin" ? JSON.stringify([identity, occurrence]) : identity;
          if (unique.has(key)) {
            record.includedInAnalysis = false;
            duplicateRows++;
            bin.warnings.push(`duplicate_${kind}_rows`);
          } else unique.set(key, record);
        }
        const observations = [...unique.values()];
        const invalid = observations.some((record) => record.value === null);
        const conflict = new Set(observations.map((record) => record.value)).size > 1;
        if (conflict) {
          bin.warnings.push(`conflicting_${kind}_bin`);
          if (kind === "cgm") conflictingCgmBins++;
          else conflictingInsulinBins++;
        }
        if (invalid) bin.warnings.push(`invalid_${kind}_bin`);
        let value = conflict || invalid ? null : observations[0].value;
        if (kind === "cgm" && conflict && !invalid) {
          value = observations.reduce((sum, record) => sum + record.value / observations.length, 0);
          averagedCgmBins++;
          bin.warnings.push("cgm_bin_averaged");
        }
        if (kind === "cgm") bin.glucose = value;
        else {
          bin.insulin = invalid ? null : Number(observations.reduce((sum, record) => sum + record.value, 0).toFixed(9));
          if (!invalid && observations.length > 1) {
            summedInsulinBins++;
            bin.warnings.push("insulin_bin_summed");
          }
          if (observations.some((record) => record.reportedTime === null)) bin.warnings.push("insulin_timing_uses_source_bin");
        }
      }
      bin.warnings = [...new Set(bin.warnings)];
    }
    if (duplicateRows) warnings.add("duplicate_rows_counted_once");
    if (averagedCgmBins) warnings.add("conflicting_cgm_bins_averaged");
    if (conflictingCgmBins > averagedCgmBins) warnings.add("conflicting_cgm_bins_with_invalid_values_unavailable");
    if (summedInsulinBins) warnings.add("multiple_insulin_rows_summed_per_bin");
    if (timeBasis === "local_unspecified") warnings.add("timezone_unspecified_wall_clock_arithmetic");
    return {
      timeBasis,
      sourceFiles: [...new Set(files.map((file) => file.name))],
      records,
      bins,
      warnings: [...warnings],
      duplicateRows,
      conflictingCgmBins,
      averagedCgmBins,
      conflictingInsulinBins,
      summedInsulinBins
    };
  }

  // src/hypoglycemia/manual-pauses.ts
  function pauseTime(record) {
    const clock = (record.metadata.event_time_text || "").trim();
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(clock);
    if (match) {
      let hour = Number(match[1]);
      const minute = Number(match[2]);
      const second = Number(match[3] || 0);
      const meridiem = match[4]?.toUpperCase();
      const validHour = meridiem ? hour >= 1 && hour <= 12 : hour >= 0 && hour <= 23;
      if (validHour && minute < 60 && second < 60) {
        if (meridiem) hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
        const date = record.sourceTimestamp.trim().slice(0, 10);
        const offset = /(Z|[+-]\d{2}:\d{2})$/.exec(record.sourceTimestamp.trim())?.[1] || "";
        const timestamp = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}${offset}`;
        const preciseTime = parseTimestamp(timestamp).time;
        if (preciseTime >= record.time && preciseTime < record.time + BIN_MS) return { time: preciseTime, timing: "annotation_clock" };
      }
    }
    return { time: record.time, timing: "source_bin" };
  }
  function getManualPauses(dataset) {
    const seen = /* @__PURE__ */ new Set();
    return dataset.records.filter((record) => record.kind === "annotation" && /^insulin paused$/i.test(record.eventType.trim())).map((record) => ({ record, ...pauseTime(record) })).sort((a, b) => a.time - b.time).filter((pause) => {
      if (seen.has(pause.time)) return false;
      seen.add(pause.time);
      return true;
    }).map((pause) => {
      const deliveryAgain = dataset.bins.find((bin) => bin.time > pause.time && bin.insulin !== null && bin.insulin > 0)?.time ?? null;
      return {
        start: pause.time,
        deliveryAgain,
        detail: {
          time: formatTimestamp(pause.time, dataset.timeBasis),
          sourceFile: pause.record.sourceFile,
          sourceTimestamp: pause.record.sourceTimestamp,
          annotationTimeText: pause.record.metadata.event_time_text || "",
          timing: pause.timing,
          deliveryObservedAgain: deliveryAgain === null ? null : formatTimestamp(deliveryAgain, dataset.timeBasis)
        }
      };
    });
  }

  // src/hypoglycemia/analyze.ts
  var DEFAULT_PARAMETERS = {
    lowThresholdMgdl: 70,
    level2ThresholdMgdl: 54,
    sustainedMinutes: 15,
    insulinSemantics: "basal_bolus"
  };
  function analyzeHypoglycemia(dataset, options = {}) {
    const parameters = { ...DEFAULT_PARAMETERS, ...options };
    const { lowThresholdMgdl: threshold, level2ThresholdMgdl, sustainedMinutes, insulinSemantics } = parameters;
    if (!Number.isFinite(threshold) || threshold <= 0 || !Number.isFinite(level2ThresholdMgdl) || level2ThresholdMgdl <= 0 || level2ThresholdMgdl > threshold || !Number.isInteger(sustainedMinutes) || sustainedMinutes < 5 || sustainedMinutes % 5 !== 0 || !["basal_bolus", "basal_only", "bolus_only"].includes(insulinSemantics)) {
      throw new Error("Invalid analysis parameters: positive thresholds, Level 2 <= low threshold, and duration in five-minute multiples are required.");
    }
    const { bins } = dataset;
    const count = sustainedMinutes / 5;
    const format = (time) => formatTimestamp(time, dataset.timeBasis);
    const binAt = (index) => bins[index];
    const landmark = (index) => {
      const bin = bins[index];
      const glucose = bin.glucose;
      const previous = binAt(index - 1)?.glucose ?? null;
      return {
        time: format(bin.time),
        binTime: format(bin.time),
        timing: "source_bin",
        glucoseTime: glucose === null ? null : format(bin.time),
        glucoseMgdl: glucose,
        rocMgdlPerMin: glucose === null || previous === null ? null : (glucose - previous) / 5,
        sourceTimestamps: [...new Set(bin.cgmRecords.map((record) => record.sourceTimestamp))]
      };
    };
    const windowStats = (from, to) => {
      let sum = 0;
      let presentBins = 0;
      for (let index = from; index < to; index++) {
        const value = binAt(index)?.insulin;
        if (value !== null && value !== void 0) {
          sum += value;
          presentBins++;
        }
      }
      const expectedBins = to - from;
      return {
        units: presentBins ? Number(sum.toFixed(9)) : null,
        presentBins,
        expectedBins,
        coveragePct: presentBins / expectedBins * 100
      };
    };
    const results = [];
    const pauses = getManualPauses(dataset);
    const firstCgm = bins.findIndex((bin) => bin.cgmRecords.length > 0);
    let lastCgm = bins.length - 1;
    while (lastCgm >= 0 && !bins[lastCgm].cgmRecords.length) lastCgm--;
    function finish(start, end, observedEnd) {
      const onsetTruncated = start === firstCgm || binAt(start - 1)?.glucose == null;
      const warnings = /* @__PURE__ */ new Set();
      const reviewStart = bins[start].time - 72 * BIN_MS;
      const reviewEnd = end === null ? bins[observedEnd].time + BIN_MS : bins[end].time;
      const manualPauses = pauses.filter((pause) => pause.start <= reviewEnd && (pause.start >= reviewStart || pause.deliveryAgain === null || pause.deliveryAgain >= reviewStart)).map((pause) => pause.detail);
      if (manualPauses.length) warnings.add("manual_pump_pause_excluded_from_automated_analysis");
      if (manualPauses.some((pause) => pause.timing === "source_bin")) warnings.add("manual_pause_time_uses_source_bin");
      if (dataset.timeBasis === "local_unspecified") warnings.add("timezone_unspecified_wall_clock_arithmetic");
      if (onsetTruncated) warnings.add("onset_may_precede_observation");
      if (end === null) {
        warnings.add("recovery_not_confirmed");
        warnings.add(observedEnd < lastCgm ? "recovery_interrupted_by_missing_cgm" : "dataset_ended_before_recovery");
      }
      let nadir = start;
      for (let index = start; index <= observedEnd; index++) {
        if (bins[index].glucose !== null && bins[index].glucose < bins[nadir].glucose) nadir = index;
      }
      const insulin3h = windowStats(start - 36, start);
      const insulin6h = windowStats(start - 72, start);
      const insulin3To6h = windowStats(start - 72, start - 36);
      if (insulin6h.presentBins < 72) warnings.add("incomplete_insulin_6h");
      if (insulin3h.presentBins < 36) warnings.add("incomplete_insulin_3h");
      if (insulinSemantics !== "basal_bolus") warnings.add(`insulin_semantics_${insulinSemantics}`);
      let lastPositive = start - 1;
      while (lastPositive >= 0 && !(bins[lastPositive].insulin !== null && bins[lastPositive].insulin > 0)) lastPositive--;
      const lastInsulin = lastPositive >= 0 ? {
        ...landmark(lastPositive),
        units: bins[lastPositive].insulin,
        binUnits: bins[lastPositive].insulin,
        sourceTimestamps: [...new Set(bins[lastPositive].insulinRecords.map((record) => record.sourceTimestamp))],
        minutesBeforeEvent: (start - lastPositive) * 5,
        outside6h: start - lastPositive > 72
      } : null;
      if (lastInsulin) {
        const positive = bins[lastPositive].insulinRecords.filter((record) => record.includedInAnalysis && record.value > 0);
        if (positive.length && positive.every((record) => record.reportedTime !== null)) {
          const latest = Math.max(...positive.map((record) => record.reportedTime));
          lastInsulin.time = format(latest);
          lastInsulin.timing = "reported_clock";
          lastInsulin.units = Number(positive.filter((record) => record.reportedTime === latest).reduce((sum, record) => sum + record.value, 0).toFixed(9));
          lastInsulin.minutesBeforeEvent = (bins[start].time - latest) / 6e4;
          lastInsulin.sourceTimestamps = [...new Set(positive.map((record) => record.metadata.reported_datetime_local))];
        }
      }
      let firstNoInsulin = null;
      let cessationStatus = "insufficient_data";
      if (insulinSemantics === "bolus_only") cessationStatus = "not_applicable_bolus_only";
      else {
        let missing = false;
        for (let index = Math.max(0, lastPositive + 1); index <= start; index++) {
          if (bins[index].insulin === null) missing = true;
        }
        if (bins[start].insulin !== null && bins[start].insulin > 0) cessationStatus = "delivery_resumed";
        else if (missing) cessationStatus = "missing_insulin_bins";
        else if (lastPositive >= 0 && lastPositive + 1 <= start) {
          firstNoInsulin = landmark(lastPositive + 1);
          firstNoInsulin.sourceTimestamps = [...new Set(bins[lastPositive + 1].insulinRecords.map((record) => record.sourceTimestamp))];
          const zeros = bins[lastPositive + 1].insulinRecords.filter((record) => record.includedInAnalysis);
          if (zeros.length && zeros.every((record) => record.reportedTime !== null)) {
            firstNoInsulin.time = format(Math.min(...zeros.map((record) => record.reportedTime)));
            firstNoInsulin.timing = "reported_clock";
            firstNoInsulin.sourceTimestamps = [...new Set(zeros.map((record) => record.metadata.reported_datetime_local))];
          }
          cessationStatus = "confirmed_zero_bins_to_event";
        }
        if (missing && lastInsulin) warnings.add("last_insulin_is_last_observed_positive_only");
      }
      const onset = landmark(start);
      if (onset.rocMgdlPerMin === null) warnings.add("onset_roc_unavailable");
      for (const [name, point] of [["last_insulin", lastInsulin], ["first_no_insulin", firstNoInsulin]]) {
        if (point && point.glucoseMgdl === null) warnings.add(`${name}_glucose_unavailable`);
        if (point && point.rocMgdlPerMin === null) warnings.add(`${name}_roc_unavailable`);
      }
      if (lastInsulin?.outside6h) warnings.add("last_insulin_outside_6h");
      let presentCgm = 0;
      let gap = 0;
      let maxGap = 0;
      for (let index = start - 72; index <= observedEnd; index++) {
        const bin = binAt(index);
        if (bin?.glucose != null) {
          if (index < start) presentCgm++;
          gap = 0;
        } else {
          gap += 5;
          maxGap = Math.max(maxGap, gap);
        }
        bin?.warnings.forEach((warning) => warnings.add(warning));
      }
      if (presentCgm < 72) warnings.add("incomplete_cgm_6h");
      if (lastPositive >= 0 && lastInsulin) bins[lastPositive].warnings.forEach((warning) => warnings.add(warning));
      results.push({
        analysisVersion: ANALYSIS_VERSION,
        eventId: `${ANALYSIS_VERSION}:${format(bins[start].time)}`,
        sourceFiles: dataset.sourceFiles,
        sourceCgmFiles: [...new Set(dataset.records.filter((record) => record.kind === "cgm").map((record) => record.sourceFile))],
        sourceInsulinFiles: [...new Set(dataset.records.filter((record) => record.kind === "insulin").map((record) => record.sourceFile))],
        timeBasis: dataset.timeBasis,
        startTime: format(bins[start].time),
        endTime: end === null ? null : format(bins[end].time),
        observedThrough: format(bins[observedEnd].time),
        durationMinutes: end === null ? null : (end - start) * 5,
        nadirTime: format(bins[nadir].time),
        nadirGlucoseMgdl: bins[nadir].glucose,
        level2: bins[nadir].glucose < level2ThresholdMgdl,
        onset,
        automatedAnalysisEligible: insulinSemantics !== "bolus_only" && manualPauses.length === 0,
        manualPauseAffected: manualPauses.length > 0,
        manualPauses,
        insulin3h,
        insulin6h,
        insulin3To6h,
        lastInsulin,
        firstNoInsulin,
        cessationStatus,
        quality: {
          eventTruncated: onsetTruncated || end === null,
          onsetTruncated,
          recoveryTruncated: end === null,
          cgmCoverage6hPct: presentCgm / 72 * 100,
          maxCgmGapMinutes: maxGap,
          warnings: [...warnings].sort()
        },
        parameters: { ...parameters }
      });
    }
    let lowRun = 0;
    let recoveryRun = 0;
    let activeStart = null;
    for (let index = firstCgm; index <= lastCgm; index++) {
      const glucose = bins[index].glucose;
      if (glucose === null) {
        if (activeStart !== null) finish(activeStart, null, index - 1);
        activeStart = null;
        lowRun = recoveryRun = 0;
      } else if (activeStart === null) {
        lowRun = glucose < threshold ? lowRun + 1 : 0;
        if (lowRun >= count) {
          activeStart = index - count + 1;
          recoveryRun = 0;
        }
      } else {
        recoveryRun = glucose >= threshold ? recoveryRun + 1 : 0;
        if (recoveryRun >= count) {
          const end = index - count + 1;
          finish(activeStart, end, end - 1);
          activeStart = null;
          lowRun = recoveryRun = 0;
        }
      }
    }
    if (activeStart !== null) finish(activeStart, null, lastCgm);
    return results;
  }

  // src/hypoglycemia/export.ts
  function eventToCsvRow(event) {
    const last = event.lastInsulin;
    const zero = event.firstNoInsulin;
    return {
      analysis_version: event.analysisVersion,
      source_cgm_file: event.sourceCgmFiles.join("; "),
      source_insulin_file: event.sourceInsulinFiles.join("; "),
      event_id: event.eventId,
      time_basis: event.timeBasis,
      event_start: event.startTime,
      event_end: event.endTime,
      observed_through: event.observedThrough,
      duration_minutes: event.durationMinutes,
      nadir_time: event.nadirTime,
      nadir_glucose_mgdl: event.nadirGlucoseMgdl,
      level2_flag: event.level2,
      automated_analysis_eligible: event.automatedAnalysisEligible,
      manual_pause_affected_flag: event.manualPauseAffected,
      manual_pause_times: event.manualPauses.map((pause) => pause.time).join("; "),
      manual_pause_source_timestamps: event.manualPauses.map((pause) => pause.sourceTimestamp).join("; "),
      manual_pause_timing: event.manualPauses.map((pause) => pause.timing).join("; "),
      manual_pause_policy: "exclude_pause_overlapping_6h_lookback_through_recovery",
      glucose_at_onset_mgdl: event.onset.glucoseMgdl,
      roc_at_onset_mgdl_per_min: event.onset.rocMgdlPerMin,
      insulin_3h_units: event.insulin3h.units,
      insulin_6h_units: event.insulin6h.units,
      insulin_3h_coverage_pct: event.insulin3h.coveragePct,
      insulin_6h_coverage_pct: event.insulin6h.coveragePct,
      last_insulin_time: last?.time ?? null,
      last_insulin_units: last?.units ?? null,
      last_insulin_bin_time: last?.binTime ?? null,
      last_insulin_bin_units: last?.binUnits ?? null,
      last_insulin_timing: last?.timing ?? null,
      last_insulin_source_timestamps: last?.sourceTimestamps.join("; ") ?? null,
      minutes_last_insulin_to_event: last?.minutesBeforeEvent ?? null,
      last_insulin_outside_6h_flag: last?.outside6h ?? null,
      glucose_time_at_last_insulin: last?.glucoseTime ?? null,
      glucose_at_last_insulin_mgdl: last?.glucoseMgdl ?? null,
      roc_at_last_insulin_mgdl_per_min: last?.rocMgdlPerMin ?? null,
      first_no_insulin_time: zero?.time ?? null,
      first_no_insulin_bin_time: zero?.binTime ?? null,
      first_no_insulin_timing: zero?.timing ?? null,
      insulin_cessation_status: event.cessationStatus,
      first_no_insulin_source_timestamps: zero?.sourceTimestamps.join("; ") ?? null,
      glucose_time_at_first_no_insulin: zero?.glucoseTime ?? null,
      glucose_at_first_no_insulin_mgdl: zero?.glucoseMgdl ?? null,
      roc_at_first_no_insulin_mgdl_per_min: zero?.rocMgdlPerMin ?? null,
      cgm_coverage_6h_pct: event.quality.cgmCoverage6hPct,
      max_cgm_gap_minutes: event.quality.maxCgmGapMinutes,
      event_truncated_flag: event.quality.eventTruncated,
      onset_truncated_flag: event.quality.onsetTruncated,
      recovery_truncated_flag: event.quality.recoveryTruncated,
      quality_warnings: event.quality.warnings.join("; "),
      low_threshold_mgdl: event.parameters.lowThresholdMgdl,
      level2_threshold_mgdl: event.parameters.level2ThresholdMgdl,
      sustained_minutes: event.parameters.sustainedMinutes,
      recovery_minutes: event.parameters.sustainedMinutes,
      grid_minutes: 5,
      max_allowed_missing_bins: 0,
      insulin_delivery_type: event.parameters.insulinSemantics,
      duplicate_policy: "cgm_mean_insulin_sum_within_file_cross_file_max_multiplicity"
    };
  }
  var CSV_HEADERS = [
    "analysis_version",
    "source_cgm_file",
    "source_insulin_file",
    "event_id",
    "time_basis",
    "event_start",
    "event_end",
    "observed_through",
    "duration_minutes",
    "nadir_time",
    "nadir_glucose_mgdl",
    "level2_flag",
    "automated_analysis_eligible",
    "manual_pause_affected_flag",
    "manual_pause_times",
    "manual_pause_source_timestamps",
    "manual_pause_timing",
    "manual_pause_policy",
    "glucose_at_onset_mgdl",
    "roc_at_onset_mgdl_per_min",
    "insulin_3h_units",
    "insulin_6h_units",
    "insulin_3h_coverage_pct",
    "insulin_6h_coverage_pct",
    "last_insulin_time",
    "last_insulin_units",
    "last_insulin_bin_time",
    "last_insulin_bin_units",
    "last_insulin_timing",
    "last_insulin_source_timestamps",
    "minutes_last_insulin_to_event",
    "last_insulin_outside_6h_flag",
    "glucose_time_at_last_insulin",
    "glucose_at_last_insulin_mgdl",
    "roc_at_last_insulin_mgdl_per_min",
    "first_no_insulin_time",
    "first_no_insulin_bin_time",
    "first_no_insulin_timing",
    "insulin_cessation_status",
    "first_no_insulin_source_timestamps",
    "glucose_time_at_first_no_insulin",
    "glucose_at_first_no_insulin_mgdl",
    "roc_at_first_no_insulin_mgdl_per_min",
    "cgm_coverage_6h_pct",
    "max_cgm_gap_minutes",
    "event_truncated_flag",
    "onset_truncated_flag",
    "recovery_truncated_flag",
    "quality_warnings",
    "low_threshold_mgdl",
    "level2_threshold_mgdl",
    "sustained_minutes",
    "recovery_minutes",
    "grid_minutes",
    "max_allowed_missing_bins",
    "insulin_delivery_type",
    "duplicate_policy"
  ];
  function exportEventsCsv(events) {
    const rows = events.map((event) => {
      const values = eventToCsvRow(event);
      return CSV_HEADERS.map((header) => {
        const value = values[header];
        if (value === null || value === void 0) return "";
        if (typeof value === "number") return String(Number(value.toFixed(9)));
        const text = String(value);
        return typeof value === "string" && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
      });
    });
    return serializeCsv({ headers: CSV_HEADERS, rows });
  }

  // src/hypoglycemia-ui/source-state.ts
  function createSourceState() {
    return { primary: [], supplemental: null, revision: 0, latestGeneration: 0 };
  }
  function beginSourceImport(state2) {
    const token = state2.latestGeneration + 1;
    return { state: { ...state2, latestGeneration: token }, token };
  }
  function prepareSupplementalSource(source) {
    const table = parseCsv(source.text);
    const normalizedHeaders = table.headers.map((header) => header.toLowerCase());
    for (const required of ["series", "datetime_local", "value"]) {
      if (!normalizedHeaders.includes(required)) {
        throw new Error(`${source.name}: missing ${required} column.`);
      }
    }
    const seriesIndex = normalizedHeaders.indexOf("series");
    const originalRows = [];
    const rows = table.rows.filter((row, index) => {
      const keep = row[seriesIndex]?.trim().toLowerCase() !== "cgm";
      if (keep) originalRows.push(index + 2);
      return keep;
    });
    if (!rows.some((row) => row[seriesIndex]?.trim().toLowerCase() === "insulin")) {
      throw new Error(`${source.name}: no Insulin rows were found.`);
    }
    return {
      source,
      analysisFile: { name: source.name, text: serializeCsv({ headers: table.headers, rows }) },
      originalRows
    };
  }
  function commitSourceImport(state2, update) {
    if (update.token !== state2.latestGeneration) return state2;
    const source = {
      name: update.name,
      text: update.text,
      kind: update.kind,
      format: update.format,
      formatLabel: update.formatLabel ?? (update.format === "series" ? "Series CSV" : "Unsupported format")
    };
    if (update.kind === "supplemental") {
      if (update.format !== "series") throw new Error("Supplemental analysis sources must use Series CSV.");
      return { ...state2, supplemental: prepareSupplementalSource(source), revision: state2.revision + 1 };
    }
    return {
      ...state2,
      primary: update.merge ? [...state2.primary, source] : [source],
      supplemental: null,
      revision: state2.revision + 1
    };
  }
  function getUnsupportedPrimarySources(state2) {
    return state2.primary.filter((source) => source.format !== "series");
  }
  function getAnalysisFiles(state2) {
    return [
      ...state2.primary.filter((source) => source.format === "series").map(({ name, text }) => ({ name, text })),
      ...state2.supplemental ? [state2.supplemental.analysisFile] : []
    ];
  }

  // src/hypoglycemia-ui/chart.ts
  var markerStyle = {
    onset: { color: "#263646", dash: [] },
    nadir: { color: "#D55E00", dash: [] },
    recovery: { color: "#0072B2", dash: [6, 4] },
    recovery_unknown: { color: "#CC79A7", dash: [3, 4] },
    last_insulin: { color: "#6f42a6", dash: [2, 3] },
    first_zero: { color: "#6f42a6", dash: [6, 3] }
  };
  function fillRange(chart, from, to, color) {
    const left = Math.max(chart.chartArea.left, chart.scales.x.getPixelForValue(from));
    const right = Math.min(chart.chartArea.right, chart.scales.x.getPixelForValue(to));
    if (right <= left) return;
    chart.ctx.fillStyle = color;
    chart.ctx.fillRect(left, chart.chartArea.top, right - left, chart.chartArea.bottom - chart.chartArea.top);
  }
  function drawHatchedRange(chart, from, to) {
    const left = Math.max(chart.chartArea.left, chart.scales.x.getPixelForValue(from));
    const right = Math.min(chart.chartArea.right, chart.scales.x.getPixelForValue(to));
    if (right <= left) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
    ctx.clip();
    ctx.strokeStyle = "rgba(92, 105, 116, .18)";
    ctx.lineWidth = 1;
    for (let x = left - (chartArea.bottom - chartArea.top); x < right; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, chartArea.bottom);
      ctx.lineTo(x + chartArea.bottom - chartArea.top, chartArea.top);
      ctx.stroke();
    }
    ctx.restore();
  }
  function backgroundPlugin(model, panel) {
    return {
      id: `hypo-background-${panel}`,
      beforeDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        ctx.save();
        fillRange(chart, -360, -180, "rgba(0, 114, 178, .14)");
        fillRange(chart, -180, 0, "rgba(230, 159, 0, .16)");
        fillRange(chart, 0, model.eventShadeEnd, "rgba(204, 121, 167, .10)");
        if (panel === "insulin") model.missingInsulin.forEach((interval) => drawHatchedRange(chart, interval.from, interval.to));
        if (panel === "glucose") {
          [[70, "#E69F00", [7, 4]], [54, "#D55E00", [4, 4]]].forEach(([value, color, dash]) => {
            const y = scales.y.getPixelForValue(value);
            ctx.strokeStyle = color;
            ctx.setLineDash(dash);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.font = "11px sans-serif";
            ctx.fillText(`${value} mg/dL`, chartArea.right - 54, y - 4);
          });
        }
        ctx.restore();
      }
    };
  }
  function drawSymbol(ctx, x, y, kind) {
    ctx.save();
    ctx.strokeStyle = markerStyle[kind].color;
    ctx.fillStyle = kind === "first_zero" ? "#fff" : markerStyle[kind].color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (kind === "nadir") {
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
    } else if (kind === "last_insulin") {
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y + 5);
      ctx.lineTo(x - 6, y + 5);
      ctx.closePath();
    } else {
      ctx.arc(x, y, 5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  function markerPlugin(model, panel) {
    return {
      id: `hypo-markers-${panel}`,
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        ctx.save();
        const labelRightEdges = [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity, -Infinity];
        [...model.markers].sort((a, b) => a.x - b.x).forEach((marker) => {
          if (panel === "insulin" && !["onset", "recovery", "recovery_unknown", "last_insulin", "first_zero"].includes(marker.kind)) return;
          const x = scales.x.getPixelForValue(marker.x);
          const style = markerStyle[marker.kind];
          ctx.strokeStyle = style.color;
          ctx.setLineDash(style.dash);
          ctx.lineWidth = marker.kind === "onset" ? 2 : 1;
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          if (panel === "glucose") {
            ctx.setLineDash([]);
            ctx.fillStyle = style.color;
            ctx.font = "11px sans-serif";
            const width = ctx.measureText(marker.label).width;
            const labelX = Math.min(chartArea.right - width, Math.max(chartArea.left, x + 4));
            let row = labelRightEdges.findIndex((edge) => labelX > edge + 8);
            if (row < 0) row = labelRightEdges.indexOf(Math.min(...labelRightEdges));
            labelRightEdges[row] = labelX + width;
            ctx.fillText(marker.label, labelX, chartArea.top + 12 + row * 13);
            if (marker.kind === "nadir") {
              const point = model.glucose.find((item) => item.x === marker.x && item.y !== null);
              if (point?.y !== null && point?.y !== void 0) drawSymbol(ctx, x, scales.y.getPixelForValue(point.y), marker.kind);
            }
          } else if (marker.kind === "last_insulin" || marker.kind === "first_zero") {
            const point = [...model.insulin, ...model.explicitZeros].find((item) => Math.abs(item.x - marker.x) < 1e-3);
            drawSymbol(ctx, x, scales.y.getPixelForValue(point?.y ?? 0), marker.kind);
          }
        });
        if (panel === "glucose") drawAnnotations(chart, model.annotations);
        ctx.restore();
      }
    };
  }
  function drawAnnotations(chart, annotations) {
    const { ctx, chartArea, scales } = chart;
    annotations.forEach((annotation, index) => {
      const x = scales.x.getPixelForValue(annotation.x);
      const y = chartArea.bottom - 10 - index % 2 * 15;
      ctx.fillStyle = annotation.kind === "manual_pause" ? "#E69F00" : annotation.kind === "meal" ? "#0072B2" : "#667685";
      if (annotation.kind === "manual_pause") ctx.fillRect(x - 4, y - 4, 8, 8);
      else {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = "10px sans-serif";
      const label = annotation.label.length > 24 ? `${annotation.label.slice(0, 23)}\u2026` : annotation.label;
      const width = ctx.measureText(label).width;
      ctx.fillText(label, Math.min(chartArea.right - width, Math.max(chartArea.left, x + 6)), y + 3);
    });
  }
  function stemPlugin(model) {
    return {
      id: "hypo-insulin-stems",
      afterDatasetsDraw(chart) {
        const { ctx, scales } = chart;
        ctx.save();
        ctx.strokeStyle = "rgba(111, 66, 166, .65)";
        ctx.lineWidth = 1;
        model.insulin.forEach((point) => {
          const x = scales.x.getPixelForValue(point.x);
          ctx.beginPath();
          ctx.moveTo(x, scales.y.getPixelForValue(0));
          ctx.lineTo(x, scales.y.getPixelForValue(point.y ?? 0));
          ctx.stroke();
        });
        ctx.restore();
      }
    };
  }
  function pointDetails(context) {
    const point = context.raw;
    if (!point || typeof point.x !== "number" || !("clock" in point)) return [];
    const result = [`${context.dataset.label ?? "Value"}: ${point.y ?? "Unavailable"}`, `Source clock: ${point.clock}`];
    if (point.clock !== point.binClock) result.push(`Bin clock: ${point.binClock}`);
    point.records.forEach((record) => result.push(`${record.sourceFile}, row ${record.row}`));
    point.quality.forEach((quality) => result.push(quality.replace(/_/g, " ")));
    return result;
  }
  function chartOptions(model, panel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      layout: { padding: { left: 8, right: 12, top: panel === "glucose" ? 8 : 0 } },
      interaction: { mode: "nearest", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => pointDetails(context) } } },
      scales: {
        x: {
          type: "linear",
          min: model.bounds.leftMinutes,
          max: model.bounds.rightMinutes,
          title: { display: panel === "insulin", text: "Hours relative to onset" },
          ticks: {
            stepSize: 180,
            autoSkip: false,
            maxRotation: 0,
            callback: (value) => {
              const hours = Number(value) / 60;
              return `${hours > 0 ? "+" : ""}${hours}h`;
            }
          },
          grid: { color: "rgba(38, 54, 70, .08)" }
        },
        y: {
          beginAtZero: true,
          min: 0,
          max: panel === "glucose" ? model.bounds.glucoseMax : model.bounds.insulinMax,
          title: { display: true, text: panel === "glucose" ? "Glucose (mg/dL)" : "Insulin (U)" },
          afterFit: (axis) => {
            axis.width = 66;
          },
          grid: { color: "rgba(38, 54, 70, .08)" }
        }
      }
    };
  }
  function pointData(points) {
    return points;
  }
  var TimelineChartManager = class {
    constructor() {
      this.glucose = null;
      this.insulin = null;
    }
    clear() {
      this.glucose?.destroy();
      this.insulin?.destroy();
      this.glucose = this.insulin = null;
    }
    render(glucoseCanvas, insulinCanvas, model) {
      this.clear();
      const Chart = window.Chart;
      const glucoseContext = glucoseCanvas.getContext("2d");
      const insulinContext = insulinCanvas.getContext("2d");
      if (!Chart || !glucoseContext || !insulinContext) return;
      this.glucose = new Chart(glucoseContext, {
        type: "line",
        data: { datasets: [{
          label: "Glucose (mg/dL)",
          data: pointData(model.glucose),
          borderColor: "#2457A7",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          spanGaps: false,
          tension: 0
        }] },
        options: chartOptions(model, "glucose"),
        plugins: [backgroundPlugin(model, "glucose"), markerPlugin(model, "glucose")]
      });
      this.insulin = new Chart(insulinContext, {
        type: "scatter",
        data: { datasets: [
          { label: "Insulin (U)", data: pointData(model.insulin), borderColor: "#6f42a6", backgroundColor: "#6f42a6", pointRadius: 3 },
          { label: "Explicit zero delivery", data: pointData(model.explicitZeros), borderColor: "#263646", backgroundColor: "#fff", pointRadius: 3, pointStyle: "line" }
        ] },
        options: chartOptions(model, "insulin"),
        plugins: [backgroundPlugin(model, "insulin"), stemPlugin(model), markerPlugin(model, "insulin")]
      });
    }
  };

  // src/hypoglycemia-ui/view-model.ts
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function formatEventTime(value, basis) {
    if (value === null) return "Unknown";
    const { time } = parseTimestamp(value);
    const date = new Date(time);
    const label = `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
    return basis === "utc" ? `${label} UTC` : label;
  }
  function relativeMinutes(time, onset) {
    return (time - onset) / 6e4;
  }
  function roundedRightBoundary(observedMinutes) {
    return Math.max(120, Math.ceil((observedMinutes + 60) / 60) * 60);
  }
  function getCommonTimelineBounds(events, dataset) {
    const rightMinutes = events.reduce((maximum, event) => {
      const onset = parseTimestamp(event.startTime).time;
      const observed = relativeMinutes(parseTimestamp(event.endTime ?? event.observedThrough).time, onset);
      return Math.max(maximum, roundedRightBoundary(observed));
    }, 120);
    const maximumGlucose = dataset.bins.reduce((maximum, bin) => Math.max(maximum, bin.glucose ?? 0), 0);
    const maximumInsulin = dataset.bins.reduce((maximum, bin) => Math.max(maximum, bin.insulin ?? 0), 0);
    return {
      leftMinutes: -360,
      rightMinutes,
      glucoseMax: Math.max(250, Math.ceil(maximumGlucose / 50) * 50),
      insulinMax: Math.max(0.25, Math.ceil(maximumInsulin * 4) / 4)
    };
  }
  function buildMissingIntervals(dataset, onset, bounds) {
    const binByTime = new Map(dataset.bins.map((bin) => [bin.time, bin]));
    const intervals = [];
    let open = null;
    for (let x = bounds.leftMinutes; x <= bounds.rightMinutes; x += 5) {
      const time = onset + x * 6e4;
      const missing = binByTime.get(time)?.insulin == null;
      if (missing && open === null) open = x;
      if (!missing && open !== null) {
        intervals.push({ from: open, to: x });
        open = null;
      }
    }
    if (open !== null) intervals.push({ from: open, to: bounds.rightMinutes + 5 });
    return intervals;
  }
  function annotationLabel(record) {
    return record.metadata.annotation_text_clean || record.metadata.tooltip_text || record.eventType || record.series;
  }
  function buildTimelineModel(event, dataset, commonBounds) {
    const onset = parseTimestamp(event.startTime).time;
    const bounds = commonBounds;
    const inWindow = (time) => {
      const x = relativeMinutes(time, onset);
      return x >= bounds.leftMinutes && x <= bounds.rightMinutes;
    };
    const glucose = dataset.bins.filter((bin) => inWindow(bin.time)).map((bin) => ({
      x: relativeMinutes(bin.time, onset),
      y: bin.glucose,
      clock: formatEventTimeFromNumber(bin.time, dataset.timeBasis),
      binClock: formatEventTimeFromNumber(bin.time, dataset.timeBasis),
      records: bin.cgmRecords,
      quality: bin.warnings
    }));
    const insulinGroups = /* @__PURE__ */ new Map();
    dataset.bins.forEach((bin) => bin.insulinRecords.filter((record) => record.includedInAnalysis && record.value !== null).forEach((record) => {
      const time = record.reportedTime ?? record.time;
      if (!inWindow(time)) return;
      const group = insulinGroups.get(time) ?? { records: [], binTime: bin.time, quality: bin.warnings };
      group.records.push(record);
      insulinGroups.set(time, group);
    }));
    const insulin = [...insulinGroups.entries()].map(([time, group]) => ({
      x: relativeMinutes(time, onset),
      y: Number(group.records.reduce((sum, record) => sum + record.value, 0).toFixed(9)),
      clock: formatEventTimeFromNumber(time, dataset.timeBasis),
      binClock: formatEventTimeFromNumber(group.binTime, dataset.timeBasis),
      records: group.records,
      quality: group.quality
    })).sort((a, b) => a.x - b.x);
    const explicitZeros = insulin.filter((point) => point.y === 0);
    const positiveInsulin = insulin.filter((point) => point.y !== null && point.y > 0);
    const pauseTime2 = new Map(event.manualPauses.map((pause) => [`${pause.sourceFile}\0${pause.sourceTimestamp}`, parseTimestamp(pause.time).time]));
    const annotations = dataset.records.filter((record) => record.kind === "annotation").map((record) => {
      const pause = /^insulin paused$/i.test(record.eventType.trim());
      const time = pauseTime2.get(`${record.sourceFile}\0${record.sourceTimestamp}`) ?? record.time;
      if (!inWindow(time)) return null;
      const meal = /meal/i.test(record.series) || record.metadata.annotation_kind?.toLowerCase() === "meal";
      return {
        x: relativeMinutes(time, onset),
        label: pause ? "Manual pump pause" : annotationLabel(record),
        clock: formatEventTimeFromNumber(time, dataset.timeBasis),
        sourceFile: record.sourceFile,
        row: record.row,
        timing: pause && time !== record.time ? "annotation clock" : "source bin",
        kind: pause ? "manual_pause" : meal ? "meal" : "event"
      };
    }).filter((annotation) => annotation !== null);
    const markers = [
      { kind: "onset", x: 0, label: "Onset" },
      { kind: "nadir", x: relativeMinutes(parseTimestamp(event.nadirTime).time, onset), label: "Nadir" }
    ];
    if (event.endTime) markers.push({ kind: "recovery", x: relativeMinutes(parseTimestamp(event.endTime).time, onset), label: "Recovery" });
    else markers.push({ kind: "recovery_unknown", x: relativeMinutes(parseTimestamp(event.observedThrough).time, onset) + 5, label: "Recovery unknown" });
    if (event.lastInsulin) markers.push({ kind: "last_insulin", x: relativeMinutes(parseTimestamp(event.lastInsulin.time).time, onset), label: "Last delivery" });
    if (event.firstNoInsulin) markers.push({ kind: "first_zero", x: relativeMinutes(parseTimestamp(event.firstNoInsulin.time).time, onset), label: "First zero" });
    const offWindow = markers.filter((marker) => marker.x < bounds.leftMinutes || marker.x > bounds.rightMinutes).map((marker) => `${marker.label} is outside the displayed window (${marker.x < bounds.leftMinutes ? "before" : "after"}).`);
    return {
      bounds,
      timeBasis: dataset.timeBasis,
      glucose,
      insulin: positiveInsulin,
      explicitZeros,
      missingInsulin: buildMissingIntervals(dataset, onset, bounds),
      markers: markers.filter((marker) => marker.x >= bounds.leftMinutes && marker.x <= bounds.rightMinutes),
      annotations,
      eventShadeEnd: event.endTime ? relativeMinutes(parseTimestamp(event.endTime).time, onset) : relativeMinutes(parseTimestamp(event.observedThrough).time, onset) + 5,
      recoveryUnknown: event.endTime === null,
      offWindow
    };
  }
  function formatEventTimeFromNumber(time, basis) {
    const iso = new Date(time).toISOString();
    return formatEventTime(basis === "utc" ? iso : iso.slice(0, 19), basis);
  }
  function formatDose(value) {
    if (value === null) return "Unknown";
    return `${Number(value.toFixed(3))} U`;
  }
  function formatGlucose(value) {
    if (value === null) return "Unknown";
    return `${Number(value.toFixed(1))} mg/dL`;
  }
  function formatRoc(value) {
    if (value === null) return "Unknown";
    const rounded = Number(value.toFixed(2));
    return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)} mg/dL/min`;
  }
  function formatDuration(value) {
    return value === null ? "Unknown" : `${value} min`;
  }
  function presentWindow(stats, semantics) {
    const coverage = `${stats.presentBins}/${stats.expectedBins} bins (${Number(stats.coveragePct.toFixed(1))}%)`;
    if (semantics === "bolus_only") {
      return {
        value: stats.units === null ? "No observed bolus" : formatDose(stats.units),
        detail: `Bolus-only data \xB7 ${coverage}`,
        incomplete: false
      };
    }
    const incomplete = stats.presentBins < stats.expectedBins;
    return {
      value: stats.units === null ? "No observed insulin" : formatDose(stats.units),
      detail: `${incomplete ? "Incomplete coverage" : "Complete"} \xB7 ${coverage}`,
      incomplete
    };
  }
  function filterAndSortEvents(events, scope, key, direction) {
    const filtered = scope === "eligible" ? events.filter((event) => event.automatedAnalysisEligible) : scope === "manual" ? events.filter((event) => event.manualPauseAffected) : [...events];
    const value = (event) => key === "onset" ? event.startTime : key === "nadir" ? event.nadirGlucoseMgdl : event.durationMinutes;
    return filtered.map((event, index) => ({ event, index })).sort((left, right) => {
      const a = value(left.event);
      const b = value(right.event);
      if (a === null && b === null) return left.index - right.index;
      if (a === null) return 1;
      if (b === null) return -1;
      const comparison = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(a) - Number(b);
      return comparison === 0 ? left.index - right.index : comparison * (direction === "asc" ? 1 : -1);
    }).map((item) => item.event);
  }
  function reconcileSelectedEventId(displayed, selectedEventId) {
    if (selectedEventId && displayed.some((event) => event.eventId === selectedEventId)) return selectedEventId;
    return displayed[0]?.eventId ?? null;
  }
  var WARNING_LABELS = {
    manual_pump_pause_excluded_from_automated_analysis: "Manual pump pause overlaps the review window",
    manual_pause_time_uses_source_bin: "Manual pause uses source-bin time",
    timezone_unspecified_wall_clock_arithmetic: "Source timezone is unspecified",
    onset_may_precede_observation: "Event onset may precede observed data",
    recovery_not_confirmed: "Recovery was not confirmed",
    recovery_interrupted_by_missing_cgm: "Recovery was interrupted by missing CGM",
    dataset_ended_before_recovery: "Dataset ended before recovery",
    incomplete_insulin_6h: "Six-hour insulin coverage is incomplete",
    incomplete_insulin_3h: "Three-hour insulin coverage is incomplete",
    insulin_semantics_basal_bolus: "Insulin data include basal and bolus delivery",
    insulin_semantics_basal_only: "Insulin data include basal delivery only",
    insulin_semantics_bolus_only: "Insulin is interpreted as bolus only",
    onset_roc_unavailable: "Onset glucose rate of change is unavailable",
    last_insulin_is_last_observed_positive_only: "Last insulin is the last observed positive delivery only",
    incomplete_cgm_6h: "Six-hour CGM coverage is incomplete",
    cgm_bin_averaged: "Conflicting CGM observations were averaged",
    insulin_bin_summed: "Multiple insulin observations were summed"
  };
  function warningLabel(code) {
    return WARNING_LABELS[code] ?? code.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
  }
  function eventBadges(event) {
    const badges = [];
    if (event.level2) badges.push("Level 2");
    if (event.manualPauseAffected) badges.push("Manual pause");
    if (event.parameters.insulinSemantics !== "bolus_only" && (event.insulin3h.presentBins < event.insulin3h.expectedBins || event.insulin6h.presentBins < event.insulin6h.expectedBins)) badges.push("Incomplete insulin");
    if (event.quality.onsetTruncated) badges.push("Uncertain onset");
    if (event.quality.recoveryTruncated) badges.push("Recovery unknown");
    if (event.quality.warnings.includes("cgm_bin_averaged")) badges.push("Averaged CGM");
    if (event.quality.warnings.includes("insulin_bin_summed")) badges.push("Summed insulin");
    return badges;
  }
  function cessationLabel(value) {
    const labels = {
      confirmed_zero_bins_to_event: "Confirmed zero-delivery bins through onset",
      explicit_suspend_event: "Explicit suspend event",
      delivery_resumed: "Delivery resumed by onset",
      missing_insulin_bins: "Unknown because insulin bins are missing",
      not_applicable_bolus_only: "Not applicable to bolus-only data",
      unknown_source_semantics: "Unknown source interpretation",
      insufficient_data: "Insufficient data"
    };
    return labels[value];
  }

  // src/hypoglycemia-ui/view.ts
  function byId(id, constructor) {
    const element = document.getElementById(id);
    return element instanceof constructor ? element : null;
  }
  function getShellElements() {
    const root = byId("hypoglycemiaAnalysisWorkspace", HTMLElement);
    const runButton = byId("hypoAnalysisRun", HTMLButtonElement);
    const downloadButton = byId("hypoAnalysisDownload", HTMLButtonElement);
    const semantics = byId("hypoAnalysisSemantics", HTMLSelectElement);
    const scope = byId("hypoAnalysisScope", HTMLSelectElement);
    const sort = byId("hypoAnalysisSort", HTMLSelectElement);
    const sortDirection = byId("hypoAnalysisSortDirection", HTMLButtonElement);
    const status = byId("hypoAnalysisStatus", HTMLElement);
    const counts = byId("hypoAnalysisCounts", HTMLElement);
    const timing = byId("hypoAnalysisTiming", HTMLElement);
    const results = byId("hypoAnalysisResults", HTMLElement);
    const tableBody = byId("hypoAnalysisEventRows", HTMLTableSectionElement);
    const emptyResults = byId("hypoAnalysisEmptyResults", HTMLElement);
    const detail = byId("hypoAnalysisDetail", HTMLElement);
    const detailTitle = byId("hypoAnalysisDetailTitle", HTMLElement);
    const position = byId("hypoAnalysisPosition", HTMLElement);
    const previousButton = byId("hypoAnalysisPrevious", HTMLButtonElement);
    const nextButton = byId("hypoAnalysisNext", HTMLButtonElement);
    const badges = byId("hypoAnalysisBadges", HTMLElement);
    const metrics = byId("hypoAnalysisMetrics", HTMLElement);
    const quality = byId("hypoAnalysisQuality", HTMLElement);
    const sources = byId("hypoAnalysisSources", HTMLElement);
    const liveRegion = byId("hypoAnalysisLive", HTMLElement);
    const glucoseCanvas = byId("hypoAnalysisGlucoseChart", HTMLCanvasElement);
    const insulinCanvas = byId("hypoAnalysisInsulinChart", HTMLCanvasElement);
    const timeBasis = byId("hypoAnalysisTimeBasis", HTMLElement);
    const offWindow = byId("hypoAnalysisOffWindow", HTMLElement);
    const timelineDetails = byId("hypoAnalysisTimelineDetails", HTMLElement);
    if (!(root && runButton && downloadButton && semantics && scope && sort && sortDirection && status && counts && timing && results && tableBody && emptyResults && detail && detailTitle && position && previousButton && nextButton && badges && metrics && quality && sources && liveRegion && glucoseCanvas && insulinCanvas && timeBasis && offWindow && timelineDetails)) return null;
    return {
      root,
      runButton,
      downloadButton,
      semantics,
      scope,
      sort,
      sortDirection,
      status,
      counts,
      timing,
      results,
      tableBody,
      emptyResults,
      detail,
      detailTitle,
      position,
      previousButton,
      nextButton,
      badges,
      metrics,
      quality,
      sources,
      liveRegion,
      glucoseCanvas,
      insulinCanvas,
      timeBasis,
      offWindow,
      timelineDetails
    };
  }
  function appendText(parent, tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    parent.append(element);
    return element;
  }
  function renderBadges(container, event) {
    container.replaceChildren();
    const labels = eventBadges(event);
    if (!labels.length) labels.push("Level 1");
    labels.forEach((label) => appendText(container, "span", label, "hypo-analysis__badge"));
  }
  function addMetric(container, label, value, detail = "", incomplete = false) {
    const card = document.createElement("div");
    card.className = `hypo-analysis__metric${incomplete ? " hypo-analysis__metric--warning" : ""}`;
    appendText(card, "dt", label);
    appendText(card, "dd", value, "hypo-analysis__metric-value");
    if (detail) appendText(card, "dd", detail, "hypo-analysis__metric-detail");
    container.append(card);
  }
  function renderMetrics(container, event) {
    container.replaceChildren();
    addMetric(
      container,
      "Onset",
      formatEventTime(event.startTime, event.timeBasis),
      `${formatGlucose(event.onset.glucoseMgdl)} \xB7 ROC ${formatRoc(event.onset.rocMgdlPerMin)}`
    );
    addMetric(container, "Nadir", formatGlucose(event.nadirGlucoseMgdl), formatEventTime(event.nadirTime, event.timeBasis));
    addMetric(
      container,
      "Recovery",
      formatEventTime(event.endTime, event.timeBasis),
      event.endTime === null ? `Observed through ${formatEventTime(event.observedThrough, event.timeBasis)}` : formatDuration(event.durationMinutes),
      event.endTime === null
    );
    const windows = [
      ["Insulin 3 hours", event.insulin3h],
      ["Insulin 6 hours", event.insulin6h],
      ["Insulin 3\u20136 hours", event.insulin3To6h]
    ];
    windows.forEach(([label, stats]) => {
      const presented = presentWindow(stats, event.parameters.insulinSemantics);
      addMetric(container, label, presented.value, presented.detail, presented.incomplete);
    });
    if (event.lastInsulin) {
      addMetric(
        container,
        "Last observed delivery",
        formatDose(event.lastInsulin.units),
        `${formatEventTime(event.lastInsulin.time, event.timeBasis)} \xB7 bin ${formatDose(event.lastInsulin.binUnits)} \xB7 ${Number(event.lastInsulin.minutesBeforeEvent.toFixed(1))} min before onset`
      );
      addMetric(
        container,
        "Glucose at last delivery",
        formatGlucose(event.lastInsulin.glucoseMgdl),
        `ROC ${formatRoc(event.lastInsulin.rocMgdlPerMin)} \xB7 ${event.lastInsulin.timing === "reported_clock" ? "reported clock" : "source-bin time"}`
      );
    } else {
      const value = event.parameters.insulinSemantics === "bolus_only" ? "No observed bolus" : "No prior positive delivery observed";
      addMetric(container, "Last observed delivery", value, cessationLabel(event.cessationStatus));
    }
    if (event.firstNoInsulin) {
      addMetric(
        container,
        "First confirmed zero delivery",
        formatEventTime(event.firstNoInsulin.time, event.timeBasis),
        `${formatGlucose(event.firstNoInsulin.glucoseMgdl)} \xB7 ROC ${formatRoc(event.firstNoInsulin.rocMgdlPerMin)}`
      );
    } else {
      addMetric(
        container,
        "First confirmed zero delivery",
        event.cessationStatus === "not_applicable_bolus_only" ? "Not applicable" : "Unknown",
        cessationLabel(event.cessationStatus)
      );
    }
    addMetric(
      container,
      "CGM coverage before onset",
      `${Number(event.quality.cgmCoverage6hPct.toFixed(1))}%`,
      `Maximum gap: ${event.quality.maxCgmGapMinutes} min`
    );
    addMetric(
      container,
      "Automated-pump review",
      event.automatedAnalysisEligible ? "Eligible" : "Not eligible",
      event.manualPauseAffected ? "A documented manual pause overlaps the review window." : event.parameters.insulinSemantics === "bolus_only" ? "Automated-pump review requires basal delivery data." : "No overlapping manual pause is documented."
    );
  }
  function renderDetails(elements2, model) {
    const event = model.selectedEvent;
    elements2.detail.classList.toggle("hidden", !event);
    if (!event) return;
    elements2.detailTitle.textContent = `Event ${formatEventTime(event.startTime, event.timeBasis)}`;
    elements2.position.textContent = `${model.selectedIndex + 1} of ${model.displayedEvents.length}`;
    elements2.previousButton.disabled = model.selectedIndex <= 0;
    elements2.nextButton.disabled = model.selectedIndex < 0 || model.selectedIndex >= model.displayedEvents.length - 1;
    renderBadges(elements2.badges, event);
    elements2.timeBasis.textContent = event.timeBasis === "utc" ? "Clock labels are shown in UTC. The x-axis is hours relative to onset." : "Clock labels preserve the source\u2019s unspecified local wall clock. The x-axis is hours relative to onset.";
    elements2.offWindow.replaceChildren();
    elements2.offWindow.classList.toggle("hidden", !model.timeline?.offWindow.length);
    model.timeline?.offWindow.forEach((message) => appendText(elements2.offWindow, "p", message));
    renderTimelineDetails(elements2.timelineDetails, model.timeline);
    renderMetrics(elements2.metrics, event);
    elements2.quality.replaceChildren();
    if (event.quality.warnings.length) {
      const list = document.createElement("ul");
      event.quality.warnings.forEach((warning) => appendText(list, "li", warningLabel(warning)));
      elements2.quality.append(list);
    } else appendText(elements2.quality, "p", "No event-level quality warnings.");
    elements2.sources.replaceChildren();
    const insulinType = event.parameters.insulinSemantics === "basal_bolus" ? "Basal and bolus" : event.parameters.insulinSemantics === "basal_only" ? "Basal only" : "Bolus only";
    appendText(elements2.sources, "p", `Analysis ${event.analysisVersion} \xB7 ${insulinType} \xB7 ${event.timeBasis === "utc" ? "UTC" : "unspecified local wall clock"}`);
    appendText(elements2.sources, "p", `CGM: ${event.sourceCgmFiles.join(", ") || "None"}`);
    appendText(elements2.sources, "p", `Insulin: ${event.sourceInsulinFiles.join(", ") || "None"}`);
    event.manualPauses.forEach((pause) => appendText(
      elements2.sources,
      "p",
      `Manual pump pause: ${formatEventTime(pause.time, event.timeBasis)} \xB7 ${pause.sourceFile} \xB7 ${pause.timing.replace(/_/g, " ")}`
    ));
  }
  function renderTimelineDetails(container, timeline) {
    container.replaceChildren();
    if (!timeline) return;
    const presentGlucose = timeline.glucose.filter((point) => point.y !== null).length;
    appendText(container, "p", `${presentGlucose}/${timeline.glucose.length} visible CGM bins \xB7 ${timeline.insulin.length} positive insulin clock groups \xB7 ${timeline.explicitZeros.length} explicit zero groups \xB7 ${timeline.missingInsulin.length} missing-insulin intervals.`);
    if (timeline.annotations.length) {
      appendText(container, "h5", "Annotations");
      const annotations = document.createElement("ul");
      timeline.annotations.forEach((annotation) => appendText(
        annotations,
        "li",
        `${annotation.label} \xB7 ${annotation.clock} \xB7 ${annotation.timing} \xB7 ${annotation.sourceFile}, row ${annotation.row}`
      ));
      container.append(annotations);
    }
    if (timeline.insulin.length) {
      appendText(container, "h5", "Positive insulin observations");
      const insulin = document.createElement("ul");
      timeline.insulin.forEach((point) => appendText(
        insulin,
        "li",
        `${formatDose(point.y)} \xB7 ${point.clock}${point.clock === point.binClock ? "" : ` \xB7 bin ${point.binClock}`} \xB7 ${point.records.map((record) => `${record.sourceFile}, row ${record.row}`).join("; ")}`
      ));
      container.append(insulin);
    }
  }
  function renderRows(elements2, model, actions) {
    elements2.tableBody.replaceChildren();
    model.displayedEvents.forEach((event) => {
      const row = document.createElement("tr");
      if (event.eventId === model.selectedEvent?.eventId) {
        row.classList.add("is-selected");
        row.setAttribute("aria-current", "true");
      }
      const onsetCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hypo-analysis__event-select";
      button.textContent = formatEventTime(event.startTime, event.timeBasis);
      button.setAttribute("aria-label", `Select event ${formatEventTime(event.startTime, event.timeBasis)}`);
      button.addEventListener("click", () => actions.selectEvent(event.eventId));
      onsetCell.append(button);
      row.append(onsetCell);
      appendText(row, "td", String(Number(event.nadirGlucoseMgdl.toFixed(1))));
      appendText(row, "td", event.durationMinutes === null ? "Unknown" : String(event.durationMinutes));
      appendText(row, "td", eventBadges(event).slice(0, 2).join(", ") || "Level 1");
      elements2.tableBody.append(row);
    });
  }
  function renderShell(elements2, model, actions) {
    elements2.root.classList.toggle("hidden", !model.active);
    elements2.root.dataset.status = model.status;
    elements2.semantics.value = model.semantics;
    elements2.scope.value = model.scope;
    elements2.sort.value = model.sortKey;
    elements2.sortDirection.textContent = model.sortDirection === "asc" ? "Ascending" : "Descending";
    elements2.sortDirection.setAttribute("aria-label", `Sort ${model.sortDirection}; activate to reverse`);
    elements2.runButton.disabled = !["ready", "success", "error"].includes(model.status);
    elements2.runButton.textContent = model.status === "running" ? "Running analysis\u2026" : "Run analysis";
    elements2.downloadButton.disabled = model.status !== "success";
    elements2.downloadButton.textContent = `Download ${model.status === "success" ? model.displayedEvents.length : 0} events CSV`;
    elements2.status.textContent = model.message;
    elements2.counts.textContent = model.status === "success" ? `${model.detected} detected \xB7 ${model.eligible} eligible \xB7 ${model.displayedEvents.length} shown` : "\u2014 detected \xB7 \u2014 eligible \xB7 \u2014 shown";
    elements2.timing.textContent = model.durationMs === null ? "" : `Analyzed in ${Math.round(model.durationMs)} ms`;
    elements2.results.classList.toggle("hidden", model.status !== "success");
    const empty = model.status === "success" && model.displayedEvents.length === 0;
    elements2.emptyResults.classList.toggle("hidden", !empty);
    elements2.emptyResults.textContent = empty ? "No events match this scope. Choose All events to review the complete result set." : "";
    renderRows(elements2, model, actions);
    renderDetails(elements2, model);
  }

  // src/hypoglycemia-ui/controller.ts
  var elements = null;
  var initialized = false;
  var state = {
    active: false,
    status: "inactive",
    message: "Load a compatible Series CSV to begin.",
    sources: createSourceState(),
    semantics: "basal_bolus",
    scope: "all",
    dataset: null,
    datasetRevision: null,
    events: [],
    displayedEventIds: [],
    selectedEventId: null,
    sortKey: "onset",
    sortDirection: "asc",
    commonTimelineBounds: null,
    analyzedSemantics: null,
    durationMs: null
  };
  var timelineCharts = new TimelineChartManager();
  var overviewSelectionListener = null;
  function displayedEvents() {
    return filterAndSortEvents(state.events, state.scope, state.sortKey, state.sortDirection);
  }
  function syncDerivedSelection() {
    const displayed = displayedEvents();
    state.displayedEventIds = displayed.map((event) => event.eventId);
    state.selectedEventId = reconcileSelectedEventId(displayed, state.selectedEventId);
    return displayed;
  }
  function announceSelection(event, index, total) {
    if (!elements) return;
    elements.liveRegion.textContent = event ? `Selected event ${index + 1} of ${total}, onset ${event.startTime}.` : "";
  }
  function selectEvent(eventId) {
    const displayed = syncDerivedSelection();
    const index = displayed.findIndex((event) => event.eventId === eventId);
    if (index < 0) return;
    state.selectedEventId = eventId;
    render();
    announceSelection(displayed[index], index, displayed.length);
  }
  function navigateSelection(change) {
    const displayed = syncDerivedSelection();
    const index = displayed.findIndex((event) => event.eventId === state.selectedEventId);
    const nextIndex = index + change;
    if (nextIndex < 0 || nextIndex >= displayed.length) return;
    selectEvent(displayed[nextIndex].eventId);
  }
  function downloadDisplayedEvents() {
    if (state.status !== "success") return;
    const events = syncDerivedSelection();
    const url = URL.createObjectURL(new Blob([exportEventsCsv(events)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `hypoglycemia-events-${state.scope}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function render() {
    if (!elements) return;
    const displayed = syncDerivedSelection();
    const selectedIndex = displayed.findIndex((event) => event.eventId === state.selectedEventId);
    const selectedEvent = selectedIndex < 0 ? null : displayed[selectedIndex];
    const timeline = state.active && state.status === "success" && selectedEvent && state.dataset && state.commonTimelineBounds ? buildTimelineModel(selectedEvent, state.dataset, state.commonTimelineBounds) : null;
    renderShell(elements, {
      active: state.active,
      status: state.status,
      message: state.message,
      semantics: state.semantics,
      scope: state.scope,
      detected: state.events.length,
      eligible: state.events.filter((event) => event.automatedAnalysisEligible).length,
      displayedEvents: displayed,
      selectedEvent,
      selectedIndex,
      sortKey: state.sortKey,
      sortDirection: state.sortDirection,
      timeline,
      durationMs: state.durationMs
    }, { selectEvent });
    if (timeline) timelineCharts.render(elements.glucoseCanvas, elements.insulinCanvas, timeline);
    else timelineCharts.clear();
    overviewSelectionListener?.(state.active && state.status === "success" && selectedEvent && state.dataset ? {
      eventId: selectedEvent.eventId,
      startTime: selectedEvent.startTime,
      datasetStartTime: formatTimestamp(state.dataset.bins[0].time, state.dataset.timeBasis),
      datasetEndTime: formatTimestamp(state.dataset.bins[state.dataset.bins.length - 1].time, state.dataset.timeBasis),
      timeBasis: selectedEvent.timeBasis
    } : null);
  }
  function invalidateResults() {
    state.dataset = null;
    state.datasetRevision = null;
    state.events = [];
    state.displayedEventIds = [];
    state.selectedEventId = null;
    state.commonTimelineBounds = null;
    state.analyzedSemantics = null;
    state.durationMs = null;
    const unsupported = getUnsupportedPrimarySources(state.sources);
    if (!state.sources.primary.length) {
      state.status = state.active ? "empty" : "inactive";
      state.message = "Load a primary Series CSV with CGM rows to begin.";
    } else if (unsupported.length) {
      state.status = "unsupported";
      state.message = `Hypoglycemia Analysis supports Series CSV only. Replace the unsupported primary source${unsupported.length === 1 ? "" : "s"}: ${unsupported.map((source) => `${source.name} (${source.formatLabel})`).join(", ")}.`;
    } else {
      state.status = "ready";
      state.message = "Source data changed. Confirm the insulin delivery type, then run the analysis.";
    }
  }
  async function runAnalysis() {
    if (!["ready", "success", "error"].includes(state.status)) return;
    const sourceRevision = state.sources.revision;
    state.status = "running";
    state.message = "Analyzing the full retained dataset\u2026";
    state.durationMs = null;
    render();
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const started = performance.now();
    try {
      if (state.datasetRevision !== sourceRevision || !state.dataset) {
        state.dataset = normalizeSeriesCsv(getAnalysisFiles(state.sources));
        state.datasetRevision = sourceRevision;
      }
      const events = analyzeHypoglycemia(state.dataset, { insulinSemantics: state.semantics });
      if (state.sources.revision !== sourceRevision) return;
      state.events = events;
      state.commonTimelineBounds = getCommonTimelineBounds(events, state.dataset);
      const displayed = syncDerivedSelection();
      state.analyzedSemantics = state.semantics;
      state.durationMs = performance.now() - started;
      state.status = "success";
      state.message = "Analysis complete. Review counts reflect the selected event scope.";
      const selectedIndex = displayed.findIndex((event) => event.eventId === state.selectedEventId);
      announceSelection(selectedIndex < 0 ? null : displayed[selectedIndex], selectedIndex, displayed.length);
    } catch (error) {
      if (state.sources.revision !== sourceRevision) return;
      state.events = [];
      state.displayedEventIds = [];
      state.selectedEventId = null;
      state.commonTimelineBounds = null;
      state.analyzedSemantics = null;
      state.durationMs = performance.now() - started;
      state.status = "error";
      state.message = error instanceof Error ? error.message : "Analysis failed.";
    }
    render();
  }
  function initialize() {
    if (initialized) return;
    elements = getShellElements();
    if (!elements) return;
    initialized = true;
    elements.runButton.addEventListener("click", () => {
      void runAnalysis();
    });
    elements.downloadButton.addEventListener("click", downloadDisplayedEvents);
    elements.previousButton.addEventListener("click", () => navigateSelection(-1));
    elements.nextButton.addEventListener("click", () => navigateSelection(1));
    elements.semantics.addEventListener("change", () => {
      state.semantics = elements.semantics.value;
      state.scope = "all";
      state.events = [];
      state.displayedEventIds = [];
      state.selectedEventId = null;
      state.commonTimelineBounds = null;
      state.analyzedSemantics = null;
      state.durationMs = null;
      if (getUnsupportedPrimarySources(state.sources).length) state.status = "unsupported";
      else if (state.sources.primary.length) state.status = "ready";
      else state.status = state.active ? "empty" : "inactive";
      state.message = state.sources.primary.length ? "Insulin delivery type changed. Run the analysis to refresh results." : "Load a primary Series CSV with CGM rows to begin.";
      render();
    });
    elements.scope.addEventListener("change", () => {
      state.scope = elements.scope.value;
      const displayed = syncDerivedSelection();
      render();
      const index = displayed.findIndex((event) => event.eventId === state.selectedEventId);
      announceSelection(index < 0 ? null : displayed[index], index, displayed.length);
    });
    elements.sort.addEventListener("change", () => {
      state.sortKey = elements.sort.value;
      render();
    });
    elements.sortDirection.addEventListener("click", () => {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      render();
    });
    document.addEventListener("keydown", (event) => {
      if (!state.active || state.status !== "success" || event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea" || target?.isContentEditable) return;
      navigateSelection(event.key === "ArrowLeft" ? -1 : 1);
      event.preventDefault();
    });
    render();
  }
  var bridge = {
    initialize,
    beginImport(_kind) {
      const begun = beginSourceImport(state.sources);
      state.sources = begun.state;
      return begun.token;
    },
    commitImport(update) {
      try {
        const next = commitSourceImport(state.sources, update);
        if (next === state.sources) return;
        state.sources = next;
        invalidateResults();
      } catch (error) {
        state.status = "error";
        state.message = error instanceof Error ? error.message : "Unable to prepare the analysis source.";
      }
      render();
    },
    setActive(active) {
      if (state.active === active) return;
      state.active = active;
      document.body.classList.toggle("hypo-analysis-active", active);
      if (active && state.status === "inactive") invalidateResults();
      render();
    },
    isActive() {
      return state.active;
    },
    setOverviewSelectionListener(listener) {
      overviewSelectionListener = listener;
      render();
    }
  };
  window.HypoglycemiaReview = bridge;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
  return __toCommonJS(controller_exports);
})();
