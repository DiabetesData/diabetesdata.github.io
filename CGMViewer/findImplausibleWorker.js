// findImplausibleDataWorker.js

self.addEventListener('message', function (e) {
    const {
        cgmData,
        implausibleLowThreshold = 50,      // run starts when reading is < this value
        implausibleEndThreshold = 80,      // run continues until reading is >= this value
        implausibleHighThreshold = 80,     // flanking check threshold
        implausibleMinConsecutive = 3,     // minimum points for a valid run
        implausibleFlankingPoints = 2      // number of points on either side to check for flank
    } = e.data;

    console.log('Message received in worker:', e.data);
    const implausibleRuns = findImplausibleRuns(
        cgmData,
        implausibleLowThreshold,
        implausibleEndThreshold,
        implausibleHighThreshold,
        implausibleMinConsecutive,
        implausibleFlankingPoints
    );

    // Send the identified implausible runs back to the main thread
    self.postMessage(implausibleRuns);
});


/**
 * Identifies implausible runs defined as:
 * "any strings (minConsecutive or more consecutive readings) that start with a reading below lowThreshold,
 * continue while readings remain below endThreshold (allowing for some values above lowThreshold),
 * and are flanked on the left and right by readings >= highThreshold within flankingPoints data points."
 *
 * @param {Array} cgmData - Array of CGM objects with at least { Timestamp, GlucoseValue }.
 * @param {number} lowThreshold - Value that triggers the run start (default: 50).
 * @param {number} endThreshold - Value that ends the run (default: 80).
 * @param {number} highThreshold - Required flanking reading threshold (default: 80).
 * @param {number} minConsecutive - Minimum number of points in the run (default: 3).
 * @param {number} flankingPoints - Number of data points on each side to check for a flank (default: 2).
 * @returns {Array} - Array of identified implausible runs.
 */
function findImplausibleRuns(
    cgmData,
    lowThreshold = 50,
    endThreshold = 80,
    highThreshold = 80,
    minConsecutive = 3,
    flankingPoints = 2
  ) {
    const runs = [];
  
    // Assume cgmData is pre-sorted by timestamp.
    let i = 0;
    while (i < cgmData.length) {
      // Look for a run start: reading below lowThreshold
      if (cgmData[i].GlucoseValue < lowThreshold) {
        // log the start index and glucose value
        console.log('Potential Start:', cgmData[i].Timestamp, cgmData[i].GlucoseValue);
        const startIndex = i;
        let j = i;
        // Continue the run until a reading >= endThreshold is encountered
        while (j < cgmData.length && cgmData[j].GlucoseValue < endThreshold) {
          j++;
        }
        // Only consider runs of sufficient length
        if (j - startIndex >= minConsecutive) {
          // Left flank: check up to flankingPoints before startIndex for a reading >= highThreshold
          let hasBefore = false;
          for (let k = Math.max(0, startIndex - flankingPoints); k < startIndex; k++) {
            if (cgmData[k].GlucoseValue >= highThreshold) {
              hasBefore = true;
              break;
            }
          }
          // Right flank: check up to flankingPoints after the run (starting at index j) for a reading >= highThreshold
          let hasAfter = false;
          for (let k = j; k < Math.min(cgmData.length, j + flankingPoints); k++) {
            if (cgmData[k].GlucoseValue >= highThreshold) {
              hasAfter = true;
              break;
            }
          }
          if (hasBefore && hasAfter) {
            runs.push({
              startTimestamp: cgmData[startIndex].Timestamp,
              endTimestamp: cgmData[j - 1].Timestamp,
              dataPoints: cgmData.slice(startIndex, j)
            });
          }
        }
        // Skip past this run
        i = j;
      } else {
        i++;
      }
    }
    return runs;
  }
  