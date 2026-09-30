"use strict";
var MealAnalysis = (() => {
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

  // src/meal-analysis/index.ts
  var index_exports = {};
  __export(index_exports, {
    DEFAULT_MATCH_CUTOFF_MINUTES: () => DEFAULT_MATCH_CUTOFF_MINUTES,
    DEFAULT_MEAL_PARAMS: () => DEFAULT_MEAL_PARAMS,
    MEAL_ANALYSIS_VERSION: () => MEAL_ANALYSIS_VERSION,
    MEAL_BIN_MS: () => MEAL_BIN_MS,
    MEAL_DETECTOR_VERSION: () => MEAL_DETECTOR_VERSION,
    MEAL_EVENT_CSV_COLUMNS: () => MEAL_EVENT_CSV_COLUMNS,
    MEAL_GRID_VERSION: () => MEAL_GRID_VERSION,
    MEAL_MATCHING_VERSION: () => MEAL_MATCHING_VERSION,
    MEAL_MATCH_SCORE_VERSION: () => MEAL_MATCH_SCORE_VERSION,
    MEAL_METRIC_VERSION: () => MEAL_METRIC_VERSION,
    MEAL_OPTIMIZATION_TOTAL: () => MEAL_OPTIMIZATION_TOTAL,
    MEAL_REFERENCE_ELIGIBILITY_VERSION: () => MEAL_REFERENCE_ELIGIBILITY_VERSION,
    applyMealExclusions: () => applyMealExclusions,
    beginMealSourceImport: () => beginMealSourceImport,
    buildGridFromLegacyRows: () => buildGridFromLegacyRows,
    buildMealEvents: () => buildMealEvents,
    buildMealGrid: () => buildMealGrid,
    buildMealRunFromOptimizedParams: () => buildMealRunFromOptimizedParams,
    buildOptimizedMealRun: () => buildOptimizedMealRun,
    buildParameterMealRun: () => buildParameterMealRun,
    commitMealSourceImport: () => commitMealSourceImport,
    compareMealOptimizationRows: () => compareMealOptimizationRows,
    compareReportMatchRows: () => compareReportMatchRows,
    createMealSourceState: () => createMealSourceState,
    defaultMealOptimizationGrid: () => defaultMealOptimizationGrid,
    detectLegacyRows: () => detectLegacyRows,
    detectMeals: () => detectMeals,
    detectionToLegacyResult: () => detectionToLegacyResult,
    eligibleMealDetections: () => eligibleMealDetections,
    eligiblePumpMealReports: () => eligiblePumpMealReports,
    formatMealTimestamp: () => formatMealTimestamp,
    gridForMealScope: () => gridForMealScope,
    matchPumpReports: () => matchPumpReports,
    mealRunToCsv: () => mealRunToCsv,
    optimizeMealParams: () => optimizeMealParams,
    optimizeMealParamsAgainstReports: () => optimizeMealParamsAgainstReports,
    parseMealSource: () => parseMealSource,
    parseMealTimestamp: () => parseMealTimestamp,
    scoreReportMatches: () => scoreReportMatches,
    summarizeMeal: () => summarizeMeal
  });

  // src/meal-analysis/types.ts
  var MEAL_BIN_MS = 5 * 6e4;
  var MEAL_DETECTOR_VERSION = "meal-detector-v1";
  var MEAL_GRID_VERSION = "meal-grid-v2";
  var MEAL_METRIC_VERSION = "meal-metrics-v1";
  var MEAL_ANALYSIS_VERSION = "meal-analysis-v1";
  var MEAL_MATCHING_VERSION = "meal-detect-core-nearest-neighbor-v1";
  var MEAL_REFERENCE_ELIGIBILITY_VERSION = "meal-reference-eligibility-v1";

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
    const normalizedHeaders2 = headers.map((header) => header.toLowerCase());
    if (new Set(normalizedHeaders2).size !== normalizedHeaders2.length) {
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

  // src/pump-meals/types.ts
  var PUMP_MEAL_REPORT_POLICY_VERSION = "pump-meal-reports-v1";

  // src/hypoglycemia/types.ts
  var BIN_MS = 5 * 6e4;

  // src/hypoglycemia/normalize.ts
  function formatTimestamp(time2, basis) {
    const iso = new Date(time2).toISOString();
    return basis === "utc" ? iso : iso.slice(0, 19);
  }

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

  // src/meal-analysis/grid.ts
  function parseDateParts(value) {
    const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/.exec(value);
    if (iso) return [Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4]), Number(iso[5]), Number(iso[6] ?? 0), Number((iso[7] ?? "").padEnd(3, "0") || 0)];
    const clock = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i.exec(value);
    if (!clock) return null;
    let hour = Number(clock[4]) % 12;
    if (clock[7].toUpperCase() === "PM") hour += 12;
    return [Number(clock[3]), Number(clock[1]), Number(clock[2]), hour, Number(clock[5]), Number(clock[6] ?? 0), 0];
  }
  function validParts(parts) {
    const [year, month, day, hour, minute, second, millisecond] = parts;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
  }
  function parseMealTimestamp(value) {
    const normalized2 = value.trim();
    const suffixMatch = /(Z|[+-]\d{2}:\d{2})$/i.exec(normalized2);
    const suffix = suffixMatch?.[1];
    const base = suffix ? normalized2.slice(0, -suffix.length) : normalized2;
    const parts = parseDateParts(base);
    if (!parts || !validParts(parts)) throw new Error(`Invalid timestamp: ${value}`);
    let time2 = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5], parts[6]);
    if (suffix && suffix.toUpperCase() !== "Z") {
      const offsetHours = Number(suffix.slice(1, 3));
      const offsetMinutes = Number(suffix.slice(4, 6));
      if (offsetHours > 14 || offsetMinutes > 59 || offsetHours === 14 && offsetMinutes !== 0) throw new Error(`Invalid timestamp offset: ${value}`);
      const sign = suffix[0] === "-" ? -1 : 1;
      time2 -= sign * (offsetHours * 60 + offsetMinutes) * 6e4;
    }
    return { time: time2, basis: suffix ? "utc" : "local_unspecified" };
  }
  function formatMealTimestamp(time2, basis) {
    const iso = new Date(time2).toISOString();
    return basis === "utc" ? iso : iso.slice(0, 19);
  }
  function normalizedHeaders(headers) {
    return headers.map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase());
  }
  function findHeaderRow(text, format) {
    if (format !== "libre") {
      const table2 = parseCsv(text);
      return { headers: normalizedHeaders(table2.headers), rows: table2.rows, headerRow: 1 };
    }
    const lines = text.split(/\r?\n/);
    const index = lines.findIndex((line) => {
      const normalized2 = line.toLowerCase();
      return normalized2.includes("device timestamp") && normalized2.includes("record type") && normalized2.includes("historic glucose mg/dl");
    });
    if (index < 0) throw new Error("Libre headers were not found.");
    const table = parseCsv(lines.slice(index).join("\n"));
    return { headers: normalizedHeaders(table.headers), rows: table.rows, headerRow: index + 1 };
  }
  function requiredIndex(headers, name, source) {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`${source.name}: missing ${name} column.`);
    return index;
  }
  function addCgm(source, output, row, timestampText, valueText) {
    let parsed;
    try {
      parsed = parseMealTimestamp(timestampText);
    } catch {
      throw new Error(`${source.name}, row ${row}: invalid CGM timestamp.`);
    }
    if (output.basis && output.basis !== parsed.basis) throw new Error(`${source.name}: mixed timestamp bases.`);
    output.basis = parsed.basis;
    const numeric = valueText.trim() && Number.isFinite(Number(valueText)) && Number(valueText) > 0 ? Number(valueText) : null;
    output.cgm.push({
      sourceId: source.id,
      sourceName: source.name,
      row,
      sourceTimestamp: timestampText,
      time: parsed.time,
      value: numeric,
      includedInAnalysis: true
    });
  }
  function addReference(source, output, row, timestampText, label, detailScore, mealTypeKey, reportedTimestampText) {
    let parsed;
    try {
      parsed = parseMealTimestamp(timestampText);
    } catch {
      return;
    }
    if (output.basis && output.basis !== parsed.basis) throw new Error(`${source.name}: mixed timestamp bases.`);
    output.basis = parsed.basis;
    let reportedTime = null;
    if (reportedTimestampText.trim()) {
      try {
        const reported = parseMealTimestamp(reportedTimestampText);
        if (reported.basis === parsed.basis) reportedTime = reported.time;
      } catch {
      }
    }
    output.references.push({
      sourceId: source.id,
      sourceName: source.name,
      row,
      sourceTimestamp: timestampText,
      time: parsed.time,
      label,
      detailScore,
      mealTypeKey,
      reportedTime
    });
  }
  function parseMealSource(source, sourceFileIndex = 0) {
    const { headers, rows, headerRow } = findHeaderRow(source.text, source.format);
    const output = { basis: null, cgm: [], references: [], mealRecords: [] };
    if (source.format === "dexcom") {
      const timestamp = requiredIndex(headers, "timestamp (yyyy-mm-ddthh:mm:ss)", source);
      const glucose = requiredIndex(headers, "glucose value (mg/dl)", source);
      const eventType = requiredIndex(headers, "event type", source);
      rows.forEach((row, index) => {
        if ((row[eventType] ?? "").trim().toLowerCase() === "egv") addCgm(source, output, headerRow + index + 1, row[timestamp] ?? "", row[glucose] ?? "");
      });
    } else if (source.format === "libre") {
      const timestamp = requiredIndex(headers, "device timestamp", source);
      const recordType = requiredIndex(headers, "record type", source);
      const historic = requiredIndex(headers, "historic glucose mg/dl", source);
      const scan = headers.indexOf("scan glucose mg/dl");
      rows.forEach((row, index) => {
        const type = (row[recordType] ?? "").trim();
        if (type === "0") addCgm(source, output, headerRow + index + 1, row[timestamp] ?? "", row[historic] ?? "");
        else if (type === "1" && scan >= 0) addCgm(source, output, headerRow + index + 1, row[timestamp] ?? "", row[scan] ?? "");
      });
    } else if (source.format === "simple") {
      const timestamp = requiredIndex(headers, "measurement_time", source);
      const glucose = requiredIndex(headers, "blood_sugar", source);
      rows.forEach((row, index) => addCgm(source, output, headerRow + index + 1, row[timestamp] ?? "", row[glucose] ?? ""));
    } else {
      const series = requiredIndex(headers, "series", source);
      const timestamp = requiredIndex(headers, "datetime_local", source);
      const value = requiredIndex(headers, "value", source);
      const annotationKind = headers.indexOf("annotation_kind");
      const mealType = headers.indexOf("meal_type");
      const mealSize = headers.indexOf("meal_size_descriptor");
      const mealTime = headers.indexOf("meal_time_text");
      const tooltip = headers.indexOf("tooltip_text");
      const annotationClean = headers.indexOf("annotation_text_clean");
      const annotationRaw = headers.indexOf("annotation_text_raw");
      const reportedTimestamp = headers.indexOf("reported_datetime_local");
      const sourcePoint = headers.indexOf("source_point_index");
      rows.forEach((row, index) => {
        const category = (row[series] ?? "").trim().toLowerCase();
        if (source.kind === "primary" && category === "cgm") addCgm(source, output, headerRow + index + 1, row[timestamp] ?? "", row[value] ?? "");
        const annotation = annotationKind >= 0 ? (row[annotationKind] ?? "").trim().toLowerCase() : "";
        if (category.includes("meal announcement") || annotation === "meal") {
          const type = mealType >= 0 ? (row[mealType] ?? "").trim() : "";
          const size = mealSize >= 0 ? (row[mealSize] ?? "").trim() : "";
          const timeText = mealTime >= 0 ? (row[mealTime] ?? "").trim() : "";
          const descriptiveLabel = [tooltip, annotationClean, annotationRaw].map((column) => column >= 0 ? (row[column] ?? "").trim() : "").find(Boolean) ?? "";
          const fallbackLabel = [type, size].filter(Boolean).join(", ");
          const label = descriptiveLabel || fallbackLabel || "Reported meal";
          const reportedText = reportedTimestamp >= 0 ? row[reportedTimestamp] ?? "" : "";
          const detailScore = (descriptiveLabel ? 3 : 0) + (type ? 2 : 0) + (size ? 2 : 0) + (timeText ? 1 : 0) + (reportedText.trim() ? 4 : 0) + (sourcePoint >= 0 && (row[sourcePoint] ?? "").trim() ? 1 : 0);
          addReference(
            source,
            output,
            headerRow + index + 1,
            row[timestamp] ?? "",
            label,
            detailScore,
            type.toLowerCase(),
            reportedText
          );
          const parsedSourceTime = parseMealTimestamp(row[timestamp] ?? "");
          let canonicalReportedTime = null;
          if (reportedText.trim()) try {
            const reported = parseMealTimestamp(reportedText);
            if (reported.basis === parsedSourceTime.basis && reported.time >= parsedSourceTime.time && reported.time < parsedSourceTime.time + MEAL_BIN_MS) canonicalReportedTime = reported.time;
          } catch {
          }
          const metadata = Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""]));
          output.mealRecords.push({
            sourceFile: source.name,
            sourceFileIndex,
            reportedTime: canonicalReportedTime,
            includedInAnalysis: true,
            row: headerRow + index + 1,
            sourceTimestamp: row[timestamp] ?? "",
            time: parsedSourceTime.time,
            series: row[series] ?? "",
            kind: "annotation",
            value: null,
            trace: metadata.source_trace_index || metadata.source_trace_name || "",
            eventType: metadata.event_type || "",
            metadata
          });
        }
      });
    }
    return output;
  }
  function dayKey(time2) {
    return new Date(time2).toISOString().slice(0, 10);
  }
  function buildMealGrid(sources) {
    if (!sources.some((source) => source.kind === "primary")) throw new Error("Load a primary CGM source.");
    const parsed = sources.map((source, index) => parseMealSource(source, index));
    const bases = new Set(parsed.map((result) => result.basis).filter((basis) => basis !== null));
    if (bases.size > 1) throw new Error("Cannot mix offset-free and offset-aware timestamps.");
    const timeBasis = [...bases][0];
    if (!timeBasis) throw new Error("No CGM observations found.");
    const observations = parsed.flatMap((result) => result.cgm).sort((a, b) => a.time - b.time || a.row - b.row);
    if (!observations.length) throw new Error("No CGM observations found.");
    const start = Math.floor(observations[0].time / MEAL_BIN_MS) * MEAL_BIN_MS;
    const end = Math.floor(observations[observations.length - 1].time / MEAL_BIN_MS) * MEAL_BIN_MS;
    const bins = Array.from({ length: (end - start) / MEAL_BIN_MS + 1 }, (_, index) => ({
      time: start + index * MEAL_BIN_MS,
      glucose: null,
      observations: [],
      warnings: []
    }));
    observations.forEach((observation) => bins[Math.floor((observation.time - start) / MEAL_BIN_MS)].observations.push(observation));
    let duplicateObservationCount = 0;
    let conflictingBinCount = 0;
    let invalidObservationCount = 0;
    for (const bin of bins) {
      const unique = /* @__PURE__ */ new Map();
      for (const observation of bin.observations) {
        if (observation.value === null) {
          invalidObservationCount++;
          bin.warnings.push("invalid_cgm_observation");
          continue;
        }
        const identity = JSON.stringify([observation.time, observation.value]);
        if (unique.has(identity)) {
          observation.includedInAnalysis = false;
          duplicateObservationCount++;
          bin.warnings.push("duplicate_cgm_observation");
        } else unique.set(identity, observation);
      }
      const valid = [...unique.values()];
      if (new Set(valid.map((row) => row.value)).size > 1) {
        conflictingBinCount++;
        bin.warnings.push("conflicting_cgm_observations");
      }
      if (valid.length) bin.glucose = valid.reduce((sum, row) => sum + row.value, 0) / valid.length;
      bin.warnings = [...new Set(bin.warnings)];
    }
    const warnings = /* @__PURE__ */ new Set();
    if (duplicateObservationCount) warnings.add("duplicate_cgm_observations_counted_once");
    if (conflictingBinCount) warnings.add("conflicting_cgm_observations_averaged");
    if (invalidObservationCount) warnings.add("invalid_cgm_observations_excluded");
    if (timeBasis === "local_unspecified") warnings.add("timezone_unspecified_wall_clock_arithmetic");
    const reportSet = extractPumpMealReports({ timeBasis, records: parsed.flatMap((result) => result.mealRecords) });
    const references = reportSet.reports.map((report) => ({
      sourceId: report.sourceReferences[0]?.sourceFile ?? report.reportId,
      sourceName: report.sourceReferences[0]?.sourceFile ?? "",
      row: report.sourceReferences[0]?.row ?? 0,
      sourceTimestamp: report.sourceTimestamp,
      time: report.effectiveTime,
      label: report.label,
      reportId: report.reportId
    }));
    if (reportSet.reports.some((report) => report.duplicateCount > 0)) warnings.add("duplicate_meal_references_preferred_richer");
    return {
      gridVersion: MEAL_GRID_VERSION,
      exclusionRevision: 0,
      timeBasis,
      sourceIds: sources.map((source) => source.id),
      bins,
      references,
      pumpMealReports: reportSet.reports,
      pumpMealCoverageStatus: reportSet.coverageStatus,
      pumpMealCoverageBasis: reportSet.coverageBasis,
      pumpMealPolicyVersion: reportSet.policyVersion,
      validDayKeys: [...new Set(bins.filter((bin) => bin.glucose !== null).map((bin) => dayKey(bin.time)))],
      warnings: [...warnings],
      duplicateObservationCount,
      conflictingBinCount,
      invalidObservationCount
    };
  }
  function applyMealExclusions(grid, excludedTimes, exclusionRevision) {
    const excluded = new Set(excludedTimes);
    const bins = grid.bins.map((bin) => excluded.has(bin.time) ? { ...bin, glucose: null, warnings: [.../* @__PURE__ */ new Set([...bin.warnings, "excluded_implausible_bin"])] } : bin);
    return {
      ...grid,
      exclusionRevision,
      bins,
      validDayKeys: [...new Set(bins.filter((bin) => bin.glucose !== null).map((bin) => dayKey(bin.time)))]
    };
  }

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
      for (let candidate2 = index; candidate2 <= confirmationEnd; candidate2++) {
        if (glucose[candidate2] !== null && glucose[candidate2] - baseline >= params.mustIncrease) {
          confirmationIndex = candidate2;
          break;
        }
      }
      if (confirmationIndex < 0) continue;
      const peakEnd = Math.min(bins.length - 1, onsetIndex + confirmBins + 12);
      let peakIndex = onsetIndex;
      let peak = baseline;
      for (let candidate2 = onsetIndex; candidate2 <= peakEnd; candidate2++) {
        if (glucose[candidate2] !== null && glucose[candidate2] > peak) {
          peak = glucose[candidate2];
          peakIndex = candidate2;
        }
      }
      const areaEnd = Math.min(bins.length - 1, onsetIndex + 24);
      let area2h = 0;
      for (let candidate2 = onsetIndex + 1; candidate2 <= areaEnd; candidate2++) {
        const left = glucose[candidate2 - 1];
        const right = glucose[candidate2];
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
  function buildGridFromLegacyRows(rows) {
    const parsed = rows.map((row, index) => ({
      time: new Date(row.Timestamp).getTime(),
      value: Number.isFinite(Number(row.GlucoseValue)) ? Number(row.GlucoseValue) : null,
      index
    })).filter((row) => Number.isFinite(row.time)).sort((a, b) => a.time - b.time);
    if (!parsed.length) return { gridVersion: "legacy-worker-grid-v1", exclusionRevision: 0, timeBasis: "utc", sourceIds: ["legacy"], bins: [], references: [], pumpMealReports: [], pumpMealCoverageStatus: "unavailable", pumpMealCoverageBasis: "legacy rows contain no report source", pumpMealPolicyVersion: "pump-meal-reports-v1", validDayKeys: [], warnings: [], duplicateObservationCount: 0, conflictingBinCount: 0, invalidObservationCount: 0 };
    const start = Math.floor(parsed[0].time / MEAL_BIN_MS) * MEAL_BIN_MS;
    const end = Math.ceil(parsed[parsed.length - 1].time / MEAL_BIN_MS) * MEAL_BIN_MS;
    const bins = Array.from({ length: (end - start) / MEAL_BIN_MS + 1 }, (_, index) => ({ time: start + index * MEAL_BIN_MS, glucose: null, observations: [], warnings: [] }));
    const grouped = /* @__PURE__ */ new Map();
    for (const row of parsed) {
      if (row.value === null) continue;
      const index = Math.floor((row.time - start) / MEAL_BIN_MS);
      const values = grouped.get(index) ?? [];
      values.push(row.value);
      grouped.set(index, values);
    }
    grouped.forEach((values, index) => {
      bins[index].glucose = values.reduce((sum, value) => sum + value, 0) / values.length;
    });
    return {
      gridVersion: "legacy-worker-grid-v1",
      exclusionRevision: 0,
      timeBasis: "utc",
      sourceIds: ["legacy"],
      bins,
      references: [],
      pumpMealReports: [],
      pumpMealCoverageStatus: "unavailable",
      pumpMealCoverageBasis: "legacy rows contain no report source",
      pumpMealPolicyVersion: "pump-meal-reports-v1",
      validDayKeys: [...new Set(bins.filter((bin) => bin.glucose !== null).map((bin) => new Date(bin.time).toISOString().slice(0, 10)))],
      warnings: [],
      duplicateObservationCount: 0,
      conflictingBinCount: 0,
      invalidObservationCount: 0
    };
  }
  function detectionToLegacyResult(event, formatTime = (time2) => new Date(time2).toISOString()) {
    const timestamp = formatTime(event.t0);
    return {
      Timestamp: timestamp,
      t0: timestamp,
      t_confirm: formatTime(event.tConfirm),
      time_to_confirm_min: event.timeToConfirmMin,
      t_peak: formatTime(event.tPeak),
      peak: event.peak,
      peakOneHour: event.peakOneHour,
      area_2h: event.area2h
    };
  }
  function detectLegacyRows(rows, params) {
    const sourceTimes = new Map(rows.map((row) => [new Date(row.Timestamp).getTime(), row.Timestamp]));
    const formatTime = (time2) => sourceTimes.get(time2) ?? new Date(time2).toISOString();
    return detectMeals(buildGridFromLegacyRows(rows), params).map((event) => detectionToLegacyResult(event, formatTime));
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
    for (let time2 = expectedStart; time2 <= expectedEnd; time2 += MEAL_BIN_MS) {
      const index = Math.round((time2 - grid.bins[0].time) / MEAL_BIN_MS);
      rows.push({
        minute: (time2 - detection.t0) / 6e4,
        time: time2,
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

  // src/meal-analysis/matching.ts
  var MEAL_MATCH_SCORE_VERSION = "meal-detect-core-score-v1";
  var DEFAULT_MATCH_CUTOFF_MINUTES = 60;
  function usableAt(grid, time2) {
    const values = new Map(grid.bins.map((bin) => [bin.time, bin.glucose]));
    const origin = grid.bins[0]?.time ?? time2;
    const alignedTime = origin + Math.floor((time2 - origin) / MEAL_BIN_MS) * MEAL_BIN_MS;
    for (let offset = -MEAL_BIN_MS; offset <= 60 * 6e4; offset += MEAL_BIN_MS) {
      if (values.get(alignedTime + offset) === null || !values.has(alignedTime + offset)) return false;
    }
    return true;
  }
  function eligiblePumpMealReports(grid, scope) {
    const eligible = [];
    const reasons = [];
    for (const report of grid.pumpMealReports) {
      if (report.effectiveTime < scope.startMs || report.effectiveTime > scope.endMs) reasons.push(`${report.reportId}:outside_scope`);
      else if (!usableAt(grid, report.effectiveTime)) reasons.push(`${report.reportId}:insufficient_continuous_cgm`);
      else eligible.push(report);
    }
    return { eligible, excludedCount: reasons.length, reasons, version: MEAL_REFERENCE_ELIGIBILITY_VERSION };
  }
  function eligibleMealDetections(grid, detections) {
    return detections.filter((detection) => usableAt(grid, detection.t0));
  }
  function matchPumpReports(reportRows, detections, cutoffMinutes = DEFAULT_MATCH_CUTOFF_MINUTES) {
    const reports = reportRows.map((report, inputIndex) => ({ report, inputIndex })).sort((a, b) => a.report.effectiveTime - b.report.effectiveTime || a.inputIndex - b.inputIndex);
    const detected = detections.map((detection, inputIndex) => ({ detection, inputIndex })).sort((a, b) => a.detection.t0 - b.detection.t0 || a.inputIndex - b.inputIndex);
    const used = /* @__PURE__ */ new Set();
    const matches = [];
    for (const { report } of reports) {
      let nearestIndex = -1;
      let nearestDistance = Infinity;
      let nearestOffset = 0;
      for (let index = 0; index < detected.length; index++) {
        if (used.has(index)) continue;
        const offset = (detected[index].detection.t0 - report.effectiveTime) / 6e4;
        const distance = Math.abs(offset);
        if (distance < nearestDistance) {
          nearestIndex = index;
          nearestDistance = distance;
          nearestOffset = offset;
        }
      }
      if (nearestIndex < 0 || nearestDistance > cutoffMinutes) continue;
      used.add(nearestIndex);
      matches.push({
        reportId: report.reportId,
        reportTime: report.effectiveTime,
        detectionTime: detected[nearestIndex].detection.t0,
        offsetMinutes: nearestOffset
      });
    }
    return matches;
  }
  function scoreReportMatches(referenceCount, detectionCount, matches, cutoffMinutes = DEFAULT_MATCH_CUTOFF_MINUTES) {
    if (!referenceCount) return 0;
    const matchedScore = matches.reduce((total, match) => {
      const distance = Math.abs(match.offsetMinutes);
      return total + (distance === 0 ? 1 : 1 - distance / cutoffMinutes);
    }, 0);
    const missedReportPenalty = referenceCount - matches.length;
    const unmatchedDetectionPenalty = detectionCount - matches.length;
    return (matchedScore - missedReportPenalty - unmatchedDetectionPenalty) / referenceCount;
  }

  // src/meal-analysis/optimize.ts
  var MEAL_OPTIMIZATION_TOTAL = 800;
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
  function dayKey2(time2) {
    return new Date(time2).toISOString().slice(0, 10);
  }
  function gridForMealScope(grid, scope) {
    const bins = grid.bins.filter((bin) => bin.time >= scope.startMs && bin.time <= scope.endMs);
    const validDayKeys = [...new Set(bins.filter((bin) => bin.glucose !== null).map((bin) => dayKey2(bin.time)))];
    return { ...grid, bins, validDayKeys };
  }
  function optimizeMealParams(grid, options) {
    if (!Number.isFinite(options.targetMealsPerDay) || options.targetMealsPerDay <= 0) {
      throw new Error("Target meals per day must be a positive finite number.");
    }
    const analyzedDayCount = grid.validDayKeys.length;
    if (!grid.bins.length || analyzedDayCount < 1) throw new Error("The meal analysis scope contains no valid CGM observations.");
    const candidates = options.candidates ?? defaultMealOptimizationGrid();
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
  function compareReportMatchRows(left, right) {
    return right.score - left.score || (right.matchedReports ?? 0) - (left.matchedReports ?? 0) || (left.unmatchedReports ?? 0) - (right.unmatchedReports ?? 0) || (left.unmatchedDetections ?? 0) - (right.unmatchedDetections ?? 0) || left.numConsecutiveIncrease - right.numConsecutiveIncrease || left.mustIncrease - right.mustIncrease || left.triggerRateMgdlPerMin - right.triggerRateMgdlPerMin || left.mealBlockoutMinutes - right.mealBlockoutMinutes;
  }
  function optimizeMealParamsAgainstReports(grid, scope, options) {
    if (!Number.isFinite(options.cutoffMinutes ?? DEFAULT_MATCH_CUTOFF_MINUTES) || (options.cutoffMinutes ?? 0) < 0) {
      throw new Error("Meal-report match cutoff must be a non-negative finite number.");
    }
    const references = eligiblePumpMealReports(grid, scope);
    if (!references.eligible.length) throw new Error("Match pump-reported meals is unavailable because no eligible reports have continuous CGM context.");
    const cutoffMinutes = options.cutoffMinutes ?? DEFAULT_MATCH_CUTOFF_MINUTES;
    const candidates = options.candidates ?? defaultMealOptimizationGrid();
    const rows = [];
    for (let index = 0; index < candidates.length; index++) {
      if (options.isCancelled?.()) throw new Error("Meal analysis cancelled.");
      const params = candidates[index];
      const allDetections = detectMeals(grid, params);
      const detections = eligibleMealDetections(grid, allDetections);
      const matches = matchPumpReports(references.eligible, detections, cutoffMinutes);
      const score = scoreReportMatches(references.eligible.length, detections.length, matches, cutoffMinutes);
      rows.push({
        ...params,
        objective: "match_pump_reports",
        detectedCount: allDetections.length,
        achievedMealsPerDay: allDetections.length / Math.max(1, grid.validDayKeys.length),
        countPenalty: 0,
        score,
        matchedReports: matches.length,
        unmatchedDetections: detections.length - matches.length,
        unmatchedReports: references.eligible.length - matches.length,
        eligibleDetectionCount: detections.length,
        eligibleReportCount: references.eligible.length
      });
      options.onProgress?.({ evaluated: index + 1, total: candidates.length });
    }
    rows.sort(compareReportMatchRows);
    return { best: rows[0], rows, analyzedDayCount: grid.validDayKeys.length };
  }
  function buildOptimizedMealRun(fullGrid, options) {
    const detectionGrid = gridForMealScope(fullGrid, options.scope);
    const reportMode = "objective" in options && options.objective === "match_pump_reports";
    const optimization = reportMode ? optimizeMealParamsAgainstReports(detectionGrid, options.scope, options) : optimizeMealParams(detectionGrid, options);
    if (options.isCancelled?.()) throw new Error("Meal analysis cancelled.");
    const params = {
      triggerRateMgdlPerMin: optimization.best.triggerRateMgdlPerMin,
      mustIncrease: optimization.best.mustIncrease,
      mealBlockoutMinutes: optimization.best.mealBlockoutMinutes,
      numConsecutiveIncrease: optimization.best.numConsecutiveIncrease,
      confirmWindowMinutes: optimization.best.confirmWindowMinutes
    };
    return { run: buildMealRunFromOptimizedParams(fullGrid, options, params), optimization };
  }
  function buildMealRunFromOptimizedParams(fullGrid, options, params) {
    const detectionGrid = gridForMealScope(fullGrid, options.scope);
    const reportMode = "objective" in options && options.objective === "match_pump_reports";
    const run = buildParameterMealRun(fullGrid, { ...options, params, targetMealsPerDay: null });
    if (!reportMode) return {
      ...run,
      optimizationObjective: "target_meals_per_day",
      targetMealsPerDay: options.targetMealsPerDay
    };
    const reportOptions = options;
    const referenceSet = eligiblePumpMealReports(detectionGrid, options.scope);
    const eligibleDetections = eligibleMealDetections(detectionGrid, detectMeals(detectionGrid, params));
    const cutoffMinutes = reportOptions.cutoffMinutes ?? DEFAULT_MATCH_CUTOFF_MINUTES;
    const matches = matchPumpReports(referenceSet.eligible, eligibleDetections, cutoffMinutes);
    return {
      ...run,
      optimizationObjective: "match_pump_reports",
      targetMealsPerDay: null,
      matchingVersion: MEAL_MATCHING_VERSION,
      scoringVersion: MEAL_MATCH_SCORE_VERSION,
      referenceEligibilityVersion: referenceSet.version,
      matchToleranceBeforeMinutes: cutoffMinutes,
      matchToleranceAfterMinutes: cutoffMinutes,
      eligibleReportCount: referenceSet.eligible.length,
      excludedReportCount: referenceSet.excludedCount,
      excludedReportReasons: referenceSet.reasons,
      matchedReportCount: matches.length,
      unmatchedDetectionCount: eligibleDetections.length - matches.length,
      unmatchedReportCount: referenceSet.eligible.length - matches.length,
      optimizationScore: scoreReportMatches(referenceSet.eligible.length, eligibleDetections.length, matches, cutoffMinutes),
      optimizerMatches: matches
    };
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
      optimizationObjective: "parameter_only",
      params,
      analyzedDayCount,
      detectedCount: events.length,
      achievedMealsPerDay: events.length / analyzedDayCount,
      sourceIds: [...fullGrid.sourceIds],
      analysisBounds: { startMs: detectionGrid.bins[0].time, endMs: detectionGrid.bins[detectionGrid.bins.length - 1].time },
      gridWarnings: [...fullGrid.warnings],
      reportCoverageStatus: fullGrid.pumpMealCoverageStatus,
      reportCoverageBasis: fullGrid.pumpMealCoverageBasis,
      reportPolicyVersion: fullGrid.pumpMealPolicyVersion,
      matchingVersion: null,
      scoringVersion: null,
      referenceEligibilityVersion: null,
      matchToleranceBeforeMinutes: null,
      matchToleranceAfterMinutes: null,
      eligibleReportCount: null,
      excludedReportCount: null,
      excludedReportReasons: [],
      matchedReportCount: null,
      unmatchedDetectionCount: null,
      unmatchedReportCount: null,
      optimizationScore: null,
      optimizerMatches: [],
      events
    };
    return run;
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
  function csvCell(value) {
    if (value === null || value === void 0 || typeof value === "number" && !Number.isFinite(value)) return "";
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function mealRunToCsv(run, events = run.events) {
    const header = MEAL_EVENT_CSV_COLUMNS.map((column) => csvCell(column.key)).join(",");
    const rows = events.map((event) => MEAL_EVENT_CSV_COLUMNS.map((column) => csvCell(column.value(run, event))).join(","));
    return [header, ...rows].join("\r\n");
  }

  // src/meal-analysis/source-state.ts
  function createMealSourceState() {
    return { primary: [], supplemental: [], grid: null, revision: 0, latestGeneration: 0 };
  }
  function beginMealSourceImport(state) {
    const token = state.latestGeneration + 1;
    return { state: { ...state, latestGeneration: token }, token };
  }
  function commitMealSourceImport(state, update) {
    if (update.token !== state.latestGeneration) return state;
    const source = { id: `${update.kind}-${update.token}`, name: update.name, text: update.text, kind: update.kind, format: update.format };
    const primary = update.kind === "primary" ? update.merge ? [...state.primary, source] : [source] : state.primary;
    const supplemental = update.kind === "supplemental" ? update.merge ? [...state.supplemental, source] : [source] : update.kind === "primary" ? [] : state.supplemental;
    const grid = buildMealGrid([...primary, ...supplemental]);
    return { ...state, primary, supplemental, grid, revision: state.revision + 1 };
  }
  return __toCommonJS(index_exports);
})();
