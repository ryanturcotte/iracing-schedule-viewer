import { useCallback } from 'react';

// Helper function to download data as a JSON file, moved outside for broader use.
const downloadJson = (data, filename) => {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        console.warn(`Skipping download for ${filename} because data is empty.`);
        return;
    }
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// --- Start of refactored parsing logic ---

/**
 * First-pass parser for the PDF's table of contents (TOC).
 * It builds a map of series names to their discipline and license class.
 * @param {PDFDocumentProxy} pdf - The loaded PDF.js document object.
 * @returns {Promise<Map<string, {discipline: string, license: string}>>}
 */
const parseTableOfContents = async (pdf) => {
    const seriesMap = new Map();
    const INDENT = { DISCIPLINE: 56, LICENSE_CLASS: 76, SERIES: 96 };
    let currentDiscipline = 'Unknown';
    let currentLicenseClass = 'Unknown';

    // The TOC is usually within the first 5 pages.
    const numTocPages = Math.min(5, pdf.numPages);

    for (let i = 1; i <= numTocPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        // Sort items by y-coordinate (desc) and then x-coordinate (asc) to process in reading order.
        const sortedItems = content.items.sort((a, b) => {
            if (a.transform[5] > b.transform[5]) return -1;
            if (a.transform[5] < b.transform[5]) return 1;
            if (a.transform[4] < b.transform[4]) return -1;
            if (a.transform[4] > b.transform[4]) return 1;
            return 0;
        });

        for (const item of sortedItems) {
            const x = item.transform[4];
            const text = item.str.trim();

            if (!text || item.height === 0) continue;

            // 1. Identify Discipline Headers (e.g., "OVAL", "SPORTS CAR")
            if (x < INDENT.LICENSE_CLASS && text === text.toUpperCase() && text.includes('.')) {
                const disciplineMatch = text.match(/^([A-Z\s]+)\s*\./);
                if (disciplineMatch) {
                    currentDiscipline = disciplineMatch[1].trim();
                    currentLicenseClass = 'Unknown'; // Reset license class on new discipline
                }
            }
            // 2. Identify License Class Headers (e.g., "R Class Series (OVAL)")
            else if (x >= INDENT.LICENSE_CLASS && x < INDENT.SERIES && text.includes('Class Series')) {
                const licenseMatch = text.match(/^([A-Z])\s+Class/);
                if (licenseMatch) {
                    currentLicenseClass = licenseMatch[1];
                }
            }
            // 3. Identify Series Names (indented the most)
            else if (x >= INDENT.SERIES && text.includes('Season')) {
                const seriesNameWithDots = text.replace(/\s*\.+\s*$/, '').trim();
                // Extract the base name (without season info) to use as a key.
                // This makes matching more reliable.
                const seriesMatch = seriesNameWithDots.match(SERIES_NAME_REGEX);
                if (seriesMatch && seriesMatch[1]) {
                    const baseName = seriesMatch[1].trim();
                    seriesMap.set(baseName, { discipline: currentDiscipline, license: currentLicenseClass });
                }
            }
        }
    }
    return seriesMap;
};

const SERIES_NAME_REGEX = /^(.*?)(\s*-*\s*\d{4}\s+Season.*)$/i;
const WEEK_REGEX = /^Week\s+(\d+)\s+\((\d{4}-\d{2}-\d{2})\)/;
const LICENSE_REGEX = /^(Rookie|Class\s+[A-D])\s+\((\d)\.0\)\s*-->/;
const FREQUENCY_REGEX = /^(Races\s+(?:every|at).*)$/i;

/**
 * Checks if a line is a structural or informational line that should not be treated as a car or series name.
 * This is a key part of the parsing heuristic.
 * @param {string} line - The line of text to check.
 * @returns {boolean} - True if the line is structural, false otherwise.
 */
const isStructuralOrDetailLine = (line) => {
    if (!line || line.trim().length === 0) return true;
    // Regex for lines that define the structure of the schedule or series details
    const structuralPatterns = [
        /^(Week\s+\d+|Rookie|Class\s+[A-D]|Races\s+(?:every|at)|Min entries)/i,
        /Penalty/i,
        /No incident/i,
        /DQ at/i,
        /incidents/i,
        /(Team racing|Split at|Drops:|Pro\/WC|GMT)/i,
        /\d+\s+(?:laps|mins)/i,
        /\d+°F/i,
        /^(Detached qual|Rolling start|Fixed Setup|Open Setup|Local|Qualifying|Race|Warmup|Practice|Entries)/i,
        /^\(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\dx\)$/i, // Matches special event time lines e.g. (2025-06-21 15:00 1x)
    ];
    return structuralPatterns.some(regex => regex.test(line));
};

/**
 * Heuristic to detect a new series based on week number and date resets.
 * @param {number} parsedWeekNumber - The current week number being parsed.
 * @param {Date} currentDate - The current date being parsed.
 * @param {object} parsingState - The current state of the parser.
 * @returns {boolean} - True if a new series is detected.
 */
const isNewSeriesHeuristic = (parsedWeekNumber, currentDate, parsingState) => {
    const isDateReset = parsingState.lastParsedDate && currentDate < parsingState.lastParsedDate;
    const isWeekReset = parsedWeekNumber === 1 && parsingState.lastParsedWeekNum > 1;
    return isDateReset || isWeekReset;
};

/**
 * Handles a line that is identified as a new series header.
 * @returns A new series object if a new series is found, otherwise null.
 */
const handleNewSeriesLine = (line, seriesData, currentSeriesRef, seriesClassMap, licenseLetterToGroupMap) => {
    const seriesMatch = line.match(SERIES_NAME_REGEX);
    if (seriesMatch && seriesMatch[1]) {
        if (currentSeriesRef.current) {
            seriesData.push(currentSeriesRef.current);
        }
        let cleanedName = seriesMatch[1].trim().replace(/^\d+\.\s*/, '');
        if (/\bfixed\b/i.test(line) && !/\bfixed\b/i.test(cleanedName)) {
            cleanedName += " - Fixed";
        }

        let tocInfo = seriesClassMap.get(cleanedName);
        // If an exact match isn't found, try a fuzzy match. This handles cases where the TOC name
        // is slightly different (e.g., "NASCAR Gen 4 Cup Series" in TOC vs. "NASCAR Gen 4 Cup" in header).
        if (!tocInfo) {
            for (const [key, value] of seriesClassMap.entries()) {
                // Check if the TOC key starts with the header name, or vice-versa.
                // This finds the most likely match.
                if (key.startsWith(cleanedName) || cleanedName.startsWith(key)) {
                    tocInfo = value;
                    break;
                }
            }
        }

        currentSeriesRef.current = {
            season_name: cleanedName,
            license_group: tocInfo ? (licenseLetterToGroupMap[tocInfo.license] || 0) : 0,
            discipline: tocInfo ? tocInfo.discipline : 'Unknown',
            track_types: [{ track_type: tocInfo ? tocInfo.discipline : 'Unknown' }],
            schedules: [],
            car_class: '', // New property for the car class string
            car_types: [], // Kept for backward compatibility if used elsewhere
            race_frequency: ''
        };
        return true;
    }
    return false;
};

/**
 * Handles a line that might contain series-level information like license, frequency, or car types.
 */
const handleSeriesInfoLine = (line, currentSeries, licenseClassMap, DEBUG_LOGGING) => {
    if (currentSeries.schedules.length > 0 || line.startsWith('Week')) {
        return false; // This logic only applies before any schedules are parsed.
    }

    const licenseMatch = line.match(LICENSE_REGEX);
    if (licenseMatch) {
        // Only use this as a fallback if the TOC parsing didn't set a license group.
        if (currentSeries.license_group === 0) {
            const licenseName = licenseMatch[1];
            const safetyRatingNum = licenseMatch[2];
            if (DEBUG_LOGGING) console.log(`  Series Info: Found license (fallback) - "${licenseName} (${safetyRatingNum}.0)"`);

            if (licenseName === 'Rookie' && safetyRatingNum === '1') {
                currentSeries.license_group = licenseClassMap['Rookie'];
            } else {
                const licensePromotionMap = {
                    'Rookie': licenseClassMap['D'],
                    'Class D': licenseClassMap['C'],
                    'Class C': licenseClassMap['B'],
                    'Class B': licenseClassMap['A'],
                };
                currentSeries.license_group = licensePromotionMap[licenseName] || 0;
            }
        }
        return true;
    }

    const frequencyMatch = line.match(FREQUENCY_REGEX);
    if (frequencyMatch) {
        if (DEBUG_LOGGING) console.log(`  Series Info: Found frequency - "${frequencyMatch[0].trim()}"`);
        currentSeries.race_frequency = frequencyMatch[0].trim();
        return true;
    }

    // If it's not a known structural line, assume it's a car type.
    // Also check that it's not a series name, which can sometimes be repeated.
    if (!isStructuralOrDetailLine(line) && !line.match(SERIES_NAME_REGEX)) {
        if (DEBUG_LOGGING) console.log(`  Series Info: Found car class part - "${line}"`);
        // Append to the new car_class property
        currentSeries.car_class = (currentSeries.car_class + ' ' + line).trim();
        return true;
    }

    return false;
};

/**
 * Handles a line that is identified as a weekly schedule entry.
 */
const handleScheduleLine = (line, seriesData, currentSeriesRef, parsingState, seriesClassMap, licenseLetterToGroupMap, DEBUG_LOGGING) => {
    const weekMatch = line.match(WEEK_REGEX);
    if (!weekMatch) return false;

    // A new week line means we should stop looking for cars for the *previous* week.
    parsingState.expectCarForLastSchedule = false;
    parsingState.lastScheduleIndexForCar = -1;

    const parsedWeekNumber = parseInt(weekMatch[1], 10);
    const currentDate = new Date(weekMatch[2]);

    // Heuristic for new series detection
    if (isNewSeriesHeuristic(parsedWeekNumber, currentDate, parsingState)) {
        const potentialSeriesName = parsingState.previousLine.trim();
        if (potentialSeriesName && !isStructuralOrDetailLine(potentialSeriesName) && !potentialSeriesName.match(SERIES_NAME_REGEX)) {
            if (DEBUG_LOGGING) {
                const reason = parsingState.lastParsedDate && currentDate < parsingState.lastParsedDate ? `date reset` : `week reset`;
                console.log(`%cNew series found (heuristic on ${reason}): "${potentialSeriesName}"`, 'color: orange; font-weight: bold;');
            }
            if (currentSeriesRef.current) {
                seriesData.push(currentSeriesRef.current);
            }
            const tocInfo = seriesClassMap.get(potentialSeriesName.replace(/^\d+\.\s*/, ''));
            currentSeriesRef.current = {
                season_name: potentialSeriesName.replace(/^\d+\.\s*/, ''),
                license_group: tocInfo ? (licenseLetterToGroupMap[tocInfo.license] || 0) : 0,
                discipline: tocInfo ? tocInfo.discipline : 'Unknown',
                track_types: [{ track_type: tocInfo ? tocInfo.discipline : 'Unknown' }],
                schedules: [], car_class: '', car_types: [], race_frequency: ''
            };
        }
    }

    parsingState.lastParsedWeekNum = parsedWeekNumber;
    parsingState.lastParsedDate = currentDate;

    let remainingLine = line.replace(WEEK_REGEX, '').trim();
    const weekNum = parseInt(weekMatch[1], 10) - 1;
    const startDateStr = weekMatch[2];

    const lapsRegex = /(\d+\s+(?:laps|mins))$/i;
    let laps = '';
    const lapsMatch = remainingLine.match(lapsRegex);
    if (lapsMatch) {
        laps = lapsMatch[1];
        remainingLine = remainingLine.replace(lapsRegex, '').trim();
    }

    // Updated regex to catch weather/setup info even if temperature is missing (e.g. "Rockingham... Constant weather")
    const weatherRegex = /([$]?\d+°F[\s\S]+)|((?:Constant weather|Rolling start|Standing start)[\s\S]+)/i;
    let weatherText = '';
    const weatherMatch = remainingLine.match(weatherRegex);
    if (weatherMatch) {
        weatherText = weatherMatch[0];
        remainingLine = remainingLine.replace(weatherRegex, '').trim();
    }

    let trackName = '';
    let configName = '';
    let weeklyCars = null;
    parsingState.expectCarForLastSchedule = false; // Reset expectation for the current line.

    const currentSeries = currentSeriesRef.current;
    if (currentSeries.season_name.includes("Ring Meister")) {
        trackName = "Nürburgring Nordschleife";
        configName = "Industriefahrten";

        // Attempt to strip the known track name from the line to find the car.
        const trackPattern = /Nürburgring Nordschleife\s*-\s*Industriefahrten/i;
        let potentialCar = remainingLine.replace(trackPattern, '').trim();

        // Clean up leading separators that might be left over.
        potentialCar = potentialCar.replace(/^-/, '').trim();

        if (potentialCar) {
            weeklyCars = potentialCar;
        } else {
            parsingState.expectCarForLastSchedule = true;
        }
    } else if (currentSeries.season_name.includes("Draft Master")) {
        const parts = remainingLine.split(/\s+-\s+/);
        if (parts.length >= 2) {
            const fullTrackName = parts.slice(0, -1).join(' - ').trim();
            let potentialCar = parts.pop().trim();

            // Check if the "car" is actually a config (common issue with Draft Master formatting)
            const commonConfigs = ['oval', 'road course', 'roval', 'legends', 'short', 'gp', 'international', 'national', 'club', 'grand prix', 'moto'];

            if (commonConfigs.includes(potentialCar.toLowerCase())) {
                configName = potentialCar;
                trackName = fullTrackName;
                weeklyCars = null;
                parsingState.expectCarForLastSchedule = true;
            } else {
                weeklyCars = potentialCar;

                const separator = " - ";
                const separatorIndex = fullTrackName.lastIndexOf(separator);
                if (separatorIndex !== -1) {
                    trackName = fullTrackName.substring(0, separatorIndex).trim();
                    configName = fullTrackName.substring(separatorIndex + separator.length).trim();
                } else {
                    trackName = fullTrackName;
                }
            }
        } else {
            trackName = remainingLine.trim();
            parsingState.expectCarForLastSchedule = true;
        }
    } else {
        const fullTrackString = remainingLine.split(' (')[0].trim();
        const separator = " - ";
        const separatorIndex = fullTrackString.lastIndexOf(separator);
        if (separatorIndex !== -1) {
            trackName = fullTrackString.substring(0, separatorIndex).trim();
            configName = fullTrackString.substring(separatorIndex + separator.length).trim();
        } else {
            trackName = fullTrackString;
        }
    }

    const rainRegex = /Rain chance (\d+)%/;
    const rainMatch = weatherText.match(rainRegex);

    currentSeries.schedules.push({
        race_week_num: weekNum,
        start_date: startDateStr,
        track: { track_name: trackName || 'N/A', config_name: configName || null },
        weekly_cars: weeklyCars,
        rain_chance: rainMatch ? parseInt(rainMatch[1], 10) : 0,
        laps: laps
    });

    if (parsingState.expectCarForLastSchedule) {
        parsingState.lastScheduleIndexForCar = currentSeries.schedules.length - 1;
    }

    return true;
};

/**
 * Handles a line that might be a car name for a previously parsed schedule week.
 */
const handleCarForScheduleLine = (line, currentSeries, parsingState, DEBUG_LOGGING) => {
    if (!parsingState.expectCarForLastSchedule || parsingState.lastScheduleIndexForCar === -1) {
        return false;
    }

    // If the line is blank, just ignore it and keep expecting a car.
    if (!line || line.trim().length === 0) {
        if (DEBUG_LOGGING) console.log(`  -> Ignoring blank line, still expecting car.`);
        return true; // Consumed the blank line, state remains the same.
    }

    const schedule = currentSeries.schedules[parsingState.lastScheduleIndexForCar];
    if (!schedule) {
        parsingState.expectCarForLastSchedule = false;
        parsingState.lastScheduleIndexForCar = -1;
        return false;
    }

    if (DEBUG_LOGGING) console.log(`Expecting car for "${currentSeries.season_name}", week ${schedule.race_week_num + 1}. Checking line: "${line}"`);

    if (!isStructuralOrDetailLine(line) && !line.match(SERIES_NAME_REGEX)) {
        let carName = line.trim();

        // Pre-process to remove artifacts instead of truncating
        carName = carName.replace(/Cautions disabled/gi, '');
        carName = carName.replace(/start\s*\//gi, ' '); // "start /" -> " " to keep Chevy+Camaro together
        carName = carName.replace(/start\b/g, ''); // Remove lower-case 'start' at end of word (Fordstart -> Ford)
        carName = carName.replace(/Chevroletstart/gi, 'Chevrolet'); // Specific fix for PDF text extraction error
        carName = carName.replace(/(\d{4})\s*(NASCAR)/g, '$1 / $2'); // Fix missing separator in Legends mashup (e.g. 1987NASCAR -> 1987 / NASCAR)

        // These keywords often appear after the car name on the same line.
        // We find the first one and truncate the string there.
        const structuralKeywords = [
            'Detached qual', 'Rolling start', 'Fixed Setup', 'Open Setup',
            'Local', 'Qualifying', 'Race', 'Warmup', 'Practice', 'Entries',
            'Penalty', 'advisory cautions', 'Qual scrutiny', 'Strict',
            'Cautions disabled'
        ];

        const specialTimePattern = /\(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\dx\)/;
        const timeMatch = carName.match(specialTimePattern);
        let splitIndex = -1;

        if (timeMatch) {
            splitIndex = timeMatch.index;
        }

        const lowerCarName = carName.toLowerCase();
        for (const keyword of structuralKeywords) {
            const index = lowerCarName.indexOf(keyword.toLowerCase());
            if (index !== -1 && (splitIndex === -1 || index < splitIndex)) {
                splitIndex = index;
            }
        }

        if (splitIndex !== -1) {
            carName = carName.substring(0, splitIndex);
        }

        // Clean up trailing characters that might be left over from the split.
        carName = carName.trim().replace(/[,-\s]+$/, '');

        if (DEBUG_LOGGING) console.log(`  -> Found car part: "${carName}"`);
        if (schedule.weekly_cars) {
            schedule.weekly_cars += ' ' + carName;
        } else {
            schedule.weekly_cars = carName;
        }

        // Apply fix for missing separators in Legends mashup on the FULL string
        // This handles cases where "1987" is on one line and "NASCAR" is on the next
        schedule.weekly_cars = schedule.weekly_cars.replace(/(\d{4})\s*(NASCAR)/g, '$1 / $2');

        return true;
    }

    // If we were expecting a car but found a structural line, reset the expectation.
    parsingState.expectCarForLastSchedule = false;
    parsingState.lastScheduleIndexForCar = -1;
    return false; // Line was not a car, needs further processing
};

const performPdfParsing = async (pdfFile, debug = false) => {
    const DEBUG_LOGGING = debug;
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

    const licenseLetterToGroupMap = { 'R': 1, 'D': 2, 'C': 3, 'B': 4, 'A': 5 };

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const seriesClassMap = await parseTableOfContents(pdf);
    if (DEBUG_LOGGING) downloadJson(Array.from(seriesClassMap.entries()), 'series-class-map.json');

    let seriesData = [];
    let allPageItems = [];
    let currentSeriesRef = { current: null };

    const parsingState = {
        expectCarForLastSchedule: false,
        lastScheduleIndexForCar: -1,
        lastParsedWeekNum: 0,
        lastParsedDate: null,
        previousLine: '',
    };

    const licenseClassMap = { 'Rookie': 1, 'D': 2, 'C': 3, 'B': 4, 'A': 5 };

    for (let i = 1; i <= pdf.numPages; i++) {
        if (DEBUG_LOGGING) console.log(`--- Parsing Page ${i} ---`);

        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        if (DEBUG_LOGGING) {
            allPageItems.push({ page: i, items: content.items });
        }

        const lines = content.items.reduce((acc, item) => {
            let line = acc.find(l => Math.abs(l.y - item.transform[5]) < 5);
            if (!line) {
                line = { y: item.transform[5], text: '' };
                acc.push(line);
            }
            line.text += item.str;
            return acc;
        }, []).sort((a, b) => b.y - a.y).map(l => l.text.trim());

        if (DEBUG_LOGGING) console.log(`Page ${i} lines:`, lines);

        for (const line of lines) {
            if (handleNewSeriesLine(line, seriesData, currentSeriesRef, seriesClassMap, licenseLetterToGroupMap)) {
                // Reset parsing state for the new series
                Object.assign(parsingState, {
                    expectCarForLastSchedule: false,
                    lastScheduleIndexForCar: -1,
                    lastParsedWeekNum: 0,
                    lastParsedDate: null,
                });
                parsingState.previousLine = line;
                continue;
            }

            if (currentSeriesRef.current) {
                if (handleCarForScheduleLine(line, currentSeriesRef.current, parsingState, DEBUG_LOGGING)) {
                    parsingState.previousLine = line;
                    continue;
                }
                if (handleSeriesInfoLine(line, currentSeriesRef.current, licenseClassMap, DEBUG_LOGGING)) {
                    parsingState.previousLine = line;
                    continue;
                }
                if (handleScheduleLine(line, seriesData, currentSeriesRef, parsingState, seriesClassMap, licenseLetterToGroupMap, DEBUG_LOGGING)) {
                    parsingState.previousLine = line;
                    continue;
                }
            }
            parsingState.previousLine = line;
        }
    }

    if (currentSeriesRef.current) {
        seriesData.push(currentSeriesRef.current);
    }

    if (DEBUG_LOGGING) {
        console.log('%c--- PDF Parsing Complete ---', 'color: blue; font-weight: bold;');
        console.log('Final seriesData:', seriesData);
    }

    const finalSeriesData = seriesData.filter(s => s.schedules.length > 0);

    return {
        seriesData: finalSeriesData,
        rawPdfJsOutput: allPageItems
    };
};

/**
 * A custom hook to encapsulate the logic for parsing iRacing PDF schedule files.
 * It handles loading the pdf.js library from a CDN and provides a parsing function.
 * @returns {{parsePdf: function(File, {debug: boolean}): Promise<Array>}} - An object containing the `parsePdf` function.
 */
export const usePdfParser = () => {
    const parsePdf = useCallback(async (pdfFile, options = {}) => {
        const { debug = false } = options; // Revert to default false, now controlled by App.jsx
        const { seriesData, rawPdfJsOutput } = await performPdfParsing(pdfFile, debug);

        if (debug) {
            downloadJson(seriesData, 'parsed-schedule.json');
            downloadJson(rawPdfJsOutput, 'pdfjs-raw-output.json');
        }

        return seriesData;
    }, []);

    return { parsePdf };
};
