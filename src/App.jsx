import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { trackNameReplacements, trackConfigReplacements, carConfigReplacements, timeReplacements } from './replacementMappings';
import { usePdfParser } from './hooks/usePdfParser';
import { useFileLoader } from './hooks/useFileLoader';
import TracksDisplayTable from './components/TracksDisplayTable';
import CalendarTable from './components/CalendarTable';
import { setCookie, getCookie } from './utils/cookies';
import { formatTrackType } from './utils/formatting';
import { generateCsv as exportToCsv } from './utils/csvExporter';
import { useAppSettings } from './hooks/useAppSettings';
import { useSeriesFilters } from './hooks/useSeriesFilters';

// Helper function for formatting
const toTitleCase = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
};

// Main App component
const App = () => {
    const { parsePdf } = usePdfParser();
    const { loadFile } = useFileLoader();
    const [seasonsData, setSeasonsData] = useState([]);
    const [availableFiles, setAvailableFiles] = useState([]); // Initialize as empty, will be populated from manifest
    const [fileDataMap, setFileDataMap] = useState(new Map());
    const [selectedDataSource, setSelectedDataSource] = useState(() => getCookie('selectedDataSource') ?? '');
    const [tableSeriesData, setTableSeriesData] = useState([]);
    const [showCalendarTable, setShowCalendarTable] = useState(false);    const [showDataSourceSelector, setShowDataSourceSelector] = useState(() => !getCookie('selectedDataSource'));
    const [message, setMessage] = useState('Please select a data source or upload a file.');
    const [isLoading, setIsLoading] = useState(false); // Start false, will be set true during loads
    const [dataLoaded, setDataLoaded] = useState(false);
    const [carIdMap, setCarIdMap] = useState(new Map());
    const initialLoadPerformed = useRef(false);
    const initialTableGenerationAttempted = useRef(false); // To prevent re-generating table on every render
    // State for hover tooltip
    const [hoveredSeriesTracks, setHoveredSeriesTracks] = useState(null); // { seriesId: string, tracks: string[], position: { top: number, left: number } }
    const hoverTimerRef = useRef(null);
    const dataSourceRef = useRef(null);
    const messageRef = useRef(null);
    const seriesItemRefs = useRef({});
    const calendarTableRef = useRef(null);

    const {
        isDarkMode, setIsDarkMode,
        isMinimizerActive, setIsMinimizerActive,
        isDebugMode,
        resetAppSettings
    } = useAppSettings();

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

    const availableDisciplines = useMemo(() => {
        if (!seasonsData || seasonsData.length === 0) return [];
        const disciplines = new Set(seasonsData.map(s => s.discipline).filter(d => d && d !== 'Unknown'));
        return Array.from(disciplines).sort();
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

    const {
        selectedLicenseLevels,
        selectedSeriesIds,
        setSelectedSeriesIds,
        selectedTrackTypes,
        setSelectedTrackTypes,
        searchTerm,
        showSearchInput,
        filterByRain,
        setFilterByRain,
        includeYearLongSeries,
        setIncludeYearLongSeries,
        allSeriesSelected,
        filteredSeries,
        handleLicenseLevelChange,
        handleSearchToggle,
        handleSearchChange,
        handleSeriesSelectionChange,
        handleTrackTypeChange,
        handleSelectAllChange,
        resetFilters
    } = useSeriesFilters(seasonsData, seriesHasRainMap);

    // State for the new Discipline filter
    const [selectedDisciplines, setSelectedDisciplines] = useState(() => new Set(getCookie('selectedDisciplines') ? JSON.parse(getCookie('selectedDisciplines')) : []));

    const handleDisciplineChange = useCallback((discipline) => {
        setSelectedDisciplines(prev => {
            const newSet = new Set(prev);
            newSet.has(discipline) ? newSet.delete(discipline) : newSet.add(discipline);
            return newSet;
        });
    }, []);

    // Effect to save selections to cookies
    // Save cookies for 90 days, about the length of an iRacing season.
    useEffect(() => {
        setCookie('selectedSeriesIds', selectedSeriesIds, 90); 
        setCookie('selectedLicenseLevels', selectedLicenseLevels, 90);
        setCookie('selectedTrackTypes', selectedTrackTypes, 90);
        setCookie('selectedDataSource', selectedDataSource, 90);
        setCookie('isMinimizerActive', isMinimizerActive, 90);
        setCookie('includeYearLongSeries', includeYearLongSeries, 90);
        setCookie('isDarkMode', isDarkMode, 90);
        setCookie('filterByRain', filterByRain, 90);
        setCookie('selectedDisciplines', JSON.stringify(Array.from(selectedDisciplines)), 90);
    }, [selectedSeriesIds, selectedLicenseLevels, selectedTrackTypes, selectedDataSource, isMinimizerActive, includeYearLongSeries, isDarkMode, filterByRain]);

    useEffect(() => {
        const fetchScheduleManifest = async () => {
            // No longer setting isLoading to true here, to allow auto-load to manage it.
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
                        // If no data source is set from a cookie, default to the first one from the manifest.
                        if (!getCookie('selectedDataSource')) {
                            setSelectedDataSource(manifestData[0]);
                        }
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
                // No longer setting isLoading to false here.
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
        if (!weeklyCarsString || typeof weeklyCarsString !== 'string' || !isMinimizerActive) {
            return weeklyCarsString;
        }

        const multiCarDelimiterRegex = /\s*(\/|,|vs)\s*/;

        // Helper to create a canonical representation of a car list string.
        const createCanonical = (str, stripPunctuation = false) => {
            let processedStr = str;
            if (stripPunctuation) {
                processedStr = processedStr.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
            }
            return processedStr
                .split(/\s*(?:\/|vs|,)\s*/)
                .map(c => c.trim().toLowerCase())
                .filter(Boolean)
                .sort()
                .join(', ');
        };

        const canonicalInput = createCanonical(weeklyCarsString);
        const canonicalInputNoPunct = createCanonical(weeklyCarsString, true);

        // --- Multi-car rule matching ---
        for (const rule of replacementsList) {
            if (multiCarDelimiterRegex.test(rule.original)) {
                const canonicalRule = createCanonical(rule.original);
                if (canonicalInput === canonicalRule) return rule.replacement;

                const canonicalRuleNoPunct = createCanonical(rule.original, true);
                if (canonicalInputNoPunct && canonicalInputNoPunct === canonicalRuleNoPunct) {
                    return rule.replacement;
                }
            }
        }

        // --- Single-car rule matching (fallback) ---
        const delimiters = /(\s+vs\s+|\s*\/\s*|\s*,\s*)/i;
        const parts = weeklyCarsString.split(delimiters);
        const processedParts = [];
        const singleCarRules = replacementsList.filter(r => !multiCarDelimiterRegex.test(r.original));

        const findSingleCarReplacement = (carPart) => {
            for (const rule of singleCarRules) {
                if (rule.original.toLowerCase() === carPart.toLowerCase()) return rule.replacement;
            }
            const strip = (str) => str.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            const strippedCarPart = strip(carPart);
            if (strippedCarPart) {
                for (const rule of singleCarRules) {
                    if (strip(rule.original) === strippedCarPart) return rule.replacement;
                }
            }
            return carPart;
        };

        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) { // Car name part
                const carPart = parts[i].trim();
                if (carPart) {
                    processedParts.push(findSingleCarReplacement(carPart));
                }
            }
        }
        return processedParts.filter(p => p.trim() !== '').join(' / ');
    }, [isMinimizerActive]);

    const processAndSetData = useCallback((data) => {
        if (!Array.isArray(data)) { return []; }
        const newCarIdMap = new Map();
        const processedData = data.map(season => {
            // iRacing weeks are based on UTC. Append 'Z' to treat date strings as UTC.
            // This prevents the user's local timezone from shifting the date.
            const schedulesWithDates = season.schedules?.map(s => {
                const schedule = { ...s, startDateObj: new Date(s.start_date + 'T00:00:00Z') };

                // Hoist weather data from the nested weather_summary object for easier access.
                const weatherSummary = schedule.weather?.weather_summary;
                if (weatherSummary) {
                    schedule.rain_chance = weatherSummary.precip_chance;
                    schedule.max_precip_rate = weatherSummary.max_precip_rate;
                    schedule.max_precip_rate_desc = weatherSummary.max_precip_rate_desc;
                }

                return schedule;
            }) || [];
            let isSameTrackEveryWeek = false;
            if (schedulesWithDates.length > 0) {
                const firstTrackName = schedulesWithDates[0].track?.track_name;
                isSameTrackEveryWeek = schedulesWithDates.every(s => s.track?.track_name === firstTrackName);
            }

            // Detect series like Ring Meister: same track, but different cars weekly.
            let isDifferentCarEveryWeek = false;
            if (schedulesWithDates.length > 1) {
                const getCarsStringForSchedule = (schedule) => {
                    // This logic needs to be self-contained as it runs before carIdMap is fully populated.
                    if (schedule.weekly_cars) return schedule.weekly_cars; // From PDF parser
                    if (schedule.race_week_cars && schedule.race_week_cars.length > 0) {
                        // Use car_name if available, otherwise car_id. Sort for consistent comparison.
                        return schedule.race_week_cars.map(c => c.car_name || `id:${c.car_id}`).sort().join(',');
                    }
                    // Fallback to season-level car types if week-specific cars aren't defined.
                    if (season.car_types && season.car_types.length > 0) {
                        return season.car_types.map(ct => ct.car_type).sort().join(',');
                    }
                    return 'N/A'; // No car data found for this schedule
                };

                const carSets = schedulesWithDates.map(s => getCarsStringForSchedule(s));
                const firstCarSet = carSets[0];
                // If we have car data, check if any week's cars differ from the first week's.
                if (firstCarSet !== 'N/A') {
                    isDifferentCarEveryWeek = carSets.some(cs => cs !== firstCarSet);
                }
            }

            if (newCarIdMap.has(67) && newCarIdMap.get(67) === null) newCarIdMap.set(67, "Mazda MX-5 Cup");
            else if (!newCarIdMap.has(67)) newCarIdMap.set(67, "Mazda MX-5 Cup");
            return { ...season, schedules: schedulesWithDates, license_group_human_readable: licenseLevelMap[season.license_group] || 'Unknown', isSameTrackEveryWeek, isDifferentCarEveryWeek };
        });
        setCarIdMap(newCarIdMap);
        return processedData;
    }, []);
    
    const handleLoadData = useCallback(async (options = {}) => {
        const { clearSelections = true, isInitialAutoLoad = false } = options;
        if (!selectedDataSource) { setMessage("Please select a file to load."); return; }
        setIsLoading(true);
        setDataLoaded(false);
        setSeasonsData([]);
        setMessage('Loading data...');
        try {
            const { type, data: fileData } = await loadFile(selectedDataSource, fileDataMap);
            let rawData;
            if (type === 'pdf') {
                setMessage('Parsing PDF... This may take a moment.');
                rawData = await parsePdf(fileData, { debug: isDebugMode });
                if (rawData && rawData.length > 0) {
                    setMessage(`Successfully parsed PDF: Found ${rawData.length} series.`);
                } else {
                    setMessage('PDF parsing failed: Could not find any series in the PDF. Please check the file format.');
                    setIsLoading(false);
                    return;
                }
            } else { // 'json'
                rawData = fileData;
                setMessage(`Successfully loaded JSON: Found ${rawData.length} series.`);
            }
            const processedData = processAndSetData(rawData);
            setSeasonsData(processedData);
            setDataLoaded(true);
            if (clearSelections) {
                setSelectedSeriesIds(new Set());
                setSelectedTrackTypes(new Set());
            }
            // Only reset the calendar if it's a manual load, not the initial auto-load
            if (!isInitialAutoLoad) {
                setShowCalendarTable(false);
                setTableSeriesData([]);
            }
        } catch (error) {
            setMessage(`Error loading data: ${error.message}`);
            console.error('Error loading data:', error);
            setDataLoaded(false);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDataSource, fileDataMap, processAndSetData, parsePdf, loadFile, isDebugMode]); // isInitialAutoLoad is a transient option, not a dependency

    // Effect to automatically load data on initial page load
    useEffect(() => {
        const dataSourceFromCookie = getCookie('selectedDataSource');
        // Only auto-load if the data source was explicitly set by the user in a previous session (i.e., the cookie exists).
        // This prevents auto-loading on a fresh visit or after a reset.
        if (dataSourceFromCookie && selectedDataSource === dataSourceFromCookie && !initialLoadPerformed.current) {
            initialLoadPerformed.current = true;
            handleLoadData({ clearSelections: false, isInitialAutoLoad: true });
        }
    }, [selectedDataSource, handleLoadData]); // handleLoadData is memoized, selectedDataSource is the trigger

    const generateCalendarTable = useCallback((customMessage) => {
        const selected = seasonsData.filter(season => selectedSeriesIds.has(season.series_id || season.season_name));
        if (selected.length === 0) {
            setMessage('Please select at least one series to generate the calendar table.');
            return;
        }
        setTableSeriesData(selected);
        setShowCalendarTable(true);
        // Use the custom message if it's a string, otherwise use the default.
        // This prevents React event objects from being set as the message when called from a button.
        const messageToSet = typeof customMessage === 'string' ? customMessage : 'Calendar table generated!';
        setMessage(messageToSet);
        // Set a cookie to remember that the user has generated a table
        setCookie('hasGeneratedTable', 'true', 90);
    }, [seasonsData, selectedSeriesIds]);

    // Effect to auto-generate calendar on initial load if selections exist
    useEffect(() => {
        const hasGeneratedBefore = getCookie('hasGeneratedTable') === 'true';
        if (dataLoaded && selectedSeriesIds.size > 0 && hasGeneratedBefore && !initialTableGenerationAttempted.current) {
            const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            generateCalendarTable(`Calendar table restored from saved selections on ${today}.`);
            initialTableGenerationAttempted.current = true;
        }
    }, [dataLoaded, selectedSeriesIds.size, generateCalendarTable]);

    // Effect to scroll to the calendar table when it's generated
    useEffect(() => {
        if (showCalendarTable && calendarTableRef.current) {
            // A brief timeout helps ensure the element is in the DOM and ready for scrolling, especially with transitions.
            calendarTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [showCalendarTable, tableSeriesData]); // Trigger on visibility change or data change

    const handleFileChange = useCallback((event) => {
        const file = event.target.files[0];
        if (!file) return;
        const newFileName = file.name;
        setFileDataMap(prev => new Map(prev).set(newFileName, file));
        setAvailableFiles(prev => [...new Set([...prev, newFileName])]);
        setSelectedDataSource(newFileName);
        setMessage(`File "${newFileName}" ready. Click 'Load Data' to process.`);
    }, []);

    const handleReset = useCallback(() => {
        // To ensure a truly clean slate, we delete all preference cookies
        // and then reload the page. This prevents the state-saving useEffect
        // from immediately re-creating cookies with default values before
        // the user has taken any action.
        setCookie('selectedDataSource', '', -1);
        setCookie('selectedSeriesIds', '', -1);
        setCookie('selectedLicenseLevels', '', -1);
        setCookie('selectedTrackTypes', '', -1);
        setCookie('isMinimizerActive', '', -1);
        setCookie('includeYearLongSeries', '', -1);
        setCookie('isDarkMode', '', -1);
        setCookie('filterByRain', '', -1);
        setCookie('hasGeneratedTable', '', -1); // Clear the table generation flag
        setCookie('selectedDisciplines', '', -1);

        // Force a page reload to start fresh without any persisted state.
        window.location.reload();
    }, []);

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

    // Further filter the series based on the new discipline filter
    const seriesToDisplay = useMemo(() => {
        if (selectedDisciplines.size === 0) {
            return filteredSeries;
        }
        return filteredSeries.filter(series => selectedDisciplines.has(series.discipline));
    }, [filteredSeries, selectedDisciplines]);

    const getTooltipContentForSeries = useCallback((series) => {
        if (!series || !series.schedules) return [];

        // Create a mutable copy and sort by race_week_num to ensure correct order
        const sortedSchedules = [...series.schedules].sort((a, b) => a.race_week_num - b.race_week_num);

        const isRingMeister = series.season_name.includes("Ring Meister");
        const isTrackPlusCar = series.season_name.includes("Draft Master") || series.season_name.includes("Outlaw Micro Showdown");

        return sortedSchedules.map(schedule => {
            const weekNum = schedule.race_week_num + 1;
            const rainChance = schedule.rain_chance || schedule.track?.rain_chance || 0;
            let text = `Week ${weekNum}: `;

            const getTrackDisplay = (sch) => {
                let trackPart = '', configPart = '';
                if (sch.track && typeof sch.track === 'object' && sch.track.track_name) {
                    trackPart = sch.track.track_name;
                    configPart = sch.track.config_name || '';
                } else if (sch.track_name) {
                    const separator = " - ";
                    const separatorIndex = sch.track_name.lastIndexOf(separator);
                    if (separatorIndex !== -1) {
                        trackPart = sch.track_name.substring(0, separatorIndex);
                        configPart = sch.track_name.substring(separatorIndex + separator.length);
                    } else {
                        trackPart = sch.track_name;
                    }
                }
                // Apply replacements only if minimizer is active (the function handles the check).
                let finalTrackPart = applyReplacements(trackPart, trackNameReplacements);
                let finalConfigPart = applyReplacements(configPart, trackConfigReplacements);

                let trackDisplay = finalTrackPart;
                if (finalConfigPart && finalConfigPart.toLowerCase() !== 'oval' && finalConfigPart.toLowerCase() !== 'n/a' && finalConfigPart.trim() !== '') {
                    trackDisplay += ` - ${finalConfigPart}`;
                }
                return trackDisplay || 'N/A';
            };

            if (isRingMeister) {
                const cars = getCarsForWeek(series, schedule);
                text += applyCarListReplacements(cars, carConfigReplacements) || 'N/A';
            } else if (isTrackPlusCar) {
                const trackDisplay = getTrackDisplay(schedule);
                const cars = getCarsForWeek(series, schedule);
                text += `${trackDisplay} - ${applyCarListReplacements(cars, carConfigReplacements) || 'N/A'}`;
            } else {
                text += getTrackDisplay(schedule);
            }

            return { text, rainChance };
        });
    }, [isMinimizerActive, applyReplacements, applyCarListReplacements, getCarsForWeek]);

    const handleSeriesMouseEnter = useCallback((event, seriesId) => {
        clearTimeout(hoverTimerRef.current);
        const currentTargetRect = event.currentTarget.getBoundingClientRect(); // Get rect immediately
        // console.log('Mouse enter on series:', seriesId); // Log 1: Check if event fires
        hoverTimerRef.current = setTimeout(() => {
            // console.log('Timer fired for series:', seriesId); // Log 2: Check if timer completes
            const series = seasonsData.find(s => (s.series_id || s.season_name) === seriesId); // seasonsData is from App's state
            if (series) {
                const content = getTooltipContentForSeries(series);
                if (content.length > 0) {
                    setHoveredSeriesTracks({ seriesId, tracks: content, position: { top: currentTargetRect.bottom + window.scrollY, left: currentTargetRect.left + window.scrollX } });
                }
            } else {
                // console.log('Series not found in seasonsData for tooltip. ID:', seriesId); // Log 6: If series object is not found
            }
        }, 700); // 700ms delay
    }, [seasonsData, getTooltipContentForSeries]);

    const handleSeriesMouseLeave = useCallback(() => { clearTimeout(hoverTimerRef.current); setHoveredSeriesTracks(null); }, []);

    const handleGenerateCsv = useCallback(() => {
        const result = exportToCsv({
            seasonsData,
            selectedSeriesIds,
            isMinimizerActive,
            getCarsForWeek,
            // Pass the car replacement logic and data to the CSV exporter
            applyCarListReplacements,
            carConfigReplacements,
        });
        setMessage(result.message);
    }, [seasonsData, selectedSeriesIds, isMinimizerActive, getCarsForWeek, applyCarListReplacements]);

    return (
        <div className={`min-h-screen p-4 font-inter transition-colors duration-300 ${isDarkMode ? 'bg-neutral-950 text-neutral-100' : 'bg-gray-100 text-gray-800'}`}>
            <style>{`::selection { background-color: #3b82f6; color: #ffffff; } .fade-enter { opacity: 0; } .fade-enter-active { opacity: 1; transition: opacity 200ms; } .fade-exit { opacity: 1; } .fade-exit-active { opacity: 0; transition: opacity 200ms; } .table-appear { opacity: 0; transform: translateY(20px); } .table-appear-active { opacity: 1; transform: translateY(0); transition: opacity 300ms, transform 300ms; } `}</style>
            <div className={`max-w-7xl mx-auto shadow-lg p-6 sm:p-8 transition-colors duration-300 ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}>
                <h1 className={`text-3xl sm:text-4xl font-bold text-center mb-8 relative ${isDarkMode ? 'text-neutral-100' : 'text-blue-700'}`}>
                    <button
                        onClick={() => setShowDataSourceSelector(prev => !prev)}
                        className={`absolute top-0 left-0 p-2 m-2 rounded-full shadow-md hover:shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500
                        ${isDarkMode
                            ? 'bg-neutral-800 text-neutral-200'
                            : 'bg-gray-200 text-gray-800'
                        }`
                        }
                        title="Toggle Data Source Selector"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
                        </svg>
                    </button>
                    iRacing Schedule Viewer and Spreadsheet Creator
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
                <TransitionGroup>
                    {showDataSourceSelector && (
                        <CSSTransition nodeRef={dataSourceRef} key="datasource-selector" timeout={200} classNames="fade">
                            <div ref={dataSourceRef} className={`mb-8 p-6 shadow-inner ${isDarkMode ? 'bg-neutral-800' : 'bg-yellow-50'}`}>
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
                        </CSSTransition>
                    )}
                </TransitionGroup>

                <TransitionGroup>
                  {message && ( 
                    <CSSTransition nodeRef={messageRef} key="message-transition" timeout={200} classNames="fade">
                        <div ref={messageRef} className={`mb-6 p-3 shadow-xs text-center ${isDarkMode ? 'bg-blue-900' : 'bg-blue-100 text-blue-800'} rounded-md`}>{message}</div>
                    </CSSTransition> 
                  )}
                </TransitionGroup>

                {/* Calendar table is now here at the top */}
                <TransitionGroup>
                  {showCalendarTable && tableSeriesData.length > 0 && (
                    <CSSTransition nodeRef={calendarTableRef} key="calendar-table-transition" timeout={500} classNames="table-appear" appear>
                      <CalendarTable ref={calendarTableRef} seriesData={tableSeriesData} isDarkMode={isDarkMode} getCarsForWeek={getCarsForWeek} applyReplacements={applyReplacements} isMinimizerActive={isMinimizerActive} timeReplacements={timeReplacements} applyCarListReplacements={applyCarListReplacements} carConfigReplacements={carConfigReplacements} />
                    </CSSTransition>
                  )}
                </TransitionGroup>

                {dataLoaded && !isLoading && (
                    <>
                        {/* Container for Series List and Tracks Table */}
                        <div className="flex flex-col md:flex-row gap-6 mb-8">
                            {/* Available Series Section */}
                            <div className={`md:w-2/3 p-6 shadow-inner ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                                <div className="flex flex-wrap items-center mb-4 gap-x-4 gap-y-2">
                                    <h2 className={`text-2xl font-semibold ${isDarkMode ? 'text-neutral-200' : 'text-gray-700'}`}>Select Series ({seriesToDisplay.length})</h2>
                                    <label className="flex items-center ml-auto space-x-2 cursor-pointer mr-4">
                                        <input type="checkbox" checked={allSeriesSelected} onChange={handleSelectAllChange} className="form-checkbox h-5 w-5 text-blue-600 rounded-sm focus:ring-blue-500"/>
                                        <span className={`${isDarkMode ? 'text-neutral-100' : 'text-gray-700'}`}>Select All</span>
                                    </label>
                                    <label className="flex items-center space-x-2 cursor-pointer mr-4">
                                        <input
                                            type="checkbox"
                                            checked={isMinimizerActive}
                                            onChange={() => setIsMinimizerActive(prev => !prev)}
                                            className="form-checkbox h-5 w-5 text-blue-600 rounded-sm focus:ring-blue-500"
                                        />
                                        <span className={`${isDarkMode ? 'text-neutral-100' : 'text-gray-700'}`}>Minimize Text</span>
                                    </label>
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={includeYearLongSeries}
                                            onChange={() => setIncludeYearLongSeries(prev => !prev)}
                                            className="form-checkbox h-5 w-5 text-blue-600 rounded-sm focus:ring-blue-500"
                                        />
                                        <span className={`${isDarkMode ? 'text-neutral-100' : 'text-gray-700'}`}>Include Year-Long Series</span>
                                    </label>
                                    <button onClick={handleSearchToggle} className={`ml-3 p-1 rounded-full ${isDarkMode ? 'text-neutral-300 hover:text-white' : 'text-gray-600 hover:text-black'}`}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.197 5.197a7.5 7.5 0 0 0 10.607 10.607Z" /></svg></button>
                                    <input type="text" placeholder="Search..." value={searchTerm} onChange={handleSearchChange} className={`ml-4 px-3 py-1.5 border rounded-md shadow-xs transition-all ${showSearchInput ? 'w-64 opacity-100' : 'w-0 opacity-0'} ${isDarkMode ? 'bg-neutral-700 border-neutral-600' : 'bg-white border-gray-300'}`} />
                                </div>
                                <div className="max-h-[60vh] overflow-y-auto">
                                    <TransitionGroup>
                                        {seriesToDisplay.map(season => {
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
                                                                    {season.isDifferentCarEveryWeek && (
                                                                        <span className="ml-2" title="Same track, different car each week">
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${isDarkMode ? 'text-yellow-300' : 'text-blue-600'}`}>
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0l3.181-3.183m-4.991-2.695v-2.695A8.25 8.25 0 0 0 5.68 9.348v2.695l-2.695 2.695" />
                                                                            </svg>
                                                                        </span>
                                                                    )}
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
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"> {/* Wrapper for side-by-side layout */}
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

                                        {/* Discipline Filter Section */}
                                        {availableDisciplines.length > 0 && (
                                            <div className="flex-1 mb-6 md:mb-0">
                                                <h3 className={`text-lg font-medium mb-3 ${isDarkMode ? 'text-neutral-300' : 'text-gray-700'}`}>By Discipline:</h3>
                                                <div className="flex flex-col items-start gap-2">
                                                    {availableDisciplines.map((discipline) => (
                                                        <label key={discipline} className={`flex items-center space-x-2 cursor-pointer px-4 py-2 rounded-full shadow-xs transition-all text-sm ${
                                                            selectedDisciplines.has(discipline)
                                                                ? (isDarkMode ? 'bg-purple-600 text-white ring-2 ring-offset-2 ring-offset-transparent ring-white' : 'bg-purple-500 text-white ring-2 ring-offset-2 ring-offset-transparent ring-white')
                                                                : (isDarkMode ? 'bg-neutral-600 text-neutral-200 opacity-80 hover:opacity-100' : 'bg-gray-300 text-gray-800 opacity-80 hover:opacity-100')
                                                        }`}>
                                                            <input type="checkbox" checked={selectedDisciplines.has(discipline)} onChange={() => handleDisciplineChange(discipline)} className="form-checkbox h-5 w-5" />
                                                            <span>{toTitleCase(discipline)}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Rain Filter Section */}
                                        <div className="flex-1 mb-6 md:mb-0">
                                            <h3 className={`text-lg font-medium mb-3 ${isDarkMode ? 'text-neutral-300' : 'text-gray-700'}`}>By Weather:</h3>
                                            <div className="flex flex-col items-start gap-2">
                                                <label className={`flex items-center space-x-2 cursor-pointer px-4 py-2 rounded-full shadow-xs transition-all text-sm ${
                                                    filterByRain
                                                        ? (isDarkMode ? 'bg-blue-600 text-white ring-2 ring-offset-2 ring-offset-transparent ring-white' : 'bg-blue-500 text-white ring-2 ring-offset-2 ring-offset-transparent ring-white')
                                                        : (isDarkMode ? 'bg-neutral-600 text-neutral-200 opacity-80 hover:opacity-100' : 'bg-gray-300 text-gray-800 opacity-80 hover:opacity-100')
                                                }`}>
                                                    <input type="checkbox" checked={filterByRain} onChange={() => setFilterByRain(prev => !prev)} className="form-checkbox h-5 w-5" />
                                                    <span>Has Rain</span>
                                                </label>
                                            </div>
                                        </div>
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
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-8">
                           <button onClick={generateCalendarTable} className="w-full sm:flex-1 bg-purple-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-purple-700">Generate Schedule</button>
                           <button onClick={handleReset} className="w-full sm:w-auto bg-red-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-red-700 whitespace-nowrap">Reset</button>
                           <button onClick={handleGenerateCsv} className="w-full sm:flex-1 bg-green-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-green-700">Generate CSV</button>
                        </div>
                    </>
                 )}
                 
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
                                    <span>{trackInfo.text}</span>
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
