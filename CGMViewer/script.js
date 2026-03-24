var picker;
let dataCompleteness = {};
var glucoseChart; // Global variable to hold the chart instance
var egvData = []; // Global variable to hold the EGV data
//var transmitterChanges = []; // Global variable to hold the transmitter changes
var deviceType = ''; // Global variable to hold the device type
var gFileName = ''; // Global variable to hold the filename
var gTruePositiveCount = 0; // Global variable to hold the true positive count
var gFalsePositiveCount = 0; // Global variable to hold the false positive count
var gFalseNegativeCount = 0; // Global variable to hold the false negative count
var gGoldStandardMealCount = 0; // Global variable to hold the gold standard meal count
var supplementalInsulinFileName = ''; // Tracks optional insulin-only supplemental file
var insulinSourceLabel = 'None';
var baseBinnedData = []; // Primary binned data before supplemental insulin overlay
var insulinDisplayCapUnits = 1.0; // Visual cap so low doses remain visible
var insulinScaleMode = 'auto_whole';
let activeRangeSelection = null;
let dragRangeState = { isDragging: false, startMs: null, currentMs: null };
let suppressNextPointClick = false;
let showStoredDetectedMeals = false;
let seriesMealAnnouncements = [];
let seriesPumpEvents = [];
let tirSummaryChart = null;
let tirOverlayChart = null;
let tirDailyCharts = [];

const TIR_BINS = [
    { key: 'below70', label: '<70', color: '#d64550' },
    { key: 'range70to180', label: '70-180', color: '#2a9d68' },
    { key: 'range181to250', label: '181-250', color: '#e9a03b' },
    { key: 'above250', label: '>250', color: '#b85c38' }
];


let selectedPoints = []; // Global array to store selected points

function loadSelectedPointsForFile(fileName) {
    if (fileName) {
        const storedPoints = localStorage.getItem(`selectedPoints_${fileName}`);
        if (storedPoints) {
            selectedPoints = JSON.parse(storedPoints);
        } else {
            selectedPoints = [];
        }
        syncOptimizationObjectiveDefault();
    }
}

function formatDate(date) {
    const d = new Date(date),
        month = '' + (d.getMonth() + 1), // Months are 0-based in JS
        day = '' + d.getDate(),
        year = d.getFullYear();

    return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
}

function parseTimestampOrNull(timestampValue) {
    const normalized = String(timestampValue || '').trim();
    if (!normalized) {
        return null;
    }

    const parsed = moment(normalized, [
        'YYYY-MM-DD HH:mm',
        'YYYY-MM-DD H:mm',
        'YYYY-MM-DD HH:mm:ss',
        'YYYY-MM-DD H:mm:ss',
        'YYYY-MM-DDTHH:mm',
        'YYYY-MM-DDTH:mm',
        'YYYY-MM-DDTHH:mm:ss',
        'YYYY-MM-DDTH:mm:ss',
        'MM-DD-YYYY hh:mm A',
        'MM/DD/YYYY hh:mm A',
        moment.ISO_8601
    ], true);
    if (!parsed.isValid()) {
        return null;
    }
    return parsed.toISOString();
}

function splitCsvLine(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            const next = line[i + 1];
            if (inQuotes && next === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === ',' && !inQuotes) {
            cells.push(current.trim());
            current = '';
            continue;
        }

        current += ch;
    }

    cells.push(current.trim());
    return cells;
}

function updateInsulinSummaryDisplay() {
    const totalDoseElement = document.getElementById('insulinTotalDose');
    const scopeLabelElement = document.getElementById('insulinScopeLabel');
    const sourceInfoElement = document.getElementById('insulinSourceInfo');
    const dataProcessingModeSelect = document.getElementById('dataProcessingMode');

    if (!totalDoseElement || !scopeLabelElement || !sourceInfoElement || !dataProcessingModeSelect) {
        return;
    }

    const mode = dataProcessingModeSelect.value;
    const scopeLabel = mode === 'visible' ? 'Visible Data Only (units total)' : 'Whole Dataset (units/day)';
    scopeLabelElement.textContent = scopeLabel;

    const sourceText = insulinSourceLabel || 'None';
    sourceInfoElement.textContent = sourceText;

    let rowsToSum = [];
    if (mode === 'visible') {
        if (glucoseChart && glucoseChart.scales && glucoseChart.scales['x']) {
            rowsToSum = getVisibleData();
        }
    } else {
        rowsToSum = egvData;
    }

    const totalDose = rowsToSum.reduce((sum, row) => {
        const dose = Number(row.InsulinValue);
        if (!Number.isFinite(dose)) {
            return sum;
        }
        return sum + dose;
    }, 0);

    if (mode === 'whole') {
        const dayCount = new Set(rowsToSum.map(row => moment(row.Timestamp).format('YYYY-MM-DD'))).size;
        const dosePerDay = dayCount > 0 ? totalDose / dayCount : 0;
        totalDoseElement.textContent = dosePerDay.toFixed(2);
    } else {
        totalDoseElement.textContent = totalDose.toFixed(2);
    }
}

function createEmptyTirCounts() {
    return {
        below70: 0,
        range70to180: 0,
        range181to250: 0,
        above250: 0
    };
}

function getCurrentScopeMode() {
    const dataProcessingModeSelect = document.getElementById('dataProcessingMode');
    return dataProcessingModeSelect ? dataProcessingModeSelect.value : 'whole';
}

function getRowsForCurrentScopeMode() {
    if (!Array.isArray(egvData) || egvData.length === 0) {
        return [];
    }

    const mode = getCurrentScopeMode();
    if (mode === 'visible' && glucoseChart && glucoseChart.scales && glucoseChart.scales.x) {
        return getVisibleData();
    }

    return egvData;
}

function sumInsulinDose(rows) {
    return (rows || []).reduce((sum, row) => {
        const dose = Number(row && row.InsulinValue);
        return Number.isFinite(dose) ? sum + dose : sum;
    }, 0);
}

function getTirBinKey(glucoseValue) {
    if (!Number.isFinite(glucoseValue)) {
        return null;
    }
    if (glucoseValue < 70) {
        return 'below70';
    }
    if (glucoseValue <= 180) {
        return 'range70to180';
    }
    if (glucoseValue <= 250) {
        return 'range181to250';
    }
    return 'above250';
}

function summarizeRowsForTir(rows) {
    const counts = createEmptyTirCounts();
    let validCount = 0;

    (rows || []).forEach(row => {
        const glucoseValue = Number(row && row.GlucoseValue);
        const binKey = getTirBinKey(glucoseValue);
        if (!binKey) {
            return;
        }
        counts[binKey] += 1;
        validCount += 1;
    });

    const percentages = {};
    TIR_BINS.forEach(bin => {
        percentages[bin.key] = validCount > 0 ? (counts[bin.key] / validCount) * 100 : 0;
    });

    return {
        counts,
        percentages,
        validCount,
        insulinTotal: sumInsulinDose(rows),
        dayCount: new Set((rows || []).map(row => moment(row.Timestamp).format('YYYY-MM-DD'))).size
    };
}

function groupVisibleRowsByDay() {
    const visibleRows = (glucoseChart && glucoseChart.scales && glucoseChart.scales.x)
        ? getVisibleData()
        : [];
    const groups = new Map();

    visibleRows.forEach(row => {
        const dayKey = moment(row.Timestamp).format('YYYY-MM-DD');
        if (!groups.has(dayKey)) {
            groups.set(dayKey, []);
        }
        groups.get(dayKey).push(row);
    });

    return Array.from(groups.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dayKey, rows]) => ({
            dayKey,
            dayLabel: moment(dayKey, 'YYYY-MM-DD').format('ddd, MMM D'),
            rows,
            summary: summarizeRowsForTir(rows)
        }));
}

function destroyTirCharts() {
    if (tirSummaryChart) {
        tirSummaryChart.destroy();
        tirSummaryChart = null;
    }
    if (tirOverlayChart) {
        tirOverlayChart.destroy();
        tirOverlayChart = null;
    }
    tirDailyCharts.forEach(chartInstance => {
        if (chartInstance) {
            chartInstance.destroy();
        }
    });
    tirDailyCharts = [];
}

function createTirBarChart(canvas, label, percentages, showLegend) {
    if (!canvas) {
        return null;
    }

    const datasets = TIR_BINS.map(bin => ({
        label: bin.label,
        data: [percentages[bin.key] || 0],
        backgroundColor: bin.color,
        borderWidth: 0,
        barThickness: 28
    }));

    return new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: [label],
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: showLegend,
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const value = Number(context.parsed.x || 0);
                            return `${context.dataset.label}: ${value.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Percent of valid CGM readings'
                    },
                    ticks: {
                        callback: function (value) {
                            return `${value}%`;
                        }
                    }
                },
                y: {
                    stacked: true,
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function createTirOverlayChart(canvas, daySummaries) {
    if (!canvas) {
        return null;
    }

    const lineColors = ['#1f77b4', '#2a9d68', '#d97706', '#c2410c', '#6d28d9', '#0f766e', '#be123c', '#4f46e5'];
    const datasets = daySummaries.map((daySummary, index) => ({
        label: daySummary.dayLabel,
        data: TIR_BINS.map(bin => Number(daySummary.summary.percentages[bin.key].toFixed(1))),
        borderColor: lineColors[index % lineColors.length],
        backgroundColor: lineColors[index % lineColors.length],
        borderWidth: 2,
        tension: 0.2,
        fill: false
    }));

    return new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: TIR_BINS.map(bin => bin.label),
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${Number(context.parsed.y || 0).toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Glucose bins'
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Percent of valid CGM readings'
                    },
                    ticks: {
                        callback: function (value) {
                            return `${value}%`;
                        }
                    }
                }
            }
        }
    });
}

function renderTirSection() {
    const tirSection = document.getElementById('tirSection');
    const tirScopeDescription = document.getElementById('tirScopeDescription');
    const tirSummaryTitle = document.getElementById('tirSummaryTitle');
    const tirSummaryMeta = document.getElementById('tirSummaryMeta');
    const tirSummaryCanvas = document.getElementById('tirSummaryChart');
    const tirOverlayPanel = document.getElementById('tirOverlayPanel');
    const tirOverlayCheckbox = document.getElementById('showTirOverlay');
    const tirOverlayCanvas = document.getElementById('tirOverlayChart');
    const tirDailyCards = document.getElementById('tirDailyCards');

    if (!tirSection || !tirScopeDescription || !tirSummaryTitle || !tirSummaryMeta || !tirSummaryCanvas || !tirOverlayPanel || !tirOverlayCheckbox || !tirOverlayCanvas || !tirDailyCards) {
        return;
    }

    destroyTirCharts();
    tirDailyCards.innerHTML = '';

    if (!Array.isArray(egvData) || egvData.length === 0) {
        tirSection.classList.add('hidden');
        return;
    }

    const scopeRows = getRowsForCurrentScopeMode();
    const scopeSummary = summarizeRowsForTir(scopeRows);
    const daySummaries = groupVisibleRowsByDay();
    const mode = getCurrentScopeMode();
    const scopeLabel = mode === 'visible' ? 'Visible Window Summary' : 'Whole Dataset Summary';

    tirSection.classList.remove('hidden');
    tirSummaryTitle.textContent = scopeLabel;
    tirScopeDescription.textContent = mode === 'visible'
        ? 'Summary uses the currently visible days. Daily cards and overlay also use the visible days.'
        : 'Summary uses the full dataset. Daily cards and overlay still show the currently visible days.';
    tirSummaryMeta.textContent = `${scopeSummary.validCount} valid CGM readings across ${Math.max(scopeSummary.dayCount, 1)} day(s)`;
    tirSummaryChart = createTirBarChart(tirSummaryCanvas, scopeLabel, scopeSummary.percentages, true);

    const showOverlay = tirOverlayCheckbox.checked && daySummaries.length > 1;
    tirOverlayPanel.classList.toggle('hidden', !showOverlay);
    if (showOverlay) {
        tirOverlayChart = createTirOverlayChart(tirOverlayCanvas, daySummaries);
    }

    daySummaries.forEach(daySummary => {
        const dayCard = document.createElement('div');
        dayCard.className = 'tir-day-card';

        const title = document.createElement('h4');
        title.className = 'tir-day-card-title';
        title.textContent = daySummary.dayLabel;

        const subtitle = document.createElement('p');
        subtitle.className = 'tir-day-card-subtitle';
        subtitle.textContent = `Insulin: ${daySummary.summary.insulinTotal.toFixed(2)} U | Valid CGM: ${daySummary.summary.validCount}`;

        const chartWrap = document.createElement('div');
        chartWrap.className = 'tir-day-chart-wrap';

        const canvas = document.createElement('canvas');
        chartWrap.appendChild(canvas);

        dayCard.appendChild(title);
        dayCard.appendChild(subtitle);
        dayCard.appendChild(chartWrap);
        tirDailyCards.appendChild(dayCard);

        tirDailyCharts.push(createTirBarChart(canvas, 'Day', daySummary.summary.percentages, false));
    });
}

function getRangeBoundsMs(rangeObj) {
    if (!rangeObj || !Number.isFinite(rangeObj.startMs) || !Number.isFinite(rangeObj.endMs)) {
        return null;
    }
    return {
        startMs: Math.min(rangeObj.startMs, rangeObj.endMs),
        endMs: Math.max(rangeObj.startMs, rangeObj.endMs)
    };
}

function getMealTimestampSet() {
    const storedMeals = localStorage.getItem(`detectedMeals_${gFileName}`);
    const detectedMeals = showStoredDetectedMeals && storedMeals ? JSON.parse(storedMeals) : [];
    const selectedSet = new Set((selectedPoints || []).map(ts => new Date(ts).getTime()));
    const detectedSet = new Set(detectedMeals.map(ts => new Date(ts).getTime()));
    return { selectedSet, detectedSet };
}

function applyRangeStatsFromBounds(bounds) {
    const rangeCard = document.getElementById('range-stats-info');
    const rangeTitle = document.getElementById('rangeStatsTitle');
    const windowLabel = document.getElementById('rangeWindowLabel');
    const insulinTotal = document.getElementById('rangeInsulinTotal');
    const cgmMean = document.getElementById('rangeCgmMean');
    const tirLabel = document.getElementById('rangeTir');
    const tbrLabel = document.getElementById('rangeTbr');

    if (!rangeCard || !rangeTitle || !windowLabel || !insulinTotal || !cgmMean || !tirLabel || !tbrLabel) {
        return;
    }

    const dataProcessingModeSelect = document.getElementById('dataProcessingMode');
    const mode = dataProcessingModeSelect ? dataProcessingModeSelect.value : 'whole';

    let rows = [];
    let workingBounds = bounds ? { ...bounds } : null;

    if (workingBounds) {
        rows = egvData.filter(row => {
            const t = new Date(row.Timestamp).getTime();
            return Number.isFinite(t) && t >= workingBounds.startMs && t <= workingBounds.endMs;
        });
    } else {
        rows = mode === 'visible' ? getVisibleData() : egvData;
        if (rows.length > 0) {
            const startMs = new Date(rows[0].Timestamp).getTime();
            const endMs = new Date(rows[rows.length - 1].Timestamp).getTime();
            if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
                workingBounds = getRangeBoundsMs({ startMs, endMs });
            }
        }
    }

    if (!rows || rows.length === 0 || !workingBounds) {
        rangeCard.classList.add('hidden');
        return;
    }

    const totalInsulin = rows.reduce((sum, row) => {
        const dose = Number(row.InsulinValue);
        return Number.isFinite(dose) ? sum + dose : sum;
    }, 0);

    const validCgm = rows
        .map(row => Number(row.GlucoseValue))
        .filter(v => Number.isFinite(v));

    const mean = validCgm.length > 0
        ? validCgm.reduce((a, b) => a + b, 0) / validCgm.length
        : null;

    const tirCount = validCgm.filter(v => v >= 70 && v <= 180).length;
    const tbrCount = validCgm.filter(v => v < 70).length;
    const tir = validCgm.length > 0 ? (tirCount / validCgm.length) * 100 : null;
    const tbr = validCgm.length > 0 ? (tbrCount / validCgm.length) * 100 : null;

    const startMoment = moment(workingBounds.startMs);
    const endMoment = moment(workingBounds.endMs);
    const startIso = startMoment.format('YYYY-MM-DD HH:mm');
    const endIso = endMoment.format('YYYY-MM-DD HH:mm');
    const durationMin = Math.max(0, Math.round((workingBounds.endMs - workingBounds.startMs) / 60000));

    const usingFallbackWindow = !bounds;
    rangeTitle.textContent = usingFallbackWindow ? 'Analysis Window' : 'Selected Range';
    const isWholeModeFallback = usingFallbackWindow && mode === 'whole';
    let insulinText = `${totalInsulin.toFixed(2)} units`;
    if (isWholeModeFallback) {
        const dayCount = new Set(rows.map(row => moment(row.Timestamp).format('YYYY-MM-DD'))).size;
        const dosePerDay = dayCount > 0 ? totalInsulin / dayCount : 0;
        insulinText = `${dosePerDay.toFixed(2)} units/day`;
    }

    const compactWindow = startMoment.isSame(endMoment, 'day')
        ? `${startMoment.format('YYYY-MM-DD HH:mm')}-${endMoment.format('HH:mm')} (${durationMin}m)`
        : `${startIso} -> ${endIso} (${durationMin}m)`;
    const scopePrefix = usingFallbackWindow ? `[${mode === 'visible' ? 'Visible' : 'Whole'}] ` : '';

    // Format duration (minutes) into days/hours/minutes for display
    function formatDuration(minutes) {
        if (!Number.isFinite(minutes) || minutes < 0) return '0 minutes';
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        const mins = Math.floor(minutes % 60);
        const parts = [];
        if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
        if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
        if (mins > 0 || parts.length === 0) parts.push(`${mins} minute${mins !== 1 ? 's' : ''}`);
        return parts.join(' ');
    }

    const durationText = formatDuration(durationMin);
    const fullWindowText = `${scopePrefix}${durationText}`;

    windowLabel.textContent = fullWindowText;
    // Keep the original start/end wording in the title for precise reference
    windowLabel.title = `${scopePrefix}${compactWindow}`;
    insulinTotal.textContent = insulinText;
    cgmMean.textContent = mean === null ? 'N/A' : mean.toFixed(1);
    tirLabel.textContent = tir === null ? 'N/A' : `${tir.toFixed(1)}%`;
    tbrLabel.textContent = tbr === null ? 'N/A' : `${tbr.toFixed(1)}%`;
    rangeCard.classList.remove('hidden');
}

function clearActiveRangeSelection() {
    activeRangeSelection = null;
    dragRangeState = { isDragging: false, startMs: null, currentMs: null };
    applyRangeStatsFromBounds(null);
    updatePointColors();
}

function getTimestampFromChartEvent(mouseEvent) {
    if (!glucoseChart || !glucoseChart.scales || !glucoseChart.scales.x || !mouseEvent) {
        return null;
    }

    const rect = glucoseChart.canvas.getBoundingClientRect();
    const xPixel = mouseEvent.clientX - rect.left;
    const chartArea = glucoseChart.chartArea;

    if (!chartArea || xPixel < chartArea.left || xPixel > chartArea.right) {
        return null;
    }

    const value = glucoseChart.scales.x.getValueForPixel(xPixel);
    return Number.isFinite(value) ? value : null;
}

function findNearestMealTimestampMs(targetMs, toleranceMs) {
    if (!Number.isFinite(targetMs)) {
        return null;
    }

    const { selectedSet, detectedSet } = getMealTimestampSet();
    const mealMsValues = new Set([...selectedSet, ...detectedSet]);

    let bestMatch = null;
    let bestDiff = Number.POSITIVE_INFINITY;

    mealMsValues.forEach(mealMs => {
        if (!Number.isFinite(mealMs)) {
            return;
        }
        const diff = Math.abs(mealMs - targetMs);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestMatch = mealMs;
        }
    });

    if (bestDiff <= toleranceMs) {
        return bestMatch;
    }
    return null;
}

function setOptimizationDialogOpen(isOpen) {
    const backdrop = document.getElementById('optimizationDialogBackdrop');
    const dialog = document.getElementById('optimizationDialog');
    if (!backdrop || !dialog) {
        return;
    }

    if (isOpen) {
        backdrop.classList.remove('hidden');
        dialog.classList.remove('hidden');
    } else {
        backdrop.classList.add('hidden');
        dialog.classList.add('hidden');
    }
}

function syncOptimizationObjectiveDefault() {
    const objectiveSelect = document.getElementById('optimizationObjective');
    const targetMealsInput = document.getElementById('targetMealsPerDay');
    const targetMealsLabel = document.getElementById('targetMealsPerDayLabel');
    if (!objectiveSelect) {
        return;
    }

    const hasGoldStandardMeals = Array.isArray(selectedPoints) && selectedPoints.length > 0;
    objectiveSelect.value = hasGoldStandardMeals ? 'gold' : 'target';

    const showTarget = objectiveSelect.value === 'target';
    if (targetMealsInput) {
        targetMealsInput.classList.toggle('hidden', !showTarget);
    }
    if (targetMealsLabel) {
        targetMealsLabel.classList.toggle('hidden', !showTarget);
    }
}

function setButtonDisabledState(buttonElement, isDisabled, strong = false) {
    if (!buttonElement) {
        return;
    }

    buttonElement.disabled = isDisabled;
    buttonElement.classList.remove('is-disabled-btn', 'is-disabled-btn-strong');

    if (isDisabled) {
        buttonElement.classList.add(strong ? 'is-disabled-btn-strong' : 'is-disabled-btn');
    }
}

function syncDetectButtonAvailability() {
    const detectButton = document.getElementById('runDetectionBtn');
    const detectionModeSelect = document.getElementById('detectionMode');
    const mealParams = document.getElementById('parameter-controls');
    if (!detectButton || !detectionModeSelect || !mealParams) {
        return;
    }

    const mode = detectionModeSelect.value;
    const mealParamsVisible = !mealParams.classList.contains('hidden');
    const hasData = Array.isArray(egvData) && egvData.length > 0;
    const shouldEnable = mode === 'meal' && mealParamsVisible && hasData;

    setButtonDisabledState(detectButton, !shouldEnable);
}

function computeAutoInsulinCap(dataRows) {
    const maxDose = dataRows.reduce((maxValue, row) => {
        const dose = Number(row.InsulinValue);
        if (!Number.isFinite(dose) || dose <= 0) {
            return maxValue;
        }
        return Math.max(maxValue, dose);
    }, 0);

    if (maxDose <= 0) {
        return 1;
    }

    const preferredCaps = [0.5, 1, 2, 5, 10, 20, 50];
    const convenientCap = preferredCaps.find(cap => cap >= maxDose);
    return convenientCap || Math.ceil(maxDose);
}

function getVisibleData() {
    const xScale = glucoseChart.scales['x']; // Assuming 'x' is the x-axis id in Chart.js
    const minX = xScale.min; // Minimum value of the visible range (in milliseconds)
    const maxX = xScale.max; // Maximum value of the visible range (in milliseconds)

    console.log('Visible X-axis range:', { minX, maxX });

    // Ensure dataPoint.x is a timestamp (milliseconds)
    const visibleData = egvData.filter(dataPoint => {
        const dataPointTimestamp = new Date(dataPoint.Timestamp).getTime(); // Convert Timestamp to milliseconds
        return dataPointTimestamp >= minX && dataPointTimestamp <= maxX;
    });

    return visibleData;
}


function getDataToProcess() {
    const dataProcessingMode = document.getElementById('dataProcessingMode').value;

    if (dataProcessingMode === 'visible') {
        return getVisibleData(); // Process only the visible data
    } else {
        return egvData; // Process the whole dataset
    }
}

function getVisibleSelectedMeals() {
    const xScale = glucoseChart.scales['x']; // Assuming 'x' is the x-axis id in Chart.js
    const minX = xScale.min; // Minimum value of the visible range (in milliseconds)
    const maxX = xScale.max; // Maximum value of the visible range (in milliseconds)
    console.log('Visible X-axis range:', { minX, maxX });
    console.log('Selected Points:', selectedPoints);

    // Filter selected meals to only include those within the visible x-axis range
    const visibleSelectedMeals = selectedPoints.filter(meal => {
        const mealTimestamp = new Date(meal).getTime(); // Convert meal's Timestamp to milliseconds
        return mealTimestamp >= minX && mealTimestamp <= maxX;
    });

    console.log('Visible Selected Meals:', visibleSelectedMeals);
    return visibleSelectedMeals;
}


// Filter selected meals based on the same toggle logic
function getSelectedMealsToProcess() {
    const dataProcessingMode = document.getElementById('dataProcessingMode').value;

    if (dataProcessingMode === 'visible') {
        return getVisibleSelectedMeals();
    } else {
        return selectedPoints; // Use all selected meals
    }
}

function updatePointColors() {
    if (!glucoseChart || !gFileName) return; // Ensure the chart and file name are initialized

    // Update selectedPoints from local storage using the current filename
    const storedPoints = localStorage.getItem(`selectedPoints_${gFileName}`);
    selectedPoints = storedPoints ? JSON.parse(storedPoints) : [];

    // for the purposes of plotting, the selectedPoints need to be converted to the nearest 5 minute clock time
    // this is because the data is binned in 5 minute intervals
    // first, convert the selectedPoints to Date objects
    const selectedPointsDates = selectedPoints.map(point => new Date(point));
    // then, round the minutes to the nearest 5 minute interval
    const selectedPointsRounded = selectedPointsDates.map(date => {
        const coeff = 1000 * 60 * 5; // 5 minutes in milliseconds
        return new Date(Math.round(date.getTime() / coeff) * coeff);
    });

    // log how many selected points we have
    console.log(`Selected points: ${selectedPoints.length}`);

    // See if there are detectedMeals in local storage
    const storedMeals = localStorage.getItem(`detectedMeals_${gFileName}`);
    const detectedMeals = showStoredDetectedMeals && storedMeals ? JSON.parse(storedMeals) : [];

    // log how many detected meals we have
    console.log(`Detected meals: ${detectedMeals.length}`);

    // See if there are implausibleData in local storage (stored as timestamps)
    const storedImplausibleData = localStorage.getItem(`implausibleData_${gFileName}`);
    const implausibleData = storedImplausibleData ? JSON.parse(storedImplausibleData) : [];

    // See if there are hypoglycemiaData in local storage (stored as timestamps)
    const storedHypoglycemiaData = localStorage.getItem(`hypoglycemiaData_${gFileName}`);
    const hypoglycemiaData = storedHypoglycemiaData ? JSON.parse(storedHypoglycemiaData) : [];

    // log how many implausible data points we have
    console.log(`Implausible data points: ${implausibleData.length}`);

    // log the first 5 detected meals
    //console.log(detectedMeals.slice(0, 5));

    // Clear existing annotations
    glucoseChart.options.plugins.annotation.annotations = [];

    const glucoseDataset = glucoseChart.data.datasets[0];
    if (!glucoseDataset) {
        glucoseChart.update();
        return;
    }

    if (
        !glucoseDataset.pointBackgroundColor ||
        glucoseDataset.pointBackgroundColor.length !== glucoseDataset.data.length
    ) {
        glucoseDataset.pointBackgroundColor = new Array(glucoseDataset.data.length).fill(glucoseDataset.backgroundColor);
    }

    glucoseDataset.data.forEach((dataPoint, index) => {
            const dataPointDate = new Date(dataPoint.x);  // Convert dataPoint.x to a Date object
            const isSelected = selectedPointsRounded.some(date => date.getTime() === dataPointDate.getTime());
            const isDetected = detectedMeals.includes(dataPoint.x);
            const isHypoglycemia = hypoglycemiaData.includes(dataPoint.x);
            const isImplausible = implausibleData.includes(dataPoint.x);

            if (isSelected && isDetected) {
                glucoseDataset.pointBackgroundColor[index] = 'rgba(0, 100, 0, 1)'; // Dark green for overlap
                glucoseChart.options.plugins.annotation.annotations.push({
                    type: 'line',
                    scaleID: 'x',
                    value: dataPoint.x,
                    borderColor: 'rgba(0, 128, 0, 1.0)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    label: {
                        content: `Selected & Detected`,
                        enabled: true,
                        position: 'start'
                    }
                });
            }
            else if (isSelected) {
                glucoseDataset.pointBackgroundColor[index] = 'rgba(0, 255, 0, 1)'; // Green for selected
                glucoseChart.options.plugins.annotation.annotations.push({
                    type: 'line',
                    scaleID: 'x',
                    value: dataPoint.x,
                    borderColor: 'rgba(0, 0, 255, 1.0)', // Brighter blue for selected
                    borderWidth: 2,
                    borderDash: [3, 3],
                    label: {
                        content: `Selected`,
                        enabled: true,
                        position: 'start',
                        color: 'rgba(0, 0, 255, 1.0)',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                });
            }
            else if (isDetected) {
                glucoseDataset.pointBackgroundColor[index] = 'rgba(255, 0, 0, 1)'; // Red for detected meals
                glucoseChart.options.plugins.annotation.annotations.push({
                    type: 'line',
                    scaleID: 'x',
                    value: dataPoint.x,
                    borderColor: 'rgba(200, 0, 0, 1.0)', // Dark red
                    borderWidth: 2,
                    borderDash: [5, 5],
                    label: {
                        content: `Detected Meal`,
                        enabled: true,
                        position: 'start'
                    }
                });
            }
            else if (isHypoglycemia) {
                // Use cyan for hypoglycemia points
                glucoseDataset.pointBackgroundColor[index] = 'rgba(0, 255, 255, 1)';
                glucoseChart.options.plugins.annotation.annotations.push({
                    type: 'point',
                    xValue: dataPoint.x,
                    yValue: 40,  // Example y-position; adjust as needed
                    backgroundColor: 'rgba(0, 255, 255, 0.7)',
                    radius: 4,
                    borderColor: 'rgba(0, 255, 255, 1)',
                    borderWidth: 1,
                    label: {
                        content: `Hypoglycemia`,
                        enabled: true,
                        position: 'start'
                    }
                });
            }
            else if (isImplausible) {
                glucoseDataset.pointBackgroundColor[index] = 'rgba(255, 165, 0, 0.5)';
                glucoseChart.options.plugins.annotation.annotations.push({
                    type: 'point',
                    xValue: dataPoint.x,
                    yValue: 40,
                    backgroundColor: 'rgba(255, 140, 0, 0.7)',
                    radius: 4,
                    borderColor: 'rgba(255, 140, 0, 1)',
                    borderWidth: 1
                });
            }
            else {
                glucoseDataset.pointBackgroundColor[index] = glucoseDataset.backgroundColor; // Default color
            }
        });

    const effectiveRange = dragRangeState.isDragging
        ? getRangeBoundsMs({ startMs: dragRangeState.startMs, endMs: dragRangeState.currentMs })
        : getRangeBoundsMs(activeRangeSelection);

    if (effectiveRange) {
        glucoseChart.options.plugins.annotation.annotations.push({
            type: 'box',
            xMin: new Date(effectiveRange.startMs).toISOString(),
            xMax: new Date(effectiveRange.endMs).toISOString(),
            backgroundColor: 'rgba(255, 215, 0, 0.15)',
            borderColor: 'rgba(255, 165, 0, 0.8)',
            borderWidth: 1
        });
    }


    const updateMode = dragRangeState.isDragging ? 'none' : 'default';
    glucoseChart.update(updateMode);
}



function updateChartData(startDate, endDate) {
    const filteredData = egvData.filter(dataPoint => {
        const dataDate = new Date(dataPoint.Timestamp);
        return dataDate >= startDate && dataDate < endDate;
    });

    const capRows = insulinScaleMode === 'auto_visible'
        ? filteredData
        : (insulinScaleMode === 'auto_whole' ? egvData : filteredData);

    insulinDisplayCapUnits = (insulinScaleMode === 'auto_visible' || insulinScaleMode === 'auto_whole')
        ? computeAutoInsulinCap(capRows)
        : Number(insulinScaleMode);

    const processedData = filteredData.map(dataPoint => ({
        x: dataPoint.Timestamp,
        y: dataPoint.GlucoseValue
    }));

    const insulinData = filteredData
        .filter(dataPoint => Number.isFinite(Number(dataPoint.InsulinValue)) && Number(dataPoint.InsulinValue) > 0)
        .map(dataPoint => {
            const rawDose = Number(dataPoint.InsulinValue);
            return {
                x: dataPoint.Timestamp,
                y: Math.min(rawDose, insulinDisplayCapUnits),
                rawDose
            };
        });

    const mealMarkerData = seriesMealAnnouncements
        .filter(row => {
            const t = new Date(row.Timestamp);
            return t >= startDate && t < endDate;
        })
        .map(row => ({
            x: row.Timestamp,
            y: 392,
            markerTooltip: row.markerTooltip,
            mealType: row.mealType,
            mealSizeDescriptor: row.mealSizeDescriptor
        }));

    const eventMarkerData = seriesPumpEvents
        .filter(row => {
            const t = new Date(row.Timestamp);
            return t >= startDate && t < endDate;
        })
        .map(row => ({
            x: row.Timestamp,
            y: 382,
            markerTooltip: row.markerTooltip,
            eventType: row.eventType
        }));

    // Create a missing data array to plot missing data points
    const missingData = processedData.filter(dataPoint => isNaN(dataPoint.y)).map(dataPoint => ({
        x: dataPoint.x,
        y: 40 // Set the y value to 40 (minimum glucose value) for missing data points
    }));

    // Update chart data
    glucoseChart.data.datasets[0].data = processedData;
    glucoseChart.data.datasets[1].data = missingData;
    glucoseChart.data.datasets[2].data = insulinData;
    glucoseChart.data.datasets[3].data = mealMarkerData;
    glucoseChart.data.datasets[4].data = eventMarkerData;
    glucoseChart.options.scales.yInsulin.max = insulinDisplayCapUnits;
    glucoseChart.options.scales.yInsulin.title.text = insulinScaleMode === 'auto_visible'
        ? `Insulin Dose (U, auto visible 0-${insulinDisplayCapUnits})`
        : (insulinScaleMode === 'auto_whole'
            ? `Insulin Dose (U, auto whole 0-${insulinDisplayCapUnits})`
            : `Insulin Dose (U, 0-${insulinDisplayCapUnits})`);

    // Update point colors
    updatePointColors();

    // Update cgmDataInfo with the global fileName and deviceType
    if (gFileName && deviceType) {
        const insulinPointCount = insulinData.length;
        const mealMarkerCount = mealMarkerData.length;
        const eventMarkerCount = eventMarkerData.length;
        const insulinSuffix = supplementalInsulinFileName ? ` | Insulin File: ${supplementalInsulinFileName}` : '';
        document.getElementById('cgmDataInfo').innerHTML = `<b>Filename:</b> ${gFileName} | Device Type: ${deviceType}${insulinSuffix} | Insulin points in view: ${insulinPointCount} | Meals in view: ${mealMarkerCount} | Events in view: ${eventMarkerCount}`;
    } else {
        console.error('Filename or Device Type is undefined:', { gFileName, deviceType });
    }

    updateInsulinSummaryDisplay();
    applyRangeStatsFromBounds(activeRangeSelection);
    renderTirSection();


}



// Function to take CGM data (with fields Timestamp and GlucoseValue), and create a new object where each data point is the 
// average glucose for a 5 (or 15) minute period,
// starting with 00:00:00 on the first day of data, and ending with 23:55:00 on the last day of data.
// Any 5 minute periods with no data should have a value of null.
// The return should be an array with objects that have the following format:
// { Timestamp: 'YYYY-MM-DDThh:mm:ss', GlucoseValue: number, NumReadings: number }
function aggregateGlucoseReadings(data, insulinData = []) {
    // check that data is defined
    if (!data) {
        console.error('Data is undefined');
        return [];
    }
    // Detect the interval in minutes (either 5 or 15) by sampling differences between timestamps
    let intervalMinutes = 5;
    if (data.length > 1) {
        const sampleSize = Math.min(data.length - 1, 20);
        let count5 = 0, count15 = 0;
        for (let i = 1; i <= sampleSize; i++) {
            const diff = moment(data[i].Timestamp).diff(moment(data[i - 1].Timestamp), 'minutes');
            if (Math.abs(diff - 5) < 2) count5++;
            if (Math.abs(diff - 15) < 2) count15++;
        }
        if (count15 > count5) {
            intervalMinutes = 15;
        }
    }

    console.log(`Detected interval: ${intervalMinutes} minutes`);

    // Use moment() to ensure we're working in UTC
    const startDate = moment(data[0].Timestamp);
    const endDate = moment(data[data.length - 1].Timestamp);

    // Set the start and end of the analysis window in UTC.
    // The start is at 00:00:00 of the first day, and the end is set to the last interval start time of the last day.
    // For example, for 5-minute intervals the last start is 23:55:00 (1440 - 5 = 1435 minutes after midnight),
    // and for 15-minute intervals it will be 23:45:00 (1440 - 15 = 1425 minutes after midnight).
    const startDay = startDate.clone().startOf('day');
    const endDay = endDate.clone().startOf('day').add(1440 - intervalMinutes, 'minutes');

    const insulinByInterval = new Map();
    insulinData.forEach(record => {
        const ts = moment(record.Timestamp);
        const dose = Number(record.InsulinValue);
        if (!ts.isValid() || !Number.isFinite(dose) || dose <= 0) {
            return;
        }

        const dayStart = ts.clone().startOf('day');
        const minuteOfDay = ts.diff(dayStart, 'minutes');
        const bucketMinute = Math.floor(minuteOfDay / intervalMinutes) * intervalMinutes;
        const bucketStartIso = dayStart.clone().add(bucketMinute, 'minutes').toISOString();
        const currentDose = insulinByInterval.get(bucketStartIso) || 0;
        insulinByInterval.set(bucketStartIso, currentDose + dose);
    });

    let currentIndex = 0;
    let currentIntervalStart = startDay.clone();
    let intervalEnd = startDay.clone().add(intervalMinutes, 'minutes');
    let glucoseValues = [];
    let output = [];

    while (currentIntervalStart <= endDay && currentIndex < data.length) {
        const currentDataPoint = data[currentIndex];
        const dataPointDate = moment(currentDataPoint.Timestamp);

        if (dataPointDate.isSameOrAfter(currentIntervalStart) && dataPointDate.isBefore(intervalEnd)) {
            // The data point is within the current interval
            glucoseValues.push(parseInt(currentDataPoint.GlucoseValue));
            currentIndex++;
        } else if (dataPointDate.isSameOrAfter(intervalEnd)) {
            // We've moved past the current interval, calculate the average for the interval
            const averageGlucose = glucoseValues.length > 0 ? glucoseValues.reduce((a, b) => a + b) / glucoseValues.length : null;

            output.push({
                Timestamp: currentIntervalStart.toISOString(),
                GlucoseValue: averageGlucose,
                InsulinValue: insulinByInterval.get(currentIntervalStart.toISOString()) || 0,
                NumReadings: glucoseValues.length
            });

            // Move to the next interval
            currentIntervalStart = intervalEnd;
            intervalEnd = currentIntervalStart.clone().add(intervalMinutes, 'minutes');
            glucoseValues = []; // Reset for the next interval

            // Skip intervals with no data points until we find the next data point or reach the end
            while (dataPointDate.isSameOrAfter(intervalEnd) && currentIntervalStart <= endDay) {
                output.push({
                    Timestamp: currentIntervalStart.toISOString(),
                    GlucoseValue: NaN, // No data points in this interval
                    InsulinValue: insulinByInterval.get(currentIntervalStart.toISOString()) || 0,
                    NumReadings: 0
                });

                currentIntervalStart = intervalEnd;
                intervalEnd = currentIntervalStart.clone().add(intervalMinutes, 'minutes');
            }
        } else {
            // The current data point is before the start of the interval (unlikely if data is sorted)
            currentIndex++;
        }
    }

    // Handle the last interval if it contains any data points
    if (glucoseValues.length > 0) {
        const averageGlucose = glucoseValues.reduce((a, b) => a + b) / glucoseValues.length;
        output.push({
            Timestamp: currentIntervalStart.toISOString(),
            GlucoseValue: averageGlucose,
            InsulinValue: insulinByInterval.get(currentIntervalStart.toISOString()) || 0,
            NumReadings: glucoseValues.length
        });
        currentIntervalStart = intervalEnd;
        intervalEnd = currentIntervalStart.clone().add(intervalMinutes, 'minutes');
    }

    // Handle any remaining intervals after the last data point
    while (currentIntervalStart <= endDay) {
        output.push({
            Timestamp: currentIntervalStart.toISOString(),
            GlucoseValue: null, // No data points in this interval
            InsulinValue: insulinByInterval.get(currentIntervalStart.toISOString()) || 0,
            NumReadings: 0
        });

        currentIntervalStart = intervalEnd;
        intervalEnd = currentIntervalStart.clone().add(intervalMinutes, 'minutes');
    }

    return output.map(item => ({
        ...item,
        Timestamp: moment(item.Timestamp).format() // Ensure output timestamps are formatted correctly
    }));
}



function processDexcomCSVData(csvText) {
    // Initial processing setup...
    // Split CSV text into lines and process headers
    // replace and splits the \r\n or \r with just \n
    const lines = csvText.split('\n').map(line =>
        line.replace(/"\r?$/, '').replace(/^"/, '').split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
    );
    const origHeaders = lines.shift();

    // Find indices...
    const indexIndex = origHeaders.indexOf('Index');
    const timestampIndex = origHeaders.indexOf('Timestamp (YYYY-MM-DDThh:mm:ss)');
    const glucoseValueIndex = origHeaders.indexOf('Glucose Value (mg/dL)');
    const transmitterIdIndex = origHeaders.indexOf('Transmitter ID');
    const deviceInfo = origHeaders.indexOf('Device Info');
    const eventType = origHeaders.indexOf('Event Type');

    // get the type of device from the data. It will be in one of the data lines with the "Event Type" of "Device"
    // in the "Device Info" column. Once we find the device type, we can assign it to a variable and stop looking.
    deviceType = '';
    for (let i = 0; i < lines.length; i++) {
        if (lines[i][eventType] === 'Device') {
            deviceType = lines[i][deviceInfo];
            break;
        }
    }

    // Process data...
    let localEgvData = lines.filter(line => line.length > 2 && line[eventType] === 'EGV').map(line => ({
        Index: line[indexIndex] || '',
        Timestamp: line[timestampIndex] || '', // Keep as the original string
        GlucoseValue: line[glucoseValueIndex] || '',
        TransmitterID: line[transmitterIdIndex] || ''
    }));


    // Detect Transmitter-ID changes...
    let changes = [];
    let lastTransmitterId = localEgvData[0] ? localEgvData[0].TransmitterID : '';
    localEgvData.forEach((dataPoint, index) => {
        if (dataPoint.TransmitterID !== lastTransmitterId) {
            changes.push({ index: index, Timestamp: dataPoint.Timestamp, TransmitterID: dataPoint.TransmitterID });
            lastTransmitterId = dataPoint.TransmitterID;
        }
    });

    // Enable the runDetectionBtn button if there is EGV data
    if (localEgvData.length > 0) {
        syncDetectButtonAvailability();
    }

    // log the first 5 rows of EGV data
    // console.log(localEgvData.slice(0, 5));
    return { localEgvData, deviceType };
}

function processLibreCSVData(csvText) {
    const parsedLines = csvText
        .split(/\r?\n/)
        .filter(line => line && line.trim().length > 0)
        .map(line => splitCsvLine(line));

    let headerRowIndex = -1;
    for (let i = 0; i < parsedLines.length; i++) {
        const normalized = parsedLines[i].map(cell => String(cell || '').trim().toLowerCase());
        if (normalized.includes('device timestamp') && normalized.includes('record type') && normalized.includes('historic glucose mg/dl')) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        console.warn('Libre headers not found in expected format.');
        return { localEGVData: [], deviceType: '' };
    }

    const origHeaders = parsedLines[headerRowIndex].map(cell => String(cell || '').trim());
    const lines = parsedLines.slice(headerRowIndex + 1);

    const deviceIndex = origHeaders.indexOf('Device');
    const deviceTimestampIndex = origHeaders.indexOf('Device Timestamp');
    const recordTypeIndex = origHeaders.indexOf('Record Type');
    const historicGlucoseIndex = origHeaders.indexOf('Historic Glucose mg/dL');
    const scanGlucoseIndex = origHeaders.indexOf('Scan Glucose mg/dL');

    if (deviceTimestampIndex === -1 || recordTypeIndex === -1 || historicGlucoseIndex === -1) {
        console.warn('Libre file missing one or more required columns.');
        return { localEGVData: [], deviceType: '' };
    }

    let deviceType = lines.length > 0 && deviceIndex !== -1 ? lines[0][deviceIndex] : 'Libre';

    const localEGVData = lines
        .filter(line => line.length > recordTypeIndex)
        .map(line => {
            const rt = String(line[recordTypeIndex] || '').trim();
            let glucoseValue = '';
            if (rt === '0') {
                glucoseValue = line[historicGlucoseIndex];
            } else if (rt === '1' && scanGlucoseIndex !== -1) {
                glucoseValue = line[scanGlucoseIndex];
            }

            const timestamp = parseTimestampOrNull(line[deviceTimestampIndex]);
            const glucoseNumeric = Number(glucoseValue);
            if (!timestamp || !Number.isFinite(glucoseNumeric)) {
                return null;
            }

            return {
                Timestamp: timestamp,
                GlucoseValue: glucoseNumeric
            };
        })
        .filter(row => row !== null);

    // Enable the runDetectionBtn button if there's Libre data
    if (localEGVData.length > 0) {
        syncDetectButtonAvailability();
    }

    // Log the first 5 rows of Libre data for debugging
    // console.log(localEGVData.slice(0, 5));
    return { localEGVData, deviceType };
}

function processSeriesCSVData(csvText) {
    const lines = csvText
        .split(/\r?\n/)
        .filter(line => line && line.trim().length > 0)
        .map(line => splitCsvLine(line));

    if (lines.length === 0) {
        return { cgmData: [], insulinData: [], mealAnnouncements: [], pumpEvents: [] };
    }

    const headers = lines.shift().map(h => h.toLowerCase().trim());
    const seriesIndex = headers.indexOf('series');
    const datetimeIndex = headers.indexOf('datetime_local');
    const valueIndex = headers.indexOf('value');
    const annotationKindIndex = headers.indexOf('annotation_kind');
    const tooltipTextIndex = headers.indexOf('tooltip_text');
    const annotationTextCleanIndex = headers.indexOf('annotation_text_clean');
    const annotationTextRawIndex = headers.indexOf('annotation_text_raw');
    const mealTypeIndex = headers.indexOf('meal_type');
    const mealSizeDescriptorIndex = headers.indexOf('meal_size_descriptor');
    const eventTypeIndex = headers.indexOf('event_type');

    if (seriesIndex === -1 || datetimeIndex === -1 || valueIndex === -1) {
        return { cgmData: [], insulinData: [], mealAnnouncements: [], pumpEvents: [] };
    }

    const cgmData = [];
    const insulinData = [];
    const mealAnnouncements = [];
    const pumpEvents = [];

    lines.forEach(line => {
        if (line.length <= Math.max(seriesIndex, datetimeIndex, valueIndex)) {
            return;
        }

        const series = (line[seriesIndex] || '').trim().toLowerCase();
        const annotationKind = annotationKindIndex >= 0
            ? String(line[annotationKindIndex] || '').trim().toLowerCase()
            : '';
        const timestamp = parseTimestampOrNull(line[datetimeIndex]);
        const numericValue = Number(line[valueIndex]);

        if (!timestamp) {
            return;
        }

        const tooltipText = [
            tooltipTextIndex >= 0 ? line[tooltipTextIndex] : '',
            annotationTextCleanIndex >= 0 ? line[annotationTextCleanIndex] : '',
            annotationTextRawIndex >= 0 ? line[annotationTextRawIndex] : ''
        ].map(t => String(t || '').trim()).find(t => t.length > 0) || '';

        const mealType = mealTypeIndex >= 0 ? String(line[mealTypeIndex] || '').trim() : '';
        const mealSizeDescriptor = mealSizeDescriptorIndex >= 0 ? String(line[mealSizeDescriptorIndex] || '').trim() : '';
        const eventType = eventTypeIndex >= 0 ? String(line[eventTypeIndex] || '').trim() : '';

        const isMealAnnouncement = series.includes('meal announcement') || annotationKind === 'meal';
        const isPumpEvent = series === 'event' || annotationKind === 'event';

        if (series === 'cgm' && Number.isFinite(numericValue)) {
            cgmData.push({ Timestamp: timestamp, GlucoseValue: numericValue });
        } else if (series.includes('insulin') && Number.isFinite(numericValue)) {
            insulinData.push({ Timestamp: timestamp, InsulinValue: numericValue });
        } else if (isMealAnnouncement) {
            const mealDetails = [mealType, mealSizeDescriptor].filter(Boolean).join(', ');
            const markerTooltip = tooltipText || (mealDetails ? `Meal: ${mealDetails}` : 'Meal Announcement');
            mealAnnouncements.push({
                Timestamp: timestamp,
                markerTooltip,
                mealType,
                mealSizeDescriptor
            });
        } else if (isPumpEvent) {
            const markerTooltip = tooltipText || (eventType ? `Event: ${eventType}` : 'Pump Event');
            pumpEvents.push({
                Timestamp: timestamp,
                markerTooltip,
                eventType
            });
        }
    });

    cgmData.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
    insulinData.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
    mealAnnouncements.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
    pumpEvents.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

    return { cgmData, insulinData, mealAnnouncements, pumpEvents };
}

function processSnyderCSVData(csvText) {
    const lines = csvText
        .split(/\r?\n/)
        .filter(line => line && line.trim().length > 0)
        .map(line => splitCsvLine(line));

    if (!lines.length) {
        return { localEgvData: [], deviceType: '' };
    }

    const headers = lines.shift().map(h => String(h || '').trim().toLowerCase());
    const patientIdIndex = headers.indexOf('patient_id');
    const glucoseIndex = headers.indexOf('blood_sugar');
    const measurementTimeIndex = headers.indexOf('measurement_time');

    if (glucoseIndex === -1 || measurementTimeIndex === -1) {
        return { localEgvData: [], deviceType: '' };
    }

    const localEgvData = lines.map(line => {
        const timestamp = parseTimestampOrNull(line[measurementTimeIndex]);
        const glucoseValue = Number(line[glucoseIndex]);

        if (!timestamp || !Number.isFinite(glucoseValue)) {
            return null;
        }

        return {
            Timestamp: timestamp,
            GlucoseValue: glucoseValue
        };
    }).filter(row => row !== null);

    const patientId = patientIdIndex !== -1 && lines.length > 0 ? lines[0][patientIdIndex] : '';
    const derivedDeviceType = patientId ? `Snyder CSV (${patientId})` : 'Snyder CSV';

    return { localEgvData, deviceType: derivedDeviceType };
}

function buildInsulinIntervalMap(insulinData, intervalMinutes) {
    const insulinByInterval = new Map();
    insulinData.forEach(record => {
        const ts = moment(record.Timestamp);
        const dose = Number(record.InsulinValue);
        if (!ts.isValid() || !Number.isFinite(dose) || dose <= 0) {
            return;
        }

        const dayStart = ts.clone().startOf('day');
        const minuteOfDay = ts.diff(dayStart, 'minutes');
        const bucketMinute = Math.floor(minuteOfDay / intervalMinutes) * intervalMinutes;
        const bucketStartIso = dayStart.clone().add(bucketMinute, 'minutes').toISOString();
        const currentDose = insulinByInterval.get(bucketStartIso) || 0;
        insulinByInterval.set(bucketStartIso, currentDose + dose);
    });
    return insulinByInterval;
}

function mergeInsulinIntoBinnedData(binnedData, insulinData) {
    if (!binnedData || binnedData.length === 0) {
        return binnedData;
    }

    const intervalMinutes = binnedData.length > 1
        ? Math.max(1, Math.round(moment(binnedData[1].Timestamp).diff(moment(binnedData[0].Timestamp), 'minutes', true)))
        : 5;

    const insulinByInterval = buildInsulinIntervalMap(insulinData, intervalMinutes);
    return binnedData.map(row => ({
        ...row,
        InsulinValue: (Number(row.InsulinValue) || 0) + (insulinByInterval.get(moment(row.Timestamp).toISOString()) || 0)
    }));
}



// Function to determine if a text file is a Libre or Dexcom file
// Returns "Libre", "Dexcom", or "Unknown"
// For Libre, the firt line starts with "Patient Report", and the third line is 
// column headers starting with "Device"
// For Dexcom, the first line starts wtih "Index" (possibly with quotes around "Index") and the other column headers
function getCGMFileType(csvText) {
    const lines = csvText.split('\n').map(line => line.trim());
    const firstLine = (lines[0] || '').replace(/^\uFEFF/, '');
    const secondLine = lines[1] || '';
    const thirdLine = lines[2] || '';
    const normalizedHeader = firstLine.toLowerCase().replace(/\"/g, '');
    const normalizedSecond = secondLine.toLowerCase().replace(/\"/g, '');
    const normalizedThird = thirdLine.toLowerCase().replace(/\"/g, '');

    if (normalizedHeader.includes('series') && normalizedHeader.includes('datetime_local') && normalizedHeader.includes('value')) {
        return 'Series';
    }

    if (normalizedHeader.includes('patient_id') && normalizedHeader.includes('blood_sugar') && normalizedHeader.includes('measurement_time')) {
        return 'Snyder';
    }

    const libreHeaderLike = (line) => line.includes('device') && line.includes('record type') && line.includes('historic glucose mg/dl');

    if ((firstLine.startsWith("Patient") && thirdLine.startsWith("Device")) || libreHeaderLike(normalizedHeader) || libreHeaderLike(normalizedSecond) || libreHeaderLike(normalizedThird)) {
        return "Libre";
    } else if (firstLine.startsWith('Index') || firstLine.startsWith('"Index"')) {
        return "Dexcom";
    } else {
        console.log('Unknown file type. First line: ', firstLine, ' Third line: ', thirdLine);
        if (firstLine.startsWith('Patient')) {
            console.log('This might be a Libre file, but the column headers are not in the expected format.');
        }
        return "Unknown";
    }
}

function handleFile(file, importMode = 'primary') {
    var reader = new FileReader();
    reader.onload = function (e) {
        const fileType = getCGMFileType(e.target.result);
        if (fileType === "Unknown") {
            alert(importMode === 'supplemental'
                ? 'Supplemental insulin import requires a file with series, datetime_local, value columns.'
                : 'This is not a recognized CGM file.');
            return;
        }

        if (importMode === 'supplemental') {
            if (!egvData || egvData.length === 0) {
                alert('Load a Dexcom, Libre, or series CGM file before adding supplemental insulin.');
                return;
            }
            if (fileType !== 'Series') {
                alert('Supplemental insulin files must use series, datetime_local, value columns.');
                return;
            }

            const parsedSeries = processSeriesCSVData(e.target.result);
            if (!parsedSeries.insulinData.length) {
                alert('No insulin rows were found in the supplemental file.');
                return;
            }

            const supplementalBase = (baseBinnedData && baseBinnedData.length > 0) ? baseBinnedData : egvData;
            egvData = mergeInsulinIntoBinnedData(supplementalBase, parsedSeries.insulinData);
            supplementalInsulinFileName = file.name;
            insulinSourceLabel = `Supplemental (${file.name})`;

            const selectedDate = picker && picker.getDate() ? picker.getDate() : moment(egvData[0].Timestamp).toDate();
            updateChartBasedOnSelection(selectedDate);
            updatePointColors();
            return;
        }

        let localCgmData = [];
        let insulinRows = [];
        let mealRows = [];
        let eventRows = [];

        if (fileType === "Libre") {
            const processedData = processLibreCSVData(e.target.result);
            localCgmData = processedData.localEGVData;
            deviceType = processedData.deviceType;
        } else if (fileType === "Dexcom") {
            const processedData = processDexcomCSVData(e.target.result);
            localCgmData = processedData.localEgvData;
            deviceType = processedData.deviceType;
        } else if (fileType === 'Snyder') {
            const processedData = processSnyderCSVData(e.target.result);
            localCgmData = processedData.localEgvData;
            deviceType = processedData.deviceType;
        } else if (fileType === 'Series') {
            const processedData = processSeriesCSVData(e.target.result);
            localCgmData = processedData.cgmData;
            insulinRows = processedData.insulinData;
            mealRows = processedData.mealAnnouncements || [];
            eventRows = processedData.pumpEvents || [];
            deviceType = 'Series CSV';

            if (localCgmData.length > 0) {
                syncDetectButtonAvailability();
            }
        }

        if (!localCgmData.length) {
            if (fileType === 'Series' && insulinRows.length > 0) {
                alert('This file contains insulin data only. Use Add Insulin File after loading CGM data.');
            } else {
                alert('No CGM rows were found in this file.');
            }
            return;
        }

        gFileName = file.name; // Update the global variable
        showStoredDetectedMeals = false;
        seriesMealAnnouncements = mealRows;
        seriesPumpEvents = eventRows;
        // Enable Add Insulin File now that a CGM file has been successfully loaded
        setButtonDisabledState(document.getElementById('addInsulinFileBtn'), false);
        activeRangeSelection = null;
        dragRangeState = { isDragging: false, startMs: null, currentMs: null };
        applyRangeStatsFromBounds(null);
        supplementalInsulinFileName = '';
        insulinSourceLabel = insulinRows.length > 0 ? `Embedded (${file.name})` : 'None';
        let binnedData = aggregateGlucoseReadings(localCgmData, insulinRows); // Process the data for the chart

        // Set up the dataCompleteness object
        const startDate = moment(binnedData[0].Timestamp).toDate();
        dataCompleteness = {};
        let currentDate = moment(startDate).format('YYYY-MM-DD');
        let count = 0;

        binnedData.forEach((dataPoint, index) => {
            const dataDate = moment(dataPoint.Timestamp).format('YYYY-MM-DD');
            if (dataDate === currentDate) {
                // Counting data points for the current date if there is at least one data point
                if (dataPoint.NumReadings > 0) {
                    count++;
                }
            } else {
                // When the date changes, calculate missing data for the previous date and reset the count
                dataCompleteness[currentDate] = { missing: 288 - count, total: 288 };
                currentDate = dataDate;
                if (dataPoint.NumReadings > 0) {
                    count = 1; // Start counting for the new date
                } else {
                    count = 0; // Reset the count if there are no data points
                }
            }

            // Ensure the last date is also accounted for
            if (index === binnedData.length - 1) {
                dataCompleteness[currentDate] = { missing: 288 - count, total: 288 };
            }
        });

        egvData = binnedData; // Update the global variable with the binned data
        baseBinnedData = binnedData.map(row => ({ ...row }));

        const initialStartDate = moment(binnedData[0].Timestamp);
        // get number of days to display, which is in the "daysToDisplay" input box
        const daysToDisplay = parseInt(document.getElementById('daysToDisplay').value, 10);
        const initialEndDate = initialStartDate.clone().add(daysToDisplay, 'days');

        updateChartData(initialStartDate.toDate(), initialEndDate.toDate());

        picker.setDate(startDate);

        // Call this function whenever a new file is loaded
        loadSelectedPointsForFile(gFileName);
        updatePointColors(); // Ensure the chart reflects the loaded selections
        syncDetectButtonAvailability();
    };
    reader.readAsText(file);
}

// Function to find matches between a gold standard and detected meals
// goldStandardMeals and detectedMeals are arrays of timestamps
function findNearestMatchesOptimized(goldStandardMeals, detectedMeals, cutoffHours = 1) {
    const cutoffSeconds = cutoffHours * 60 * 60;
    const matches = [];

    const goldSorted = [...goldStandardMeals].sort((a, b) => new Date(a) - new Date(b));
    const detectedSorted = [...detectedMeals].sort((a, b) => new Date(a) - new Date(b));
    const detectedUsed = new Array(detectedSorted.length).fill(false);

    goldSorted.forEach(goldMeal => {
        const goldSec = new Date(goldMeal).getTime() / 1000;
        let bestIdx = -1;
        let bestDiffSec = Infinity;

        for (let j = 0; j < detectedSorted.length; j++) {
            if (detectedUsed[j]) {
                continue;
            }
            const detSec = new Date(detectedSorted[j]).getTime() / 1000;
            const diffSec = Math.abs(detSec - goldSec);

            if (diffSec <= cutoffSeconds && diffSec < bestDiffSec) {
                bestDiffSec = diffSec;
                bestIdx = j;
            }
        }

        if (bestIdx >= 0) {
            detectedUsed[bestIdx] = true;
            matches.push({
                goldMeal,
                detectedMeal: detectedSorted[bestIdx],
                timeDifferenceSec: bestDiffSec
            });
        } else {
            matches.push({
                goldMeal,
                detectedMeal: null,
                timeDifferenceSec: null
            });
        }
    });

    const falsePositives = detectedSorted.filter((_, idx) => !detectedUsed[idx]);
    return { matches, falsePositives };
}

// Function to calculate the score based on the nearest matches
function calculateMealDetectionScore(goldStandardMeals, detectedMeals, cutoffHours = 1) {
    const { matches, falsePositives } = findNearestMatchesOptimized(goldStandardMeals, detectedMeals, cutoffHours);
    const cutoffSeconds = cutoffHours * 60 * 60;
    let totalScore = 0;

    // Calculate score for matches
    matches.forEach(match => {
        if (match.detectedMeal !== null) {
            if (match.timeDifferenceSec === 0) {
                // Exact match, score +1
                totalScore += 1;
            } else {
                // Linear ramp, without harsh penalties (1 - (timeDifference / cutoff))
                const score = 1 - (match.timeDifferenceSec / cutoffSeconds);
                totalScore += score;
            }
        } else {
            // No match for this gold standard meal, it's a false negative
            totalScore -= 1;
        }
    });

    // Subtract score for false positives directly
    totalScore -= falsePositives.length;

    // Normalize score based on the number of gold standard meals
    const normalizedScore = goldStandardMeals.length > 0 ? totalScore / goldStandardMeals.length : 0;

    // Calculate missed meals and successful matches
    const missedMeals = matches.filter(match => match.detectedMeal === null).length;
    const successfulMatches = matches.filter(match => match.detectedMeal !== null).length;

    return {
        score: normalizedScore,
        matches: successfulMatches,
        falsePositives: falsePositives.length,
        missedMeals: missedMeals
    };
}

function defaultInfiGrid() {
    const grid = [];
    const triggerRates = [];
    for (let v = 0; v <= 1.8 + 1e-9; v += 0.2) {
        triggerRates.push(Number(v.toFixed(1)));
    }

    const rises = [];
    for (let v = 10; v <= 55; v += 5) {
        rises.push(v);
    }

    for (const triggerRateMgdlPerMin of triggerRates) {
        for (const mustIncrease of rises) {
            for (let numConsecutiveIncrease = 1; numConsecutiveIncrease <= 8; numConsecutiveIncrease++) {
                grid.push({
                    triggerRateMgdlPerMin,
                    mustIncrease,
                    numConsecutiveIncrease,
                    mealBlockoutMinutes: 120
                });
            }
        }
    }

    return grid;
}

function compareOptimizationRows(a, b) {
    // R-style tie-break order.
    return (b.total_score - a.total_score) ||
        (a.mustIncrease - b.mustIncrease) ||
        (a.numConsecutiveIncrease - b.numConsecutiveIncrease) ||
        (a.missedMeals - b.missedMeals) ||
        (a.falsePositives - b.falsePositives) ||
        (a.triggerRateMgdlPerMin - b.triggerRateMgdlPerMin) ||
        (a.mealBlockoutMinutes - b.mealBlockoutMinutes);
}

function runDetectionForParams(dataToProcess, params) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('findExcursionsWorker.js');
        worker.postMessage({
            egvData: dataToProcess,
            triggerRate: params.triggerRateMgdlPerMin,
            mustIncrease: params.mustIncrease,
            mealBlockoutMinutes: params.mealBlockoutMinutes,
            numConsecutiveIncrease: params.numConsecutiveIncrease
        });

        worker.addEventListener('message', function (e) {
            const detectedMeals = e.data || [];
            resolve(detectedMeals.map(m => m.Timestamp));
            worker.terminate();
        });

        worker.addEventListener('error', function (err) {
            reject(err);
            worker.terminate();
        });
    });
}

async function optimizeMealParamsCurrentData() {
    const dataToProcess = getDataToProcess();
    const goldStandardMeals = getSelectedMealsToProcess();
    const objectiveSelect = document.getElementById('optimizationObjective');
    const targetMealsInput = document.getElementById('targetMealsPerDay');
    const optimizationSummary = document.getElementById('optimizationSummary');
    const optimizationProgressContainer = document.getElementById('optimizationProgressContainer');
    const optimizationProgress = document.getElementById('optimizationProgress');
    const optimizationProgressText = document.getElementById('optimizationProgressText');

    if (!dataToProcess || dataToProcess.length < 3) {
        alert('Load CGM data before running optimization.');
        return null;
    }

    const objective = objectiveSelect ? objectiveSelect.value : 'gold';
    const targetMealsPerDay = Math.max(1, Number(targetMealsInput ? targetMealsInput.value : 3) || 3);
    const useTargetObjective = objective === 'target';

    if (!useTargetObjective && (!goldStandardMeals || goldStandardMeals.length === 0)) {
        alert('Select or upload gold-standard meal timestamps, or switch objective to Target Meals / Day.');
        return null;
    }

    // At least one day for short windows; avoids runaway penalties for small slices.
    const dayKeys = new Set(dataToProcess.map(row => moment(row.Timestamp).format('YYYY-MM-DD')));
    const numDaysInWindow = Math.max(1, dayKeys.size);

    const grid = defaultInfiGrid();
    const rows = [];
    const total = grid.length;

    if (optimizationProgressContainer) {
        optimizationProgressContainer.classList.remove('hidden');
    }
    if (optimizationProgress) {
        optimizationProgress.value = 0;
    }
    if (optimizationProgressText) {
        optimizationProgressText.textContent = `0% (0/${total})`;
    }

    for (let idx = 0; idx < grid.length; idx++) {
        const params = grid[idx];
        const detectedTimestamps = await runDetectionForParams(dataToProcess, params);
        const avgMealsPerDay = detectedTimestamps.length / numDaysInWindow;

        let score = {
            score: 0,
            matches: 0,
            falsePositives: 0,
            missedMeals: 0
        };

        let countPenalty = 0;
        if (useTargetObjective) {
            countPenalty = Math.pow(avgMealsPerDay - targetMealsPerDay, 2) / Math.pow(targetMealsPerDay, 2);
            score.score = -countPenalty;
        } else {
            score = calculateMealDetectionScore(goldStandardMeals, detectedTimestamps, 1);
        }

        rows.push({
            ...params,
            total_score: score.score,
            score: score.score,
            matches: score.matches,
            falsePositives: score.falsePositives,
            missedMeals: score.missedMeals,
            detectedCount: detectedTimestamps.length,
            avgMealsPerDay,
            countPenalty
        });

        const completed = idx + 1;
        const percent = Math.round((completed / total) * 100);
        if (optimizationProgress) {
            optimizationProgress.value = percent;
        }
        if (optimizationProgressText) {
            optimizationProgressText.textContent = `${percent}% (${completed}/${total})`;
        }

        if (optimizationSummary && (idx % 20 === 0 || idx === grid.length - 1)) {
            optimizationSummary.textContent = `Running optimization: ${completed}/${total}`;
        }
    }

    rows.sort(compareOptimizationRows);
    const best = rows[0];
    if (!best) {
        return null;
    }

    document.getElementById('triggerRate').value = best.triggerRateMgdlPerMin.toFixed(1);
    document.getElementById('mustIncrease').value = String(best.mustIncrease);
    document.getElementById('mealBlockoutMinutes').value = String(best.mealBlockoutMinutes);
    document.getElementById('numConsecutiveIncrease').value = String(best.numConsecutiveIncrease);

    if (optimizationSummary) {
        const paramsLine = `trigger=${best.triggerRateMgdlPerMin.toFixed(1)} mg/dL/min, rise=${best.mustIncrease}, N=${best.numConsecutiveIncrease}, blackout=${best.mealBlockoutMinutes}`;
        const metricLine = useTargetObjective
            ? `objective=target ${targetMealsPerDay}/day, avg=${best.avgMealsPerDay.toFixed(2)}/day, penalty=${best.countPenalty.toFixed(3)}, score=${best.score.toFixed(3)}`
            : `objective=gold, score=${best.score.toFixed(3)}, TP=${best.matches}, FP=${best.falsePositives}, FN=${best.missedMeals}`;

        optimizationSummary.innerHTML = `<b>Best params applied</b><br>${paramsLine}<br>${metricLine}`;
    }

    if (optimizationProgressText) {
        optimizationProgressText.textContent = `100% (${total}/${total})`;
    }

    return { best, rows };
}



// Function to send data to a worker and receive a response for one trigger rate
function runFindExcursionsInWorker(dataToProcess, goldStandardMeals, triggerRateMgdlPerMin, mustIncrease, mealBlockoutMinutes, numConsecutiveIncrease) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('findExcursionsWorker.js');

        // Send data to the worker
        worker.postMessage({
            egvData: dataToProcess,
            triggerRateMgdlPerMin,
            mustIncrease,
            mealBlockoutMinutes,
            numConsecutiveIncrease
        });

        // Receive the result from the worker
        worker.addEventListener('message', function (e) {
            const detectedMeals = e.data; // detected meals from worker
            const mealTimestamps = detectedMeals.map(excursion => excursion.Timestamp);

            if (goldStandardMeals.length > 0) {
                // If selected meals exist, calculate the score (difference for now)
                const score = calculateMealDetectionScore(goldStandardMeals, mealTimestamps);
                console.log('GoldStandardMeals:', goldStandardMeals.length, 'Detected Meals:', mealTimestamps.length, 'Score:', score.score);
                resolve(score); // Resolve with the score
            } else {
                // No selected meals, just return the number of detected meals
                console.log('No goldStandardMeals found; score is Detected Meals:', mealTimestamps.length);
                resolve(mealTimestamps.length);
            }

            worker.terminate(); // Terminate the worker
        });

        // Handle worker errors
        worker.addEventListener('error', function (e) {
            reject(e);
            worker.terminate(); // Terminate the worker
        });
    });
}

// function to plot a graph for a given parameter
async function plotGraph(parameter, graphId, label, minValue, maxValue, step) {
    const triggerRateMgdlPerMin = parseFloat(document.getElementById('triggerRate').value);
    const mustIncrease = parseInt(document.getElementById('mustIncrease').value, 10);
    const mealBlockoutMinutes = parseInt(document.getElementById('mealBlockoutMinutes').value, 10);
    const numConsecutiveIncrease = parseInt(document.getElementById('numConsecutiveIncrease').value, 10);

    // Get all the data (not just visible data)
    const dataToProcess = getDataToProcess(); // adjust this to filter based on visible data if needed.
    const selectedMeals = getSelectedMealsToProcess();

    const parameterValues = [];
    const mealPromises = [];

    // Loop through parameter values and create a promise for each worker
    for (let value = minValue; value <= maxValue + 1e-9; value += step) {
        const steppedValue = Number(value.toFixed(3));
        parameterValues.push(steppedValue);
        let triggerRateMgdlPerMinValue = parameter === 'triggerRate' ? steppedValue : triggerRateMgdlPerMin;
        let mustIncreaseValue = parameter === 'mustIncrease' ? value : mustIncrease;
        let mealBlockoutMinutesValue = parameter === 'mealBlockoutMinutes' ? value : mealBlockoutMinutes;
        let numConsecutiveIncreaseValue = parameter === 'numConsecutiveIncrease' ? value : numConsecutiveIncrease;
        mealPromises.push(runFindExcursionsInWorker(dataToProcess, selectedMeals, triggerRateMgdlPerMinValue, mustIncreaseValue, mealBlockoutMinutesValue, numConsecutiveIncreaseValue));
    }

    try {
        // Run all workers in parallel and wait for them to finish
        const scores_with_info = await Promise.all(mealPromises);
        // Extract the scores from the results
        const scores = scores_with_info.map(score => score.score || score);

        // If the graph already exists, destroy it before creating a new one
        if (window[graphId + 'Instance']) {
            window[graphId + 'Instance'].destroy();
        }

        // Determine the current value for the parameter so we can annotate it on the graph
        const currentValue = parameter === 'triggerRate' ? triggerRateMgdlPerMin :
            parameter === 'mustIncrease' ? mustIncrease :
                parameter === 'mealBlockoutMinutes' ? mealBlockoutMinutes :
                    numConsecutiveIncrease;


        // Find the index of the currentValue in the parameterValues array
        const currentValueIndex = parameterValues.findIndex(v => Math.abs(v - currentValue) < 1e-6);

        console.log('Parameter:', parameter, 'currentValue:', currentValue, 'Index:', currentValueIndex);


        // Create a new graph
        const ctx = document.getElementById(graphId).getContext('2d');
        window[graphId + 'Instance'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: parameterValues,
                datasets: [{
                    label: label,
                    data: scores,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 2,
                    fill: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: label
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Score (higher is better)'
                        },
                        beginAtZero: true
                    }
                },
                plugins: {
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line',
                                scaleID: 'x',
                                value: currentValueIndex, // annotations work like this
                                borderColor: 'red',
                                borderWidth: 2,
                                borderDash: [6, 6],
                                label: {
                                    enabled: true,
                                    content: 'Current Value',
                                    position: 'start'
                                }
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error plotting meals:', error);
        alert('An error occurred while detecting meals.');
    }
}

// Function to update the chart based on the selected start date and days to display
function updateChartBasedOnSelection(date) {
    activeRangeSelection = null;
    dragRangeState = { isDragging: false, startMs: null, currentMs: null };

    const startDate = moment(date);
    const daysToDisplay = parseInt(document.getElementById('daysToDisplay').value, 10);
    const endDate = moment(date).add(daysToDisplay, 'days'); // Add selected number of days

    // Call the function to update the chart with the new date range
    updateChartData(startDate.toDate(), endDate.toDate());
}

function moveDisplayWindowByDays(dayDelta) {
    if (!egvData || egvData.length === 0) {
        return;
    }

    const currentDate = picker && picker.getDate()
        ? moment(picker.getDate())
        : moment(egvData[0].Timestamp);

    const minStart = moment(egvData[0].Timestamp).startOf('day');
    const maxStart = moment(egvData[egvData.length - 1].Timestamp).startOf('day');
    const targetStart = currentDate.clone().add(dayDelta, 'days');
    const clampedStart = moment.min(moment.max(targetStart, minStart), maxStart);

    if (picker) {
        picker.setDate(clampedStart.toDate());
    } else {
        updateChartBasedOnSelection(clampedStart.toDate());
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const csvFileInput = document.getElementById("csvFileInput");
    const insulinFileInput = document.getElementById('insulinFileInput');
    const insulinScaleModeSelect = document.getElementById('insulinScaleMode');
    const openOptimizationDialogBtn = document.getElementById('openOptimizationDialogBtn');
    const closeOptimizationDialogBtn = document.getElementById('closeOptimizationDialogBtn');
    const optimizationDialogBackdrop = document.getElementById('optimizationDialogBackdrop');

    setOptimizationDialogOpen(false);

    if (openOptimizationDialogBtn) {
        openOptimizationDialogBtn.addEventListener('click', function () {
            syncOptimizationObjectiveDefault();
            setOptimizationDialogOpen(true);
        });
    }

    if (closeOptimizationDialogBtn) {
        closeOptimizationDialogBtn.addEventListener('click', function () {
            setOptimizationDialogOpen(false);
        });
    }

    if (optimizationDialogBackdrop) {
        optimizationDialogBackdrop.addEventListener('click', function () {
            setOptimizationDialogOpen(false);
        });
    }

    const prevDayBtn = document.getElementById('prevDayBtn');
    const nextDayBtn = document.getElementById('nextDayBtn');
    const prevWindowBtn = document.getElementById('prevWindowBtn');
    const nextWindowBtn = document.getElementById('nextWindowBtn');

    if (prevDayBtn) {
        prevDayBtn.addEventListener('click', function () {
            moveDisplayWindowByDays(-1);
        });
    }
    if (nextDayBtn) {
        nextDayBtn.addEventListener('click', function () {
            moveDisplayWindowByDays(1);
        });
    }
    if (prevWindowBtn) {
        prevWindowBtn.addEventListener('click', function () {
            const n = Math.max(1, parseInt(document.getElementById('daysToDisplay').value, 10) || 1);
            moveDisplayWindowByDays(-n);
        });
    }
    if (nextWindowBtn) {
        nextWindowBtn.addEventListener('click', function () {
            const n = Math.max(1, parseInt(document.getElementById('daysToDisplay').value, 10) || 1);
            moveDisplayWindowByDays(n);
        });
    }

    document.addEventListener('keydown', function (evt) {
        const tagName = evt.target && evt.target.tagName ? evt.target.tagName.toLowerCase() : '';
        const isTypingTarget = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || (evt.target && evt.target.isContentEditable);

        if (evt.key === 'Escape') {
            const optimizationDialog = document.getElementById('optimizationDialog');
            if (optimizationDialog && !optimizationDialog.classList.contains('hidden')) {
                setOptimizationDialogOpen(false);
            }
            return;
        }

        if (isTypingTarget || !egvData || egvData.length === 0) {
            return;
        }

        if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight') {
            const step = evt.shiftKey
                ? Math.max(1, parseInt(document.getElementById('daysToDisplay').value, 10) || 1)
                : 1;
            moveDisplayWindowByDays(evt.key === 'ArrowLeft' ? -step : step);
            evt.preventDefault();
        }
    });

    if (insulinScaleModeSelect) {
        insulinScaleMode = insulinScaleModeSelect.value;
        if (insulinScaleMode === 'auto') {
            insulinScaleMode = 'auto_whole';
            insulinScaleModeSelect.value = 'auto_whole';
        }
    }
    csvFileInput.addEventListener('change', function (event) {
        const file = event.target.files[0];
        if (file) {
            handleFile(file);
        }
    });

    insulinFileInput.addEventListener('change', function (event) {
        const file = event.target.files[0];
        if (file) {
            handleFile(file, 'supplemental');
        }
    });

    const dropzone = document.getElementById('dropzone');
    // Make the dropzone clickable to trigger the file input
    dropzone.addEventListener("click", () => {
        csvFileInput.click();
    });

    document.getElementById('addInsulinFileBtn').addEventListener('click', function () {
        insulinFileInput.click();
    });
    // Disable Add Insulin File until a CGM file is loaded
    setButtonDisabledState(document.getElementById('addInsulinFileBtn'), true);
    // Load the bundled example CSV from examples/example_cgm.csv
    const loadExampleBtn = document.getElementById('loadExampleCSV');
    if (loadExampleBtn) {
        loadExampleBtn.addEventListener('click', async function () {
            try {
                const resp = await fetch('examples/example_cgm.csv');
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const text = await resp.text();
                const blob = new Blob([text], { type: 'text/csv' });
                const file = new File([blob], 'example_cgm.csv', { type: 'text/csv' });
                handleFile(file);
            } catch (err) {
                alert('Unable to load example file: ' + err.message);
            }
        });
    }
    //console.log("adding event listeners for drag and drop");

    dropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', function (e) {
        dropzone.classList.remove('dragover');

    });

    dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.classList.remove('dragover'); // Optional: Remove visual feedback
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFile(file);
        }
    });

    // Add button event listeners
    document.getElementById('customUploadButton').addEventListener('click', function () {
        document.getElementById('uploadSelectedPoints').click();
    });

    const loadPreviousDetectionsBtn = document.getElementById('loadPreviousDetectionsBtn');
    if (loadPreviousDetectionsBtn) {
        loadPreviousDetectionsBtn.addEventListener('click', function () {
            if (!gFileName) {
                alert('Load a CGM file before loading previous detections.');
                return;
            }

            const storedMeals = localStorage.getItem(`detectedMeals_${gFileName}`);
            const detectedMeals = storedMeals ? JSON.parse(storedMeals) : [];

            if (!detectedMeals.length) {
                alert('No previously saved detected meals were found for this file.');
                return;
            }

            showStoredDetectedMeals = true;
            updatePointColors();
        });
    }

    document.getElementById('uploadSelectedPoints').addEventListener('change', function (event) {
        const file = event.target.files[0];
        if (!file) {
            alert('No file selected.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const csvContent = e.target.result;
            // Parse CSV content - assume each line contains a timestamp
            const pointsFromCSV = csvContent.split('\n').map(line => {
                line = line.trim().replace(/^"|"$/g, ''); // Remove leading/trailing quotes
                if (!line) return null;

                // Try to parse the line into a Date object
                const date = new Date(line);
                if (isNaN(date)) {
                    // Handle invalid date
                    console.warn(`Invalid date format: ${line}`);
                    return null;
                }

                // Format the date into the expected format
                const formattedDate = formatDateWithOffset(date);
                return formattedDate;
            }).filter(line => line);

            if (pointsFromCSV.length === 0) {
                alert('The file is empty or contains invalid dates.');
                return;
            }

            // Remove duplicates by converting to a Set and back to an array
            const uniquePoints = Array.from(new Set(pointsFromCSV));

            // Update selectedPoints with the loaded unique points
            selectedPoints = uniquePoints;

            // Save the selected points to local storage based on the current file name
            if (gFileName) {
                localStorage.setItem(`selectedPoints_${gFileName}`, JSON.stringify(selectedPoints));
            }

            // Update the chart colors based on the newly loaded points
            updatePointColors();
            syncOptimizationObjectiveDefault();

            //alert('Selected points loaded from CSV.');
        };

        reader.readAsText(file);
    });

    // Helper function to format date with timezone offset
    function formatDateWithOffset(date) {
        const pad = (num) => String(num).padStart(2, '0');

        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1); // months are zero-indexed
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());

        // Timezone offset in minutes
        const offsetMinutes = -date.getTimezoneOffset();
        const offsetSign = offsetMinutes >= 0 ? '+' : '-';
        const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
        const offsetMins = pad(Math.abs(offsetMinutes) % 60);

        const offset = `${offsetSign}${offsetHours}:${offsetMins}`;

        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
    }



    // initialize the picker
    picker = new Pikaday({
        field: document.getElementById('datepicker'),
        bound: false,
        firstDay: 1,
        minDate: new Date(2010, 1, 1),
        // maxDate should be the literal today at the time the script is run
        maxDate: new Date(), // new Date() gives the current date
        //maxDate: new Date(2024, 12, 31),
        //yearRange: [2010,2025],
        onSelect: function (date) {
            // Update the chart based on the selected date
            updateChartBasedOnSelection(date);
        },
        onDraw: function () {
            var dates = document.querySelectorAll('.pika-button');
            dates.forEach(function (btn) {
                var year = btn.getAttribute('data-pika-year');
                var month = btn.getAttribute('data-pika-month');
                var day = btn.getAttribute('data-pika-day');
                var fullDate = formatDate(moment([year, month, day]).toDate());

                // Apply custom styling based on dataCompleteness for the date
                if (dataCompleteness[fullDate] && dataCompleteness[fullDate].missing <= 0) {
                    btn.style.backgroundColor = '#00ff00'; // No missing data
                } else if (dataCompleteness[fullDate] && dataCompleteness[fullDate].missing / dataCompleteness[fullDate].total <= 0.2) {
                    btn.style.backgroundColor = '#ffff00'; // less than 20% missing data
                } else if (dataCompleteness[fullDate] && dataCompleteness[fullDate].missing < dataCompleteness[fullDate].total) {
                    btn.style.backgroundColor = '#ff0000'; // More than 20% missing data, but not all missing
                }
            });
        }
    });
    picker.show();

    // Initialize the chart
    var ctx = document.getElementById('glucoseChart').getContext('2d');
    glucoseChart = new Chart(ctx, {
        type: 'line', // Scatter chart to plot individual glucose readings
        data: {
            datasets: [{
                label: 'Glucose Level',
                data: [], // Start with no data
                backgroundColor: 'rgba(0, 0, 0, 1)',
                yAxisID: 'y'
            },
            {
                label: 'Missing Data',
                data: [], // Start with no data
                backgroundColor: 'rgba(255, 0, 0, 1)',
                yAxisID: 'y'
            },
            {
                label: 'Insulin Dose (U)',
                data: [],
                type: 'scatter',
                backgroundColor: 'rgba(0, 102, 204, 0.95)',
                borderColor: 'rgba(0, 102, 204, 0.95)',
                borderWidth: 1,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointStyle: 'rectRot',
                yAxisID: 'yInsulin',
                showLine: false
            },
            {
                label: 'Meal Announcements',
                data: [],
                type: 'scatter',
                backgroundColor: 'rgba(255, 140, 0, 0.95)',
                borderColor: 'rgba(255, 140, 0, 0.95)',
                borderWidth: 1,
                pointRadius: 8,
                pointHoverRadius: 10,
                pointStyle: 'triangle',
                yAxisID: 'y',
                showLine: false
            },
            {
                label: 'Pump Events',
                data: [],
                type: 'scatter',
                backgroundColor: 'rgba(106, 90, 205, 0.95)',
                borderColor: 'rgba(106, 90, 205, 0.95)',
                borderWidth: 1,
                pointRadius: 8,
                pointHoverRadius: 10,
                pointStyle: 'rect',
                yAxisID: 'y',
                showLine: false
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            showLine: false,
            animation: {
                duration: 0
            },
            scales: {
                x: {
                    type: 'time',
                    ticks: { // major ticks at 00:00:00 of each day, minor ticks every 4 hours
                        source: 'data',
                        major: {
                            enabled: true,
                            unit: 'day',
                            displayFormats: {
                                day: 'YYYY-MM-DD'
                            }
                        },
                        minor: {
                            enabled: true,
                            unit: 'hour',
                            stepSize: 4,
                            displayFormats: {
                                hour: 'HH:mm'
                            }
                        }
                    },
                    grid: { // vertical grid lines at 00:00:00 of each day
                        display: true,
                        drawOnChartArea: true,
                        drawBorder: false,
                        tickLength: 0,
                        color: function (context) {
                            if (context.tick && context.tick.major) {
                                return '#666'; // Color for the first tick of each day
                            }
                            return '#E0E0E0'; // Default grid line color
                        }
                    },
                    display: true, // Show x-axis
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    min: 40,
                    max: 400,
                    ticks: {
                        stepSize: 50
                    },
                    title: {
                        display: true,
                        text: 'Glucose Value (mg/dL)'
                    }
                },
                yInsulin: {
                    position: 'right',
                    min: 0,
                    max: insulinDisplayCapUnits,
                    title: {
                        display: true,
                        text: 'Insulin Dose (U)'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            if (context.dataset && context.dataset.yAxisID === 'yInsulin') {
                                const rawDose = context.raw && Number.isFinite(context.raw.rawDose)
                                    ? context.raw.rawDose
                                    : context.parsed.y;
                                const cappedText = rawDose > insulinDisplayCapUnits ? ' (display capped)' : '';
                                return `Insulin Dose: ${rawDose.toFixed(3)} U${cappedText}`;
                            }

                            if (context.dataset && context.dataset.label === 'Meal Announcements') {
                                return context.raw && context.raw.markerTooltip
                                    ? context.raw.markerTooltip
                                    : 'Meal Announcement';
                            }

                            if (context.dataset && context.dataset.label === 'Pump Events') {
                                return context.raw && context.raw.markerTooltip
                                    ? context.raw.markerTooltip
                                    : 'Pump Event';
                            }

                            if (context.parsed && Number.isFinite(context.parsed.y)) {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}`;
                            }
                            return `${context.dataset.label}: ${context.formattedValue}`;
                        }
                    }
                }
            },
            // Modify the onClick handler for selecting points
            onClick: function (event, activeElements) {
                if (suppressNextPointClick) {
                    suppressNextPointClick = false;
                    return;
                }

                const isShiftClick = !!(event && event.native && event.native.shiftKey);

                if (isShiftClick) {
                    if (activeElements.length === 0) {
                        return;
                    }

                    const datasetIndex = activeElements[0].datasetIndex;
                    if (datasetIndex !== 0) {
                        return;
                    }

                    const index = activeElements[0].index;
                    const clickedPoint = glucoseChart.data.datasets[datasetIndex].data[index];
                    selectedPoints.push(clickedPoint.x);

                    if (gFileName) {
                        localStorage.setItem(`selectedPoints_${gFileName}`, JSON.stringify(selectedPoints));
                    }

                    syncOptimizationObjectiveDefault();
                    updatePointColors();
                    return;
                }

                const strictPointHits = glucoseChart.getElementsAtEventForMode(
                    event,
                    'nearest',
                    { intersect: true },
                    false
                );

                if ((!strictPointHits || strictPointHits.length === 0) && activeRangeSelection) {
                    clearActiveRangeSelection();
                    return;
                }

                if (activeElements.length === 0) {
                    if (activeRangeSelection) {
                        clearActiveRangeSelection();
                    }
                    return;
                }
            }

        }
    });

    const chartCanvas = glucoseChart.canvas;
    if (chartCanvas) {
        chartCanvas.addEventListener('pointerdown', function (evt) {
            if (evt.shiftKey || evt.button !== 0) {
                return;
            }

            const startMs = getTimestampFromChartEvent(evt);
            if (!Number.isFinite(startMs)) {
                return;
            }

            dragRangeState = { isDragging: true, startMs, currentMs: startMs };
            chartCanvas.setPointerCapture(evt.pointerId);
            updatePointColors();
            evt.preventDefault();
        });

        chartCanvas.addEventListener('pointermove', function (evt) {
            if (!dragRangeState.isDragging) {
                return;
            }

            const currentMs = getTimestampFromChartEvent(evt);
            if (!Number.isFinite(currentMs)) {
                return;
            }

            dragRangeState.currentMs = currentMs;
            updatePointColors();
        });

        chartCanvas.addEventListener('pointerup', function (evt) {
            if (!dragRangeState.isDragging) {
                return;
            }

            const endMs = getTimestampFromChartEvent(evt);
            const fallbackEnd = Number.isFinite(endMs) ? endMs : dragRangeState.currentMs;
            const bounds = getRangeBoundsMs({ startMs: dragRangeState.startMs, endMs: fallbackEnd });

            dragRangeState = { isDragging: false, startMs: null, currentMs: null };

            if (bounds) {
                const durationMs = Math.abs(bounds.endMs - bounds.startMs);
                if (durationMs >= 5 * 60 * 1000) {
                    activeRangeSelection = bounds;
                    applyRangeStatsFromBounds(bounds);
                }
            }

            suppressNextPointClick = true;
            updatePointColors();
        });

        chartCanvas.addEventListener('pointercancel', function () {
            if (!dragRangeState.isDragging) {
                return;
            }
            dragRangeState = { isDragging: false, startMs: null, currentMs: null };
            updatePointColors();
        });

        chartCanvas.addEventListener('dblclick', function (evt) {
            const clickedMs = getTimestampFromChartEvent(evt);
            const mealMs = findNearestMealTimestampMs(clickedMs, 10 * 60 * 1000);
            if (!Number.isFinite(mealMs)) {
                return;
            }

            const mealWindow = {
                startMs: mealMs - (30 * 60 * 1000),
                endMs: mealMs + (120 * 60 * 1000)
            };

            activeRangeSelection = getRangeBoundsMs(mealWindow);
            applyRangeStatsFromBounds(activeRangeSelection);
            suppressNextPointClick = true;
            updatePointColors();
            evt.preventDefault();
        });
    }

    // end chart initialization

    // more buttons and event listeners
    document.getElementById('downloadSelectedPoints').addEventListener('click', function () {
        if (selectedPoints.length === 0) {
            alert('No points selected to download.');
            return;
        }

        // Extract the base filename (without the extension) from the currently loaded file
        const baseFileName = gFileName ? gFileName.replace(/\.[^/.]+$/, "") : "data";

        // Generate the filename for the CSV download
        const downloadFileName = `selected_points_${baseFileName}.csv`;

        // Convert the selected points (timestamps) to a CSV format
        const csvContent = selectedPoints.join('\n');

        // Create a Blob from the CSV string
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        // Create a temporary link element
        const a = document.createElement('a');
        a.href = url;
        a.setAttribute('download', downloadFileName);
        document.body.appendChild(a);

        // Trigger the download by programmatically clicking the link
        a.click();

        // Clean up by removing the temporary link element
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    document.getElementById('clearSelectedPoints').addEventListener('click', function () {
        if (selectedPoints.length === 0) {
            alert('No points to clear.');
            return;
        }

        // Clear the selectedPoints array
        selectedPoints = [];

        // Update the local storage for the current file
        if (gFileName) {
            localStorage.removeItem(`selectedPoints_${gFileName}`);
        }

        // Reset the point colors on the chart
        updatePointColors();
        syncOptimizationObjectiveDefault();

        //alert('Selected points cleared.');
    });

    const clearRangeSelectionBtn = document.getElementById('clearRangeSelectionBtn');
    if (clearRangeSelectionBtn) {
        clearRangeSelectionBtn.addEventListener('click', function () {
            clearActiveRangeSelection();
        });
    }

    // Implement clear detected meals button
    document.getElementById('clearDetected').addEventListener('click', function () {
        // if in meal detection mode, clear the detected meals
        const detectionMode = document.getElementById('detectionMode').value;

        if (detectionMode === 'meal' || detectionMode === 'summary') {
            // Clear detected meals from local storage
            localStorage.removeItem(`detectedMeals_${gFileName}`);
            showStoredDetectedMeals = false;
        } else if (detectionMode === 'implausible') {
            // Clear implausible data from local storage
            localStorage.removeItem(`implausibleData_${gFileName}`);
        } else if (detectionMode === 'hypo') {
            // Clear hypoglycemia data from local storage
            localStorage.removeItem(`hypoglycemiaData_${gFileName}`);
        } else {
            // error
            alert('Invalid detection mode selected.');
        }

        // Update the point colors on the chart
        updatePointColors();
    });

    // Implement saveDetectedMeals button
    document.getElementById('saveDetectedMeals').addEventListener('click', function () {
        // load detected meals from local storage
        const storedMeals = localStorage.getItem(`detectedMeals_${gFileName}`);
        const detectedMeals = storedMeals ? JSON.parse(storedMeals) : [];

        if (detectedMeals.length === 0) {
            alert('No detected meals to save.');
            return;
        }

        // Extract the base filename (without the extension) from the currently loaded file
        const baseFileName = gFileName ? gFileName.replace(/\.[^/.]+$/, "") : "data";

        // Generate the filename for the CSV download
        const downloadFileName = `detected_meals_${baseFileName}.csv`;

        // Convert the detected meals (timestamps) to a CSV format
        const csvContent = detectedMeals.join('\n');

        // Create a Blob from the CSV string
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        // Create a temporary link element
        const a = document.createElement('a');
        a.href = url;
        a.setAttribute('download', downloadFileName);
        document.body.appendChild(a);

        // Trigger the download by programmatically clicking the link
        a.click();

        // Clean up by removing the temporary link element
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });



    // call findExcursions with the egvData when the runDetectionBtn button is clicked
    document.getElementById('runDetectionBtn').addEventListener('click', function () {
        // Get the button element
        const searchButton = document.getElementById('runDetectionBtn');
        saveDetectedMeals = document.getElementById('saveDetectedMeals');

        // Disable the button and change its appearance
        setButtonDisabledState(searchButton, true);

        // also disable the saveDetectedMeals button
        setButtonDisabledState(saveDetectedMeals, true);

        const mode = document.getElementById('detectionMode').value;
        console.log('Detection Mode:', mode);

        if (mode === 'meal') {
            runMealDetection();
        } else if (mode === 'hypo') {
            runHypoglycemiaDetection();
        } else if (mode === 'implausible') {
            runImplausibleDataDetection();
        } else {
            // error
            alert('Invalid detection mode selected.');
        }
    });

    // Add an event listener to the button to plot the graph when clicked
    document.getElementById('btnOptimizationGraphs').addEventListener('click', async function () {
        // Get the button element
        const optimizationGraphButton = document.getElementById('btnOptimizationGraphs');

        // Disable the optimization graph button to prevent multiple clicks while processing
        setButtonDisabledState(optimizationGraphButton, true);

        await plotGraph('triggerRate', 'triggerRateGraph', 'Trigger Rate (mg/dL/min)', 0, 2, 0.2);
        await plotGraph('mustIncrease', 'mustIncreaseGraph', 'Must Increase', 10, 100, 10);
        await plotGraph('mealBlockoutMinutes', 'mealBlockoutMinutesGraph', 'Meal Blockout Minutes', 30, 240, 30);
        await plotGraph('numConsecutiveIncrease', 'numConsecutiveIncreaseGraph', 'Num Consecutive Increase', 1, 10, 1);

        // Re-enable the button and reset its appearance
        setButtonDisabledState(optimizationGraphButton, false);

    });

    document.getElementById('btnOptimizeParams').addEventListener('click', async function () {
        const optimizeButton = document.getElementById('btnOptimizeParams');
        const optimizationSummary = document.getElementById('optimizationSummary');
        const optimizationProgressContainer = document.getElementById('optimizationProgressContainer');
        const optimizationProgress = document.getElementById('optimizationProgress');
        const optimizationProgressText = document.getElementById('optimizationProgressText');

        setButtonDisabledState(optimizeButton, true);

        if (optimizationSummary) {
            optimizationSummary.textContent = 'Starting optimization...';
        }
        if (optimizationProgressContainer) {
            optimizationProgressContainer.classList.remove('hidden');
        }
        if (optimizationProgress) {
            optimizationProgress.value = 0;
        }
        if (optimizationProgressText) {
            optimizationProgressText.textContent = '0% (0/0)';
        }

        try {
            const optimizationResult = await optimizeMealParamsCurrentData();

            if (optimizationResult) {
                if (optimizationSummary) {
                    optimizationSummary.innerHTML += '<br>Auto-running Detect with optimized params...';
                }

                const detectionModeSelect = document.getElementById('detectionMode');
                if (detectionModeSelect && detectionModeSelect.value !== 'meal') {
                    detectionModeSelect.value = 'meal';
                    detectionModeSelect.dispatchEvent(new Event('change'));
                }

                const detectButton = document.getElementById('runDetectionBtn');
                if (detectButton && !detectButton.disabled) {
                    detectButton.click();
                } else if (optimizationSummary) {
                    optimizationSummary.innerHTML += '<br>Auto-detect skipped because Detect is currently disabled.';
                }
            }
        } catch (error) {
            console.error('Parameter optimization failed:', error);
            if (optimizationSummary) {
                optimizationSummary.textContent = 'Optimization failed. See console for details.';
            }
            if (optimizationProgressText) {
                optimizationProgressText.textContent = 'Failed';
            }
            alert('An error occurred during meal parameter optimization.');
        } finally {
            setButtonDisabledState(optimizeButton, false);
        }
    });

    // Event listener to update the chart when daysToDisplay changes
    document.getElementById('daysToDisplay').addEventListener('change', function () {
        const daysToDisplay = parseInt(this.value, 10);

        // Get the currently selected date from the date picker
        const selectedDate = picker.getDate();

        // Update the chart based on the selected date and days to display
        if (selectedDate) {
            updateChartBasedOnSelection(selectedDate, daysToDisplay);
        }

        updateInsulinSummaryDisplay();
    });

    document.getElementById('dataProcessingMode').addEventListener('change', function () {
        updateInsulinSummaryDisplay();
        applyRangeStatsFromBounds(activeRangeSelection);
        renderTirSection();
    });

    const tirOverlayCheckbox = document.getElementById('showTirOverlay');
    if (tirOverlayCheckbox) {
        tirOverlayCheckbox.addEventListener('change', function () {
            renderTirSection();
        });
    }

    const optimizationObjective = document.getElementById('optimizationObjective');
    if (optimizationObjective) {
        optimizationObjective.addEventListener('change', function () {
            const targetMealsInput = document.getElementById('targetMealsPerDay');
            const targetMealsLabel = document.getElementById('targetMealsPerDayLabel');
            const showTarget = this.value === 'target';
            if (targetMealsInput) {
                targetMealsInput.classList.toggle('hidden', !showTarget);
            }
            if (targetMealsLabel) {
                targetMealsLabel.classList.toggle('hidden', !showTarget);
            }
        });
    }

    if (insulinScaleModeSelect) {
        insulinScaleModeSelect.addEventListener('change', function () {
            insulinScaleMode = this.value;
            if (insulinScaleMode === 'auto') {
                insulinScaleMode = 'auto_whole';
                this.value = 'auto_whole';
            }
            const selectedDate = picker && picker.getDate() ? picker.getDate() : null;
            if (selectedDate) {
                updateChartBasedOnSelection(selectedDate);
            }
        });
    }

    // show/hide parameter controls based on the detectionMode
    function applyDetectionModeUi() {
        const detectionModeSelect = document.getElementById('detectionMode');
        const mode = detectionModeSelect ? detectionModeSelect.value : 'summary';
        const mealParams = document.getElementById('parameter-controls');
        const hypoParams = document.getElementById('hypo-parameter-controls');
        const implausibleParams = document.getElementById('implausible-parameter-controls');
        const mealMatchingInfo = document.getElementById('meal-matching-info');

        if (mealParams === null || hypoParams === null || implausibleParams === null) {
            console.log('At least one of the parameter controls is missing.');
            if (mealParams === null) {
                console.log('mealParams is missing.');
            } else if (hypoParams === null) {
                console.log('hypoParams is missing.');
            } else if (implausibleParams === null) {
                console.log('implausibleParams is missing.');
            }

            return;
        }
        // Hide all by default
        mealParams.classList.add('hidden');
        hypoParams.classList.add('hidden');
        implausibleParams.classList.add('hidden');
        if (mealMatchingInfo) {
            mealMatchingInfo.classList.add('hidden');
        }

        if (mode === 'meal') {
            mealParams.classList.remove('hidden');
            if (mealMatchingInfo) {
                mealMatchingInfo.classList.remove('hidden');
            }
        } else if (mode === 'hypo') {
            hypoParams.classList.remove('hidden');
        } else if (mode === 'implausible') {
            implausibleParams.classList.remove('hidden');
        } else if (mode === 'summary') {
            // Summary mode intentionally hides all detector-specific parameter cards.
        }

        syncDetectButtonAvailability();
    }

    document.getElementById('detectionMode').addEventListener('change', applyDetectionModeUi);
    applyDetectionModeUi();


    // Detection worker functions
    function runMealDetection() {
        // We are going to create a worker, send it a message to get it started, 
        // and then create a listener to handle the response
        // Get the button elements for later
        const searchButton = document.getElementById('runDetectionBtn');
        const saveDetectedMeals = document.getElementById('saveDetectedMeals');

        // Get parameter values from the inputs
        const triggerRateMgdlPerMin = parseFloat(document.getElementById('triggerRate').value);
        const mustIncrease = parseInt(document.getElementById('mustIncrease').value, 10);
        const mealBlockoutMinutes = parseInt(document.getElementById('mealBlockoutMinutes').value, 10);
        const numConsecutiveIncrease = parseInt(document.getElementById('numConsecutiveIncrease').value, 10);

        // Initialize the Web Worker
        const worker = new Worker('./findExcursionsWorker.js');
        const egvRawDataToProcess = getDataToProcess(); // Get the data to process

        // See if there are implausibleData in local storage (stored as timestamps)
        const storedImplausibleData = localStorage.getItem(`implausibleData_${gFileName}`);
        const implausibleData = storedImplausibleData ? JSON.parse(storedImplausibleData) : [];

        // Replace GlucoseValue with NaN for implausible points
        const egvDataToProcess = egvRawDataToProcess.map(point => {
            if (implausibleData.includes(point.Timestamp)) {
                return { ...point, GlucoseValue: NaN };
            }
            return point;
        });

        console.log('Web worker Data to process:', egvDataToProcess, 'dataProcessingMode:', document.getElementById('dataProcessingMode').value);
        // Send data to the worker
        worker.postMessage({
            egvData: egvDataToProcess,
            triggerRate: triggerRateMgdlPerMin,
            mustIncrease: mustIncrease,
            mealBlockoutMinutes: mealBlockoutMinutes,
            numConsecutiveIncrease: numConsecutiveIncrease
        });
        console.log('Message sent to worker:', {
            egvData: egvDataToProcess,
            triggerRate: triggerRateMgdlPerMin,
            mustIncrease: mustIncrease,
            mealBlockoutMinutes: mealBlockoutMinutes,
            numConsecutiveIncrease: numConsecutiveIncrease
        });


        // Handle the result from the worker
        worker.addEventListener('message', function (e) {
            const detectedMeals = e.data;
            console.log(detectedMeals);

            // Re-enable the button and reset its appearance
            setButtonDisabledState(searchButton, false);
            console.log('Search button re-enabled.');

            // Enable the saveDetectedMeals button
            setButtonDisabledState(saveDetectedMeals, false);

            console.log(`Found ${detectedMeals.length} meal excursions.`);
            // Store the meal excursions in local storage (just the timestamps)
            // Make sure we just store the timestamps
            const mealTimestamps = detectedMeals.map(excursion => excursion.Timestamp);
            localStorage.setItem(`detectedMeals_${gFileName}`, JSON.stringify(mealTimestamps));
            showStoredDetectedMeals = true;

            updatePointColors();

            // test function that finds the nearest matches between gold standard and detected meals
            // and returns the matches and false positives
            const goldStandardMeals = getSelectedMealsToProcess();
            const { matches, falsePositives } = findNearestMatchesOptimized(goldStandardMeals, mealTimestamps);
            console.log('Matches:', matches);
            console.log('False Positives:', falsePositives);
            // test function that calculates the meal detection score based on the matches
            const score = calculateMealDetectionScore(goldStandardMeals, mealTimestamps);
            // update the global variables with the detected meal information
            gTruePositiveCount = score.matches;
            gFalsePositiveCount = score.falsePositives;
            gMissedMeals = score.missedMeals;
            gGoldStandardMealCount = goldStandardMeals.length;
            console.log('Score:', score.score, 'Matches:', score.matches, 'False Positives:', score.falsePositives, 'Missed Meals:', score.missedMeals);
            // update meal matching info based on global variables
            document.getElementById('truePositives').innerHTML = gTruePositiveCount;
            document.getElementById('truePositivesPercent').innerHTML = gGoldStandardMealCount > 0 ? ((gTruePositiveCount / gGoldStandardMealCount) * 100).toFixed(2) : 0;
            document.getElementById('falsePositives').innerHTML = gFalsePositiveCount;
            document.getElementById('falsePositivesPercent').innerHTML = gFalsePositiveCount > 0 ? ((gFalsePositiveCount / gGoldStandardMealCount) * 100).toFixed(2) : 0;
            document.getElementById('missedMeals').innerHTML = gMissedMeals;
            document.getElementById('missedMealsPercent').innerHTML = gGoldStandardMealCount > 0 ? ((gMissedMeals / gGoldStandardMealCount) * 100).toFixed(2) : 0;



            // Terminate the worker after completion
            worker.terminate();
        });

        // Handle any errors from the worker
        worker.addEventListener('error', function (e) {
            console.error("Worker error:", e);

            // Re-enable the button and reset its appearance
            setButtonDisabledState(searchButton, false);

            alert('An error occurred during processing findExcursions.');

            // Terminate the worker in case of error
            worker.terminate();
        });
    }

    function runImplausibleDataDetection() {
        // --- 1) Get the button elements ---
        const searchButton = document.getElementById('runDetectionBtn');
        //const saveDetectedMeals = document.getElementById('saveDetectedMeals');

        // --- 2) Get parameter values from the inputs ---
        const implausibleLowThreshold = parseInt(document.getElementById('implausibleLowThreshold').value, 10) || 50;
        const implausibleEndThreshold = parseInt(document.getElementById('implausibleEndThreshold').value, 10) || 80;
        const implausibleHighThreshold = parseInt(document.getElementById('implausibleHighThreshold').value, 10) || 80;
        const implausibleMinConsecutive = parseInt(document.getElementById('implausibleMinConsecutive').value, 10) || 3;
        const implausibleFlankingPoints = parseInt(document.getElementById('implausibleFlankingPoints').value, 10) || 2;

        // --- 3) Initialize the Web Worker ---
        const worker = new Worker('./findImplausibleWorker.js');

        // getDataToProcess() retrieves current CGM data (similar to your meal detection flow).
        const cgmDataToProcess = getDataToProcess();
        console.log('Implausible Data Worker - data to process:', cgmDataToProcess);

        // --- 4) Send data to the worker ---
        worker.postMessage({
            cgmData: cgmDataToProcess,
            implausibleLowThreshold,
            implausibleEndThreshold,
            implausibleHighThreshold,
            implausibleMinConsecutive,
            implausibleFlankingPoints
        });
        console.log('Message sent to findImplausibleDataWorker:', {
            cgmData: cgmDataToProcess,
            implausibleLowThreshold,
            implausibleEndThreshold,
            implausibleHighThreshold,
            implausibleMinConsecutive,
            implausibleFlankingPoints
        });


        // Optionally, disable the button while processing
        setButtonDisabledState(searchButton, true, true);

        // --- 5) Handle the result from the worker ---
        worker.addEventListener('message', function (e) {
            const implausibleRuns = e.data;
            console.log('Implausible Runs found:', implausibleRuns);

            // Re-enable the button and reset its appearance
            setButtonDisabledState(searchButton, false);

            // Enable the 'saveImplausibleRuns' button
            // saveImplausibleRunsBtn.disabled = false;
            // saveImplausibleRunsBtn.style.backgroundColor = '';
            // saveImplausibleRunsBtn.style.cursor = '';
            // saveImplausibleRunsBtn.style.color = '';

            console.log(`Found ${implausibleRuns.length} implausible run(s).`);

            // --- 6) Store the implausible runs in local storage ---
            // For simplicity, store them all. Adjust as needed.
            // After worker returns implausibleRuns
            const detectedImplausiblePoints = extractImplausibleDataPoints(implausibleRuns);
            localStorage.setItem(`implausibleData_${gFileName}`, JSON.stringify(detectedImplausiblePoints));

            // --- 7) Optionally update the chart/graph here ---
            // (You might mark these runs on the graph or highlight them.)
            // This is your custom function. Could be updatePointColors(), updateGraph(), etc.
            updatePointColors();

            // Terminate the worker after completion
            worker.terminate();
        });

        // --- 8) Handle any errors from the worker ---
        worker.addEventListener('error', function (e) {
            console.error("Implausible Data Worker error:", e);

            // Re-enable the button
            setButtonDisabledState(searchButton, false);

            alert('An error occurred during implausible data detection.');

            // Terminate the worker in case of error
            worker.terminate();
        });
    } // end runImplausibleDataDetection

    function runHypoglycemiaDetection() {
        // --- 1) Get the button element for hypoglycemia detection ---
        const searchButton = document.getElementById('runDetectionBtn');

        // --- 2) Get parameter values from the hypo inputs ---
        const hypoLowThreshold = parseInt(document.getElementById('hypoLowThreshold').value, 10) || 54;
        const hypoHighThreshold = parseInt(document.getElementById('hypoHighThreshold').value, 10) || 70;
        const hypoMinGapPoints = parseInt(document.getElementById('hypoMinGapPoints').value, 10) || 3;

        // --- 3) Initialize the Hypoglycemia Web Worker ---
        const worker = new Worker('./findHypoglycemiaWorker.js');

        // getDataToProcess() retrieves current CGM data (like your meal detection flow).
        const cgmDataToProcess = getDataToProcess();
        console.log('Hypoglycemia Worker - data to process:', cgmDataToProcess);

        // --- 4) Send data to the worker ---
        worker.postMessage({
            cgmData: cgmDataToProcess,
            hypoLowThreshold,
            hypoHighThreshold,
            hypoMinGapPoints
        });
        console.log('Message sent to findHypoglycemiaWorker:', {
            cgmData: cgmDataToProcess,
            hypoLowThreshold,
            hypoHighThreshold,
            hypoMinGapPoints
        });

        // Optionally, disable the button while processing
        setButtonDisabledState(searchButton, true, true);

        // --- 5) Handle the result from the worker ---
        worker.addEventListener('message', function (e) {
            const hypoglycemicEvents = e.data;
            console.log('Hypoglycemic Events found:', hypoglycemicEvents);

            // Re-enable the button and reset its appearance
            setButtonDisabledState(searchButton, false);

            console.log(`Found ${hypoglycemicEvents.length} hypoglycemic event(s).`);

            // --- 6) Store the hypoglycemic events in local storage ---
            const detectedHypoglycemiaPoints = extractHypoglycemiaDataPoints(hypoglycemicEvents);
            localStorage.setItem(`hypoglycemiaData_${gFileName}`, JSON.stringify(detectedHypoglycemiaPoints));

            // --- 7) update the chart/graph here ---
            updatePointColors();

            // Terminate the worker after completion
            worker.terminate();
        });

        // --- 8) Handle any errors from the worker ---
        worker.addEventListener('error', function (e) {
            console.error("Hypoglycemia Worker error:", e);

            // Re-enable the button
            setButtonDisabledState(searchButton, false);

            alert('An error occurred during hypoglycemia detection.');

            // Terminate the worker in case of error
            worker.terminate();
        });
    } // end runHypoglycemiaDetection


    function extractImplausibleDataPoints(implausibleRuns) {
        // Each run has a dataPoints array. Collect all timestamps from those arrays.
        const allTimestamps = [];
        implausibleRuns.forEach(run => {
            run.dataPoints.forEach(dp => {
                allTimestamps.push(dp.Timestamp);
            });
        });
        return allTimestamps;
    }

    // same as above but for hypoglycemia
    function extractHypoglycemiaDataPoints(hypoglycemicEvents) {
        // Each event has a dataPoints array. Collect all timestamps from those arrays.
        const allTimestamps = [];
        hypoglycemicEvents.forEach(event => {
            event.dataPoints.forEach(dp => {
                allTimestamps.push(dp.Timestamp);
            });
        });
        return allTimestamps;
    }

    // Initialize detect availability based on current mode/data/visibility.
    syncDetectButtonAvailability();

    // Keep saveDetectedMeals visually disabled until a detection run enables it.
    setButtonDisabledState(document.getElementById('saveDetectedMeals'), true);

    updateInsulinSummaryDisplay();
    renderTirSection();


});

// Calculate average meal response (24 intervals over 2 hours)
function calculateAverageMealResponse(selectedMealTimestamps, egvData) {
    const numIntervals = 24; // 2 hours / 5 minutes
    const offsetSums = Array(numIntervals).fill(0);
    const offsetCounts = Array(numIntervals).fill(0);

    selectedMealTimestamps.forEach(mealTimestamp => {
        // Find the index where the meal occurred
        const mealIndex = egvData.findIndex(dp => dp.Timestamp === mealTimestamp);
        if (mealIndex !== -1) {
            for (let offset = 0; offset < numIntervals; offset++) {
                const dataPoint = egvData[mealIndex + offset];
                if (dataPoint && !isNaN(dataPoint.GlucoseValue)) {
                    offsetSums[offset] += dataPoint.GlucoseValue;
                    offsetCounts[offset]++;
                }
            }
        }
    });

    return offsetSums.map((sum, i) => (offsetCounts[i] > 0 ? sum / offsetCounts[i] : NaN));
}

// Show the average meal response in a modal popup with a Chart.js graph
function showMealResponseModal() {
    let modal = document.getElementById('mealResponseModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mealResponseModal';
        modal.style.position = 'fixed';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.innerHTML = `
            <div style="background: white; padding: 20px; position: relative; max-width: 700px; width: 90%;">
                <span id="closeMealResponse" style="position: absolute; top: 5px; right: 10px; cursor: pointer; font-size: 22px;">&times;</span>
                <div id="mealSourceToggle" style="margin-bottom: 10px;">
                    <label>
                        <input type="radio" name="mealSource" value="selected" checked> User Selected
                    </label>
                    <label style="margin-left: 10px;">
                        <input type="radio" name="mealSource" value="detected"> Detected
                    </label>
                </div>
                <canvas id="mealResponseChart" width="600" height="400"></canvas>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('closeMealResponse').addEventListener('click', function () {
            modal.style.display = 'none';
        });
    } else {
        modal.style.display = 'flex';
    }

    // Function to recalculate averages and update chart based on current toggle
    function updateMealResponseChart() {
        const mealSource = document.querySelector('input[name="mealSource"]:checked').value;
        let mealTimestamps;
        if (mealSource === 'selected') {
            // Use the global user-selected meals array
            mealTimestamps = selectedPoints;
        } else {
            // Use detected meals from local storage
            mealTimestamps = JSON.parse(localStorage.getItem(`detectedMeals_${gFileName}`)) || [];
        }

        if (mealTimestamps.length === 0 || egvData.length === 0) {
            alert('No meal detections or CGM data available.');
            return;
        }

        const averages = calculateAverageMealResponse(mealTimestamps, egvData);
        const ctx = document.getElementById('mealResponseChart').getContext('2d');

        // Destroy the previous chart if it exists
        if (window.mealResponseChart && typeof window.mealResponseChart.destroy === 'function') {
            window.mealResponseChart.destroy();
        }

        const labels = [];
        for (let i = 0; i < averages.length; i++) {
            labels.push(`${i * 5} min`);
        }

        window.mealResponseChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Average Meal Response',
                    data: averages,
                    borderColor: 'blue',
                    backgroundColor: 'rgba(0,0,255,0.1)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                scales: {
                    x: {
                        title: { display: true, text: 'Time After Meal' }
                    },
                    y: {
                        title: { display: true, text: 'Glucose Value (mg/dL)' }
                    }
                }
            }
        });
    }

    // Initially update the chart
    updateMealResponseChart();

    // Attach change listener to toggle controls to update the chart when switched
    const radios = document.querySelectorAll('input[name="mealSource"]');
    radios.forEach(radio => {
        radio.addEventListener('change', updateMealResponseChart);
    });
}

// Event listener for the "viewAverageMealResponse" button
document.getElementById('viewAverageMealResponse').addEventListener('click', function () {
    showMealResponseModal();
});

function getAnalysisRowsForCurrentContext() {
    if (!Array.isArray(egvData) || egvData.length === 0) {
        return [];
    }

    const selectionBounds = getRangeBoundsMs(activeRangeSelection);
    if (selectionBounds) {
        return egvData.filter(row => {
            const t = new Date(row.Timestamp).getTime();
            return Number.isFinite(t) && t >= selectionBounds.startMs && t <= selectionBounds.endMs;
        });
    }

    const dataProcessingModeSelect = document.getElementById('dataProcessingMode');
    const mode = dataProcessingModeSelect ? dataProcessingModeSelect.value : 'whole';
    return mode === 'visible' ? getVisibleData() : egvData;
}

function getAnalysisScopeLabel() {
    const selectionBounds = getRangeBoundsMs(activeRangeSelection);
    if (selectionBounds) {
        const start = moment(selectionBounds.startMs).format('YYYY-MM-DD HH:mm');
        const end = moment(selectionBounds.endMs).format('YYYY-MM-DD HH:mm');
        return `Selected Range (${start} -> ${end})`;
    }

    const dataProcessingModeSelect = document.getElementById('dataProcessingMode');
    const mode = dataProcessingModeSelect ? dataProcessingModeSelect.value : 'whole';
    return mode === 'visible' ? 'Visible Window' : 'Whole Dataset';
}

function buildInsulinRateScatterPoints(rows, insulinOffsetPoints = 0) {
    const orderedRows = (rows || [])
        .filter(row => row && row.Timestamp)
        .slice()
        .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

    const offset = Number.isFinite(insulinOffsetPoints) ? Math.floor(insulinOffsetPoints) : 0;
    const points = [];
    for (let i = 1; i < orderedRows.length; i++) {
        const prev = orderedRows[i - 1];
        const curr = orderedRows[i];
        const doseRow = orderedRows[i + offset];

        if (!doseRow) {
            continue;
        }

        const prevGlucose = Number(prev.GlucoseValue);
        const currGlucose = Number(curr.GlucoseValue);
        if (!Number.isFinite(prevGlucose) || !Number.isFinite(currGlucose)) {
            continue;
        }

        const prevMs = new Date(prev.Timestamp).getTime();
        const currMs = new Date(curr.Timestamp).getTime();
        const deltaMin = (currMs - prevMs) / 60000;
        if (!Number.isFinite(deltaMin) || deltaMin <= 0 || deltaMin > 60) {
            continue;
        }

        const insulinDose = Number.isFinite(Number(doseRow.InsulinValue)) ? Number(doseRow.InsulinValue) : 0;
        const rate = (currGlucose - prevGlucose) / deltaMin;

        points.push({
            x: rate,
            y: insulinDose,
            timestamp: curr.Timestamp,
            glucose: currGlucose,
            deltaMin
        });
    }

    return points;
}

function computeSimpleRegression(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return null;
    }

    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;

    let varX = 0;
    let varY = 0;
    let covXY = 0;
    points.forEach(p => {
        const dx = p.x - meanX;
        const dy = p.y - meanY;
        varX += dx * dx;
        varY += dy * dy;
        covXY += dx * dy;
    });

    if (varX <= 0) {
        return null;
    }

    const slope = covXY / varX;
    const intercept = meanY - (slope * meanX);
    const corr = (varX > 0 && varY > 0) ? (covXY / Math.sqrt(varX * varY)) : NaN;
    return { slope, intercept, corr };
}

function percentile(values, percentileValue) {
    if (!Array.isArray(values) || values.length === 0) {
        return NaN;
    }

    const sorted = values
        .filter(v => Number.isFinite(v))
        .slice()
        .sort((a, b) => a - b);

    if (sorted.length === 0) {
        return NaN;
    }

    if (sorted.length === 1) {
        return sorted[0];
    }

    const rank = (Math.max(0, Math.min(100, percentileValue)) / 100) * (sorted.length - 1);
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    const frac = rank - low;
    return sorted[low] + (sorted[high] - sorted[low]) * frac;
}

function filterInsulinRocOutliers(points, cutoffPercentile = 90) {
    const absRocValues = points.map(p => Math.abs(p.x)).filter(v => Number.isFinite(v));
    const insulinValues = points.map(p => p.y).filter(v => Number.isFinite(v));

    const rocAbsCutoff = percentile(absRocValues, cutoffPercentile);
    const insulinCutoff = percentile(insulinValues, cutoffPercentile);

    const filtered = points.filter(p => {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            return false;
        }
        if (Number.isFinite(rocAbsCutoff) && Math.abs(p.x) > rocAbsCutoff) {
            return false;
        }
        if (Number.isFinite(insulinCutoff) && p.y > insulinCutoff) {
            return false;
        }
        return true;
    });

    return {
        filtered,
        rocAbsCutoff,
        insulinCutoff
    };
}

function averageScatterPoints(points, windowSize) {
    const n = Number.isFinite(windowSize) ? Math.max(1, Math.floor(windowSize)) : 1;
    if (!Array.isArray(points) || points.length === 0 || n <= 1) {
        return Array.isArray(points) ? points.slice() : [];
    }

    const averaged = [];
    for (let i = n - 1; i < points.length; i++) {
        let sumX = 0;
        let sumY = 0;
        let validCount = 0;

        for (let j = i - n + 1; j <= i; j++) {
            const p = points[j];
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
                continue;
            }
            sumX += p.x;
            sumY += p.y;
            validCount++;
        }

        if (validCount > 0) {
            averaged.push({
                x: sumX / validCount,
                y: sumY / validCount,
                timestamp: points[i].timestamp
            });
        }
    }

    return averaged;
}

function computePairingFit(rows, insulinOffsetPoints, averagingWindow, cutoffPercentile) {
    const rawPoints = buildInsulinRateScatterPoints(rows, insulinOffsetPoints);
    if (!rawPoints || rawPoints.length < 2) {
        return null;
    }

    const averagedPoints = averageScatterPoints(rawPoints, averagingWindow);
    const outlierResult = filterInsulinRocOutliers(averagedPoints, cutoffPercentile);
    const filteredPoints = outlierResult.filtered;
    if (!filteredPoints || filteredPoints.length < 2) {
        return null;
    }

    const stats = computeSimpleRegression(filteredPoints);
    const rSquared = stats && Number.isFinite(stats.corr) ? (stats.corr * stats.corr) : NaN;
    if (!Number.isFinite(rSquared)) {
        return null;
    }

    return {
        rSquared,
        stats,
        rawPoints,
        averagedPoints,
        filteredPoints,
        outlierResult
    };
}

function showInsulinRateCorrelationModal() {
    const rows = getAnalysisRowsForCurrentContext();
    if (!rows.length) {
        alert('No data available for the current analysis scope.');
        return;
    }

    const points = buildInsulinRateScatterPoints(rows, 0);
    if (points.length < 2) {
        alert('Not enough valid glucose/insulin points to build Insulin vs ROC.');
        return;
    }

    let modal = document.getElementById('insulinRateModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'insulinRateModal';
        modal.style.position = 'fixed';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.innerHTML = `
            <div style="background: white; padding: 16px; position: relative; max-width: 820px; width: 92%; max-height: 92vh; overflow: auto; box-sizing: border-box;">
                <span id="closeInsulinRateModal" style="position: absolute; top: 5px; right: 10px; cursor: pointer; font-size: 22px;">&times;</span>
                <div id="insulinRateScopeLabel" style="margin-bottom: 6px; font-weight: 600;"></div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
                    <label for="insulinRateCutoffSelect" style="font-weight: 600;">Outlier Cutoff:</label>
                    <select id="insulinRateCutoffSelect">
                        <option value="90" selected>90th percentile</option>
                        <option value="95">95th percentile</option>
                        <option value="99">99th percentile</option>
                    </select>
                    <label for="insulinRateAverageSelect" style="font-weight: 600; margin-left: 8px;">Averaging:</label>
                    <select id="insulinRateAverageSelect">
                        <option value="1" selected>Raw (no averaging)</option>
                        <option value="5">5-point average</option>
                        <option value="10">10-point average</option>
                        <option value="15">15-point average</option>
                    </select>
                    <label for="insulinRateAlignmentSelect" style="font-weight: 600; margin-left: 8px;">Dose Pairing:</label>
                    <select id="insulinRateAlignmentSelect">
                        <option value="0" selected>Dose at i (current point)</option>
                        <option value="1">Dose at i+1 (next point)</option>
                        <option value="2">Dose at i+2</option>
                    </select>
                </div>
                <div id="insulinRateSummary" style="margin-bottom: 8px;"></div>
                <div style="height: clamp(260px, 52vh, 460px); min-height: 220px; width: 100%;">
                    <canvas id="insulinRateChart" style="width: 100%; height: 100%;"></canvas>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('closeInsulinRateModal').addEventListener('click', function () {
            modal.style.display = 'none';
        });
    } else {
        modal.style.display = 'flex';
    }

    const scopeLabel = getAnalysisScopeLabel();
    const scopeEl = document.getElementById('insulinRateScopeLabel');
    const summaryEl = document.getElementById('insulinRateSummary');
    const cutoffSelect = document.getElementById('insulinRateCutoffSelect');
    const averageSelect = document.getElementById('insulinRateAverageSelect');
    const alignmentSelect = document.getElementById('insulinRateAlignmentSelect');
    const ctx = document.getElementById('insulinRateChart').getContext('2d');

    if (scopeEl) {
        scopeEl.textContent = `Scope: ${scopeLabel}`;
    }

    function renderInsulinRateChart() {
        const insulinOffsetPoints = parseInt((alignmentSelect && alignmentSelect.value) || '0', 10);
        const cutoffPercentile = parseInt((cutoffSelect && cutoffSelect.value) || '90', 10);
        const averagingWindow = parseInt((averageSelect && averageSelect.value) || '1', 10);

        const fit = computePairingFit(rows, insulinOffsetPoints, averagingWindow, cutoffPercentile);
        if (!fit) {
            if (summaryEl) {
                summaryEl.textContent = 'Not enough valid glucose/insulin points for this dose pairing.';
            }
            if (window.insulinRateChart && typeof window.insulinRateChart.destroy === 'function') {
                window.insulinRateChart.destroy();
                window.insulinRateChart = null;
            }
            return;
        }

        const points = fit.rawPoints;
        const averagedPoints = fit.averagedPoints;
        const outlierResult = fit.outlierResult;
        const filteredPoints = fit.filteredPoints;

        if (filteredPoints.length < 2) {
            if (summaryEl) {
                summaryEl.textContent = `Too few points remain after ${averagingWindow}-point averaging and ${cutoffPercentile}th percentile filtering.`;
            }
            if (window.insulinRateChart && typeof window.insulinRateChart.destroy === 'function') {
                window.insulinRateChart.destroy();
                window.insulinRateChart = null;
            }
            return;
        }

        const stats = fit.stats;
        const xValues = filteredPoints.map(p => p.x);
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const trendline = stats
            ? [
                { x: minX, y: stats.slope * minX + stats.intercept },
                { x: maxX, y: stats.slope * maxX + stats.intercept }
            ]
            : [];

        if (summaryEl) {
            const rSquaredText = Number.isFinite(fit.rSquared) ? fit.rSquared.toFixed(3) : 'N/A';
            const slopeText = stats && Number.isFinite(stats.slope) ? stats.slope.toFixed(3) : 'N/A';
            const rocCutoffText = Number.isFinite(outlierResult.rocAbsCutoff) ? outlierResult.rocAbsCutoff.toFixed(3) : 'N/A';
            const insulinCutoffText = Number.isFinite(outlierResult.insulinCutoff) ? outlierResult.insulinCutoff.toFixed(3) : 'N/A';
            const pairingText = insulinOffsetPoints > 0 ? `i+${insulinOffsetPoints}` : 'i';

            const candidateOffsets = [0, 1, 2];
            let bestOffset = null;
            let bestR2 = -Infinity;
            candidateOffsets.forEach(offset => {
                const candidate = computePairingFit(rows, offset, averagingWindow, cutoffPercentile);
                if (candidate && Number.isFinite(candidate.rSquared) && candidate.rSquared > bestR2) {
                    bestR2 = candidate.rSquared;
                    bestOffset = offset;
                }
            });

            const bestPairingText = bestOffset === null
                ? 'N/A'
                : (bestOffset > 0 ? `i+${bestOffset}` : 'i');
            const bestR2Text = Number.isFinite(bestR2) ? bestR2.toFixed(3) : 'N/A';

            summaryEl.textContent = `Points: ${filteredPoints.length}/${averagedPoints.length} kept (from ${points.length} raw) | Pairing: dose at ${pairingText} | Avg window: ${averagingWindow} | R^2: ${rSquaredText} | Best pairing: ${bestPairingText} (R^2 ${bestR2Text}) | Trend slope: ${slopeText} (U per mg/dL/min) | ${cutoffPercentile}th pct cutoffs: ROC |x|<=${rocCutoffText}, U<=${insulinCutoffText}`;
        }

        if (window.insulinRateChart && typeof window.insulinRateChart.destroy === 'function') {
            window.insulinRateChart.destroy();
        }

        window.insulinRateChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Insulin vs ROC',
                        data: filteredPoints,
                        backgroundColor: 'rgba(0, 102, 204, 0.55)',
                        borderColor: 'rgba(0, 102, 204, 0.9)',
                        pointRadius: 3,
                        pointHoverRadius: 5
                    },
                    {
                        label: 'Linear Trend',
                        type: 'line',
                        data: trendline,
                        borderColor: 'rgba(220, 53, 69, 0.95)',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false,
                        showLine: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                if (context.dataset && context.dataset.label === 'Linear Trend') {
                                    return `Trend: y=${context.parsed.y.toFixed(3)}`;
                                }
                                const pt = context.raw || {};
                                const ts = pt.timestamp ? moment(pt.timestamp).format('YYYY-MM-DD HH:mm') : 'N/A';
                                return `ROC=${context.parsed.x.toFixed(3)}, U=${context.parsed.y.toFixed(3)} @ ${ts}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Glucose Rate of Change (mg/dL/min)' }
                    },
                    y: {
                        title: { display: true, text: 'Insulin Dose (U)' }
                    }
                }
            }
        });
    }

    if (cutoffSelect) {
        cutoffSelect.onchange = renderInsulinRateChart;
    }
    if (averageSelect) {
        averageSelect.onchange = renderInsulinRateChart;
    }
    if (alignmentSelect) {
        alignmentSelect.onchange = renderInsulinRateChart;
    }
    renderInsulinRateChart();
}

const insulinRateBtn = document.getElementById('viewInsulinRateCorrelation');
if (insulinRateBtn) {
    insulinRateBtn.addEventListener('click', function () {
        showInsulinRateCorrelationModal();
    });
}


// Linear interpolation for missing values
function linearInterpolation(data) {
    let interpolated = data.slice();
    for (let i = 0; i < interpolated.length; i++) {
        if (isNaN(interpolated[i])) {
            let j = i;
            while (j < interpolated.length && isNaN(interpolated[j])) j++;
            const startVal = interpolated[i - 1];
            const endVal = interpolated[j];
            const gap = j - i + 1;
            for (let k = i; k < j; k++) {
                interpolated[k] = startVal + ((endVal - startVal) * (k - i + 1)) / gap;
            }
            i = j;
        }
    }
    return interpolated;
}

// Simple low-pass filter (moving average)
function lowPassFilter(data, windowSize = 3) {
    const filtered = Array(data.length).fill(NaN);
    const halfWin = Math.floor(windowSize / 2);
    for (let i = halfWin; i < data.length - halfWin; i++) {
        let sum = 0;
        for (let j = -halfWin; j <= halfWin; j++) {
            sum += data[i + j];
        }
        filtered[i] = sum / windowSize;
    }
    return filtered;
}

// Preprocess glucose data
function preprocessData(egvData) {
    const glucoseValues = egvData.map(dp => dp.GlucoseValue);
    const interpolated = glucoseValues; //linearInterpolation(glucoseValues);
    const filtered = interpolated; //lowPassFilter(interpolated);
    return filtered;
}

// Calculate raw and normalized cross-correlation with mean offset
function calculateCrossCorrelation(template, egvData) {
    const processedData = preprocessData(egvData);
    const templateLength = template.length;
    const numOffsets = processedData.length - templateLength;

    const rawCorrelation = Array(numOffsets).fill(NaN);
    const normalizedCorrelation = Array(numOffsets).fill(NaN);

    // Mean-subtracted template
    const templateMean = template.reduce((a, b) => a + b, 0) / templateLength;
    const templateZeroMean = template.map(v => v - templateMean);
    const templateStd = Math.sqrt(templateZeroMean.reduce((sum, v) => sum + v * v, 0));

    for (let offset = 0; offset < numOffsets; offset++) {
        const segment = processedData.slice(offset, offset + templateLength);

        if (segment.some(isNaN)) continue;

        const segmentMean = segment.reduce((a, b) => a + b, 0) / templateLength;
        const segmentZeroMean = segment.map(v => v - segmentMean);
        const segmentStd = Math.sqrt(segmentZeroMean.reduce((sum, v) => sum + v * v, 0));

        const covariance = segmentZeroMean.reduce((sum, val, i) => sum + val * templateZeroMean[i], 0);

        rawCorrelation[offset] = covariance;

        normalizedCorrelation[offset] = (segmentStd > 0 && templateStd > 0)
            ? covariance / (segmentStd * templateStd)
            : NaN;
    }

    return { rawCorrelation, normalizedCorrelation };
}

function performFilteredPlot(mode, startDate, endDate) {
    // mode should be either 'raw' or 'normalized'
    const userMeals = selectedPoints; // user-selected meals
    if (userMeals.length === 0 || egvData.length === 0) {
        alert('No user-selected meals or CGM data available.');
        return;
    }

    // Use the average meal response as the template
    const template = calculateAverageMealResponse(userMeals, egvData);

    // Use the provided startDate and endDate for the visible window
    const visibleMin = startDate.getTime();
    const visibleMax = endDate.getTime();
    const visibleDurationMs = visibleMax - visibleMin;
    const intervalDurationMs = 5 * 60 * 1000; // 5 minutes per interval
    const numIntervalsToShow = Math.floor(visibleDurationMs / intervalDurationMs);

    // Determine the starting index for correlation calculation based on visibleMin
    let correlationCalcStartIndex = egvData.findIndex(
        dp => Date.parse(dp.Timestamp) >= visibleMin
    );
    if (correlationCalcStartIndex === -1) {
        correlationCalcStartIndex = 0;
        console.log('Visible window not found in data. Using full data for correlation.');
    }

    // Slice egvData for correlation: visible slice plus extra data for the template length
    const visibleEgvDataSlice = egvData.slice(
        correlationCalcStartIndex,
        correlationCalcStartIndex + numIntervalsToShow + template.length
    );

    // Calculate cross-correlation on the visible slice
    const correlations = calculateCrossCorrelation(template, visibleEgvDataSlice);
    const correlationData = mode === 'raw' ? correlations.rawCorrelation : correlations.normalizedCorrelation;

    // Since the visible window starts at midnight, take the first numIntervalsToShow data points
    const correlationDataToShow = correlationData.slice(0, numIntervalsToShow);

    // Generate labels starting from visibleMin (which is midnight)
    const labels = [];
    for (let i = 0; i < correlationDataToShow.length; i++) {
        labels.push(new Date(visibleMin + i * intervalDurationMs));
    }

    // Unhide the filtered chart container
    const canvas = document.getElementById('filteredGlucoseChart');
    if (!canvas) {
        console.error('Canvas element with id "filteredGlucoseChart" not found.');
        return;
    }
    canvas.parentElement.classList.remove('hidden');

    // Destroy any previous chart instance to avoid duplicates
    if (window.filteredGlucoseChart && typeof window.filteredGlucoseChart.destroy === 'function') {
        window.filteredGlucoseChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Create a new Chart.js chart with a time-based x-axis
    window.filteredGlucoseChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: mode === 'raw' ? 'Raw Cross Correlation' : 'Normalized Cross Correlation',
                data: correlationDataToShow,
                borderColor: 'purple',
                backgroundColor: 'rgba(128,0,128,0.1)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        tooltipFormat: 'MMM DD, YYYY HH:mm'
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: mode === 'raw' ? 'Covariance' : 'Correlation Coefficient'
                    }
                }
            }
        }
    });
}


// Attach event listeners to the filtered plot buttons
document.getElementById('rawCrossCorrelation').addEventListener('click', function () {
            // Get the currently selected date from the date picker
            const date = picker.getDate();
    const startDate = moment(date);
    const daysToDisplay = parseInt(document.getElementById('daysToDisplay').value, 10);
    const endDate = moment(date).add(daysToDisplay, 'days'); // Add selected number of days
    performFilteredPlot('raw', startDate.toDate(), endDate.toDate());
});

document.getElementById('normalizedCrossCorrelation').addEventListener('click', function () {
    // Get the currently selected date from the date picker
    const date = picker.getDate();
    const startDate = moment(date);
    const daysToDisplay = parseInt(document.getElementById('daysToDisplay').value, 10);
    const endDate = moment(date).add(daysToDisplay, 'days'); // Add selected number of days
    performFilteredPlot('normalized', startDate.toDate(), endDate.toDate());
});