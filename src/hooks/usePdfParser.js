import { useCallback } from 'react';

// The original parsePdfData function, now encapsulated within this module.
const performPdfParsing = async (pdfFile) => {
    const pdfJsVersion = "3.11.174"; 

    if (typeof window['pdfjs-dist/build/pdf'] === 'undefined') {
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfJsVersion}/pdf.min.js`;
                script.onload = resolve;
                script.onerror = () => reject(new Error('Failed to load PDF library script from cdnjs.'));
                document.body.appendChild(script);
            });
        } catch (error) {
            console.error("Failed to load pdf.js script:", error);
            throw new Error("Could not load PDF library. Please try again.");
        }
    }
    
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    if (!pdfjsLib) throw new Error("PDF library failed to initialize even after loading.");
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfJsVersion}/pdf.worker.min.js`;
    
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let seriesData = [];
    let currentSeries = null;
    // Flags to manage expecting a car name on the next line for special series
    let expectCarForLastSchedule = false;
    let lastScheduleIndexForCar = -1;

    const licenseClassMap = { 'Rookie': 1, 'D': 2, 'C': 3, 'B': 4, 'A': 5 };

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        const lines = content.items.reduce((acc, item) => {
            let line = acc.find(l => Math.abs(l.y - item.transform[5]) < 5);
            if (!line) {
                line = { y: item.transform[5], text: '' };
                acc.push(line);
            }
            line.text += item.str;
            return acc;
        }, []).sort((a, b) => b.y - a.y).map(l => l.text.trim());

        for (const line of lines) {
            const seriesNameRegex = /^(.*?)(\s*-*\s*\d{4}\s+Season\s+\d(?: - Fixed)?)$/i;
            const seriesMatch = line.match(seriesNameRegex);

            if (seriesMatch && seriesMatch[1]) {
                 if (currentSeries) {
                    seriesData.push(currentSeries);
                }
                let cleanedName = seriesMatch[1].trim().replace(/^\d+\.\s*/, '');
                if (/\bfixed\b/i.test(line) && !/\bfixed\b/i.test(cleanedName)) {
                     cleanedName += " - Fixed";
                }

                currentSeries = {
                    season_name: cleanedName,
                    license_group: 0,
                    schedules: [],
                    car_types: [],
                    race_frequency: '' // Initialize race_frequency
                };
                expectCarForLastSchedule = false; // Reset for new series
                lastScheduleIndexForCar = -1;
                continue;
            }

            if (currentSeries) {
                // Check if we are expecting a car name for the previously parsed schedule week.
                // This should be one of the first checks for any line if a series is active.
                if (expectCarForLastSchedule && lastScheduleIndexForCar !== -1 && currentSeries.schedules[lastScheduleIndexForCar]) {
                    // A line is a candidate for a car name if it's not a new series header,
                    // not a structural line (Week, License, Frequency, etc.), and has content.
                    const isAnotherSeriesName = seriesNameRegex.test(line); // Use the existing seriesNameRegex
                    const isStructuralLine = /^(Week\s+\d+|Rookie|Class\s+[A-D]|Races\s+(?:every|at)|Min entries|Penalty|See race week)/i.test(line);
                    
                    if (!isStructuralLine && !isAnotherSeriesName && line.trim().length > 0) {
                        let fullLineText = line.trim();
                        let carName = fullLineText; // Default to the full line text

                        // Regex to find the start of session details or large spaces.
                        // This will split the line, and we'll take the first part as the car name.
                        // Keywords are case-insensitive. Non-capturing group for delimiters.
                        const delimiterRegex = /\s{2,}|(?:\s*(?:Detached qual|Rolling start|Fixed Setup|Open Setup|Local|Qualifying|Race|Warmup|Practice|Entries|Penalty)\b[\s,]*)/i;
                        const parts = fullLineText.split(delimiterRegex);

                        if (parts && parts[0] && parts[0].trim().length > 0) {
                            carName = parts[0].trim();
                        }

                        currentSeries.schedules[lastScheduleIndexForCar].weekly_cars = carName;
                        expectCarForLastSchedule = false; 
                        lastScheduleIndexForCar = -1;
                        continue; 
                    } else {
                        // The current line is not the expected car name (it's structural or empty).
                        // Assume the car for the previous week was missed or not present directly after.
                        expectCarForLastSchedule = false; 
                        lastScheduleIndexForCar = -1;
                        // Proceed to process the current line normally with the logic below.
                    }
                }

                if (currentSeries.schedules.length === 0 && !line.startsWith('Week')) { // This block is for series-level info (license, frequency, car_types)
                    const licenseRegex = /^(Rookie|Class\s+[A-D])\s+\((\d)\.0\)\s+-->/;
                    const licenseMatch = line.match(licenseRegex);

                    const frequencyRegex = /^(Races\s+(?:every|at).*)$/i;
                    const frequencyMatch = line.match(frequencyRegex);

                    if (licenseMatch) {
                        let license = licenseMatch[1];
                        let srNum = licenseMatch[2];
                        if (license === 'Rookie' & srNum == '1') currentSeries.license_group = licenseClassMap['Rookie'];
                        else if (license === 'Rookie') currentSeries.license_group = licenseClassMap['D'];
                        else if (license === 'Class D') currentSeries.license_group = licenseClassMap['C'];
                        else if (license === 'Class C') currentSeries.license_group = licenseClassMap['B'];
                        else if (license === 'Class B') currentSeries.license_group = licenseClassMap['A'];
                    } else if (frequencyMatch) {
                        currentSeries.race_frequency = frequencyMatch[0].trim();
                    } else if (!line.startsWith('Min entries') && !line.startsWith('Penalty') && !line.includes('See race week')) {
                        const existingCars = currentSeries.car_types[0]?.car_type || '';
                        currentSeries.car_types = [{car_type: (existingCars + ' ' + line).trim()}];
                    }
                }
                
                const weekRegex = /^Week\s+(\d+)\s+\((\d{4}-\d{2}-\d{2})\)/;
                const weekMatch = line.match(weekRegex);

                if (weekMatch) {
                    let remainingLine = line.replace(weekRegex, '').trim();
                    const weekNum = parseInt(weekMatch[1], 10) - 1;
                    const startDateStr = weekMatch[2];

                    const lapsRegex = /(\d+\s+(?:laps|mins))$/i;
                    let laps = '';
                    const lapsMatch = remainingLine.match(lapsRegex);
                    if(lapsMatch) {
                        laps = lapsMatch[1];
                        remainingLine = remainingLine.replace(lapsRegex, '').trim();
                    }

                    const weatherRegex = /([$]?\d+°F[\s\S]+)/;
                    let weatherText = '';
                    const weatherMatch = remainingLine.match(weatherRegex);
                    if(weatherMatch){
                        weatherText = weatherMatch[1];
                        remainingLine = remainingLine.replace(weatherRegex, '').trim();
                    }
                    
                    let trackName = ''; // Initialize
                    let weeklyCars = null;

                    if (currentSeries.season_name.includes("Draft Master") || currentSeries.season_name.includes("Ring Meister")) {
                        if (currentSeries.season_name.includes("Ring Meister")) {
                            // Ring Meister: Car is often in parentheses, or the line IS the car. Track is usually Nürburgring.
                            trackName = remainingLine.trim() || "Nürburgring Combined"; // Default if line is empty
                            weeklyCars = null; // Expect on next line
                            expectCarForLastSchedule = true;
                        } else if (currentSeries.season_name.includes("Draft Master")) {
                            // Draft Master: Try to parse "Track - Car". If not found, track is remainingLine, car on next.
                            const parts = remainingLine.split(/\s+-\s+/); // Split by " - "
                            if (parts.length >= 2) {
                                trackName = parts.slice(0, -1).join(' - ').trim(); // Join all but last for track
                                weeklyCars = parts.pop().trim(); // Last part is car
                                expectCarForLastSchedule = false; // Car found on this line
                            } else {
                                trackName = remainingLine.trim(); // Assume whole line is track
                                weeklyCars = null; // Expect on next line
                                expectCarForLastSchedule = true;
                            }
                        }
                    } else {
                        trackName = remainingLine.split(' (')[0].trim(); // Original logic for other series
                        // For regular series, if car is in parentheses on the same line
                        const carInParenRegex = /\(([^)]+)\)$/;
                        const carMatch = remainingLine.match(carInParenRegex);
                        if (carMatch && carMatch[1]) {
                            // This might be too greedy or conflict if track names have parentheses.
                            // For now, we assume this is for non-special series where car might be appended.
                            // weeklyCars = carMatch[1].trim(); // Potentially re-enable if needed for other series
                        }
                        expectCarForLastSchedule = false;
                    }
                    const rainRegex = /Rain chance (\d+)%/;
                    const rainMatch = weatherText.match(rainRegex);

                    currentSeries.schedules.push({
                        race_week_num: weekNum,
                        start_date: startDateStr,
                        track: { track_name: trackName || 'N/A' },
                        weekly_cars: weeklyCars,
                        rain_chance: rainMatch ? parseInt(rainMatch[1], 10) : 0,
                        laps: laps
                    });
                    if (expectCarForLastSchedule) {
                        lastScheduleIndexForCar = currentSeries.schedules.length - 1;
                    }
                }
            }
        }
    }
    if (currentSeries) seriesData.push(currentSeries);
    
    return seriesData.filter(s => s.schedules.length > 0); // Keep series with schedules, but don't filter by length
};

/**
 * A custom hook to encapsulate the logic for parsing iRacing PDF schedule files.
 * It handles loading the pdf.js library from a CDN and provides a parsing function.
 * @returns {{parsePdf: function}} - An object containing the `parsePdf` function.
 */
export const usePdfParser = () => {
    const parsePdf = useCallback(async (pdfFile) => {
        return await performPdfParsing(pdfFile);
    }, []);

    return { parsePdf };
};