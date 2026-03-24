// findHypoglycemiaWorker.js

self.addEventListener('message', function (e) {
    const {
      cgmData,
      hypoLowThreshold = 54,    // Sensor values < this indicate hypoglycemia
      hypoHighThreshold = 70,   // Sensor values > this are required to end the event
      hypoMinGapPoints = 3      // Number of data points (e.g., 3 for 15 minutes at 5-min intervals)
    } = e.data;
  
    console.log('Message received in hypoglycemia worker:', e.data);
    const hypoglycemicEvents = findHypoglycemicEvents(
      cgmData,
      hypoLowThreshold,
      hypoHighThreshold,
      hypoMinGapPoints
    );
    // Send the identified hypoglycemic events back to the main thread
    self.postMessage(hypoglycemicEvents);
  });
  
  /**
   * Identifies hypoglycemic events defined as:
   * "At least 2 sensor values < hypoLowThreshold that are at least hypoMinGapPoints apart
   *  with no intervening values > hypoLowThreshold; and the event is terminated when at least
   *  2 sensor values > hypoHighThreshold that are at least hypoMinGapPoints apart with no intervening
   *  values < hypoHighThreshold are observed."
   *
   * @param {Array} cgmData - Array of CGM objects with at least { Timestamp, GlucoseValue }.
   * @param {number} hypoLowThreshold - Threshold for hypoglycemia (default: 54 mg/dL).
   * @param {number} hypoHighThreshold - Threshold required to end the event (default: 70 mg/dL).
   * @param {number} hypoMinGapPoints - Minimum number of data points corresponding to >=15 minutes (default: 3 for 5-min intervals).
   * @returns {Array} - Array of identified hypoglycemic events.
   */
  function findHypoglycemicEvents(cgmData, hypoLowThreshold = 54, hypoHighThreshold = 70, hypoMinGapPoints = 3) {
    const events = [];
    let i = 0;
    while (i < cgmData.length) {
      // Look for a potential event start: a sensor value < hypoLowThreshold
      if (cgmData[i].GlucoseValue < hypoLowThreshold) {
        console.log(`Potential event start at index ${i}: ${cgmData[i].Timestamp} - ${cgmData[i].GlucoseValue}`);
        const lowStartIndex = i;
        let j = i + 1;
        let lowConfirmed = false;
        let lowSecondIndex = null;
        // Search for a second low reading that's at least hypoMinGapPoints apart.
        while (j < cgmData.length) {
          if (j - lowStartIndex >= hypoMinGapPoints) {
            if (cgmData[j].GlucoseValue < hypoLowThreshold) {
              console.log(`Second low confirmed at index ${j}: ${cgmData[j].Timestamp} - ${cgmData[j].GlucoseValue}`);
              lowConfirmed = true;
              lowSecondIndex = j;
              break;
            }
          }
          if (cgmData[j].GlucoseValue > hypoLowThreshold) {
            console.log(`Intervening value above hypoLowThreshold at index ${j}: ${cgmData[j].Timestamp} - ${cgmData[j].GlucoseValue}`);
            break;
          }
          j++;
        }
        if (lowConfirmed) {
          // Now look for termination: a chain of high readings (>= hypoHighThreshold)
          // that are separated by at least hypoMinGapPoints with no intervening low values.
          let candidateStart = null;
          let candidateEnd = null;
          let terminationFound = false;
          for (let k = lowSecondIndex + 1; k < cgmData.length; k++) {
            if (cgmData[k].GlucoseValue >= hypoHighThreshold) {
              if (candidateStart === null) {
                candidateStart = k;
                console.log(`Potential termination start at index ${k}: ${cgmData[k].Timestamp} - ${cgmData[k].GlucoseValue}`);
              } else {
                // We already have a candidate start. Check if this reading is far enough away.
                if (k - candidateStart >= hypoMinGapPoints) {
                  candidateEnd = k;
                  terminationFound = true;
                  console.log(`Termination confirmed with second high at index ${k}: ${cgmData[k].Timestamp} - ${cgmData[k].GlucoseValue}`);
                  break;
                }
              }
            } else {
              // If an intervening value is below the threshold, reset the candidate chain.
              if (candidateStart !== null) {
                console.log(`Candidate chain broken at index ${k}: ${cgmData[k].Timestamp} - ${cgmData[k].GlucoseValue}`);
              }
              candidateStart = null;
            }
          }
          if (terminationFound && candidateStart !== null) {
            // Record the event up to, but not including, the termination point (candidateStart)
            events.push({
              startTimestamp: cgmData[lowStartIndex].Timestamp,
              endTimestamp: cgmData[candidateStart - 1].Timestamp,
              dataPoints: cgmData.slice(lowStartIndex, candidateStart)
            });
            console.log(`Hypoglycemic event recorded from index ${lowStartIndex} to ${candidateStart - 1}`);
            // Advance past this event (we use candidateEnd to ensure we skip the termination chain)
            i = candidateEnd + 1;
            continue;
          } else {
            console.log(`No termination confirmed for event starting at index ${lowStartIndex}`);
          }
        } else {
          console.log(`Low event not confirmed after index ${i}`);
        }
      }
      i++;
    }
    return events;
  }
  
  
  
  