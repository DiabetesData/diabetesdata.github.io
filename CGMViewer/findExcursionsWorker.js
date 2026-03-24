// findExcursionsWorker.js
self.addEventListener('message', function (e) {
    const { egvData, triggerRate: triggerRateMgdlPerMin, mustIncrease, mealBlockoutMinutes, numConsecutiveIncrease } = e.data;
    const mealExcursions = findExcursions(egvData, triggerRateMgdlPerMin, mustIncrease, mealBlockoutMinutes, numConsecutiveIncrease);
    self.postMessage(mealExcursions);
});

function buildFiveMinuteGrid(cgmData) {
    const validRows = cgmData
        .map(row => {
            const tMs = new Date(row.Timestamp).getTime();
            if (!Number.isFinite(tMs)) {
                return null;
            }
            const glucose = Number(row.GlucoseValue);
            return {
                tMs,
                timestampRaw: row.Timestamp,
                glucose: Number.isFinite(glucose) ? glucose : NaN
            };
        })
        .filter(row => row !== null)
        .sort((a, b) => a.tMs - b.tMs);

    if (validRows.length === 0) {
        return [];
    }

    const binMs = 5 * 60 * 1000;
    const startMs = Math.floor(validRows[0].tMs / binMs) * binMs;
    const endMs = Math.ceil(validRows[validRows.length - 1].tMs / binMs) * binMs;
    const binCount = Math.floor((endMs - startMs) / binMs) + 1;

    const bins = new Array(binCount).fill(null).map(() => ({
        sum: 0,
        count: 0,
        timestampRaw: null
    }));

    validRows.forEach(row => {
        const idx = Math.floor((Math.floor(row.tMs / binMs) * binMs - startMs) / binMs);
        if (idx < 0 || idx >= binCount) {
            return;
        }
        if (bins[idx].timestampRaw === null) {
            bins[idx].timestampRaw = row.timestampRaw;
        }
        if (Number.isFinite(row.glucose)) {
            bins[idx].sum += row.glucose;
            bins[idx].count += 1;
        }
    });

    return bins.map((bin, idx) => {
        const tMs = startMs + idx * binMs;
        const avg = bin.count > 0 ? bin.sum / bin.count : NaN;
        return {
            Timestamp: bin.timestampRaw || new Date(tMs).toISOString(),
            _tMs: tMs,
            GlucoseValue: avg
        };
    });
}

// Find meal excursions anchored at the beginning of the rise interval.
function findExcursions(cgmData, triggerRate = 1.0, mustIncrease = 30, mealBlockoutMinutes = 150, numConsecutiveIncrease = 3) {
    if (!Array.isArray(cgmData) || cgmData.length < 3) {
        return [];
    }

    const gridData = buildFiveMinuteGrid(cgmData);
    if (gridData.length < 3) {
        return [];
    }

    const confirmBins = 12; // 60 minutes on a 5-minute grid
    const blackoutBins = Math.max(1, Math.round(mealBlockoutMinutes / 5));

    const mg = gridData.map(row => Number(row.GlucoseValue));
    const deltas = new Array(gridData.length).fill(NaN);
    for (let i = 1; i < gridData.length; i++) {
        const curr = mg[i];
        const prev = mg[i - 1];
        if (Number.isFinite(curr) && Number.isFinite(prev)) {
            deltas[i] = curr - prev;
        }
    }

    const results = [];
    let nextAllowedIdx = 1;

    for (let i = 1; i < gridData.length; i++) {
        if (i < nextAllowedIdx) {
            continue;
        }

        const ratePerMinute = Number.isFinite(deltas[i]) ? (deltas[i] / 5) : NaN;
        const rateGate = Number.isFinite(ratePerMinute) && ratePerMinute >= triggerRate;
        if (!rateGate) {
            continue;
        }

        if (i + numConsecutiveIncrease - 1 >= gridData.length) {
            continue;
        }

        let streakOk = true;
        for (let j = i; j < i + numConsecutiveIncrease; j++) {
            const dj = deltas[j];
            if (Number.isFinite(dj) && dj <= 0) {
                streakOk = false;
                break;
            }
        }
        if (!streakOk) {
            continue;
        }

        const t0Idx = i - 1;
        const base = mg[t0Idx];
        if (!Number.isFinite(base)) {
            continue;
        }

        const jMax = Math.min(gridData.length - 1, i + confirmBins);
        let confirmIdx = -1;
        for (let j = i; j <= jMax; j++) {
            if (Number.isFinite(mg[j]) && (mg[j] - base) >= mustIncrease) {
                confirmIdx = j;
                break;
            }
        }

        if (confirmIdx === -1) {
            continue;
        }

        const peakEnd = Math.min(gridData.length - 1, t0Idx + confirmBins + 12);
        let peakIdx = t0Idx;
        let peakValue = Number.isFinite(mg[t0Idx]) ? mg[t0Idx] : -Infinity;
        for (let k = t0Idx; k <= peakEnd; k++) {
            if (Number.isFinite(mg[k]) && mg[k] > peakValue) {
                peakValue = mg[k];
                peakIdx = k;
            }
        }

        const areaEnd = Math.min(gridData.length - 1, t0Idx + 24);
        let area2h = 0;
        for (let k = t0Idx + 1; k <= areaEnd; k++) {
            const a = mg[k - 1];
            const b = mg[k];
            if (!Number.isFinite(a) || !Number.isFinite(b)) {
                continue;
            }
            area2h += ((a + b) * 0.5 * 5);
        }

        const peakDelta = Number.isFinite(peakValue) ? (peakValue - base) : NaN;

        results.push({
            Timestamp: gridData[t0Idx].Timestamp,
            t0: gridData[t0Idx].Timestamp,
            t_confirm: gridData[confirmIdx].Timestamp,
            time_to_confirm_min: (gridData[confirmIdx]._tMs - gridData[t0Idx]._tMs) / (60 * 1000),
            t_peak: gridData[peakIdx].Timestamp,
            peak: Number.isFinite(peakValue) ? peakValue : null,
            peakOneHour: peakDelta,
            area_2h: area2h
        });

        nextAllowedIdx = t0Idx + blackoutBins;
    }

    return results;
}