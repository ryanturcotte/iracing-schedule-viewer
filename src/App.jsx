import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { trackNameReplacements, trackConfigReplacements, carConfigReplacements, timeReplacements } from './replacementMappings';

// PDF Parsing Logic - Re-engineered for column-based parsing
const parsePdfData = async (pdfFile) => {
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
    
    return seriesData.filter(s => s.schedules.length > 0 && s.schedules.length <= 12);
};

// Helper function to format track type strings
const formatTrackType = (type) => {
    if (!type || typeof type !== 'string') return '';
    return type
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};
// Component to display unique tracks from selected series
const TracksDisplayTable = ({ selectedSeriesData, isDarkMode, applyReplacements, isMinimizerActive }) => {
    const uniqueTracks = useMemo(() => {
        if (!selectedSeriesData || selectedSeriesData.length === 0) return [];
        const tracksSet = new Set();

        selectedSeriesData.forEach(series => {
            series.schedules?.forEach(schedule => {
                let trackPart = '';
                let configPart = '';

                // Extract track and config (similar to CalendarTable logic)
                if (schedule.track && typeof schedule.track === 'object' && schedule.track.track_name) {
                    trackPart = schedule.track.track_name;
                    configPart = schedule.track.config_name || '';
                } else if (schedule.track_name) { // PDF-like data
                    const separator = " - ";
                    const separatorIndex = schedule.track_name.lastIndexOf(separator);
                    if (separatorIndex !== -1) {
                        trackPart = schedule.track_name.substring(0, separatorIndex);
                        configPart = schedule.track_name.substring(separatorIndex + separator.length);
                    } else {
                        trackPart = schedule.track_name;
                    }
                }

                // Apply minimizer if active
                if (isMinimizerActive) {
                    trackPart = applyReplacements(trackPart, trackNameReplacements);
                    configPart = applyReplacements(configPart, trackConfigReplacements);
                }

                let trackDisplay = trackPart.trim();
                const configDisplay = configPart.trim();

                if (configDisplay && configDisplay.toLowerCase() !== 'oval' && configDisplay.toLowerCase() !== 'n/a' && configDisplay !== '') {
                    trackDisplay += ` - ${configDisplay}`;
                }
                
                if (trackDisplay) {
                    tracksSet.add(trackDisplay);
                }
            });
        });
        return Array.from(tracksSet).sort((a, b) => a.localeCompare(b));
    }, [selectedSeriesData, isMinimizerActive, applyReplacements]);

    if (uniqueTracks.length === 0) {
        return <p className={`text-sm ${isDarkMode ? 'text-neutral-400' : 'text-gray-600'}`}>No tracks to display for selected series.</p>;
    }

    return (
        <div>
            <h3 className={`text-xl font-semibold mb-3 ${isDarkMode ? 'text-neutral-200' : 'text-gray-700'}`}>Tracks in Selected Series ({uniqueTracks.length})</h3>
            <div className={`max-h-[60vh] overflow-y-auto border rounded-md p-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-850' : 'border-gray-300 bg-gray-50'}`}>
                <ul className={`list-disc list-inside space-y-1 ${isDarkMode ? 'text-neutral-300' : 'text-gray-700'}`}>
                    {uniqueTracks.map((track, index) => (
                        <li key={index} className="py-0.5">{track}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

// Main App component
const App = () => {
    const [seasonsData, setSeasonsData] = useState([]);
    const [availableFiles, setAvailableFiles] = useState([]); // Initialize as empty, will be populated from manifest
    const [fileDataMap, setFileDataMap] = useState(new Map());
    const [selectedDataSource, setSelectedDataSource] = useState('');
    const [selectedLicenseLevels, setSelectedLicenseLevels] = useState(new Set());
    const [selectedSeriesIds, setSelectedSeriesIds] = useState(new Set());
    const [selectedTrackTypes, setSelectedTrackTypes] = useState(new Set()); // New state for track types
    const [tableSeriesData, setTableSeriesData] = useState([]);
    const [showCalendarTable, setShowCalendarTable] = useState(false);
    const [message, setMessage] = useState('Please select a data source or upload a file.');
    const [isLoading, setIsLoading] = useState(true); // Start true while fetching manifest
    const [dataLoaded, setDataLoaded] = useState(false);
    const [carIdMap, setCarIdMap] = useState(new Map());
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [showSearchInput, setShowSearchInput] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [allSeriesSelected, setAllSeriesSelected] = useState(false);
    const [isMinimizerActive, setIsMinimizerActive] = useState(false); // State for minimizer
    
    // State for hover tooltip
    const [hoveredSeriesTracks, setHoveredSeriesTracks] = useState(null); // { seriesId: string, tracks: string[], position: { top: number, left: number } }
    const hoverTimerRef = useRef(null);

    const licenseLevelMap = { 1: 'Rookie', 2: 'D', 3: 'C', 4: 'B', 5: 'A', 0: 'Unknown' };
    const licenseColorMap = { 'Rookie': 'bg-red-500 text-white', 'D': 'bg-orange-500 text-white', 'C': 'bg-yellow-300 text-gray-800', 'B': 'bg-green-500 text-white', 'A': 'bg-blue-500 text-white', 'Unknown': 'bg-gray-400 text-white' };
    
    const displayableLicenseLevels = useMemo(() => {
        const allLevels = Object.entries(licenseLevelMap);
        const hasUnknownSeries = seasonsData.some(s => s.license_group_human_readable === 'Unknown');
        if (!hasUnknownSeries) {
            return allLevels.filter(([_, level]) => level !== 'Unknown');
        }
        return allLevels;
    }, [seasonsData]); // licenseLevelMap is constant

    const availableTrackTypes = useMemo(() => {
        if (!seasonsData || seasonsData.length === 0) return [];
        const types = new Set();
        seasonsData.forEach(season => { // Iterate through all track types for a season
            season.track_types?.forEach(tt => {
                if (tt.track_type) {
                    types.add(tt.track_type); // Store the raw type
                }
            });
        });
        return Array.from(types).sort();
    }, [seasonsData]);
    const seriesHasRainMap = useMemo(() => {
        const map = new Map();
        seasonsData.forEach(season => {
            const key = season.series_id || season.season_name;
            const hasRain = season.schedules?.some(sch => (sch.rain_chance || sch.track?.rain_chance || 0) > 0);
            map.set(key, hasRain);
        });
        return map;
    }, [seasonsData]);

    useEffect(() => {
        const fetchScheduleManifest = async () => {
            setIsLoading(true);
            setMessage('Loading available schedules...');
            try {
                const manifestUrl = `${import.meta.env.BASE_URL}schedules/manifest.json`;
                const response = await fetch(manifestUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch schedule manifest: ${response.status} ${response.statusText}`);
                }
                const manifestData = await response.json();
                if (Array.isArray(manifestData)) {
                    setAvailableFiles(manifestData);
                    if (manifestData.length > 0) {
                        setMessage('Please select a data source or upload a file.');
                    } else {
                        setMessage('No schedules found in manifest. Please upload a file.');
                    }
                } else {
                    throw new Error("Schedule manifest is not in the expected format (array).");
                }
            } catch (error) {
                console.error("Error fetching schedule manifest:", error);
                setMessage(`Error loading schedule list: ${error.message}. You can still upload a file.`);
                setAvailableFiles([]); // Fallback to empty or a default hardcoded list if preferred
            } finally {
                setIsLoading(false);
            }
        };
        fetchScheduleManifest();
    }, []); // Empty dependency array ensures this runs once on component mount

    // Helper to escape special characters for RegExp
    const escapeRegExp = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    };

    const applyReplacements = useCallback((text, replacementsList) => {
        if (!text || typeof text !== 'string' || !isMinimizerActive) return text;
        let newText = text;
        for (const rule of replacementsList) {
            // Using RegExp for case-insensitive global replacement
            newText = newText.replace(new RegExp(escapeRegExp(rule.original), 'gi'), rule.replacement);
        }
        return newText;
    }, [isMinimizerActive]);

    const applyCarListReplacements = useCallback((weeklyCarsString, replacementsList) => {
        if (!weeklyCarsString || typeof weeklyCarsString !== 'string' || !isMinimizerActive) return weeklyCarsString;

        // Split by common delimiters, apply replacements to each part, then rejoin.
        // This handles "Car A vs Car B" or "Car A / Car B"
        const delimiters = /(\s+vs\s+|\s*\/\s*|\s*,\s*)/i; // Regex to split by "vs", "/", or "," keeping delimiters for rejoining if needed, but we'll use a standard one.
        const parts = weeklyCarsString.split(delimiters);
        const processedParts = [];

        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) { // Car name part
                processedParts.push(applyReplacements(parts[i].trim(), replacementsList));
            } else { // Delimiter part - we'll standardize to " / "
                // We are not keeping original delimiters, but standardizing to " / " if multiple cars
            }
        }
        return processedParts.filter(p => p.trim() !== '').join(' / '); // Join valid processed car names with " / "
    }, [isMinimizerActive, applyReplacements]); // applyReplacements is already memoized with isMinimizerActive

    const processAndSetData = useCallback((data) => {
        if (!Array.isArray(data)) { return []; }
        const newCarIdMap = new Map();
        const processedData = data.map(season => {
            const schedulesWithDates = season.schedules?.map(s => ({...s, startDateObj: new Date(s.start_date + 'T00:00:00')})) || [];
            let isSameTrackEveryWeek = false;
            if (schedulesWithDates.length > 0) {
                const firstTrackName = schedulesWithDates[0].track?.track_name;
                isSameTrackEveryWeek = schedulesWithDates.every(s => s.track?.track_name === firstTrackName);
            }
            if (newCarIdMap.has(67) && newCarIdMap.get(67) === null) newCarIdMap.set(67, "Mazda MX-5 Cup");
            else if (!newCarIdMap.has(67)) newCarIdMap.set(67, "Mazda MX-5 Cup");
            return { ...season, schedules: schedulesWithDates, license_group_human_readable: licenseLevelMap[season.license_group] || 'Unknown', isSameTrackEveryWeek };
        });
        setCarIdMap(newCarIdMap);
        return processedData;
    }, []);
    
    const fetchFileContent = async (fileName, fileDataMap) => {
        if (fileDataMap.has(fileName)) {
            const file = fileDataMap.get(fileName);
            if (file.type.startsWith('application/json')) return JSON.parse(await file.text());
            if (file.type.startsWith('application/pdf')) return file;
        }
        try {
            // Files are expected in 'public/schedules/' in source, deployed to 'schedules/' at the base URL.
            // import.meta.env.BASE_URL is set by Vite based on the 'base' config (e.g., '/iracing-schedule-viewer/').
            const scheduleFileUrl = `${import.meta.env.BASE_URL}schedules/${fileName}`;
            const response = await fetch(scheduleFileUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            if (fileName.endsWith('.json')) return await response.json();
            if (fileName.endsWith('.pdf')) {
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/pdf")) {
                    return await response.blob();
                } else {
                    throw new Error(`Expected PDF, but received content type: ${contentType || 'N/A'} for ${fileName}`);
                }
            }
        } catch (e) { console.error(`Could not fetch hosted file ${fileName}:`, e); }
        throw new Error(`File ${fileName} not found or accessible. If not uploading, ensure the file path is correct on the server.`);
    };    

    const handleLoadData = useCallback(async () => {
        if (!selectedDataSource) { setMessage("Please select a file to load."); return; }
        setIsLoading(true);
        setDataLoaded(false);
        setSeasonsData([]);
        setMessage('Loading data...');
        try {
            const fileData = await fetchFileContent(selectedDataSource, fileDataMap);
            let rawData;
            if (selectedDataSource.endsWith('.pdf')) {
                setMessage('Parsing PDF... This may take a moment.');
                rawData = await parsePdfData(fileData);
                if (rawData && rawData.length > 0) {
                    setMessage(`Successfully parsed PDF: Found ${rawData.length} series.`);
                } else {
                    setMessage('PDF parsing failed: Could not find any series in the PDF. Please check the file format.');
                    setIsLoading(false);
                    return;
                }
            } else {
                rawData = fileData;
                setMessage(`Successfully loaded JSON: Found ${rawData.length} series.`);
            }
            const processedData = processAndSetData(rawData);
            setSeasonsData(processedData);
            setDataLoaded(true);
            setSelectedSeriesIds(new Set());
            setSelectedTrackTypes(new Set()); // Clear track type filter
            setShowCalendarTable(false);
            setTableSeriesData([]);
        } catch (error) {
            setMessage(`Error loading data: ${error.message}`);
            console.error('Error loading data:', error);
            setDataLoaded(false);
        } finally {
            // Also clear filters if loading fails or is just completed, to ensure a fresh state
            // setSelectedTrackTypes(new Set()); // Already handled in success, consider if needed for error too
            setIsLoading(false);
        }
    }, [selectedDataSource, fileDataMap, processAndSetData]);

    const handleFileChange = useCallback((event) => {
        const file = event.target.files[0];
        if (!file) return;
        const newFileName = file.name;
        setFileDataMap(prev => new Map(prev).set(newFileName, file));
        setAvailableFiles(prev => [...new Set([...prev, newFileName])]);
        setSelectedDataSource(newFileName);
        setMessage(`File "${newFileName}" ready. Click 'Load Data' to process.`);
    }, []);

    const filteredSeries = useMemo(() => {
        if (!seasonsData || !Array.isArray(seasonsData) || seasonsData.length === 0) return [];
        return seasonsData.filter(season => {
            if (!season || !season.license_group_human_readable) return false;
            const matchesLevel = selectedLicenseLevels.size === 0 || selectedLicenseLevels.has(season.license_group_human_readable);

            const seasonTrackTypesList = season.track_types?.map(tt => tt.track_type).filter(Boolean) || [];
            const matchesTrackType = selectedTrackTypes.size === 0 || (seasonTrackTypesList.length > 0 && seasonTrackTypesList.some(stt => selectedTrackTypes.has(stt)));

            const searchHaystack = `${season.series_name || ''} ${season.season_name || ''}`.toLowerCase();
            const matchesSearch = !searchTerm || searchHaystack.includes(searchTerm.toLowerCase());
            return matchesLevel && matchesSearch && matchesTrackType;
        });
    }, [seasonsData, selectedLicenseLevels, searchTerm, selectedTrackTypes]);

    const handleSelectAllChange = useCallback(() => {
        if (allSeriesSelected) {
            setSelectedSeriesIds(new Set());
        } else {
            const allIds = new Set(filteredSeries.map(s => s.series_id || s.season_name));
            setSelectedSeriesIds(allIds);
        }
    }, [allSeriesSelected, filteredSeries]);

    useEffect(() => {
        setAllSeriesSelected(filteredSeries.length > 0 && selectedSeriesIds.size === filteredSeries.length);
    }, [selectedSeriesIds, filteredSeries]);

    const handleLicenseLevelChange = useCallback((level) => { setSelectedLicenseLevels(prev => { const newSet = new Set(prev); if (newSet.has(level)) newSet.delete(level); else newSet.add(level); return newSet; }); }, []);
    const handleSearchToggle = useCallback(() => { setShowSearchInput(prev => !prev); setSearchTerm(''); }, []);
    const handleSearchChange = useCallback((event) => { setSearchTerm(event.target.value); }, []);
    const handleSeriesSelectionChange = useCallback((seriesId) => { setSelectedSeriesIds(prev => { const newSet = new Set(prev); if (newSet.has(seriesId)) newSet.delete(seriesId); else newSet.add(seriesId); return newSet; }); }, []);
    const handleTrackTypeChange = useCallback((type) => { setSelectedTrackTypes(prev => { const newSet = new Set(prev); if (newSet.has(type)) newSet.delete(type); else newSet.add(type); return newSet; }); }, []);

    const getTracksForSingleSeries = useCallback((series, minimizerActive, replacerFunc) => {
        if (!series || !series.schedules) return [];
        
        // Create a mutable copy and sort by race_week_num to ensure correct order
        const sortedSchedules = [...series.schedules].sort((a, b) => a.race_week_num - b.race_week_num);
        
        const weeklyTrackEntries = sortedSchedules.map(schedule => {
            let trackPart = '';
            let configPart = '';

            // Existing logic to extract trackPart and configPart
            if (schedule.track && typeof schedule.track === 'object' && schedule.track.track_name) {
                trackPart = schedule.track.track_name;
                configPart = schedule.track.config_name || '';
            } else if (schedule.track_name) { // PDF-like data
                const separator = " - ";
                const separatorIndex = schedule.track_name.lastIndexOf(separator);
                if (separatorIndex !== -1) {
                    trackPart = schedule.track_name.substring(0, separatorIndex);
                    configPart = schedule.track_name.substring(separatorIndex + separator.length);
                } else {
                    trackPart = schedule.track_name;
                }
            }

            if (minimizerActive) {
                trackPart = replacerFunc(trackPart, trackNameReplacements);
                configPart = replacerFunc(configPart, trackConfigReplacements);
            }

            let trackDisplay = trackPart.trim();
            const configDisplay = configPart.trim();

            if (configDisplay && configDisplay.toLowerCase() !== 'oval' && configDisplay.toLowerCase() !== 'n/a' && configDisplay !== '') {
                trackDisplay += ` - ${configDisplay}`;
            }

            const rainChance = schedule.rain_chance || schedule.track?.rain_chance || 0;
            
            return {
                text: `Week ${schedule.race_week_num + 1}: ${trackDisplay || 'N/A'}`,
                rainChance: rainChance
            };
        });
        return weeklyTrackEntries;
    }, []); // Assuming trackNameReplacements & trackConfigReplacements are stable or App re-renders if they change

    const handleSeriesMouseEnter = useCallback((event, seriesId) => {
        clearTimeout(hoverTimerRef.current);
        const currentTargetRect = event.currentTarget.getBoundingClientRect(); // Get rect immediately
        // console.log('Mouse enter on series:', seriesId); // Log 1: Check if event fires
        hoverTimerRef.current = setTimeout(() => {
            // console.log('Timer fired for series:', seriesId); // Log 2: Check if timer completes
            const series = seasonsData.find(s => (s.series_id || s.season_name) === seriesId); // seasonsData is from App's state
            if (series) {
                // console.log('Found series for tooltip:', series); // Log 3: Check the found series object
                const tracks = getTracksForSingleSeries(series, isMinimizerActive, applyReplacements); // isMinimizerActive & applyReplacements are from App's state/memoized
                // console.log('Tracks extracted for tooltip:', tracks); // Log 4: Check the extracted tracks
                if (tracks.length > 0) {
                    setHoveredSeriesTracks({ seriesId, tracks, position: { top: currentTargetRect.bottom + window.scrollY, left: currentTargetRect.left + window.scrollX } });
                } else {
                    // console.log('No tracks found (tracks.length is 0) for series:', seriesId); // Log 5: If tracks array is empty
                }
            } else {
                // console.log('Series not found in seasonsData for tooltip. ID:', seriesId); // Log 6: If series object is not found
            }
        }, 700); // 700ms delay
    }, [seasonsData, isMinimizerActive, applyReplacements, getTracksForSingleSeries]);

    const handleSeriesMouseLeave = useCallback(() => { clearTimeout(hoverTimerRef.current); setHoveredSeriesTracks(null); }, []);
    const messageRef = useRef(null);
    const seriesItemRefs = useRef({});
    const calendarTableRef = useRef(null);

    const getCarsForWeek = useCallback((season, schedule) => {
        if (!schedule) return 'N/A';
        if (schedule.weekly_cars) return schedule.weekly_cars;
        const carNames = new Set();
        const addCarName = (name) => { if (name && typeof name === 'string' && !name.startsWith('Car ID:')) carNames.add(name); };
        if (schedule.race_week_cars) schedule.race_week_cars.forEach(c => addCarName(c.car_name || carIdMap.get(c.car_id)));
        if (schedule.car_restrictions) schedule.car_restrictions.forEach(c => addCarName(c.car_name || carIdMap.get(c.car_id)));
        if (carNames.size === 0 && season.car_types) season.car_types.forEach(ct => addCarName(ct.car_type));
        if (carNames.size === 0) return 'N/A';
        return Array.from(carNames).join(', ');
    }, [carIdMap]);

    const generateCsv = useCallback(() => {
        // Correctly identify selected series using series_id if available, then season_name
        const selected = seasonsData.filter(season => selectedSeriesIds.has(season.series_id || season.season_name));
        if (selected.length === 0) {
            setMessage('Please select at least one series to generate CSV.');
            return;
        }

        const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
        
        let csvRows = [];
        const headerRow = ['RowType', ...selected.map(s => s.season_name)];
        csvRows.push(headerRow.map(escapeCsv).join(','));

        const dataRows = {
            Time: ['Time'], License: ['License'], Style: ['Style'], Name: ['Name']
        };
        for(let i=1; i<=12; i++) {
            dataRows[`Track${i}`] = [`Track${i}`];
        }

        selected.forEach(series => {
            const frequencyText = series.race_frequency ? applyReplacements(series.race_frequency, timeReplacements) : 'N/A';
            dataRows.Time.push(frequencyText);
            dataRows.License.push(series.license_group_human_readable || 'N/A');
            // Handle multiple track types for CSV, join formatted names
            const seriesStyles = series.track_types?.map(tt => formatTrackType(tt.track_type)).filter(Boolean).join(' / ') || 'N/A';
            dataRows.Style.push(seriesStyles);
            dataRows.Name.push(series.season_name);

            for (let i = 0; i < 12; i++) {
                const schedule = series.schedules.find(s => s.race_week_num === i);
                let cellData = '';

                if (schedule) {
                    let trackPart = '';
                    let configPart = '';
                    let weeklyCarsPart = ''; // For Draft Master/Ring Meister

                    // 1. Extract parts based on data structure
                    if (schedule.track && typeof schedule.track === 'object' && schedule.track.track_name) { // JSON data
                        trackPart = schedule.track.track_name;
                        configPart = schedule.track.config_name || '';
                    } else if (schedule.track_name) { // PDF-like data (track_name is a string "Track - Config")
                        const separator = " - ";
                        const separatorIndex = schedule.track_name.lastIndexOf(separator);
                        if (separatorIndex !== -1) {
                            trackPart = schedule.track_name.substring(0, separatorIndex);
                            configPart = schedule.track_name.substring(separatorIndex + separator.length);
                        } else {
                            trackPart = schedule.track_name; // Assume whole string is track if no separator
                        }
                    }

                    const isSpecialSeries = series.season_name.includes("Draft Master") || series.season_name.includes("Ring Meister");
                    if (isSpecialSeries && schedule.weekly_cars) {
                        weeklyCarsPart = schedule.weekly_cars; // This will be handled by carConfigReplacements later
                    }

                    const rainChance = schedule.rain_chance || schedule.track?.rain_chance || 0;
                    // 2. Apply minimizer if active (for track and track config)
                    if (isMinimizerActive) {
                        trackPart = applyReplacements(trackPart, trackNameReplacements);
                        configPart = applyReplacements(configPart, trackConfigReplacements);
                        // weeklyCarsPart will be minimized specifically for Draft Master/Ring Meister below
                    }

                    // 3. Construct cellData
                    if (isSpecialSeries) {
                        const minimizedCars = applyCarListReplacements(weeklyCarsPart, carConfigReplacements);
                        if (series.season_name.includes("Draft Master")) {
                            let displayTrack = trackPart;
                            if (configPart && configPart.toLowerCase() !== 'oval' && configPart.toLowerCase() !== 'n/a' && configPart.trim() !== '') {
                                displayTrack += ` - ${configPart}`;
                            }
                            cellData = `${displayTrack} - ${minimizedCars}`;
                        } else if (series.season_name.includes("Ring Meister")) {
                            cellData = minimizedCars;
                        }
                    } else {
                        cellData = trackPart;
                        if (configPart && configPart.toLowerCase() !== 'oval' && configPart.toLowerCase() !== 'n/a' && configPart.trim() !== '') {
                            cellData += ` - ${configPart}`;
                        }
                    }

                    if (rainChance > 0) {
                        cellData += ` (${rainChance}%)`;
                    }
                }
                dataRows[`Track${i+1}`].push(cellData);
            }
        });
        
        const csvContent = Object.values(dataRows).map(row => row.map(escapeCsv).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'iracing_schedule_pivoted.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setMessage('CSV generated successfully!');

    }, [seasonsData, selectedSeriesIds, getCarsForWeek, isMinimizerActive, applyReplacements, applyCarListReplacements]);

    const generateCalendarTable = useCallback(() => {
        const selected = seasonsData.filter(season => selectedSeriesIds.has(season.series_id || season.season_name));
        if (selected.length === 0) {
            setMessage('Please select at least one series to generate the calendar table.');
            return;
        }
        setTableSeriesData(selected);
        setShowCalendarTable(true);
        setMessage('Calendar table generated!');
    }, [seasonsData, selectedSeriesIds]); // isMinimizerActive & applyReplacements are passed to CalendarTable, not used directly here
    const CalendarTable = React.forwardRef(({ seriesData, isDarkMode, getCarsForWeek, applyReplacements, isMinimizerActive, timeReplacements: localTimeReplacements }, ref) => {
        if (!seriesData || seriesData.length === 0) return null;
        
        const allSchedules = seriesData.flatMap(s => s.schedules);
        if (allSchedules.length === 0) return <p>No schedules found for selected series.</p>;

        const dates = allSchedules.map(s => s.startDateObj);
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        
        const calendarWeeks = [];
        let currentWeekStart = new Date(minDate);
        currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());

        while(currentWeekStart <= maxDate) {
            const currentWeekEnd = new Date(currentWeekStart);
            currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
            calendarWeeks.push({ start: currentWeekStart, end: currentWeekEnd });
            currentWeekStart = new Date(currentWeekEnd);
            currentWeekStart.setDate(currentWeekStart.getDate() + 1);
        }

        return (
            <div ref={ref} className={`mt-8 p-6 shadow-lg border ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`text-2xl font-semibold mb-4 ${isDarkMode ? 'text-neutral-200' : 'text-blue-700'}`}>Generated Calendar Schedule</h2>
                <div className="overflow-x-auto">
                    <table className={`min-w-full divide-y ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
                        <thead className={isDarkMode ? 'bg-neutral-900' : 'bg-gray-50'}>
                            <tr>
                                <th scope="col" className={`px-6 py-3 text-left text-xs font-medium ${isDarkMode ? 'text-neutral-300' : 'text-gray-500'} uppercase`}>Week</th>
                                {seriesData.map(season => (
                                    <th key={season.series_id || season.season_name} scope="col" className={`px-3 py-3 text-left text-xs font-medium ${isDarkMode ? 'text-neutral-300' : 'text-gray-500'} uppercase`}>
                                        <div className="text-center">{season.season_name}</div> {/* Centered series name */}
                                        {season.race_frequency && (
                                            <div className={`text-[0.65rem] leading-tight ${isDarkMode ? 'text-neutral-400' : 'text-gray-400'} font-normal normal-case text-center`}> {/* Centered frequency */}
                                                {applyReplacements(season.race_frequency, localTimeReplacements)}
                                            </div>
                                        )}
                                    </th>
                                
                                ))}
                            </tr>
                        </thead>
                        <tbody className={`${isDarkMode ? 'bg-neutral-800' : 'bg-white'} divide-y ${isDarkMode ? 'divide-neutral-700' : 'divide-gray-200'}`}>
                            {calendarWeeks.map((week, i) => (
                                <tr key={i}>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${isDarkMode ? 'text-neutral-100' : 'text-gray-900'} text-center`}>{i + 1}</td>
                                    {seriesData.map(season => {
                                        const schedule = season.schedules?.find(s => s.startDateObj >= week.start && s.startDateObj <= week.end);
                                        let cellContentHtml = 'N/A';
                                        if (schedule) {
                                            let trackPart = '';
                                            let configPart = '';
                                            let weeklyCarsPart = ''; // For Draft/Ring Meister

                                            // 1. Extract parts
                                            if (schedule.track && typeof schedule.track === 'object' && schedule.track.track_name) { // JSON
                                                trackPart = schedule.track.track_name;
                                                configPart = schedule.track.config_name || '';
                                            } else if (schedule.track_name) { // PDF-like
                                                const separator = " - ";
                                                const separatorIndex = schedule.track_name.lastIndexOf(separator);
                                                if (separatorIndex !== -1) {
                                                    trackPart = schedule.track_name.substring(0, separatorIndex);
                                                    configPart = schedule.track_name.substring(separatorIndex + separator.length);
                                                } else {
                                                    trackPart = schedule.track_name;
                                                }
                                            }

                                            const isSpecialSeries = season.season_name.includes('Draft Master') || season.season_name.includes('Ring Meister');
                                            if (isSpecialSeries && schedule.weekly_cars) {
                                                weeklyCarsPart = schedule.weekly_cars; // Will be processed by carConfigReplacements later
                                            }

                                            // 2. Apply minimizer (for track and track config)
                                            if (isMinimizerActive) {
                                                trackPart = applyReplacements(trackPart, trackNameReplacements);
                                                configPart = applyReplacements(configPart, trackConfigReplacements);
                                                // weeklyCarsPart for special series will be minimized below
                                            }

                                            // 3. Construct display parts
                                            let trackNameForDisplay;
                                            let subTextForDisplay = '';

                                            if (isSpecialSeries) {
                                                const minimizedCars = applyCarListReplacements(weeklyCarsPart, carConfigReplacements);
                                                if (season.season_name.includes("Draft Master")) {
                                                    trackNameForDisplay = trackPart; // Already minimized if active
                                                    if (configPart && configPart.toLowerCase() !== 'oval' && configPart.toLowerCase() !== 'n/a' && configPart.trim() !== '') {
                                                        trackNameForDisplay += ` - ${configPart}`; // Already minimized if active
                                                    }
                                                    subTextForDisplay = minimizedCars; // Car type as subtext
                                                } else if (season.season_name.includes("Ring Meister")) {
                                                    trackNameForDisplay = minimizedCars; // Only car type
                                                    // subTextForDisplay remains empty or could be track if desired, but request implies only car type
                                                }
                                            } else {
                                                trackNameForDisplay = trackPart;
                                                if (configPart && configPart.toLowerCase() !== 'oval' && configPart.toLowerCase() !== 'n/a' && configPart.trim() !== '') {
                                                    trackNameForDisplay += ` - ${configPart}`;
                                                }
                                                subTextForDisplay = schedule.laps ? `${schedule.laps}` : '';
                                            }

                                            const rainChance = schedule.rain_chance || schedule.track?.rain_chance || 0;
                                            let trackDisplayHtml = `<span class="font-semibold">${trackNameForDisplay || 'N/A'}</span>`;
                                            if (rainChance > 0) {
                                                trackDisplayHtml = `<span class="text-blue-400 ml-1">${trackNameForDisplay || 'N/A'} (${rainChance}%)</span>`;
                                            }
                                            cellContentHtml = `<div class="flex flex-col">${trackDisplayHtml}<span class="text-xs ${isDarkMode ? 'text-neutral-400' : 'text-gray-600'}">${subTextForDisplay || ''}</span></div>`;
                                        }
                                        return <td key={`${season.series_id || season.season_name}-${i}`} className={`px-3 py-4 whitespace-nowrap text-sm ${isDarkMode ? 'text-neutral-100' : 'text-gray-500'}`} dangerouslySetInnerHTML={{ __html: cellContentHtml }}></td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    });
    
    return (
        <div className={`min-h-screen p-4 font-inter transition-colors duration-300 ${isDarkMode ? 'bg-neutral-950 text-neutral-100' : 'bg-gray-100 text-gray-800'}`}>
            <style>{`::selection { background-color: #3b82f6; color: #ffffff; } .fade-enter { opacity: 0; } .fade-enter-active { opacity: 1; transition: opacity 200ms; } .fade-exit { opacity: 1; } .fade-exit-active { opacity: 0; transition: opacity 200ms; } .table-appear { opacity: 0; transform: translateY(20px); } .table-appear-active { opacity: 1; transform: translateY(0); transition: opacity 300ms, transform 300ms; } `}</style>
            <div className={`max-w-7xl mx-auto shadow-lg p-6 sm:p-8 transition-colors duration-300 ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}>
                <h1 className={`text-3xl sm:text-4xl font-bold text-center mb-8 relative ${isDarkMode ? 'text-neutral-100' : 'text-blue-700'}`}>iRacing Schedule Viewer and Spreadsheet Creator
                    <button
                        onClick={() => setIsDarkMode(prevMode => !prevMode)}
                        className={`absolute top-0 right-14 p-2 m-2 rounded-full shadow-md hover:shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500
                        ${isDarkMode
                            ? 'bg-neutral-800 text-neutral-200' // Dark mode active: dark button, light icon (sun) is light
                            : 'bg-gray-200 text-gray-800' // Light mode active: light button, icon (moon) needs to be visible
                        }`
                        }
                        title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    >
                        {isDarkMode ? (
                        // Sun icon for light mode (displayed when in dark mode, to toggle to light mode)
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                        </svg>
                        ) : (
                        // Moon icon for dark mode (displayed when in light mode, to toggle to dark mode)
                        // Added explicit stroke="black" to ensure visibility in light mode.
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="black">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9 9 0 008.354-5.646z" />
                        </svg>
                        )}
                    </button>
                    <a
                        href="https://github.com/ryanturcotte/iracing-schedule-viewer/#how-to-use"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`absolute top-0 right-0 p-2 m-2 rounded-full shadow-md hover:shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base
                        ${isDarkMode ? 'bg-neutral-800 text-neutral-200' : 'bg-gray-200 text-gray-800'}`}
                        title="How to use"
                    >
                        ❓
                    </a>
                </h1>           
                <div className={`mb-8 p-6 shadow-inner ${isDarkMode ? 'bg-neutral-800' : 'bg-yellow-50'}`}>
                    <h2 className={`text-2xl font-semibold mb-4 ${isDarkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>Select Data Source</h2>
                    <div className="flex items-center gap-4">
                        <select value={selectedDataSource} onChange={e => setSelectedDataSource(e.target.value)} className={`grow p-2 border rounded-md shadow-xs ${isDarkMode ? 'bg-neutral-700 border-neutral-600' : 'bg-white border-gray-300'}`}>
                            <option value="" disabled>Select a source...</option>
                            {availableFiles.map(file => <option key={file} value={file}>{file}</option>)}
                        </select>
                        <button onClick={handleLoadData} disabled={isLoading || !selectedDataSource} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                            {isLoading ? 'Loading...' : 'Load Data'}
                        </button>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                        <div>
                            <span className={`text-sm ${isDarkMode ? 'text-neutral-400' : 'text-gray-600'}`}>or upload a custom file:</span>
                            <input type="file" accept=".json,.pdf" onChange={handleFileChange} className={`block w-full text-sm mt-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold ${isDarkMode ? 'text-neutral-300 file:bg-neutral-700 file:text-neutral-200' : 'file:bg-blue-50 file:text-blue-700'}`} />
                        </div>
                        <a href={`${import.meta.env.BASE_URL}excel template/Template.xlsx`} download="iRacingScheduleTemplate.xlsx" className={`text-sm font-medium px-4 py-2 rounded-md shadow-sm ${isDarkMode ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}>
                            Download Excel Template
                        </a>
                    </div>
                </div>

                <TransitionGroup>
                  {message && ( 
                    <CSSTransition nodeRef={messageRef} key="message-transition" timeout={200} classNames="fade">
                        <div ref={messageRef} className={`mb-6 p-3 shadow-xs text-center ${isDarkMode ? 'bg-blue-900' : 'bg-blue-100 text-blue-800'} rounded-md`}>{message}</div>
                    </CSSTransition> 
                  )}
                </TransitionGroup>

                {dataLoaded && !isLoading && (
                    <>
                        {/* Container for Series List and Tracks Table */}
                        <div className="flex flex-col md:flex-row gap-6 mb-8">
                            {/* Available Series Section */}
                            <div className={`md:w-2/3 p-6 shadow-inner ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                                <div className="flex items-center mb-4">
                                    <h2 className={`text-2xl font-semibold ${isDarkMode ? 'text-neutral-200' : 'text-gray-700'}`}>Select Series ({filteredSeries.length})</h2>
                                    <label className="flex items-center ml-auto space-x-2 cursor-pointer mr-4">
                                        <input type="checkbox" checked={allSeriesSelected} onChange={handleSelectAllChange} className="form-checkbox h-5 w-5 text-blue-600 rounded-sm focus:ring-blue-500"/>
                                        <span className={`${isDarkMode ? 'text-neutral-100' : 'text-gray-700'}`}>Select All</span>
                                    </label>
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={isMinimizerActive}
                                            onChange={() => setIsMinimizerActive(prev => !prev)}
                                            className="form-checkbox h-5 w-5 text-blue-600 rounded-sm focus:ring-blue-500"
                                        />
                                        <span className={`${isDarkMode ? 'text-neutral-100' : 'text-gray-700'}`}>Minimize Text</span>
                                    </label>
                                    <button onClick={handleSearchToggle} className={`ml-3 p-1 rounded-full ${isDarkMode ? 'text-neutral-300 hover:text-white' : 'text-gray-600 hover:text-black'}`}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.197 5.197a7.5 7.5 0 0 0 10.607 10.607Z" /></svg></button>
                                    <input type="text" placeholder="Search..." value={searchTerm} onChange={handleSearchChange} className={`ml-4 px-3 py-1.5 border rounded-md shadow-xs transition-all ${showSearchInput ? 'w-64 opacity-100' : 'w-0 opacity-0'} ${isDarkMode ? 'bg-neutral-700 border-neutral-600' : 'bg-white border-gray-300'}`} />
                                </div>
                                <div className="max-h-[60vh] overflow-y-auto">
                                    <TransitionGroup>
                                        {filteredSeries.map(season => {
                                            if (!season || !season.season_name) return null;
                                            const seriesKey = season.series_id || season.season_name;
                                            if (!seriesItemRefs.current[seriesKey]) seriesItemRefs.current[seriesKey] = React.createRef();
                                            const nodeRef = seriesItemRefs.current[seriesKey];

                                            return (
                                                <CSSTransition key={seriesKey} nodeRef={nodeRef} timeout={300} classNames="fade">
                                                    <div 
                                                        ref={nodeRef} 
                                                        className={`p-4 mb-2 rounded-md shadow-md transition-colors ${selectedSeriesIds.has(seriesKey) ? (isDarkMode ? 'bg-green-800 hover:bg-green-700' : 'bg-green-100 hover:bg-green-200') : (isDarkMode ? 'bg-neutral-900 hover:bg-neutral-700' : 'bg-white hover:bg-gray-100')}`}
                                                        onMouseEnter={(e) => handleSeriesMouseEnter(e, seriesKey)}
                                                        onMouseLeave={handleSeriesMouseLeave}
                                                        role="button" // For accessibility, as it has hover interaction
                                                        tabIndex={0} // Make it focusable
                                                    >
                                                        <label className="flex items-center space-x-3 cursor-pointer">
                                                            <input type="checkbox" checked={selectedSeriesIds.has(seriesKey)} onChange={() => handleSeriesSelectionChange(seriesKey)} className="form-checkbox h-6 w-6 text-blue-600 rounded focus:ring-blue-500 shrink-0" />
                                                            <span className={`flex items-center justify-between w-full text-lg font-bold ${isDarkMode ? 'text-neutral-100' : 'text-gray-800'}`}>
                                                                <span className="flex items-center"> {/* Group name and rain icon */}
                                                                    <span>{season.season_name || "Invalid Series Name"}</span>
                                                                    {seriesHasRainMap.get(seriesKey) && <span className="ml-2 text-lg" role="img" aria-label="rain chance">🌧️</span>}
                                                                    {/* Display Track Type(s)/Style(s) */}
                                                                    {season.track_types && season.track_types.length > 0 && (
                                                                        season.track_types.map(tt => tt.track_type).filter(Boolean).map(type => (
                                                                            <span key={type} className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded ${isDarkMode ? 'bg-neutral-700 text-neutral-300' : 'bg-gray-200 text-gray-600'}`}>
                                                                                {formatTrackType(type)}
                                                                            </span>
                                                                        ))
                                                                    )}
                                                                </span>
                                                                {season.race_frequency && !season.isSameTrackEveryWeek && ( // Only show frequency if not same track every week
                                                                    <span className={`text-xs font-normal normal-case ${isDarkMode ? 'text-neutral-400' : 'text-gray-500'}`}>
                                                                        {applyReplacements(season.race_frequency, timeReplacements)}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </label>
                                                    </div>
                                                </CSSTransition>
                                            );
                                        })}
                                    </TransitionGroup>
                                </div>
                            </div>

                            {/* Right Column for Filters and Tracks Display */}
                            <div className="md:w-1/3 flex flex-col gap-6">
                                {/* Filter Series Section */}
                                <div className={`p-6 shadow-inner ${isDarkMode ? 'bg-neutral-800' : 'bg-blue-50'}`}>
                                    <h2 className={`text-2xl font-semibold mb-4 ${isDarkMode ? 'text-neutral-200' : 'text-blue-600'}`}>Filter Series</h2>
                                    <div className="flex flex-col md:flex-row md:gap-6"> {/* New wrapper for side-by-side layout */}
                                        {/* License Level Filter Section */}
                                        <div className="flex-1 mb-6 md:mb-0">
                                            <h3 className={`text-lg font-medium mb-3 ${isDarkMode ? 'text-neutral-300' : 'text-gray-700'}`}>By License Level:</h3>
                                            <div className="flex flex-col items-start gap-2">
                                                {displayableLicenseLevels.map(([id, level]) => (
                                                    <label key={id} className={`flex items-center space-x-2 cursor-pointer px-4 py-2 rounded-full shadow-xs transition-all ${
                                                        licenseColorMap[level]
                                                    } ${
                                                        selectedLicenseLevels.has(level) ? 'ring-2 ring-offset-2 ring-offset-transparent ring-white' : 'opacity-80 hover:opacity-100'
                                                    }`}><input type="checkbox" checked={selectedLicenseLevels.has(level)} onChange={() => handleLicenseLevelChange(level)} className="form-checkbox h-5 w-5" /><span>{level}</span></label>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Track Type Filter Section */}
                                        {availableTrackTypes.length > 0 && (
                                            <div className="flex-1 mb-6 md:mb-0">
                                                <h3 className={`text-lg font-medium mb-3 ${isDarkMode ? 'text-neutral-300' : 'text-gray-700'}`}>By Track Type:</h3>
                                                <div className="flex flex-col items-start gap-2">
                                                    {availableTrackTypes.map((type) => (
                                                        <label key={type} className={`flex items-center space-x-2 cursor-pointer px-4 py-2 rounded-full shadow-xs transition-all text-sm ${
                                                            selectedTrackTypes.has(type)
                                                                ? (isDarkMode ? 'bg-blue-600 text-white ring-2 ring-offset-2 ring-offset-transparent ring-white' : 'bg-blue-500 text-white ring-2 ring-offset-2 ring-offset-transparent ring-white')
                                                                : (isDarkMode ? 'bg-neutral-600 text-neutral-200 opacity-80 hover:opacity-100' : 'bg-gray-300 text-gray-800 opacity-80 hover:opacity-100')
                                                        }`}>
                                                            <input type="checkbox" checked={selectedTrackTypes.has(type)} onChange={() => handleTrackTypeChange(type)} className="form-checkbox h-5 w-5" />
                                                            <span>{formatTrackType(type)}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Tracks Display Section - Conditionally rendered */}
                                {tableSeriesData.length > 0 && (
                                    <div className={`p-6 shadow-inner ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                                        <TracksDisplayTable
                                            selectedSeriesData={tableSeriesData}
                                            isDarkMode={isDarkMode}
                                            applyReplacements={applyReplacements}
                                            isMinimizerActive={isMinimizerActive} />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
                           <button onClick={generateCsv} className="flex-1 bg-green-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-green-700">Generate CSV</button>
                           <button onClick={generateCalendarTable} className="flex-1 bg-purple-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-purple-700">Generate Calendar Table</button>
                        </div>
                    </>
                 )}
                 
                 <TransitionGroup>
                  {showCalendarTable && tableSeriesData.length > 0 && (
                    <CSSTransition nodeRef={calendarTableRef} key="calendar-table-transition" timeout={500} classNames="table-appear">
                      <CalendarTable ref={calendarTableRef} seriesData={tableSeriesData} isDarkMode={isDarkMode} getCarsForWeek={getCarsForWeek} applyReplacements={applyReplacements} isMinimizerActive={isMinimizerActive} timeReplacements={timeReplacements} />
                    </CSSTransition>
                  )}
                </TransitionGroup>

                {/* Track Tooltip */}
                {hoveredSeriesTracks && hoveredSeriesTracks.tracks.length > 0 && (
                    <div
                        style={{ top: hoveredSeriesTracks.position.top + 8, left: hoveredSeriesTracks.position.left }}
                        className={`absolute z-50 p-3 rounded-md shadow-xl text-sm w-auto max-w-sm
                                    ${isDarkMode ? 'bg-neutral-700 border border-neutral-600 text-neutral-100'
                                                : 'bg-white border border-gray-300 text-gray-800'}`}
                    >
                        <h4 className="font-semibold mb-1 text-sm">Tracks for this series:</h4>
                        <ul className="max-h-72 overflow-y-auto space-y-0.5"> {/* Increased max-h for more lines, width increased via max-w-sm */}
                            {hoveredSeriesTracks.tracks.map((trackInfo, index) => (
                                <li key={index}>
                                    <span className={trackInfo.rainChance > 0 ? 'text-blue-400' : ''}>
                                        {trackInfo.text}
                                    </span>
                                    {trackInfo.rainChance > 0 && (
                                        <span className="text-blue-400 ml-1">({trackInfo.rainChance}%)</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
