import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { trackNameReplacements, trackConfigReplacements, carConfigReplacements } from './trackMappings';

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
            const seriesNameRegex = /^(.*?)(\s*-\s*\d{4}\s+Season\s+\d(?: - Fixed)?)$/i;
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
                    car_types: []
                };
                continue;
            }

            if (currentSeries) {
                 if (currentSeries.schedules.length === 0 && !line.startsWith('Week')) {
                    const licenseRegex = /^(Rookie|Class\s+[A-D])\s+\(4\.0\)\s+-->/;
                    const licenseMatch = line.match(licenseRegex);
                    if (licenseMatch) {
                        let license = licenseMatch[1];
                        if (license === 'Rookie') currentSeries.license_group = licenseClassMap['D'];
                        else if (license === 'Class D') currentSeries.license_group = licenseClassMap['C'];
                        else if (license === 'Class C') currentSeries.license_group = licenseClassMap['B'];
                        else if (license === 'Class B') currentSeries.license_group = licenseClassMap['A'];
                    } else if (!line.startsWith('Races') && !line.startsWith('Min entries') && !line.startsWith('Penalty') && !line.includes('See race week')) {
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
                    
                    let trackName = remainingLine;
                    let weeklyCars = null;

                    if (currentSeries.season_name.includes("Draft Master") || currentSeries.season_name.includes("Ring Meister")) {
                        const trackNameRegex = /^([^\(]+)(?=\(|$)/;
                        const trackMatch = remainingLine.match(trackNameRegex);
                        if (trackMatch) {
                            trackName = trackMatch[1].trim();
                            weeklyCars = remainingLine.replace(trackName, '').trim();
                        }
                    } else {
                        trackName = trackName.split(' (')[0].trim();
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
                }
            }
        }
    }
    if (currentSeries) seriesData.push(currentSeries);
    
    return seriesData.filter(s => s.schedules.length > 0 && s.schedules.length <= 12);
};


// Main App component
const App = () => {
    const [seasonsData, setSeasonsData] = useState([]);
    const [availableFiles, setAvailableFiles] = useState(['season-series-25s2.json', '2025S2.pdf', '2025S3.pdf']);
    const [fileDataMap, setFileDataMap] = useState(new Map());
    const [selectedDataSource, setSelectedDataSource] = useState('');
    const [selectedLicenseLevels, setSelectedLicenseLevels] = useState(new Set());
    const [selectedSeriesIds, setSelectedSeriesIds] = useState(new Set());
    const [tableSeriesData, setTableSeriesData] = useState([]);
    const [showCalendarTable, setShowCalendarTable] = useState(false);
    const [message, setMessage] = useState('Please select a data source or upload a file.');
    const [isLoading, setIsLoading] = useState(false);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [carIdMap, setCarIdMap] = useState(new Map());
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [showSearchInput, setShowSearchInput] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [allSeriesSelected, setAllSeriesSelected] = useState(false);
    const [isMinimizerActive, setIsMinimizerActive] = useState(false); // State for minimizer
    
    const licenseLevelMap = { 1: 'Rookie', 2: 'D', 3: 'C', 4: 'B', 5: 'A', 0: 'Unknown' };
    const licenseColorMap = { 'Rookie': 'bg-red-500 text-white', 'D': 'bg-orange-500 text-white', 'C': 'bg-yellow-300 text-gray-800', 'B': 'bg-green-500 text-white', 'A': 'bg-blue-500 text-white', 'Unknown': 'bg-gray-400 text-white' };
    
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
            setShowCalendarTable(false);
            setTableSeriesData([]);
        } catch (error) {
            setMessage(`Error loading data: ${error.message}`);
            console.error('Error loading data:', error);
            setDataLoaded(false);
        } finally {
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
            const searchHaystack = `${season.series_name || ''} ${season.season_name || ''}`.toLowerCase();
            const matchesSearch = !searchTerm || searchHaystack.includes(searchTerm.toLowerCase());
            return matchesLevel && matchesSearch;
        });
    }, [seasonsData, selectedLicenseLevels, searchTerm]);

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
        const selected = seasonsData.filter(season => selectedSeriesIds.has(season.season_name));
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
            dataRows.Time.push(series.schedule_description || 'N/A');
            dataRows.License.push(series.license_group_human_readable || 'N/A');
            dataRows.Style.push(series.track_types?.[0]?.track_type || 'N/A');
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

    const CalendarTable = React.forwardRef(({ seriesData, isDarkMode, getCarsForWeek, applyReplacements, isMinimizerActive }, ref) => {
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
                                {seriesData.map(season => (<th key={season.series_id || season.season_name} scope="col" className={`px-3 py-3 text-left text-xs font-medium ${isDarkMode ? 'text-neutral-300' : 'text-gray-500'} uppercase`}>{season.season_name}</th>))}
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
                                                subTextForDisplay = schedule.laps ? `${schedule.laps} laps` : '';
                                            }

                                            const rainChance = schedule.rain_chance || schedule.track?.rain_chance || 0;
                                            let trackDisplayHtml = `<span class="font-semibold">${trackNameForDisplay || 'N/A'}</span>`;
                                            if (rainChance > 0) {
                                                trackDisplayHtml += `<span class="text-blue-400 ml-1">(${rainChance}%)</span>`;
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
                <h1 className={`text-3xl sm:text-4xl font-bold text-center mb-8 ${isDarkMode ? 'text-neutral-100' : 'text-blue-700'}`}>iRacing Schedule Viewer and Spreadsheet Creator</h1>
                <div className={`mb-8 p-6 shadow-inner ${isDarkMode ? 'bg-neutral-800' : 'bg-yellow-50'}`}>
                    <h2 className={`text-2xl font-semibold mb-4 ${isDarkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>1. Select Data Source</h2>
                    <div className="flex items-center gap-4">
                        <select value={selectedDataSource} onChange={e => setSelectedDataSource(e.target.value)} className={`flex-grow p-2 border rounded-md shadow-sm ${isDarkMode ? 'bg-neutral-700 border-neutral-600' : 'bg-white border-gray-300'}`}>
                            <option value="" disabled>Select a source...</option>
                            {availableFiles.map(file => <option key={file} value={file}>{file}</option>)}
                        </select>
                        <button onClick={handleLoadData} disabled={isLoading || !selectedDataSource} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                            {isLoading ? 'Loading...' : 'Load Data'}
                        </button>
                    </div>
                    <div className="mt-4 text-center">
                        <span className={`text-sm ${isDarkMode ? 'text-neutral-400' : 'text-gray-600'}`}>or upload a custom file:</span>
                        <input type="file" accept=".json,.pdf" onChange={handleFileChange} className={`block w-full text-sm mt-2 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold ${isDarkMode ? 'text-neutral-300 file:bg-neutral-700 file:text-neutral-200' : 'file:bg-blue-50 file:text-blue-700'}`} />
                    </div>
                </div>

                <TransitionGroup>
                  {message && ( 
                    <CSSTransition nodeRef={messageRef} key="message-transition" timeout={200} classNames="fade">
                        <div ref={messageRef} className={`mb-6 p-3 shadow-sm text-center ${isDarkMode ? 'bg-blue-900' : 'bg-blue-100 text-blue-800'} rounded-md`}>{message}</div>
                    </CSSTransition> 
                  )}
                </TransitionGroup>

                {dataLoaded && !isLoading && (
                    <>
                        <div className={`mb-8 p-6 shadow-inner ${isDarkMode ? 'bg-neutral-800' : 'bg-blue-50'}`}>
                            <h2 className={`text-2xl font-semibold mb-4 ${isDarkMode ? 'text-neutral-200' : 'text-blue-600'}`}>Filter Series</h2>
                            <div className="mb-6">
                                <h3 className={`text-lg font-medium mb-3 ${isDarkMode ? 'text-neutral-300' : 'text-gray-700'}`}>By License Level:</h3>
                                <div className="flex flex-wrap gap-3">
                                    {Object.entries(licenseLevelMap).map(([id, level]) => (
                                        <label key={id} className={`flex items-center space-x-2 cursor-pointer px-4 py-2 rounded-full shadow-sm ${licenseColorMap[level]} ${selectedLicenseLevels.has(level) ? 'outline' : ''}`}><input type="checkbox" checked={selectedLicenseLevels.has(level)} onChange={() => handleLicenseLevelChange(level)} className="form-checkbox h-5 w-5" /><span>{level}</span></label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className={`mb-8 p-6 shadow-inner ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                            <div className="flex items-center mb-4">
                                <h2 className={`text-2xl font-semibold ${isDarkMode ? 'text-neutral-200' : 'text-gray-700'}`}>Available Series ({filteredSeries.length})</h2>
                                <label className="flex items-center ml-auto space-x-2 cursor-pointer mr-4">
                                    <input type="checkbox" checked={allSeriesSelected} onChange={handleSelectAllChange} className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500"/>
                                    <span className={`${isDarkMode ? 'text-neutral-100' : 'text-gray-700'}`}>Select All</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isMinimizerActive}
                                        onChange={() => setIsMinimizerActive(prev => !prev)}
                                        className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                                    />
                                    <span className={`${isDarkMode ? 'text-neutral-100' : 'text-gray-700'}`}>Minimize Track Names</span>
                                </label>
                                <button onClick={handleSearchToggle} className="ml-3 p-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.197 5.197a7.5 7.5 0 0 0 10.607 10.607Z" /></svg></button>
                                <input type="text" placeholder="Search..." value={searchTerm} onChange={handleSearchChange} className={`ml-4 px-3 border rounded-md shadow-sm transition-all ${showSearchInput ? 'w-64 opacity-100' : 'w-0 opacity-0'} ${isDarkMode ? 'bg-neutral-700' : 'bg-white'}`} />
                            </div>
                            <div className="max-h-[60vh] overflow-y-auto">
                                <TransitionGroup>
                                    {filteredSeries.map(season => {
                                        if (!season || !season.season_name) {
                                            // console.error("Attempted to render an invalid season object:", season);
                                            return null;
                                        }
                                        const seriesKey = season.series_id || season.season_name;
                                        if (!seriesItemRefs.current[seriesKey]) {
                                            seriesItemRefs.current[seriesKey] = React.createRef();
                                        }
                                        const nodeRef = seriesItemRefs.current[seriesKey];

                                        return (
                                            <CSSTransition key={seriesKey} nodeRef={nodeRef} timeout={300} classNames="fade">
                                                <div 
                                                    ref={nodeRef} 
                                                    className={`p-4 shadow-md ${selectedSeriesIds.has(seriesKey) ? (isDarkMode ? 'bg-green-900' : 'bg-green-100') : (isDarkMode ? 'bg-neutral-900' : 'bg-white')}`}
                                                >
                                                    <label className="flex items-center space-x-3 cursor-pointer">
                                                        <input type="checkbox" checked={selectedSeriesIds.has(seriesKey)} onChange={() => handleSeriesSelectionChange(seriesKey)} className="form-checkbox h-6 w-6" />
                                                        <p className={`text-lg font-bold ${isDarkMode ? 'text-neutral-100' : 'text-gray-800'}`}>{season.season_name || "Invalid Series Name"}</p>
                                                    </label>
                                                </div>
                                            </CSSTransition>
                                        );
                                    })}
                                </TransitionGroup>
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
                      <CalendarTable ref={calendarTableRef} seriesData={tableSeriesData} isDarkMode={isDarkMode} getCarsForWeek={getCarsForWeek} applyReplacements={applyReplacements} isMinimizerActive={isMinimizerActive} />
                    </CSSTransition>
                  )}
                </TransitionGroup>
            </div>
        </div>
    );
};

export default App;
