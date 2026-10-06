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
    if (left.pointIdentity && left.pointIdentity === right.pointIdentity && left.record.time === right.record.time && (left.record.reportedTime === null || right.record.reportedTime === null || left.record.reportedTime === right.record.reportedTime)) return true;
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

  // src/hypoglycemia-ui/source-state.ts
  function createSourceState() {
    return { primary: [], supplemental: [], revision: 0, latestGeneration: 0 };
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
    const annotationKindIndex = normalizedHeaders.indexOf("annotation_kind");
    const supported = rows.some((row) => {
      const series = row[seriesIndex]?.trim().toLowerCase() ?? "";
      const annotationKind = annotationKindIndex >= 0 ? row[annotationKindIndex]?.trim().toLowerCase() ?? "" : "";
      return series === "insulin" || series.includes("meal announcement") || series === "event" || annotationKind === "meal" || annotationKind === "event";
    });
    if (!supported) {
      throw new Error(`${source.name}: no insulin, pump-reported meal, or event rows were found.`);
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
      const supplemental = prepareSupplementalSource(source);
      return {
        ...state2,
        supplemental: update.merge ? [...state2.supplemental, supplemental] : [supplemental],
        revision: state2.revision + 1
      };
    }
    return {
      ...state2,
      primary: update.merge ? [...state2.primary, source] : [source],
      supplemental: [],
      revision: state2.revision + 1
    };
  }
  function getUnsupportedPrimarySources(state2) {
    return state2.primary.filter((source) => source.format !== "series");
  }
  function getAnalysisFiles(state2) {
    return [
      ...state2.primary.filter((source) => source.format === "series").map(({ name, text }) => ({ name, text })),
      ...state2.supplemental.map((source) => source.analysisFile)
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
  var DAY_MS2 = 864e5;
  function calendarDayStart(time) {
    const value = new Date(time);
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
    for (let day = firstDay; day <= lastDay; day += DAY_MS2) {
      const eventCount = eligibleOnsets.filter((onset) => onset >= day && onset < day + DAY_MS2).length;
      counts.push(eventCount);
      const trailingAverage = counts.length < movingAverageDays ? null : counts.slice(-movingAverageDays).reduce((sum, value) => sum + value, 0) / movingAverageDays;
      dailyRows.push({
        date: new Date(day).toISOString().slice(0, 10),
        xValue: options.timeBasis === "calendar" ? day : (day - origin) / DAY_MS2,
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
  function buildPumpMealDailyCountTrendModel(options) {
    const start = parseTimestamp(options.start).time;
    const end = parseTimestamp(options.end).time;
    const origin = parseTimestamp(options.origin).time;
    const movingAverageDays = options.movingAverageDays ?? 7;
    if (!Number.isInteger(movingAverageDays) || movingAverageDays < 1) throw new Error("Moving-average days must be a positive integer.");
    const firstDay = calendarDayStart(start);
    const lastDay = calendarDayStart(Math.max(start, end - 1));
    const counts = [];
    const dailyRows = [];
    for (let day = firstDay; day <= lastDay; day += DAY_MS2) {
      const available = options.reportSet.coverageStatus !== "unavailable";
      const count = available ? options.reportSet.reports.filter((report) => report.effectiveTime >= Math.max(day, start) && report.effectiveTime < Math.min(day + DAY_MS2, end)).length : null;
      counts.push(count);
      const window2 = counts.slice(-movingAverageDays);
      const trailingAverage = window2.length === movingAverageDays && window2.every((value) => value !== null) ? window2.reduce((sum, value) => sum + value, 0) / movingAverageDays : null;
      dailyRows.push({
        date: new Date(day).toISOString().slice(0, 10),
        xValue: options.timeBasis === "calendar" ? day : (day - origin) / DAY_MS2,
        eventCount: count,
        trailingAverage,
        availabilityStatus: options.reportSet.coverageStatus,
        qualityFlags: options.reportSet.qualityFlags
      });
    }
    return {
      mode: "pump_meal_daily_counts",
      timeBasis: options.timeBasis,
      origin: options.origin,
      originKind: options.originKind,
      scopeCount: options.reportSet.reports.filter((report) => report.effectiveTime >= start && report.effectiveTime < end).length,
      qualityExcluded: 0,
      unavailable: dailyRows.filter((row) => row.eventCount === null).length,
      rows: [],
      dailyRows,
      movingAverageDays,
      dailyMetricKey: "pump_meal_report_count",
      dailyMetricLabel: "Pump-reported meals per day",
      dailyMetricUnits: "reports"
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

  // src/hypoglycemia-ui/trends.ts
  var priorContext = (event) => event.lastInsulin ? {
    method: event.lastInsulin.priorContext.method,
    timestamps: [
      event.lastInsulin.priorContext.rocStartBinTime,
      event.lastInsulin.priorContext.glucoseBinTime,
      event.lastInsulin.time
    ]
  } : { method: null, timestamps: [] };
  var deliveryContext = (event) => event.lastInsulin ? {
    method: event.lastInsulin.timing,
    timestamps: [event.lastInsulin.binTime, event.lastInsulin.time]
  } : { method: null, timestamps: [] };
  var HYPO_TREND_METRICS = [
    {
      key: "prior_glucose",
      label: "Prior-delivery glucose",
      units: "mg/dL",
      value: (event) => event.lastInsulin?.priorContext.glucoseMgdl ?? null,
      context: priorContext
    },
    {
      key: "prior_roc",
      label: "Prior-delivery ROC",
      units: "mg/dL/min",
      value: (event) => event.lastInsulin?.priorContext.rocMgdlPerMin ?? null,
      context: priorContext
    },
    {
      key: "delivery_glucose",
      label: "Delivery-bin glucose",
      units: "mg/dL",
      value: (event) => event.lastInsulin?.glucoseMgdl ?? null,
      context: deliveryContext
    },
    {
      key: "delivery_roc",
      label: "Delivery-bin ROC",
      units: "mg/dL/min",
      value: (event) => event.lastInsulin?.rocMgdlPerMin ?? null,
      context: deliveryContext
    },
    {
      key: "delivery_to_onset",
      label: "Last delivery to onset",
      units: "minutes",
      value: (event) => event.lastInsulin?.minutesBeforeEvent ?? null
    },
    { key: "nadir", label: "Nadir", units: "mg/dL", value: (event) => event.nadirGlucoseMgdl },
    { key: "duration", label: "Event duration", units: "minutes", value: (event) => event.durationMinutes },
    { key: "insulin_3h", label: "Insulin before onset (3h)", units: "U", value: (event) => event.insulin3h.units },
    { key: "insulin_6h", label: "Insulin before onset (6h)", units: "U", value: (event) => event.insulin6h.units }
  ];
  var HYPO_TREND_ACCESSOR = {
    id: (event) => event.eventId,
    onset: (event) => event.startTime,
    warnings: (event) => event.quality.warnings
  };
  function hypoMetric(key) {
    return HYPO_TREND_METRICS.find((metric) => metric.key === key) ?? HYPO_TREND_METRICS[0];
  }

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
    const annotations = dataset.records.filter((record) => record.kind === "annotation" && record.includedInAnalysis).map((record) => {
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
    const rounded2 = Number(value.toFixed(2));
    return `${rounded2 > 0 ? "+" : ""}${rounded2.toFixed(2)} mg/dL/min`;
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
    const compactSummary = byId("hypoAnalysisCompactSummary", HTMLElement);
    const fullDetails = byId("hypoAnalysisFullDetails", HTMLDetailsElement);
    const eventCount = byId("hypoEventsDisclosureCount", HTMLElement);
    if (!(root && runButton && downloadButton && semantics && scope && sort && sortDirection && status && counts && timing && results && tableBody && emptyResults && detail && detailTitle && position && previousButton && nextButton && badges && metrics && quality && sources && liveRegion && glucoseCanvas && insulinCanvas && timeBasis && offWindow && timelineDetails && compactSummary && fullDetails && eventCount)) return null;
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
      timelineDetails,
      compactSummary,
      fullDetails,
      eventCount
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
  function addMetric(container, label, value, detail = "", incomplete = false, trendMetricKey, actions) {
    const card = document.createElement("div");
    card.className = `hypo-analysis__metric${incomplete ? " hypo-analysis__metric--warning" : ""}`;
    appendText(card, "dt", label);
    appendText(card, "dd", value, "hypo-analysis__metric-value");
    if (detail) appendText(card, "dd", detail, "hypo-analysis__metric-detail");
    if (trendMetricKey && actions) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "hypo-analysis__metric-action";
      action.textContent = trendMetricKey === "daily_counts" ? "View events per day" : "View over time";
      action.addEventListener("click", () => trendMetricKey === "daily_counts" ? actions.selectDailyCounts() : actions.selectTrendMetric(trendMetricKey));
      card.append(action);
    }
    container.append(card);
  }
  function renderMetrics(container, event, actions) {
    container.replaceChildren();
    addMetric(
      container,
      "Onset",
      formatEventTime(event.startTime, event.timeBasis),
      `${formatGlucose(event.onset.glucoseMgdl)} \xB7 ROC ${formatRoc(event.onset.rocMgdlPerMin)}`,
      false,
      "daily_counts",
      actions
    );
    addMetric(
      container,
      "Nadir",
      formatGlucose(event.nadirGlucoseMgdl),
      formatEventTime(event.nadirTime, event.timeBasis),
      false,
      "nadir",
      actions
    );
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
        `${formatEventTime(event.lastInsulin.time, event.timeBasis)} \xB7 bin ${formatDose(event.lastInsulin.binUnits)} \xB7 ${Number(event.lastInsulin.minutesBeforeEvent.toFixed(1))} min before onset`,
        false,
        "delivery_to_onset",
        actions
      );
      const prior = event.lastInsulin.priorContext;
      addMetric(
        container,
        "Glucose before last delivery",
        formatGlucose(prior.glucoseMgdl),
        `ROC ${formatRoc(prior.rocMgdlPerMin)} \xB7 Previous five-minute source bin \xB7 glucose ${formatEventTime(prior.glucoseBinTime, event.timeBasis)} \xB7 ROC ${formatEventTime(prior.rocStartBinTime, event.timeBasis)} to ${formatEventTime(prior.rocEndBinTime, event.timeBasis)} \xB7 ${Number(prior.glucoseBinToDeliveryMinutes.toFixed(1))} min bin-based lag`,
        prior.qualityWarnings.length > 0,
        "prior_glucose",
        actions
      );
      addMetric(
        container,
        "ROC before last delivery",
        formatRoc(prior.rocMgdlPerMin),
        `Ends at ${formatEventTime(prior.rocEndBinTime, event.timeBasis)} \xB7 Previous five-minute source bin`,
        prior.qualityWarnings.length > 0,
        "prior_roc",
        actions
      );
      addMetric(
        container,
        "Glucose in delivery bin",
        formatGlucose(event.lastInsulin.glucoseMgdl),
        `Sensitivity comparison \xB7 ${event.lastInsulin.timing === "reported_clock" ? "reported delivery clock" : "source-bin delivery time"}`,
        false,
        "delivery_glucose",
        actions
      );
      addMetric(
        container,
        "ROC in delivery bin",
        formatRoc(event.lastInsulin.rocMgdlPerMin),
        "Sensitivity comparison",
        false,
        "delivery_roc",
        actions
      );
    } else {
      const value = event.parameters.insulinSemantics === "bolus_only" ? "No observed bolus" : "No prior positive delivery observed";
      addMetric(
        container,
        "Last observed delivery",
        value,
        cessationLabel(event.cessationStatus),
        false,
        "delivery_to_onset",
        actions
      );
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
  function renderDetails(elements2, model, actions) {
    const event = model.selectedEvent;
    elements2.detail.classList.toggle("hidden", !event);
    elements2.fullDetails.classList.toggle("hidden", !event);
    if (!event) return;
    elements2.detailTitle.textContent = `Event ${formatEventTime(event.startTime, event.timeBasis)}`;
    elements2.position.textContent = `${model.selectedIndex + 1} of ${model.displayedEvents.length}`;
    elements2.previousButton.disabled = model.selectedIndex <= 0;
    elements2.nextButton.disabled = model.selectedIndex < 0 || model.selectedIndex >= model.displayedEvents.length - 1;
    renderBadges(elements2.badges, event);
    elements2.compactSummary.replaceChildren();
    addMetric(elements2.compactSummary, "Nadir", formatGlucose(event.nadirGlucoseMgdl), formatEventTime(event.nadirTime, event.timeBasis));
    addMetric(
      elements2.compactSummary,
      "Duration / recovery",
      event.durationMinutes === null ? "Recovery not observed" : formatDuration(event.durationMinutes),
      event.endTime === null ? `Observed through ${formatEventTime(event.observedThrough, event.timeBasis)}` : formatEventTime(event.endTime, event.timeBasis),
      event.endTime === null
    );
    const insulin3h = presentWindow(event.insulin3h, event.parameters.insulinSemantics);
    addMetric(elements2.compactSummary, "Insulin 3 hours", insulin3h.value, insulin3h.detail, insulin3h.incomplete);
    elements2.timeBasis.textContent = event.timeBasis === "utc" ? "Clock labels are shown in UTC. The x-axis is hours relative to onset." : "Clock labels preserve the source\u2019s unspecified local wall clock. The x-axis is hours relative to onset.";
    elements2.offWindow.replaceChildren();
    elements2.offWindow.classList.toggle("hidden", !model.timeline?.offWindow.length);
    model.timeline?.offWindow.forEach((message) => appendText(elements2.offWindow, "p", message));
    renderTimelineDetails(elements2.timelineDetails, model.timeline);
    renderMetrics(elements2.metrics, event, actions);
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
    elements2.eventCount.textContent = String(model.displayedEvents.length);
    const empty = model.status === "success" && model.displayedEvents.length === 0;
    elements2.emptyResults.classList.toggle("hidden", !empty);
    elements2.emptyResults.textContent = empty ? "No events match this scope. Choose All events to review the complete result set." : "";
    renderRows(elements2, model, actions);
    renderDetails(elements2, model, actions);
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
    durationMs: null,
    trendMode: "over_time",
    trendMetricKey: "prior_glucose",
    trendTimeBasis: "calendar",
    trendQuality: "all",
    trendOrigin: null,
    trendOriginKind: "first_observed_cgm",
    focusPanel: "event"
  };
  var timelineCharts = new TimelineChartManager();
  var trendCharts = new EventTrendChartManager();
  var overviewSelectionListener = null;
  var overviewEventsListener = null;
  var publishedOverviewEventsKey = null;
  var chartRenderGeneration = 0;
  function focusElements() {
    return {
      eventTab: document.getElementById("hypoEventTab"),
      trendsTab: document.getElementById("hypoTrendsTab")
    };
  }
  function setFocusPanel(panel, focus = false) {
    state.focusPanel = panel;
    render();
    if (focus) focusElements()[panel === "event" ? "eventTab" : "trendsTab"]?.focus({ preventScroll: true });
  }
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
  function selectEvent(eventId, intent = "inspect") {
    const displayed = syncDerivedSelection();
    const index = displayed.findIndex((event) => event.eventId === eventId);
    if (index < 0) return;
    state.selectedEventId = eventId;
    if (intent === "inspect") state.focusPanel = "event";
    render();
    if (intent === "inspect" && matchMedia("(max-width: 1099px)").matches) {
      const disclosure = document.getElementById("hypoEventsDisclosure");
      if (disclosure) disclosure.open = false;
      document.getElementById("hypoAnalysisTitle")?.focus({ preventScroll: true });
    }
    announceSelection(displayed[index], index, displayed.length);
  }
  function navigateSelection(change) {
    const displayed = syncDerivedSelection();
    const index = displayed.findIndex((event) => event.eventId === state.selectedEventId);
    const nextIndex = index + change;
    if (nextIndex < 0 || nextIndex >= displayed.length) return;
    selectEvent(displayed[nextIndex].eventId, "keep-panel");
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
  function downloadDailySummaries() {
    if (state.status !== "success" || !state.dataset) return;
    const rows = summarizeHypoglycemiaDays(state.dataset, state.events, {
      origin: state.trendOrigin ?? void 0,
      originKind: state.trendOriginKind
    });
    const url = URL.createObjectURL(new Blob([exportDailySummariesCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "hypoglycemia-daily-all-observed-data.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function downloadPumpMealReports() {
    if (state.status !== "success" || !state.dataset) return;
    const url = URL.createObjectURL(new Blob(
      [exportPumpMealReportsCsv(extractPumpMealReports(state.dataset))],
      { type: "text/csv;charset=utf-8" }
    ));
    const link = document.createElement("a");
    link.href = url;
    link.download = "pump-meal-reports.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function trendElements() {
    const get = (id) => document.getElementById(id);
    return {
      root: get("hypoEventTrends"),
      mode: get("hypoTrendMode"),
      metric: get("hypoTrendMetric"),
      timeBasis: get("hypoTrendTimeBasis"),
      origin: get("hypoTrendOrigin"),
      quality: get("hypoTrendQuality"),
      counts: get("hypoTrendCounts"),
      scope: get("hypoTrendScopeLabel"),
      canvas: get("hypoTrendChart"),
      fallback: get("hypoTrendFallback"),
      download: get("hypoTrendDownload")
    };
  }
  function currentTrendModel(events = displayedEvents()) {
    if (!state.dataset || !state.trendOrigin) return null;
    if (state.trendMode !== "over_time") {
      const cgmBins = state.dataset.bins.filter((bin) => bin.cgmRecords.length > 0);
      if (!cgmBins.length) return null;
      const meals = buildPumpMealDailyCountTrendModel({
        reportSet: extractPumpMealReports(state.dataset),
        start: formatTimestamp(cgmBins[0].time, state.dataset.timeBasis),
        end: formatTimestamp(cgmBins[cgmBins.length - 1].time + 5 * 6e4, state.dataset.timeBasis),
        timeBasis: state.trendTimeBasis,
        origin: state.trendOrigin,
        originKind: state.trendOriginKind,
        movingAverageDays: 7
      });
      if (state.trendMode === "pump_meal_daily_counts") return meals;
      const counts = buildDailyCountTrendModel({
        events,
        accessor: HYPO_TREND_ACCESSOR,
        start: formatTimestamp(cgmBins[0].time, state.dataset.timeBasis),
        end: formatTimestamp(cgmBins[cgmBins.length - 1].time + 5 * 6e4, state.dataset.timeBasis),
        timeBasis: state.trendTimeBasis,
        origin: state.trendOrigin,
        originKind: state.trendOriginKind,
        qualityFilter: state.trendQuality,
        movingAverageDays: 7
      });
      return state.trendMode === "combined_daily_counts" ? { ...counts, mode: "combined_daily_counts", pumpMealDailyRows: meals.dailyRows } : counts;
    }
    return buildEventTrendModel({
      events,
      accessor: HYPO_TREND_ACCESSOR,
      mode: state.trendMode,
      timeBasis: state.trendTimeBasis,
      origin: state.trendOrigin,
      originKind: state.trendOriginKind,
      qualityFilter: state.trendQuality,
      metric: hypoMetric(state.trendMetricKey)
    });
  }
  function renderTrends(generation) {
    const el = trendElements();
    if (!el.root) return;
    const visible = state.active && state.status === "success" && state.focusPanel === "trends";
    el.root.classList.toggle("hidden", !visible);
    if (!visible) {
      trendCharts.clear();
      return;
    }
    const model = currentTrendModel();
    if (!model || !el.mode || !el.metric || !el.timeBasis || !el.origin || !el.quality || !el.counts || !el.scope || !el.canvas || !el.fallback || !el.download) return;
    if (!el.metric.options.length) HYPO_TREND_METRICS.forEach((metric) => el.metric.add(new Option(metric.label, metric.key)));
    el.mode.value = state.trendMode;
    el.metric.value = state.trendMetricKey;
    el.timeBasis.value = state.trendTimeBasis;
    el.quality.value = state.trendQuality;
    el.metric.disabled = state.trendMode !== "over_time";
    el.quality.disabled = state.trendMode === "pump_meal_daily_counts";
    el.origin.value = model.origin.replace(/Z$/, "").slice(0, 16);
    el.scope.textContent = state.trendMode === "pump_meal_daily_counts" ? `All observed pump reports within CGM observation bounds; origin is ${state.trendOriginKind === "first_observed_cgm" ? "first observed CGM" : "user supplied"}. Counts are independent of event scope and hypoglycemia quality filters. Unknown coverage means zero is only zero observed reports.` : `${state.scope === "all" ? "All events" : state.scope === "eligible" ? "Automated-pump eligible subset" : "Manual-pause affected events"}; origin is ${state.trendOriginKind === "first_observed_cgm" ? "first observed CGM" : "user supplied"}. ${state.trendMode === "daily_counts" ? "Bars are detected onsets per source-calendar day; the 7-day trailing average is descriptive and not exposure-adjusted." : state.trendMode === "combined_daily_counts" ? "" : "This is not verified automated mode."}`;
    el.counts.textContent = state.trendMode === "pump_meal_daily_counts" ? `${model.dailyRows.length} calendar days \xB7 ${model.scopeCount} observed reports \xB7 ${model.unavailable} unavailable days \xB7 coverage ${model.dailyRows[0]?.availabilityStatus ?? "unavailable"}` : state.trendMode !== "over_time" ? `${model.dailyRows.length} calendar days \xB7 ${model.scopeCount - model.qualityExcluded} events counted \xB7 ${model.qualityExcluded} quality-filter exclusions` : `${model.rows.length} plotted / ${model.scopeCount} in scope \xB7 ${model.qualityExcluded} quality-filter exclusions \xB7 ${model.unavailable} unavailable required values${state.selectedEventId && !model.rows.some((row) => row.eventId === state.selectedEventId) ? " \xB7 Selected event is not plotted: required value unavailable or excluded" : ""}`;
    if (state.trendMode === "combined_daily_counts") {
      el.scope.textContent += " Blue bars: pump-reported meals; orange line: detected hypoglycemia onsets. Dashed lines: 7-day trailing averages. Both use the same count axis. Event scope and quality filters affect only hypoglycemia; meals include all observed reports within CGM bounds. Counts are descriptive and not exposure-adjusted; shared patterns do not establish causation.";
      const mealRows = model.pumpMealDailyRows ?? [];
      el.counts.textContent += mealRows.some((row) => row.eventCount !== null) ? ` \uFFFD ${mealRows.reduce((sum, row) => sum + (row.eventCount ?? 0), 0)} observed pump reports \uFFFD meal coverage ${mealRows[0]?.availabilityStatus}. Zero means zero observed reports.` : " \uFFFD Pump-report data unavailable: no recognized report source was imported.";
    }
    const hasData = state.trendMode !== "over_time" ? model.dailyRows.some((row) => row.eventCount !== null) : model.rows.length > 0;
    el.canvas.classList.toggle("hidden", !hasData);
    el.fallback.classList.toggle("hidden", hasData);
    el.fallback.textContent = hasData ? "Chart.js is unavailable. Download the plotted rows CSV to inspect the values." : state.trendMode === "pump_meal_daily_counts" ? "Pump-report data is unavailable: no recognized report source was imported." : model.scopeCount ? "No events have valid values for this view and filter." : "No events are in the selected scope.";
    el.download.disabled = state.trendMode === "pump_meal_daily_counts" ? model.dailyRows.length === 0 : !hasData;
    if (hasData) requestAnimationFrame(() => {
      if (generation !== chartRenderGeneration || state.focusPanel !== "trends" || el.root?.classList.contains("hidden")) return;
      const available = trendCharts.render(el.canvas, model, state.selectedEventId, (id) => selectEvent(id, "keep-panel"));
      el.canvas.classList.toggle("hidden", !available);
      el.fallback.classList.toggle("hidden", available);
    });
  }
  function downloadTrendRows() {
    const model = currentTrendModel();
    if (!model || (model.mode !== "over_time" ? !model.dailyRows.length : !model.rows.length)) return;
    const url = URL.createObjectURL(new Blob([exportTrendCsv(model)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "hypoglycemia-event-trend.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function render() {
    if (!elements) return;
    const displayed = syncDerivedSelection();
    const selectedIndex = displayed.findIndex((event) => event.eventId === state.selectedEventId);
    const selectedEvent = selectedIndex < 0 ? null : displayed[selectedIndex];
    const timeline = state.active && state.status === "success" && selectedEvent && state.dataset && state.commonTimelineBounds ? buildTimelineModel(selectedEvent, state.dataset, state.commonTimelineBounds) : null;
    const generation = ++chartRenderGeneration;
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
    }, {
      selectEvent: (id) => selectEvent(id, "inspect"),
      selectTrendMetric(metricKey) {
        state.trendMetricKey = metricKey;
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
    focus.eventTab?.closest(".review-focus-tabs")?.classList.toggle("hidden", state.status !== "success");
    document.getElementById("hypoFocusHeader")?.classList.toggle("hidden", !selectedEvent);
    elements.detail.classList.toggle("hidden", state.focusPanel !== "event" || !selectedEvent);
    if (timeline && state.focusPanel === "event") requestAnimationFrame(() => {
      if (generation === chartRenderGeneration && state.focusPanel === "event" && !elements.detail.classList.contains("hidden"))
        timelineCharts.render(elements.glucoseCanvas, elements.insulinCanvas, timeline);
    });
    else timelineCharts.clear();
    renderTrends(generation);
    const dailyButton = document.getElementById("hypoDailyDownload");
    if (dailyButton) {
      dailyButton.disabled = state.status !== "success";
      dailyButton.title = "All observed data; event scope does not alter this export.";
    }
    const reportButton = document.getElementById("pumpMealReportsDownload");
    if (reportButton) {
      reportButton.disabled = state.status !== "success";
      reportButton.title = "One auditable row per canonical pump-reported meal.";
    }
    overviewSelectionListener?.(state.active && state.status === "success" && selectedEvent && state.dataset ? {
      eventId: selectedEvent.eventId,
      startTime: selectedEvent.startTime,
      datasetStartTime: formatTimestamp(state.dataset.bins[0].time, state.dataset.timeBasis),
      datasetEndTime: formatTimestamp(state.dataset.bins[state.dataset.bins.length - 1].time, state.dataset.timeBasis),
      timeBasis: selectedEvent.timeBasis
    } : null);
    const overviewEvents = state.status === "success" ? state.events.map((event) => ({
      eventId: event.eventId,
      startTime: event.startTime,
      timeBasis: event.timeBasis
    })) : [];
    const overviewEventsKey = overviewEvents.map((event) => `${event.eventId}\0${event.startTime}\0${event.timeBasis}`).join("");
    if (overviewEventsListener && overviewEventsKey !== publishedOverviewEventsKey) {
      publishedOverviewEventsKey = overviewEventsKey;
      overviewEventsListener(overviewEvents);
    }
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
    state.trendOrigin = null;
    state.trendOriginKind = "first_observed_cgm";
    state.focusPanel = "event";
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
        const firstCgm = state.dataset.records.filter((record) => record.kind === "cgm" && record.value !== null).reduce((minimum, record) => Math.min(minimum, record.time), Number.POSITIVE_INFINITY);
        state.trendOrigin = formatTimestamp(firstCgm, state.dataset.timeBasis);
        state.trendOriginKind = "first_observed_cgm";
      }
      const events = analyzeHypoglycemia(state.dataset, { insulinSemantics: state.semantics });
      if (state.sources.revision !== sourceRevision) return;
      state.events = events;
      state.commonTimelineBounds = getCommonTimelineBounds(events, state.dataset);
      const displayed = syncDerivedSelection();
      state.analyzedSemantics = state.semantics;
      state.durationMs = performance.now() - started;
      state.status = "success";
      state.focusPanel = "event";
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
    const eventsDisclosure = document.getElementById("hypoEventsDisclosure");
    if (eventsDisclosure && matchMedia("(max-width: 1099px)").matches) eventsDisclosure.open = false;
    elements.runButton.addEventListener("click", () => {
      void runAnalysis();
    });
    elements.downloadButton.addEventListener("click", downloadDisplayedEvents);
    document.getElementById("hypoDailyDownload")?.addEventListener("click", downloadDailySummaries);
    document.getElementById("pumpMealReportsDownload")?.addEventListener("click", downloadPumpMealReports);
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
    const trend = trendElements();
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
      if (!state.dataset || !trend.origin.value) return;
      state.trendOrigin = `${trend.origin.value}:00${state.dataset.timeBasis === "utc" ? "Z" : ""}`;
      state.trendOriginKind = "user_supplied";
      render();
    });
    trend.download?.addEventListener("click", downloadTrendRows);
    const focus = focusElements();
    focus.eventTab?.addEventListener("click", () => setFocusPanel("event"));
    focus.trendsTab?.addEventListener("click", () => setFocusPanel("trends"));
    [focus.eventTab, focus.trendsTab].forEach((tab) => tab?.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      setFocusPanel(event.key === "ArrowLeft" || event.key === "Home" ? "event" : "trends", true);
    }));
    document.addEventListener("keydown", (event) => {
      if (!state.active || state.status !== "success" || event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const tag = target?.tagName.toLowerCase();
      if (!target?.closest("#hypoAnalysisResults") || target.closest('[role="tablist"]') || tag === "input" || tag === "select" || tag === "textarea" || tag === "button" || target?.isContentEditable) return;
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
    },
    setOverviewEventsListener(listener) {
      overviewEventsListener = listener;
      publishedOverviewEventsKey = null;
      render();
    }
  };
  window.HypoglycemiaReview = bridge;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
  return __toCommonJS(controller_exports);
})();
