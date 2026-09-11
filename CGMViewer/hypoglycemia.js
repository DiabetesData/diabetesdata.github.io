"use strict";
var HypoglycemiaAnalysis = (() => {
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

  // src/hypoglycemia/index.ts
  var index_exports = {};
  __export(index_exports, {
    ANALYSIS_VERSION: () => ANALYSIS_VERSION,
    BIN_MS: () => BIN_MS,
    CSV_HEADERS: () => CSV_HEADERS,
    DEFAULT_PARAMETERS: () => DEFAULT_PARAMETERS,
    analyzeHypoglycemia: () => analyzeHypoglycemia,
    eventToCsvRow: () => eventToCsvRow,
    exportEventsCsv: () => exportEventsCsv,
    formatTimestamp: () => formatTimestamp,
    getManualPauses: () => getManualPauses,
    normalizeSeriesCsv: () => normalizeSeriesCsv,
    parseTimestamp: () => parseTimestamp
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
  return __toCommonJS(index_exports);
})();
