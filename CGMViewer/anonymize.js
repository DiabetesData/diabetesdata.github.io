"use strict";
(() => {
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

  // src/anonymize/date-mapping.ts
  var DAY_MS = 864e5;
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function parseDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    return validateParts({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: 0,
      minute: 0,
      second: 0,
      includedSeconds: false
    });
  }
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
  function dayNumber(parts) {
    return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
  }
  function partsFromDayNumber(value) {
    const date = new Date(value * DAY_MS);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate()
    };
  }
  function weekdayForDate(value) {
    const parsed = parseDateOnly(value);
    if (!parsed) return null;
    return new Date(dayNumber(parsed) * DAY_MS).getUTCDay();
  }
  function nextDateWithWeekday(preferredDate, weekday) {
    const parsed = parseDateOnly(preferredDate);
    if (!parsed || weekday < 0 || weekday > 6) return null;
    const preferredDay = dayNumber(parsed);
    const currentWeekday = new Date(preferredDay * DAY_MS).getUTCDay();
    const delta = (weekday - currentWeekday + 7) % 7;
    return formatDateOnly(partsFromDayNumber(preferredDay + delta));
  }
  function shiftLocalDateTime(source, sourceStartDay, syntheticStartDay) {
    const shiftedDate = partsFromDayNumber(syntheticStartDay + (dayNumber(source) - sourceStartDay));
    return { ...source, ...shiftedDate };
  }
  function formatDateOnly(parts) {
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }
  function formatDateRaw(parts) {
    const weekday = new Date(dayNumber(parts) * DAY_MS).getUTCDay();
    return `${WEEKDAYS[weekday]}, ${MONTHS[parts.month - 1]} ${parts.day}`;
  }
  function formatTimeIso(parts) {
    return `${pad(parts.hour)}:${pad(parts.minute)}`;
  }
  function formatLocalDateTime(parts) {
    const base = `${formatDateOnly(parts)} ${formatTimeIso(parts)}`;
    return parts.includedSeconds ? `${base}:${pad(parts.second)}` : base;
  }
  function formatDateRange(first, last) {
    return first === last ? first : `${first} to ${last}`;
  }
  function pad(value) {
    return String(value).padStart(2, "0");
  }

  // src/anonymize/quality.ts
  function prepareRows(files) {
    const rows = [];
    let unassessed = 0;
    const incompleteBins = /* @__PURE__ */ new Set();
    const clock = (values) => {
      const bin = parseLocalDateTime(values.datetime_local || "");
      const reportedText = (values.reported_datetime_local || "").trim();
      const reported = parseLocalDateTime(reportedText);
      const millis = (parts) => Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
      const usable = bin && reported && millis(reported) >= millis(bin) && millis(reported) < millis(bin) + 3e5;
      const binKey = JSON.stringify([(values.series || "").trim().toLowerCase(), bin ? formatLocalDateTime({ ...bin, includedSeconds: true }) : values.datetime_local]);
      return { bin, reported, reportedText, usable, binKey };
    };
    for (const { table } of files) {
      const headers = table.headers.map((header) => header.toLowerCase());
      for (const cells of table.rows) {
        const values = Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
        const time = clock(values);
        if (!time.usable) incompleteBins.add(time.binKey);
      }
    }
    for (const { file, table } of files) {
      const headers = table.headers.map((header) => header.toLowerCase());
      table.rows.forEach((cells, index) => {
        const values = Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
        const series = (values.series || "").trim().toLowerCase();
        const measurementType = series === "cgm" || series.includes("glucose") ? "CGM" : series.includes("insulin") ? "Insulin" : series.includes("meal") ? "Meal" : series.includes("event") ? "Event" : "Other";
        const measurement = series === "cgm" || series.includes("glucose") || series.includes("insulin");
        const time = clock(values);
        const timestamp = time.usable && !incompleteBins.has(time.binKey) ? time.reported : time.bin;
        const rawValue = (values.value || "").trim();
        const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(rawValue) ? Number(rawValue) : NaN;
        const valid = measurement && timestamp !== null && (!time.reportedText || !!time.usable) && Number.isFinite(numeric);
        if (measurement && !valid) unassessed++;
        rows.push({
          reference: { file, row: index + 2 },
          measurementType,
          exactKey: JSON.stringify(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))),
          measurementKey: valid ? JSON.stringify([series, formatLocalDateTime({ ...timestamp, includedSeconds: true })]) : null,
          valueKey: valid ? String(numeric) : null
        });
      });
    }
    return { rows, unassessed };
  }
  function groupRows(rows, key) {
    const groups = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const value = key(row);
      if (value === null) continue;
      const group = groups.get(value);
      if (group) group.push(row);
      else groups.set(value, [row]);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  }
  function buildAudit(rows, unassessed) {
    const exact = groupRows(rows, (row) => row.exactKey);
    const repeated = groupRows(rows, (row) => row.measurementKey === null ? null : JSON.stringify([row.measurementKey, row.valueKey]));
    const conflicting = groupRows(rows, (row) => row.measurementKey).filter((group) => new Set(group.map((row) => row.valueKey)).size > 1);
    const issues = [];
    for (const [kind, groups] of [["identical_rows", exact], ["repeated_measurements", repeated], ["conflicting_measurements", conflicting]]) {
      for (const group of groups) issues.push({ kind, measurementType: group[0].measurementType, rows: group.map((row) => row.reference) });
    }
    return {
      identicalRowGroups: exact.length,
      identicalExtraRows: exact.reduce((sum, group) => sum + group.length - 1, 0),
      repeatedMeasurementGroups: repeated.length,
      repeatedExtraMeasurements: repeated.reduce((sum, group) => sum + group.length - 1, 0),
      conflictingMeasurementGroups: conflicting.length,
      unassessedMeasurementRows: unassessed,
      issues
    };
  }
  function auditTables(files) {
    const prepared = prepareRows(files);
    return buildAudit(prepared.rows, prepared.unassessed);
  }
  var pairs = (count) => count * (count - 1) / 2;
  function equalPairs(rows, key) {
    return groupRows(rows, key).reduce((sum, group) => sum + pairs(group.length), 0);
  }
  function compareTableQuality(source, output) {
    if (source.length !== output.length || source.some((item, index) => item.file !== output[index].file || item.table.rows.length !== output[index].table.rows.length)) {
      throw new Error("Cannot compare data quality: anonymization changed file or row correspondence.");
    }
    const before = prepareRows(source);
    const after = prepareRows(output);
    const sourceAudit = buildAudit(before.rows, before.unassessed);
    const outputAudit = buildAudit(after.rows, after.unassessed);
    const sourceRows = new Map(before.rows.map((row) => [JSON.stringify(row.reference), row]));
    const outputRows = new Map(after.rows.map((row) => [JSON.stringify(row.reference), row]));
    for (const issue of outputAudit.issues) {
      const originals = issue.rows.map((reference) => sourceRows.get(JSON.stringify(reference)));
      let existing = false;
      let introduced = false;
      if (issue.kind === "conflicting_measurements") {
        const outputValue = (row) => outputRows.get(JSON.stringify(row.reference)).valueKey;
        const total = pairs(originals.length) - equalPairs(originals, outputValue);
        let inherited = 0;
        for (const group of groupRows(originals.filter((row) => row.valueKey !== null), (row) => row.measurementKey)) {
          inherited += pairs(group.length) - equalPairs(group, (row) => row.valueKey) - equalPairs(group, outputValue) + equalPairs(group, (row) => JSON.stringify([row.valueKey, outputValue(row)]));
        }
        existing = inherited > 0;
        introduced = inherited < total;
      } else {
        const keys = originals.map((row) => issue.kind === "identical_rows" ? row.exactKey : row.measurementKey === null ? JSON.stringify(row.reference) : JSON.stringify([row.measurementKey, row.valueKey]));
        const distinct = new Set(keys).size;
        existing = distinct < keys.length;
        introduced = distinct > 1;
      }
      issue.origin = existing && introduced ? "source_and_introduced" : introduced ? "introduced" : "source";
    }
    const introducedCount = (kind) => outputAudit.issues.filter((issue) => issue.kind === kind && issue.origin !== "source").length;
    return {
      source: sourceAudit,
      output: outputAudit,
      introducedIdenticalRowGroups: introducedCount("identical_rows"),
      introducedRepeatedMeasurementGroups: introducedCount("repeated_measurements"),
      introducedConflictingMeasurementGroups: introducedCount("conflicting_measurements")
    };
  }

  // src/anonymize/anonymize.ts
  var SERIES_CSV_HEADERS = [
    "chartIndex",
    "date_raw",
    "date_iso",
    "series",
    "time_raw",
    "time_iso",
    "datetime_local",
    "value",
    "annotation_kind",
    "annotation_text_raw",
    "annotation_text_clean",
    "tooltip_text",
    "meal_type",
    "meal_code",
    "meal_size_descriptor",
    "meal_time_text",
    "event_type",
    "event_time_text",
    "source_trace_index",
    "source_trace_name",
    "reported_datetime_local",
    "source_point_index"
  ];
  var KNOWN_HEADER_BY_LOWER = new Map(SERIES_CSV_HEADERS.map((header) => [header.toLowerCase(), header]));
  var REQUIRED_HEADERS = ["series", "datetime_local", "value"];
  var SAFE_MEAL_TYPES = /* @__PURE__ */ new Map([
    ["breakfast", "Breakfast"],
    ["lunch", "Lunch"],
    ["dinner", "Dinner"],
    ["snack", "Snack"]
  ]);
  var SAFE_MEAL_CODES = /* @__PURE__ */ new Set(["B", "L", "D", "S"]);
  var SAFE_MEAL_SIZES = /* @__PURE__ */ new Map([
    ["less than usual", "Less Than Usual"],
    ["usual", "Usual"],
    ["more than usual", "More Than Usual"],
    ["small", "Small"],
    ["medium", "Medium"],
    ["large", "Large"]
  ]);
  function inspectSourceFiles(files) {
    const inspections = [];
    const errors = [];
    let earliestDate = null;
    let latestDate = null;
    const auditSources = [];
    files.forEach((file, fileIndex) => {
      try {
        const table = parseCsv(file.text);
        auditSources.push({ file: fileIndex + 1, table });
        const lookup = buildHeaderLookup(table.headers);
        const missingHeaders = REQUIRED_HEADERS.filter((header) => !lookup.has(header));
        const unknownHeaders = table.headers.filter((header) => !KNOWN_HEADER_BY_LOWER.has(header.toLowerCase()));
        const invalidTimestampRows = [];
        const series = /* @__PURE__ */ new Set();
        let fileEarliest = null;
        let fileLatest = null;
        if (missingHeaders.length > 0) {
          errors.push(`${file.name}: missing required column(s): ${missingHeaders.join(", ")}.`);
        } else {
          const timestampIndex = lookup.get("datetime_local");
          const seriesIndex = lookup.get("series");
          for (let index = 0; index < table.rows.length; index++) {
            const row = table.rows[index];
            const reportedIndex = lookup.get("reported_datetime_local");
            const reported = reportedIndex === void 0 ? "" : (row[reportedIndex] ?? "").trim();
            if (reported && !parseLocalDateTime(reported)) {
              errors.push(`${file.name}: invalid reported_datetime_local on row ${index + 2}.`);
            }
            const timestamp = parseLocalDateTime(row[timestampIndex] ?? "");
            if (!timestamp) {
              invalidTimestampRows.push(index + 2);
            } else {
              const date = formatDateOnly(timestamp);
              fileEarliest = earlierDate(fileEarliest, date);
              fileLatest = laterDate(fileLatest, date);
            }
            const seriesValue = (row[seriesIndex] ?? "").trim();
            if (seriesValue) series.add(seriesValue);
          }
        }
        if (invalidTimestampRows.length > 0) {
          errors.push(`${file.name}: ${invalidTimestampRows.length} row(s) have invalid datetime_local values.`);
        }
        if (table.rows.length === 0) {
          errors.push(`${file.name}: the file has no data rows.`);
        }
        if (fileEarliest) earliestDate = earlierDate(earliestDate, fileEarliest);
        if (fileLatest) latestDate = laterDate(latestDate, fileLatest);
        const warnings = [];
        if (unknownHeaders.length > 0) {
          warnings.push(`Share-safe output will omit unknown column(s): ${unknownHeaders.join(", ")}.`);
        }
        const unrecognizedSeries = Array.from(series).filter((value) => classifySeries(value) === null).sort();
        if (unrecognizedSeries.length > 0) {
          warnings.push(`Share-safe output requires a policy for unrecognized series: ${unrecognizedSeries.join(", ")}.`);
        }
        inspections.push({
          quality: auditTables([{ file: fileIndex + 1, table }]),
          name: file.name,
          rowCount: table.rows.length,
          headers: table.headers,
          unknownHeaders,
          series: Array.from(series).sort(),
          unrecognizedSeries,
          earliestDate: fileEarliest,
          latestDate: fileLatest,
          invalidTimestampRows,
          warnings
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${file.name}: ${message}`);
        inspections.push({
          quality: auditTables([]),
          name: file.name,
          rowCount: 0,
          headers: [],
          unknownHeaders: [],
          series: [],
          unrecognizedSeries: [],
          earliestDate: null,
          latestDate: null,
          invalidTimestampRows: [],
          warnings: []
        });
      }
    });
    if (files.length === 0) errors.push("Select at least one CSV file.");
    if (!earliestDate || !latestDate) errors.push("No valid source date range was found.");
    return {
      quality: auditTables(auditSources),
      files: inspections,
      earliestDate,
      latestDate,
      weekday: earliestDate ? weekdayForDate(earliestDate) : null,
      canTransform: errors.length === 0,
      errors
    };
  }
  function anonymizeSourceFiles(files, options) {
    const inspection2 = inspectSourceFiles(files);
    if (!inspection2.canTransform || !inspection2.earliestDate || !inspection2.latestDate) {
      throw new Error(inspection2.errors.join(" "));
    }
    if (options.profile === "share-safe") {
      const unrecognizedSeries = inspection2.files.flatMap((file) => file.unrecognizedSeries);
      if (unrecognizedSeries.length > 0) {
        throw new Error(`Share-safe output is blocked until a policy is defined for series: ${Array.from(new Set(unrecognizedSeries)).join(", ")}.`);
      }
    }
    const sourceStart = parseDateOnly(inspection2.earliestDate);
    const syntheticStart = parseDateOnly(options.syntheticStartDate);
    if (!syntheticStart) {
      throw new Error("Synthetic start date must use YYYY-MM-DD.");
    }
    if (weekdayForDate(inspection2.earliestDate) !== weekdayForDate(options.syntheticStartDate)) {
      throw new Error("Synthetic start date must have the same weekday as the earliest source date.");
    }
    const sourceStartDay = dayNumber(sourceStart);
    const syntheticStartDay = dayNumber(syntheticStart);
    const dayShift = syntheticStartDay - sourceStartDay;
    const syntheticEndParts = parseDateOnly(inspection2.latestDate);
    const syntheticEnd = formatDateOnly({
      ...syntheticEndParts,
      ...dateFromDayNumber(dayNumber(syntheticEndParts) + dayShift)
    });
    const traceMap = /* @__PURE__ */ new Map();
    const pseudonym = sanitizePseudonym(options.pseudonym);
    const outputs = files.map((file, index) => anonymizeFile(
      file,
      options,
      sourceStartDay,
      syntheticStartDay,
      traceMap,
      `${pseudonym}_${String(index + 1).padStart(2, "0")}.csv`,
      index + 1
    ));
    return {
      quality: compareTableQuality(
        files.map((file, index) => ({ file: index + 1, table: parseCsv(file.text) })),
        outputs.map((file, index) => ({ file: index + 1, table: parseCsv(file.csv) }))
      ),
      files: outputs,
      sourceDateRange: formatDateRange(inspection2.earliestDate, inspection2.latestDate),
      syntheticDateRange: formatDateRange(options.syntheticStartDate, syntheticEnd),
      profile: options.profile
    };
  }
  function anonymizeFile(file, options, sourceStartDay, syntheticStartDay, traceMap, outputName, fileNumber) {
    const table = parseCsv(file.text);
    const lookup = buildHeaderLookup(table.headers);
    const unknownHeaders = table.headers.filter((header) => !KNOWN_HEADER_BY_LOWER.has(header.toLowerCase()));
    const outputHeaders = options.profile === "share-safe" ? table.headers.filter((header) => KNOWN_HEADER_BY_LOWER.has(header.toLowerCase())).map((header) => KNOWN_HEADER_BY_LOWER.get(header.toLowerCase())) : table.headers.slice();
    const chartMap = /* @__PURE__ */ new Map();
    const warningSet = /* @__PURE__ */ new Set();
    let sourceFirst = null;
    let sourceLast = null;
    let syntheticFirst = null;
    let syntheticLast = null;
    if (options.profile === "date-shift-only") {
      warningSet.add("Date-shift-only output retains free text and is not share-safe.");
    }
    if (unknownHeaders.length > 0 && options.profile === "share-safe") {
      warningSet.add(`Omitted unknown column(s): ${unknownHeaders.join(", ")}.`);
    }
    const outputRows = table.rows.map((row, rowIndex) => {
      const timestampIndex = lookup.get("datetime_local");
      const timestamp = timestampIndex === void 0 ? null : parseLocalDateTime(row[timestampIndex] ?? "");
      if (!timestamp) {
        throw new Error(`${file.name}: invalid datetime_local on row ${rowIndex + 2}.`);
      }
      const shifted = shiftLocalDateTime(timestamp, sourceStartDay, syntheticStartDay);
      const sourceDate = formatDateOnly(timestamp);
      const shiftedDate = formatDateOnly(shifted);
      sourceFirst = earlierDate(sourceFirst, sourceDate);
      sourceLast = laterDate(sourceLast, sourceDate);
      syntheticFirst = earlierDate(syntheticFirst, shiftedDate);
      syntheticLast = laterDate(syntheticLast, shiftedDate);
      const input = objectByLowerHeader(table.headers, row);
      const reported = input.get("reported_datetime_local")?.trim() ?? "";
      const shiftedReported = reported ? formatLocalDateTime(shiftLocalDateTime(parseLocalDateTime(reported), sourceStartDay, syntheticStartDay)) : "";
      if (options.profile === "date-shift-only") {
        return table.headers.map((header) => header.toLowerCase() === "reported_datetime_local" ? shiftedReported : shiftedOrOriginalValue(header, input.get(header.toLowerCase()) ?? "", shifted));
      }
      const safeSeries = normalizeSeries(input.get("series") ?? "", warningSet);
      const mealType = allowMappedValue(input.get("meal_type") ?? "", SAFE_MEAL_TYPES, "meal type", warningSet);
      const mealCode = allowMealCode(input.get("meal_code") ?? "", warningSet);
      const mealSize = allowMappedValue(input.get("meal_size_descriptor") ?? "", SAFE_MEAL_SIZES, "meal size", warningSet);
      const mealTime = safeTimeText(input.get("meal_time_text") ?? "", "meal time", warningSet);
      const eventTime = safeTimeText(input.get("event_time_text") ?? "", "event time", warningSet);
      const eventType = normalizeEventType(input.get("event_type") ?? "", safeSeries, warningSet);
      const traceKey = JSON.stringify([input.get("source_trace_index"), input.get("source_trace_name"), safeSeries]);
      if (!traceMap.has(traceKey)) traceMap.set(traceKey, String(traceMap.size + 1));
      const originalChart = input.get("chartindex") ?? "";
      if (originalChart && !chartMap.has(originalChart)) chartMap.set(originalChart, String(chartMap.size + 1));
      const annotationKind = safeSeries === "Meal Announcement" ? "Meal" : safeSeries === "Event" ? "Event" : "";
      const cleanAnnotation = buildCleanAnnotation(safeSeries, mealType, mealSize, mealTime, eventType, eventTime);
      const safeValues = /* @__PURE__ */ new Map([
        ["reported_datetime_local", shiftedReported],
        ["source_point_index", /^\d+$/.test(input.get("source_point_index") ?? "") ? input.get("source_point_index") : ""],
        ["chartindex", originalChart ? chartMap.get(originalChart) : ""],
        ["date_raw", formatDateRaw(shifted)],
        ["date_iso", shiftedDate],
        ["series", safeSeries],
        ["time_raw", String(shifted.hour * 60 + shifted.minute)],
        ["time_iso", formatTimeIso(shifted)],
        ["datetime_local", formatLocalDateTime(shifted)],
        ["value", input.get("value") ?? ""],
        ["annotation_kind", annotationKind],
        ["annotation_text_raw", ""],
        ["annotation_text_clean", cleanAnnotation],
        ["tooltip_text", cleanAnnotation],
        ["meal_type", safeSeries === "Meal Announcement" ? mealType : ""],
        ["meal_code", safeSeries === "Meal Announcement" ? mealCode : ""],
        ["meal_size_descriptor", safeSeries === "Meal Announcement" ? mealSize : ""],
        ["meal_time_text", safeSeries === "Meal Announcement" ? mealTime : ""],
        ["event_type", safeSeries === "Event" ? eventType : ""],
        ["event_time_text", safeSeries === "Event" ? eventTime : ""],
        ["source_trace_index", traceMap.get(traceKey)],
        ["source_trace_name", safeSeries]
      ]);
      return outputHeaders.map((header) => safeValues.get(header.toLowerCase()) ?? "");
    });
    return {
      quality: compareTableQuality(
        [{ file: fileNumber, table }],
        [{ file: fileNumber, table: { headers: outputHeaders, rows: outputRows } }]
      ),
      sourceName: file.name,
      outputName,
      csv: serializeCsv({ headers: outputHeaders, rows: outputRows }),
      rowCount: outputRows.length,
      sourceDateRange: formatDateRange(sourceFirst, sourceLast),
      syntheticDateRange: formatDateRange(syntheticFirst, syntheticLast),
      removedHeaders: options.profile === "share-safe" ? unknownHeaders : [],
      warnings: Array.from(warningSet)
    };
  }
  function buildHeaderLookup(headers) {
    return new Map(headers.map((header, index) => [header.toLowerCase(), index]));
  }
  function objectByLowerHeader(headers, row) {
    return new Map(headers.map((header, index) => [header.toLowerCase(), row[index] ?? ""]));
  }
  function shiftedOrOriginalValue(header, originalValue, shifted) {
    switch (header.toLowerCase()) {
      case "date_raw":
        return formatDateRaw(shifted);
      case "date_iso":
        return formatDateOnly(shifted);
      case "time_raw":
        return String(shifted.hour * 60 + shifted.minute);
      case "time_iso":
        return formatTimeIso(shifted);
      case "datetime_local":
        return formatLocalDateTime(shifted);
      default:
        return originalValue;
    }
  }
  function normalizeSeries(value, warnings) {
    const classified = classifySeries(value);
    if (classified) return classified;
    warnings.add(`Unrecognized series "${value}" was replaced with "Other Series".`);
    return "Other Series";
  }
  function classifySeries(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "cgm" || normalized.includes("glucose")) return "CGM";
    if (normalized.includes("insulin")) return "Insulin";
    if (normalized.includes("meal")) return "Meal Announcement";
    if (normalized === "event" || normalized.includes("event")) return "Event";
    return null;
  }
  function allowMappedValue(value, allowed, label, warnings) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const safe = allowed.get(trimmed.toLowerCase());
    if (safe) return safe;
    warnings.add(`An unrecognized ${label} value was removed.`);
    return "";
  }
  function allowMealCode(value, warnings) {
    const trimmed = value.trim().toUpperCase();
    if (!trimmed) return "";
    if (SAFE_MEAL_CODES.has(trimmed)) return trimmed;
    warnings.add("An unrecognized meal code was removed.");
    return "";
  }
  function safeTimeText(value, label, warnings) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(trimmed)) return trimmed;
    if (/^(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:AM|PM)$/i.test(trimmed)) {
      return trimmed.replace(/\s*(am|pm)$/i, (_, suffix) => ` ${suffix.toUpperCase()}`);
    }
    warnings.add(`An invalid ${label} value was removed.`);
    return "";
  }
  function normalizeEventType(value, series, warnings) {
    if (series !== "Event") return "";
    const normalized = value.trim().toLowerCase();
    if (!normalized) return "Other Event";
    if (/insulin\s+(paused|pause|suspended|suspend)/.test(normalized)) return "Insulin Paused";
    if (/insulin\s+(resumed|resume|restarted|restart)/.test(normalized)) return "Insulin Resumed";
    if (normalized.startsWith("weight changed")) return "Weight Changed";
    warnings.add('An unrecognized event description was reduced to "Other Event".');
    return "Other Event";
  }
  function buildCleanAnnotation(series, mealType, mealSize, mealTime, eventType, eventTime) {
    if (series === "Meal Announcement") {
      return [mealType, mealSize, mealTime].filter(Boolean).join(", ");
    }
    if (series === "Event") {
      return [`Event: ${eventType || "Other Event"}`, eventTime].filter(Boolean).join(", ");
    }
    return "";
  }
  function earlierDate(current, candidate) {
    return current === null || candidate < current ? candidate : current;
  }
  function laterDate(current, candidate) {
    return current === null || candidate > current ? candidate : current;
  }
  function sanitizePseudonym(value) {
    const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    return sanitized || "subject";
  }
  function dateFromDayNumber(value) {
    const date = new Date(value * 864e5);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  // src/anonymize-controller.ts
  var fileInput = requiredElement("sourceFiles");
  var profileSelect = requiredElement("profile");
  var pseudonymInput = requiredElement("pseudonym");
  var syntheticStartInput = requiredElement("syntheticStartDate");
  var generateDateButton = requiredElement("generateDate");
  var transformButton = requiredElement("transformFiles");
  var inspectionPanel = requiredElement("inspectionPanel");
  var resultsPanel = requiredElement("resultsPanel");
  var statusPanel = requiredElement("statusPanel");
  var profileExplanation = requiredElement("profileExplanation");
  var sourceFiles = [];
  var inspection = null;
  var resultUrls = [];
  fileInput.addEventListener("change", async () => {
    clearResults();
    setStatus("Reading selected files\u2026", "working");
    try {
      const selected = Array.from(fileInput.files ?? []);
      sourceFiles = await Promise.all(selected.map(async (file) => ({ name: file.name, text: await file.text() })));
      inspection = inspectSourceFiles(sourceFiles);
      if (inspection.canTransform && inspection.earliestDate && inspection.weekday !== null) {
        syntheticStartInput.value = generateCompatibleSyntheticDate(inspection.earliestDate, inspection.weekday);
        setStatus("Files inspected locally. Review the preview before creating output.", "success");
      } else {
        setStatus(inspection.errors.join(" "), "error");
      }
    } catch (error) {
      sourceFiles = [];
      inspection = null;
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
    renderInspection();
    updateTransformAvailability();
  });
  profileSelect.addEventListener("change", () => {
    updateProfileExplanation();
    clearResults();
    updateTransformAvailability();
  });
  syntheticStartInput.addEventListener("input", () => {
    clearResults();
    updateTransformAvailability();
  });
  pseudonymInput.addEventListener("input", clearResults);
  generateDateButton.addEventListener("click", () => {
    if (!inspection?.earliestDate || inspection.weekday === null) return;
    syntheticStartInput.value = generateCompatibleSyntheticDate(inspection.earliestDate, inspection.weekday);
    clearResults();
    updateTransformAvailability();
  });
  transformButton.addEventListener("click", () => {
    clearResults();
    try {
      const result = anonymizeSourceFiles(sourceFiles, {
        profile: profileSelect.value,
        syntheticStartDate: syntheticStartInput.value,
        pseudonym: pseudonymInput.value
      });
      renderResults(result);
      const introducedMeasurements = result.quality.introducedRepeatedMeasurementGroups + result.quality.introducedConflictingMeasurementGroups;
      setStatus(
        `Created ${result.files.length} anonymized file${result.files.length === 1 ? "" : "s"} entirely in this browser. ` + (introducedMeasurements ? "New measurement overlaps appeared during anonymization. Review the data-quality comparison." : "No new repeated measurements or measurement conflicts were introduced."),
        introducedMeasurements ? "warning" : "success"
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
  });
  updateProfileExplanation();
  updateTransformAvailability();
  function renderInspection() {
    inspectionPanel.replaceChildren();
    if (!inspection || sourceFiles.length === 0) {
      inspectionPanel.className = "empty-state";
      inspectionPanel.textContent = "Select one or more related CSV files to inspect them.";
      return;
    }
    inspectionPanel.className = "inspection-content";
    const summary = document.createElement("div");
    summary.className = "summary-strip";
    summary.append(
      summaryItem("Files", String(inspection.files.length)),
      summaryItem("Rows", String(inspection.files.reduce((sum, file) => sum + file.rowCount, 0))),
      summaryItem("Source range", inspection.earliestDate && inspection.latestDate ? `${inspection.earliestDate} \u2192 ${inspection.latestDate}` : "Unavailable")
    );
    inspectionPanel.append(summary);
    inspectionPanel.append(qualityPanel(inspection.quality));
    inspection.files.forEach((file, index) => {
      const card = document.createElement("article");
      card.className = "file-card";
      const heading = document.createElement("h3");
      heading.textContent = `File ${index + 1}: ${file.name}`;
      const details = document.createElement("p");
      details.textContent = `${file.rowCount} rows \xB7 ${file.series.length ? file.series.join(", ") : "No series found"} \xB7 ${file.earliestDate ?? "?"} \u2192 ${file.latestDate ?? "?"}`;
      card.append(heading, details);
      const quality = document.createElement("p");
      quality.textContent = `${file.quality.repeatedExtraMeasurements} extra repeated measurements \xB7 ${file.quality.conflictingMeasurementGroups} conflicting series/timestamps in this file`;
      card.append(quality);
      if (file.unknownHeaders.length > 0) {
        card.append(messageList("Unknown columns omitted by Share-safe", file.unknownHeaders, "warning-list"));
      }
      if (file.unrecognizedSeries.length > 0) {
        card.append(messageList("Series requiring a Share-safe policy", file.unrecognizedSeries, "error-list"));
      }
      if (file.invalidTimestampRows.length > 0) {
        card.append(messageList(
          "Rows with invalid datetime_local",
          file.invalidTimestampRows.slice(0, 12).map(String),
          "error-list"
        ));
      }
      inspectionPanel.append(card);
    });
    if (inspection.errors.length > 0) {
      inspectionPanel.append(messageList("Cannot transform yet", inspection.errors, "error-list"));
    }
  }
  function renderResults(result) {
    resultsPanel.replaceChildren();
    resultsPanel.className = "results-content";
    const heading = document.createElement("h2");
    heading.id = "downloadsTitle";
    heading.textContent = "Downloads";
    resultsPanel.append(heading);
    resultsPanel.append(qualityPanel(result.quality.source, result.quality));
    const reportUrl = URL.createObjectURL(new Blob([JSON.stringify({
      auditVersion: "anonymizer-quality-v3",
      rowReferenceConvention: "File numbers follow selection/output order. Row 1 is the header; row numbers count CSV records, including records with embedded newlines.",
      scope: "All selected files together; counts include overlaps across files. Measurement keys use preserved reported timestamps when every row in a series/bin has a valid reported clock; otherwise they use bin timestamps. Series matching is case-insensitive, irrespective of trace.",
      comparison: result.quality
    }, null, 2)], { type: "application/json;charset=utf-8" }));
    resultUrls.push(reportUrl);
    const reportLink = document.createElement("a");
    reportLink.className = "download-link audit-download";
    reportLink.href = reportUrl;
    reportLink.download = "anonymization-quality-report.json";
    reportLink.textContent = "Download data-quality report (JSON)";
    resultsPanel.append(reportLink);
    result.files.forEach((file, index) => {
      const card = document.createElement("article");
      card.className = "result-card";
      const title = document.createElement("h3");
      title.textContent = `File ${index + 1}: ${file.outputName}`;
      const details = document.createElement("p");
      details.textContent = `${file.rowCount} rows \xB7 ${file.sourceDateRange} \u2192 ${file.syntheticDateRange}`;
      const blob = new Blob([file.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      resultUrls.push(url);
      const link = document.createElement("a");
      link.className = "download-link";
      link.href = url;
      link.download = file.outputName;
      link.textContent = `Download ${file.outputName}`;
      card.append(title, details, link);
      if (file.removedHeaders.length > 0) {
        card.append(messageList("Removed columns", file.removedHeaders, "warning-list"));
      }
      if (file.warnings.length > 0) {
        card.append(messageList("Transformation notes", file.warnings, "warning-list"));
      }
      resultsPanel.append(card);
    });
  }
  function qualityPanel(source, comparison) {
    const panel = document.createElement("section");
    panel.className = "quality-card";
    const title = document.createElement("h3");
    title.textContent = comparison ? "Source \u2192 output data quality" : "Source data quality";
    const explanation = document.createElement("p");
    explanation.textContent = "Across all selected files, including overlaps between files. Identical rows match every column. Repeated measurements share a series, timestamp and numeric value; conflicts have different numeric values at the same series/timestamp, even across traces. Distinct preserved reported timestamps within a bin are separate measurements, not problems. If any row in a series/bin lacks a valid reported clock, that group is checked at bin resolution. No rows are removed or combined.";
    panel.append(title, explanation);
    const tableWrapper = document.createElement("div");
    tableWrapper.className = "quality-table-scroll";
    const table = document.createElement("table");
    table.className = "quality-table";
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const text of comparison ? ["Finding", "Source groups", "Output groups", "Groups with new overlaps"] : ["Finding", "Source groups"]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = text;
      headerRow.append(cell);
    }
    head.append(headerRow);
    table.append(head);
    const body = document.createElement("tbody");
    for (const [label, before, after, introduced] of [
      ["Identical full rows", source.identicalRowGroups, comparison?.output.identicalRowGroups, comparison?.introducedIdenticalRowGroups],
      ["Repeated measurements", source.repeatedMeasurementGroups, comparison?.output.repeatedMeasurementGroups, comparison?.introducedRepeatedMeasurementGroups],
      ["Conflicting measurements", source.conflictingMeasurementGroups, comparison?.output.conflictingMeasurementGroups, comparison?.introducedConflictingMeasurementGroups]
    ]) {
      const row = document.createElement("tr");
      const labelCell = document.createElement("th");
      labelCell.scope = "row";
      labelCell.textContent = label;
      row.append(labelCell);
      for (const value of comparison ? [before, after, introduced] : [before]) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    tableWrapper.append(table);
    panel.append(tableWrapper);
    const audit = comparison?.output ?? source;
    const breakdown = document.createElement("p");
    breakdown.className = "quality-breakdown";
    breakdown.textContent = ["CGM", "Insulin"].map((type) => {
      const conflicts = audit.issues.filter((issue) => issue.measurementType === type && issue.kind === "conflicting_measurements").length;
      const repeats = audit.issues.filter((issue) => issue.measurementType === type && issue.kind === "repeated_measurements").reduce((sum, issue) => sum + issue.rows.length - 1, 0);
      return `${type}: ${conflicts} conflicting groups, ${repeats} extra repeated measurements`;
    }).join(" \xB7 ");
    panel.append(breakdown);
    const note = document.createElement("p");
    note.textContent = `${audit.identicalExtraRows} extra identical rows; ${audit.repeatedExtraMeasurements} extra repeated measurements${comparison ? " in output" : " in source"}. Categories can overlap. ` + (comparison ? "Row correspondence is checked, so unchanged group totals cannot hide new overlaps. Removing private fields can create identical full rows without creating a measurement conflict. " : "") + `${audit.unassessedMeasurementRows} measurement rows could not be assessed because their timestamp or numeric value is invalid/blank.`;
    panel.append(note);
    if (comparison) {
      const outcome = document.createElement("p");
      const introduced = comparison.introducedRepeatedMeasurementGroups + comparison.introducedConflictingMeasurementGroups;
      outcome.className = introduced ? "warning-list" : "status-panel status-success";
      outcome.textContent = introduced ? "New measurement overlaps were introduced. Inspect the affected row groups before analysis." : "No new repeated measurements or measurement conflicts were introduced. Any output measurement issues were already present in the selected source files.";
      panel.append(outcome);
    }
    if (audit.issues.length) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `Affected row groups (${audit.issues.length})`;
      details.append(summary);
      const filterLabel = document.createElement("label");
      filterLabel.className = "quality-filter";
      filterLabel.append("Measurement type ");
      const filter = document.createElement("select");
      for (const type of ["All types", "CGM", "Insulin", "Meal", "Event", "Other"]) {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        filter.append(option);
      }
      filterLabel.append(filter);
      details.append(filterLabel);
      const guidance = document.createElement("p");
      guidance.textContent = "The analysis engine sums insulin rows within each five-minute bin by default, including older files, and averages valid conflicting CGM observations after repeated observations are counted once. This anonymizer preserves every row and dose; it shifts timestamps without aggregating measurements.";
      details.append(guidance);
      const list = document.createElement("ul");
      const listStatus = document.createElement("p");
      listStatus.setAttribute("aria-live", "polite");
      const moreButton = document.createElement("button");
      moreButton.type = "button";
      moreButton.textContent = "Show 60 more groups";
      let visibleCount = 60;
      const renderGroups = () => {
        const issues = audit.issues.filter((issue) => filter.value === "All types" || issue.measurementType === filter.value);
        list.replaceChildren();
        for (const issue of issues.slice(0, visibleCount)) {
          const item = document.createElement("li");
          const label = { identical_rows: "Identical rows", repeated_measurements: "Repeated measurement", conflicting_measurements: "Conflicting measurements" }[issue.kind];
          const origin = issue.origin ? { source: "already in source", introduced: "introduced by anonymization", source_and_introduced: "already in source + additional overlaps introduced" }[issue.origin] : "";
          item.textContent = `${issue.measurementType} \u2014 ${label}${origin ? ` \u2014 ${origin}` : ""}: ` + issue.rows.slice(0, 12).map((ref) => `file ${ref.file}, row ${ref.row}`).join("; ") + (issue.rows.length > 12 ? `; and ${issue.rows.length - 12} more rows` : "") + (issue.measurementType === "Insulin" && issue.kind === "conflicting_measurements" ? " \xB7 Manual review needed" : "");
          list.append(item);
        }
        listStatus.textContent = `Showing ${Math.min(visibleCount, issues.length)} of ${issues.length} ${filter.value === "All types" ? "" : filter.value + " "}groups.`;
        moreButton.hidden = visibleCount >= issues.length;
      };
      filter.addEventListener("change", () => {
        visibleCount = 60;
        renderGroups();
      });
      moreButton.addEventListener("click", () => {
        visibleCount += 60;
        renderGroups();
      });
      renderGroups();
      details.append(listStatus, list, moreButton);
      const help = document.createElement("p");
      help.textContent = "File numbers follow selection/output order; row 1 is the header. Rows count CSV records, so a quoted multiline field is still one row. " + (comparison ? "The JSON report contains every group with its measurement category and file/row numbers, without original names, dates, values or annotations." : "After transformation, a downloadable report includes the complete before/after comparison.");
      details.append(help);
      panel.append(details);
    }
    return panel;
  }
  function clearResults() {
    resultUrls.forEach((url) => URL.revokeObjectURL(url));
    resultUrls = [];
    resultsPanel.replaceChildren();
    resultsPanel.className = "empty-state";
    const heading = document.createElement("h2");
    heading.id = "downloadsTitle";
    heading.className = "visually-hidden";
    heading.textContent = "Downloads";
    resultsPanel.append(heading, "Anonymized downloads will appear here after transformation.");
  }
  function updateProfileExplanation() {
    if (profileSelect.value === "share-safe") {
      profileExplanation.textContent = "Shifts dates, removes unknown columns and raw annotations, normalizes trace IDs, and rebuilds safe meal/event labels.";
    } else {
      profileExplanation.textContent = "Shifts structured date columns but preserves all other content. Intended for private use; not safe to share.";
    }
  }
  function updateTransformAvailability() {
    const dateIsCompatible = !!inspection?.earliestDate && inspection.weekday !== null && nextDateWithWeekday(syntheticStartInput.value, inspection.weekday) === syntheticStartInput.value;
    const profileCanTransform = profileSelect.value !== "share-safe" || !!inspection?.files.every((file) => file.unrecognizedSeries.length === 0);
    transformButton.disabled = !(inspection?.canTransform && dateIsCompatible && profileCanTransform);
    generateDateButton.disabled = !(inspection?.canTransform && inspection.weekday !== null);
    if (inspection?.canTransform && syntheticStartInput.value && !dateIsCompatible) {
      syntheticStartInput.setCustomValidity("Choose a date with the same weekday as the earliest source date, or use Generate.");
    } else {
      syntheticStartInput.setCustomValidity("");
    }
  }
  function generateCompatibleSyntheticDate(sourceDate, weekday) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      const year = 2e3 + random[0] % 16;
      const month = 1 + (random[0] >>> 4) % 12;
      const day = 1 + (random[0] >>> 9) % 21;
      const preferred = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const compatible = nextDateWithWeekday(preferred, weekday);
      if (compatible && compatible !== sourceDate) return compatible;
    }
    return nextDateWithWeekday("2001-01-01", weekday) ?? "2001-01-01";
  }
  function summaryItem(label, value) {
    const item = document.createElement("div");
    const term = document.createElement("span");
    term.textContent = label;
    const definition = document.createElement("strong");
    definition.textContent = value;
    item.append(term, definition);
    return item;
  }
  function messageList(titleText, messages, className) {
    const wrapper = document.createElement("div");
    wrapper.className = className;
    const title = document.createElement("strong");
    title.textContent = titleText;
    const list = document.createElement("ul");
    messages.forEach((message) => {
      const item = document.createElement("li");
      item.textContent = message;
      list.append(item);
    });
    wrapper.append(title, list);
    return wrapper;
  }
  function setStatus(message, kind) {
    statusPanel.textContent = message;
    statusPanel.className = `status-panel status-${kind}`;
  }
  function requiredElement(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required element #${id}.`);
    return element;
  }
})();
