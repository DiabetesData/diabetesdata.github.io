// Compatibility worker backed by the shared typed meal detector.
importScripts('./meal-analysis.js');

self.addEventListener('message', function (e) {
    const { egvData, triggerRate: triggerRateMgdlPerMin, mustIncrease, mealBlockoutMinutes, numConsecutiveIncrease } = e.data;
    const mealExcursions = MealAnalysis.detectLegacyRows(egvData, {
        triggerRateMgdlPerMin,
        mustIncrease,
        mealBlockoutMinutes,
        numConsecutiveIncrease,
        confirmWindowMinutes: 60
    });
    self.postMessage(mealExcursions);
});
