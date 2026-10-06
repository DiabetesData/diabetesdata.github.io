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
    DAILY_CSV_HEADERS: () => DAILY_CSV_HEADERS,
    DAILY_SUMMARY_VERSION: () => DAILY_SUMMARY_VERSION,
    DEFAULT_PARAMETERS: () => DEFAULT_PARAMETERS,
    PUMP_MEAL_REPORT_CSV_HEADERS: () => PUMP_MEAL_REPORT_CSV_HEADERS,
    PUMP_MEAL_REPORT_POLICY_VERSION: () => PUMP_MEAL_REPORT_POLICY_VERSION,
    analyzeHypoglycemia: () => analyzeHypoglycemia,
    eventToCsvRow: () => eventToCsvRow,
    exportDailySummariesCsv: () => exportDailySummariesCsv,
    exportEventsCsv: () => exportEventsCsv,
    exportPumpMealReportsCsv: () => exportPumpMealReportsCsv,
    extractPumpMealReports: () => extractPumpMealReports,
    formatTimestamp: () => formatTimestamp,
    getManualPauses: () => getManualPauses,
    isPumpMealRecord: () => isPumpMealRecord,
    normalizePumpMealSize: () => normalizePumpMealSize,
    normalizeSeriesCsv: () => normalizeSeriesCsv,
    parseTimestamp: () => parseTimestamp,
    summarizeHypoglycemiaDays: () => summarizeHypoglycemiaDays
  });

  // src/hypoglycemia/types.ts
  var BIN_MS = 5 * 6e4;
  var ANALYSIS_VERSION = "hypo-v5";

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
    if (records.every((row) => row.length === 1)) {
      const innerHeaders = records[0][0].split(",").map((header) => header.trim().toLowerCase());
      if (["series", "datetime_local", "value"].every((header) => innerHeaders.includes(header))) {
        return parseCsv(records.map((row) => row[0]).join("\r\n"));
      }
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
      const normalized2 = String(value ?? "");
      if (/[",\r\n]/.test(normalized2)) {
        return `"${normalized2.replace(/"/g, '""')}"`;
      }
      return normalized2;
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
    const candidate2 = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (candidate2.getUTCFullYear() !== parts.year || candidate2.getUTCMonth() !== parts.month - 1 || candidate2.getUTCDate() !== parts.day) {
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
  function annotationIdentity(record) {
    return record.eventType.trim().toLowerCase();
  }
  function annotationDetailScore(record) {
    const metadata = record.metadata;
    return (metadata.annotation_text_clean?.trim() ? 3 : 0) + (metadata.tooltip_text?.trim() ? 3 : 0) + (metadata.annotation_text_raw?.trim() ? 1 : 0) + (record.eventType.trim() ? 2 : 0) + (metadata.event_time_text?.trim() ? 2 : 0) + (record.reportedTime !== null ? 4 : 0) + (metadata.source_point_index?.trim() ? 1 : 0);
  }
  function duplicateAnnotation(left, right) {
    const identity = annotationIdentity(left);
    if (!identity || identity !== annotationIdentity(right)) return false;
    if (left.time === right.time) return true;
    if (left.reportedTime !== null && right.reportedTime !== null && left.reportedTime === right.reportedTime) return true;
    const hasPreciseMetadata = left.reportedTime !== null || right.reportedTime !== null || !!left.metadata.event_time_text?.trim() || !!right.metadata.event_time_text?.trim();
    return hasPreciseMetadata && Math.floor(left.time / BIN_MS) === Math.floor(right.time / BIN_MS);
  }
  function markSupersededAnnotations(records) {
    const selected = [];
    let duplicateCount = 0;
    for (const record of records) {
      if (record.kind !== "annotation" || !annotationIdentity(record)) continue;
      const duplicateIndex = selected.findIndex((existing2) => duplicateAnnotation(existing2, record));
      if (duplicateIndex < 0) {
        selected.push(record);
        continue;
      }
      duplicateCount++;
      const existing = selected[duplicateIndex];
      if (annotationDetailScore(record) > annotationDetailScore(existing)) {
        existing.includedInAnalysis = false;
        selected[duplicateIndex] = record;
      } else {
        record.includedInAnalysis = false;
      }
    }
    return duplicateCount;
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
        const series = row.series.trim();
        const kind = series.toLowerCase() === "cgm" ? "cgm" : series.toLowerCase() === "insulin" ? "insulin" : "annotation";
        let reportedTime = null;
        if (row.reported_datetime_local?.trim()) {
          try {
            const reported = parseTimestamp(row.reported_datetime_local);
            if (reported.basis !== parsed.basis || reported.time < parsed.time || reported.time >= parsed.time + BIN_MS) throw new Error();
            reportedTime = reported.time;
          } catch {
            if (kind !== "annotation") throw new Error(`${file.name}, row ${index + 2}: invalid reported_datetime_local or outside its source bin.`);
            warnings.add("invalid_annotation_reported_datetime_uses_source_timestamp");
          }
        }
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
    const duplicateAnnotationRows = markSupersededAnnotations(records);
    if (duplicateAnnotationRows) warnings.add("duplicate_annotations_preferred_richer");
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
    return dataset.records.filter((record) => record.kind === "annotation" && record.includedInAnalysis && /^insulin paused$/i.test(record.eventType.trim())).map((record) => ({ record, ...pauseTime(record) })).sort((a, b) => a.time - b.time).filter((pause) => {
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
        outside6h: start - lastPositive > 72,
        priorContext: (() => {
          const glucoseBin = binAt(lastPositive - 1);
          const rocStartBin = binAt(lastPositive - 2);
          const contextWarnings = /* @__PURE__ */ new Set();
          glucoseBin?.warnings.forEach((warning) => contextWarnings.add(warning));
          rocStartBin?.warnings.forEach((warning) => contextWarnings.add(warning));
          if (!glucoseBin || glucoseBin.glucose === null) contextWarnings.add("prior_delivery_glucose_unavailable");
          if (!rocStartBin || rocStartBin.glucose === null || !glucoseBin || glucoseBin.glucose === null) {
            contextWarnings.add("prior_delivery_roc_unavailable");
          }
          const deliveryTime = bins[lastPositive].time;
          return {
            method: "previous_source_bin_v1",
            glucoseBinTime: format(deliveryTime - BIN_MS),
            glucoseMgdl: glucoseBin?.glucose ?? null,
            rocStartBinTime: format(deliveryTime - 2 * BIN_MS),
            rocEndBinTime: format(deliveryTime - BIN_MS),
            rocMgdlPerMin: glucoseBin?.glucose == null || rocStartBin?.glucose == null ? null : (glucoseBin.glucose - rocStartBin.glucose) / 5,
            glucoseBinToDeliveryMinutes: 5,
            glucoseSourceTimestamps: [...new Set(glucoseBin?.cgmRecords.map((record) => record.sourceTimestamp) ?? [])],
            rocStartSourceTimestamps: [...new Set(rocStartBin?.cgmRecords.map((record) => record.sourceTimestamp) ?? [])],
            qualityWarnings: [...contextWarnings].sort()
          };
        })()
      } : null;
      if (lastInsulin) {
        const positive = bins[lastPositive].insulinRecords.filter((record) => record.includedInAnalysis && record.value > 0);
        if (positive.length && positive.every((record) => record.reportedTime !== null)) {
          const latest = Math.max(...positive.map((record) => record.reportedTime));
          lastInsulin.time = format(latest);
          lastInsulin.timing = "reported_clock";
          lastInsulin.units = Number(positive.filter((record) => record.reportedTime === latest).reduce((sum, record) => sum + record.value, 0).toFixed(9));
          lastInsulin.minutesBeforeEvent = (bins[start].time - latest) / 6e4;
          lastInsulin.priorContext.glucoseBinToDeliveryMinutes = (latest - (bins[lastPositive].time - BIN_MS)) / 6e4;
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
      lastInsulin?.priorContext.qualityWarnings.forEach((warning) => warnings.add(warning));
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
      pre_last_insulin_method: last?.priorContext.method ?? null,
      pre_last_insulin_glucose_bin_time: last?.priorContext.glucoseBinTime ?? null,
      pre_last_insulin_glucose_mgdl: last?.priorContext.glucoseMgdl ?? null,
      pre_last_insulin_roc_start_bin_time: last?.priorContext.rocStartBinTime ?? null,
      pre_last_insulin_roc_end_bin_time: last?.priorContext.rocEndBinTime ?? null,
      pre_last_insulin_roc_mgdl_per_min: last?.priorContext.rocMgdlPerMin ?? null,
      pre_last_insulin_glucose_bin_to_delivery_minutes: last?.priorContext.glucoseBinToDeliveryMinutes ?? null,
      pre_last_insulin_glucose_source_timestamps: last?.priorContext.glucoseSourceTimestamps.join("; ") ?? null,
      pre_last_insulin_roc_start_source_timestamps: last?.priorContext.rocStartSourceTimestamps.join("; ") ?? null,
      pre_last_insulin_quality_warnings: last?.priorContext.qualityWarnings.join("; ") ?? null,
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
    "pre_last_insulin_method",
    "pre_last_insulin_glucose_bin_time",
    "pre_last_insulin_glucose_mgdl",
    "pre_last_insulin_roc_start_bin_time",
    "pre_last_insulin_roc_end_bin_time",
    "pre_last_insulin_roc_mgdl_per_min",
    "pre_last_insulin_glucose_bin_to_delivery_minutes",
    "pre_last_insulin_glucose_source_timestamps",
    "pre_last_insulin_roc_start_source_timestamps",
    "pre_last_insulin_quality_warnings",
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

  // src/pump-meals/types.ts
  var PUMP_MEAL_REPORT_POLICY_VERSION = "pump-meal-reports-v1";

  // src/pump-meals/extract.ts
  function clean(value) {
    return (value ?? "").trim();
  }
  function normalized(value) {
    return clean(value).toLowerCase().replace(/[\s_-]+/g, " ");
  }
  function isPumpMealRecord(record) {
    return record.series.toLowerCase().includes("meal announcement") || normalized(record.metadata.annotation_kind) === "meal";
  }
  function normalizePumpMealSize(value) {
    const key = normalized(value);
    if (key === "less than usual") return "less_than_usual";
    if (key === "usual") return "usual";
    if (key === "more than usual") return "more_than_usual";
    if (key === "small") return "small";
    if (key === "medium") return "medium";
    if (key === "large") return "large";
    return "unknown";
  }
  function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function candidate(record) {
    const metadata = record.metadata;
    const mealType = clean(metadata.meal_type);
    const rawSize = clean(metadata.meal_size_descriptor);
    const size = normalizePumpMealSize(rawSize);
    const descriptiveLabel = [metadata.tooltip_text, metadata.annotation_text_clean, metadata.annotation_text_raw].map(clean).find(Boolean);
    const label = descriptiveLabel || [mealType, rawSize].filter(Boolean).join(", ") || "Reported meal";
    const traceIndex = clean(metadata.source_trace_index);
    const traceName = clean(metadata.source_trace_name);
    const pointIndex = clean(metadata.source_point_index);
    const pointIdentity = pointIndex ? JSON.stringify([traceIndex, traceName, pointIndex]) : "";
    const effectiveTime = record.reportedTime ?? record.time;
    const warnings = [];
    if (record.reportedTime === null) warnings.push(clean(metadata.reported_datetime_local) ? "invalid_reported_timestamp_source_fallback" : "source_timestamp_fallback");
    if (size === "unknown") warnings.push(rawSize ? "unrecognized_size_descriptor" : "missing_size_descriptor");
    return {
      record,
      effectiveTime,
      mealType,
      rawSize,
      size,
      label,
      pointIdentity,
      contentIdentity: JSON.stringify([record.time, normalized(mealType), normalized(rawSize), normalized(label)]),
      detailScore: (record.reportedTime === null ? 0 : 8) + (pointIndex ? 4 : 0) + (mealType ? 2 : 0) + (rawSize ? 2 : 0) + (label === "Reported meal" ? 0 : 3),
      warnings
    };
  }
  function compatibleType(left, right) {
    return !left.mealType || !right.mealType || normalized(left.mealType) === normalized(right.mealType);
  }
  function duplicateAcrossSources(left, right) {
    if (left.record.sourceFileIndex === right.record.sourceFileIndex) return false;
    if (left.pointIdentity && right.pointIdentity && left.pointIdentity === right.pointIdentity) return true;
    if (!compatibleType(left, right)) return false;
    if (left.record.reportedTime !== null && right.record.reportedTime !== null)
      return left.record.reportedTime === right.record.reportedTime;
    if (left.contentIdentity === right.contentIdentity) return true;
    return Math.floor(left.record.time / BIN_MS) === Math.floor(right.record.time / BIN_MS) && (left.record.reportedTime !== null || right.record.reportedTime !== null) && normalized(left.mealType) !== "" && normalized(left.mealType) === normalized(right.mealType);
  }
  function sourceReference(item) {
    const metadata = item.record.metadata;
    return {
      sourceFile: item.record.sourceFile,
      sourceFileIndex: item.record.sourceFileIndex,
      row: item.record.row,
      sourceTimestamp: item.record.sourceTimestamp,
      sourceTraceIndex: clean(metadata.source_trace_index) || null,
      sourceTraceName: clean(metadata.source_trace_name) || null,
      sourcePointIndex: clean(metadata.source_point_index) || null
    };
  }
  function mergeGroup(group, timeBasis) {
    const ranked = [...group].sort((a, b) => b.detailScore - a.detailScore || a.effectiveTime - b.effectiveTime || a.record.sourceFile.localeCompare(b.record.sourceFile) || a.record.row - b.record.row);
    const selected = ranked[0];
    const typeValues = [...new Set(group.map((item) => clean(item.mealType)).filter(Boolean))];
    const sizeValues = [...new Set(group.map((item) => clean(item.rawSize)).filter(Boolean))];
    const conflictDetails = [];
    if (typeValues.map((value) => normalized(value)).filter((value, index, all) => all.indexOf(value) === index).length > 1)
      conflictDetails.push("conflicting_meal_type");
    if (sizeValues.map((value) => normalizePumpMealSize(value)).filter((value, index, all) => all.indexOf(value) === index).length > 1)
      conflictDetails.push("conflicting_size_descriptor");
    const normalizedSize = conflictDetails.includes("conflicting_size_descriptor") ? "unknown" : selected.size;
    const effectiveTimes = [...new Set(group.map((item) => item.effectiveTime))];
    if (effectiveTimes.length > 1) conflictDetails.push("merged_source_and_precise_times");
    const identity = JSON.stringify([
      selected.effectiveTime,
      normalized(selected.mealType),
      normalizedSize,
      group.map((item) => item.pointIdentity || item.contentIdentity).sort()
    ]);
    const sourceReferences = group.map(sourceReference).sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.row - b.row);
    const warnings = [...new Set(group.flatMap((item) => item.warnings).concat(conflictDetails))].sort();
    return {
      reportId: `pump-meal-${stableHash(identity)}`,
      sourceReferences,
      sourceTimestamp: selected.record.sourceTimestamp,
      reportedTimestamp: selected.record.reportedTime === null ? null : formatTimestamp(selected.record.reportedTime, timeBasis),
      effectiveTimestamp: formatTimestamp(selected.effectiveTime, timeBasis),
      effectiveTime: selected.effectiveTime,
      timeBasis,
      timingQuality: selected.record.reportedTime === null ? "source_timestamp_fallback" : "precise_reported_time",
      mealType: conflictDetails.includes("conflicting_meal_type") ? "" : selected.mealType,
      rawSizeDescriptor: conflictDetails.includes("conflicting_size_descriptor") ? sizeValues.join(" | ") : selected.rawSize,
      normalizedSize,
      label: selected.label,
      duplicateCount: group.length - 1,
      duplicateDetails: group.length > 1 ? ["overlapping_source_representation_merged"] : [],
      conflictDetails,
      warnings,
      policyVersion: PUMP_MEAL_REPORT_POLICY_VERSION
    };
  }
  function extractPumpMealReports(dataset) {
    const candidates = dataset.records.filter(isPumpMealRecord).map(candidate).sort((a, b) => a.effectiveTime - b.effectiveTime || a.record.sourceFile.localeCompare(b.record.sourceFile) || a.record.row - b.record.row);
    const groups = [];
    for (const item of candidates) {
      const group = groups.find((existing) => existing.some((member) => duplicateAcrossSources(member, item)));
      if (group) group.push(item);
      else groups.push([item]);
    }
    const reports = groups.map((group) => mergeGroup(group, dataset.timeBasis)).sort((a, b) => a.effectiveTime - b.effectiveTime || a.reportId.localeCompare(b.reportId));
    const idOccurrences = /* @__PURE__ */ new Map();
    for (const report of reports) {
      const occurrence = (idOccurrences.get(report.reportId) ?? 0) + 1;
      idOccurrences.set(report.reportId, occurrence);
      if (occurrence > 1) report.reportId = `${report.reportId}-${occurrence}`;
    }
    const recognized = candidates.length > 0;
    const qualityFlags = [...new Set(reports.flatMap((report) => report.warnings))].sort();
    return {
      reports,
      coverageStatus: recognized ? "unknown" : "unavailable",
      coverageBasis: recognized ? "recognized report-capable source; completeness not declared" : "no recognized report source or coverage declaration",
      qualityFlags,
      policyVersion: PUMP_MEAL_REPORT_POLICY_VERSION
    };
  }

  // src/pump-meals/export.ts
  var PUMP_MEAL_REPORT_CSV_HEADERS = [
    "report_id",
    "date",
    "time_basis",
    "study_id",
    "episode_id",
    "effective_timestamp",
    "source_timestamp",
    "reported_timestamp",
    "timing_quality",
    "meal_type",
    "raw_size_descriptor",
    "normalized_size_category",
    "descriptive_label",
    "source_files",
    "source_rows",
    "source_trace_indices",
    "source_trace_names",
    "source_point_indices",
    "duplicate_count",
    "duplicate_details",
    "conflict_details",
    "quality_flags",
    "coverage_status",
    "coverage_basis",
    "report_policy_version"
  ];
  function safeText(value) {
    return /^[=+\-@]/.test(value) ? `'${value}` : value;
  }
  function exportPumpMealReportsCsv(reportSet, options = {}) {
    return serializeCsv({ headers: PUMP_MEAL_REPORT_CSV_HEADERS, rows: reportSet.reports.map((report) => [
      report.reportId,
      report.effectiveTimestamp.slice(0, 10),
      report.timeBasis,
      safeText(options.studyId ?? ""),
      safeText(options.episodeId ?? ""),
      report.effectiveTimestamp,
      report.sourceTimestamp,
      report.reportedTimestamp ?? "",
      report.timingQuality,
      safeText(report.mealType),
      safeText(report.rawSizeDescriptor),
      report.normalizedSize,
      safeText(report.label),
      safeText(report.sourceReferences.map((source) => source.sourceFile).join("; ")),
      report.sourceReferences.map((source) => source.row).join("; "),
      report.sourceReferences.map((source) => source.sourceTraceIndex ?? "").join("; "),
      report.sourceReferences.map((source) => source.sourceTraceName ?? "").join("; "),
      report.sourceReferences.map((source) => source.sourcePointIndex ?? "").join("; "),
      String(report.duplicateCount),
      report.duplicateDetails.join("; "),
      report.conflictDetails.join("; "),
      report.warnings.join("; "),
      reportSet.coverageStatus,
      safeText(reportSet.coverageBasis),
      report.policyVersion
    ]) });
  }

  // src/hypoglycemia/daily.ts
  var DAILY_SUMMARY_VERSION = "hypo-daily-v2";
  var DAY_MS = 864e5;
  function dayStart(time) {
    const date = new Date(time);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  function rounded(value) {
    return Number(value.toFixed(9));
  }
  function summarizeHypoglycemiaDays(dataset, events, options = {}) {
    const cgmBins = dataset.bins.filter((bin) => bin.cgmRecords.length > 0);
    if (!cgmBins.length) return [];
    const analysisStart = cgmBins[0].time;
    const analysisEnd = cgmBins[cgmBins.length - 1].time + BIN_MS;
    const originTime = options.origin ?? formatTimestamp(analysisStart, dataset.timeBasis);
    const parsedOrigin = parseTimestamp(originTime).time;
    const startDay = dayStart(analysisStart);
    const endDay = dayStart(analysisEnd - 1);
    const thresholds = events[0]?.parameters ?? { lowThresholdMgdl: 70, level2ThresholdMgdl: 54 };
    const pumpMeals = options.pumpMealReports ?? extractPumpMealReports(dataset);
    const rows = [];
    for (let dateStart = startDay; dateStart <= endDay; dateStart += DAY_MS) {
      const dateEnd = dateStart + DAY_MS;
      const boundedStart = Math.max(dateStart, analysisStart);
      const boundedEnd = Math.min(dateEnd, analysisEnd);
      const expectedMinutes = Math.max(0, (boundedEnd - boundedStart) / 6e4);
      let observedCgmMinutes = 0, below70Minutes = 0, below54Minutes = 0, inRangeMinutes = 0, above180Minutes = 0;
      let observedInsulinMinutes = 0, insulinUnits = 0, observedInsulinBins = 0;
      for (const bin of dataset.bins) {
        const overlap = Math.max(0, Math.min(bin.time + BIN_MS, boundedEnd) - Math.max(bin.time, boundedStart)) / 6e4;
        if (!overlap) continue;
        if (bin.glucose !== null) {
          observedCgmMinutes += overlap;
          if (bin.glucose < thresholds.lowThresholdMgdl) below70Minutes += overlap;
          if (bin.glucose < thresholds.level2ThresholdMgdl) below54Minutes += overlap;
          if (bin.glucose >= thresholds.lowThresholdMgdl && bin.glucose <= 180) inRangeMinutes += overlap;
          if (bin.glucose > 180) above180Minutes += overlap;
        }
        if (bin.insulin !== null) {
          observedInsulinMinutes += overlap;
          observedInsulinBins++;
          insulinUnits += bin.insulin * overlap / 5;
        }
      }
      const dayEvents = events.filter((event) => {
        const onset = parseTimestamp(event.startTime).time;
        return onset >= dateStart && onset < dateEnd;
      });
      const dayReports = pumpMeals.reports.filter((report) => report.effectiveTime >= boundedStart && report.effectiveTime < boundedEnd);
      const available = pumpMeals.coverageStatus !== "unavailable";
      const sizeCount = (size) => available ? dayReports.filter((report) => report.normalizedSize === size).length : null;
      const less = sizeCount("less_than_usual");
      const usual = sizeCount("usual");
      const more = sizeCount("more_than_usual");
      const knownRelative = available ? less + usual + more : null;
      const percent = (minutes) => observedCgmMinutes ? rounded(minutes / observedCgmMinutes * 100) : null;
      rows.push({
        date: new Date(dateStart).toISOString().slice(0, 10),
        timeBasis: dataset.timeBasis,
        studyId: options.studyId ?? null,
        episodeId: options.episodeId ?? null,
        analysisVersion: events[0]?.analysisVersion ?? ANALYSIS_VERSION,
        contextVersion: "previous_source_bin_v1",
        summarizationVersion: DAILY_SUMMARY_VERSION,
        originKind: options.originKind ?? "first_observed_cgm",
        originTime,
        elapsedDay: rounded((dateStart - parsedOrigin) / DAY_MS),
        expectedBinsWithinObservationBounds: expectedMinutes / 5,
        fullDayExpectedBins: 288,
        observedCgmBins: observedCgmMinutes / 5,
        observedCgmMinutes: rounded(observedCgmMinutes),
        cgmCoveragePct: expectedMinutes ? rounded(observedCgmMinutes / expectedMinutes * 100) : null,
        boundaryPartialDay: expectedMinutes < 1440,
        below70Minutes: rounded(below70Minutes),
        below54Minutes: rounded(below54Minutes),
        in70To180Minutes: rounded(inRangeMinutes),
        above180Minutes: rounded(above180Minutes),
        below70Pct: percent(below70Minutes),
        below54Pct: percent(below54Minutes),
        in70To180Pct: percent(inRangeMinutes),
        above180Pct: percent(above180Minutes),
        allEventOnsetCount: dayEvents.length,
        level2OnsetCount: dayEvents.filter((event) => event.level2).length,
        truncatedOnsetCount: dayEvents.filter((event) => event.quality.onsetTruncated).length,
        eventRatePer24ObservedHours: observedCgmMinutes ? rounded(dayEvents.length / (observedCgmMinutes / 1440)) : null,
        observedInsulinUnits: observedInsulinMinutes ? rounded(insulinUnits) : null,
        observedInsulinBins,
        insulinCoveragePct: expectedMinutes ? rounded(observedInsulinMinutes / expectedMinutes * 100) : null,
        lowThresholdMgdl: thresholds.lowThresholdMgdl,
        level2ThresholdMgdl: thresholds.level2ThresholdMgdl,
        rangeUpperMgdl: 180,
        pumpMealReportCount: available ? dayReports.length : null,
        pumpMealLessThanUsualCount: less,
        pumpMealUsualCount: usual,
        pumpMealMoreThanUsualCount: more,
        pumpMealSmallCount: sizeCount("small"),
        pumpMealMediumCount: sizeCount("medium"),
        pumpMealLargeCount: sizeCount("large"),
        pumpMealUnknownSizeCount: sizeCount("unknown"),
        pumpMealKnownRelativeSizeCount: knownRelative,
        pumpMealLessThanUsualFraction: knownRelative ? rounded(less / knownRelative) : null,
        pumpMealReportCoverageStatus: pumpMeals.coverageStatus,
        pumpMealReportCoverageBasis: pumpMeals.coverageBasis,
        pumpMealReportQualityFlags: [.../* @__PURE__ */ new Set([...pumpMeals.qualityFlags, ...dayReports.flatMap((report) => report.warnings)])].join("; "),
        pumpMealReportPolicyVersion: pumpMeals.policyVersion
      });
    }
    return rows;
  }
  var DAILY_CSV_HEADERS = [
    "date",
    "time_basis",
    "study_id",
    "episode_id",
    "analysis_version",
    "context_version",
    "summarization_version",
    "origin_kind",
    "origin_time",
    "elapsed_day",
    "expected_bins_within_observation_bounds",
    "full_day_expected_bins",
    "observed_cgm_bins",
    "observed_cgm_minutes",
    "cgm_coverage_pct",
    "boundary_partial_day_flag",
    "below_70_minutes",
    "below_54_minutes",
    "in_70_to_180_minutes",
    "above_180_minutes",
    "below_70_pct",
    "below_54_pct",
    "in_70_to_180_pct",
    "above_180_pct",
    "all_event_onset_count",
    "level2_onset_count",
    "truncated_onset_count",
    "event_rate_per_24_observed_hours",
    "observed_insulin_units",
    "observed_insulin_bins",
    "insulin_coverage_pct",
    "low_threshold_mgdl",
    "level2_threshold_mgdl",
    "range_upper_mgdl",
    "pump_meal_report_count",
    "pump_meal_less_than_usual_count",
    "pump_meal_usual_count",
    "pump_meal_more_than_usual_count",
    "pump_meal_small_count",
    "pump_meal_medium_count",
    "pump_meal_large_count",
    "pump_meal_unknown_size_count",
    "pump_meal_known_relative_size_count",
    "pump_meal_less_than_usual_fraction",
    "pump_meal_report_coverage_status",
    "pump_meal_report_coverage_basis",
    "pump_meal_report_quality_flags",
    "pump_meal_report_policy_version"
  ];
  function exportDailySummariesCsv(rows) {
    const keyMap = {
      time_basis: "timeBasis",
      study_id: "studyId",
      episode_id: "episodeId",
      analysis_version: "analysisVersion",
      context_version: "contextVersion",
      summarization_version: "summarizationVersion",
      origin_kind: "originKind",
      origin_time: "originTime",
      elapsed_day: "elapsedDay",
      expected_bins_within_observation_bounds: "expectedBinsWithinObservationBounds",
      full_day_expected_bins: "fullDayExpectedBins",
      observed_cgm_bins: "observedCgmBins",
      observed_cgm_minutes: "observedCgmMinutes",
      cgm_coverage_pct: "cgmCoveragePct",
      boundary_partial_day_flag: "boundaryPartialDay",
      below_70_minutes: "below70Minutes",
      below_54_minutes: "below54Minutes",
      in_70_to_180_minutes: "in70To180Minutes",
      above_180_minutes: "above180Minutes",
      below_70_pct: "below70Pct",
      below_54_pct: "below54Pct",
      in_70_to_180_pct: "in70To180Pct",
      above_180_pct: "above180Pct",
      all_event_onset_count: "allEventOnsetCount",
      level2_onset_count: "level2OnsetCount",
      truncated_onset_count: "truncatedOnsetCount",
      event_rate_per_24_observed_hours: "eventRatePer24ObservedHours",
      observed_insulin_units: "observedInsulinUnits",
      observed_insulin_bins: "observedInsulinBins",
      insulin_coverage_pct: "insulinCoveragePct",
      low_threshold_mgdl: "lowThresholdMgdl",
      level2_threshold_mgdl: "level2ThresholdMgdl",
      range_upper_mgdl: "rangeUpperMgdl",
      date: "date",
      pump_meal_report_count: "pumpMealReportCount",
      pump_meal_less_than_usual_count: "pumpMealLessThanUsualCount",
      pump_meal_usual_count: "pumpMealUsualCount",
      pump_meal_more_than_usual_count: "pumpMealMoreThanUsualCount",
      pump_meal_small_count: "pumpMealSmallCount",
      pump_meal_medium_count: "pumpMealMediumCount",
      pump_meal_large_count: "pumpMealLargeCount",
      pump_meal_unknown_size_count: "pumpMealUnknownSizeCount",
      pump_meal_known_relative_size_count: "pumpMealKnownRelativeSizeCount",
      pump_meal_less_than_usual_fraction: "pumpMealLessThanUsualFraction",
      pump_meal_report_coverage_status: "pumpMealReportCoverageStatus",
      pump_meal_report_coverage_basis: "pumpMealReportCoverageBasis",
      pump_meal_report_quality_flags: "pumpMealReportQualityFlags",
      pump_meal_report_policy_version: "pumpMealReportPolicyVersion"
    };
    return serializeCsv({ headers: DAILY_CSV_HEADERS, rows: rows.map((row) => DAILY_CSV_HEADERS.map((header) => {
      const value = row[keyMap[header]];
      return value === null ? "" : String(value);
    })) });
  }
  return __toCommonJS(index_exports);
})();
