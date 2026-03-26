import React, { useState } from 'react';
import { trackNameReplacements, trackConfigReplacements, carConfigReplacements } from '../replacementMappings';

const CalendarTable = React.forwardRef(({ seriesData, isDarkMode, getCarsForWeek, applyReplacements, applyCarListReplacements, isMinimizerActive, timeReplacements: localTimeReplacements, contentState }, ref) => {
    if (!seriesData || seriesData.length === 0) return null;

    const [isExpanded, setIsExpanded] = useState(true);

    const now = new Date(); // The current moment in time (UTC based).

    const allSchedules = seriesData.flatMap(s => s.schedules);
    if (allSchedules.length === 0) return <p>No schedules found for selected series.</p>;

    // Helper to normalize any date to the beginning of its iRacing week (Tuesday 00:00 UTC)
    const getWeekStartDate = (date) => {
        if (!date) return null;
        const d = new Date(date);
        // getUTCDay() returns 0 for Sunday, 1 for Monday, ..., 6 for Saturday. Tuesday is 2.
        const dayOfWeek = d.getUTCDay();
        const daysToSubtract = (dayOfWeek - 2 + 7) % 7;
        d.setUTCDate(d.getUTCDate() - daysToSubtract);
        d.setUTCHours(0, 0, 0, 0); // Ensure time is at the beginning of the day
        return d.getTime();
    };

    const getItemState = (season, schedule) => {
        if (!contentState || !schedule) return 'Empty';
        
        let trackPart = '';
        if (schedule.track && typeof schedule.track === 'object' && schedule.track.track_name) {
            trackPart = schedule.track.track_name;
        } else if (schedule.track_name) {
            const separator = " - ";
            const separatorIndex = schedule.track_name.lastIndexOf(separator);
            if (separatorIndex !== -1) {
                trackPart = schedule.track_name.substring(0, separatorIndex);
            } else {
                trackPart = schedule.track_name;
            }
        }
        const cleanedTrackPart = trackPart.replace(/,?\s*Constant weather.*$/i, '').trim();
        const finalTrackNameForState = isMinimizerActive ? applyReplacements(cleanedTrackPart, trackNameReplacements) : cleanedTrackPart;
        const trackState = contentState.tracks?.[finalTrackNameForState] || 'Empty';

        const isRingMeister = season.season_name.includes('Ring Meister');
        if (isRingMeister) {
            const carsList = getCarsForWeek(season, schedule);
            const finalCarNameForState = isMinimizerActive ? applyCarListReplacements(carsList, carConfigReplacements) : carsList;
            return contentState.cars?.[finalCarNameForState] || 'Empty';
        }
        
        return trackState;
    };

    // --- Determine max season length ---
    const scheduleLengths = seriesData.map(s => s.schedules.length);
    let maxSeasonLength = 12; // Default min length
    if (scheduleLengths.length > 0) {
        maxSeasonLength = Math.max(...scheduleLengths);
    }
    // Ensure we show at least 12 weeks normally, unless everything is shorter? 
    // Actually, if we have a 13 week season, we want 13. If we have only 6, maybe we still want 12?
    // Let's stick to the plan: "Always show the full length of the longest selected series."
    // But usually standard is 12. Let's ensure at least 12.
    if (maxSeasonLength < 12) maxSeasonLength = 12;

    // --- Determine season's start date, prioritizing series with the max length ---
    let referenceSeries = seriesData.filter(s => s.schedules.length === maxSeasonLength);

    // Fallback if no series match the dominant length (e.g., only 8-week series are selected).
    if (referenceSeries.length === 0) {
        // Fallback to any non-year-long series
        referenceSeries = seriesData.filter(s => s.schedules.length > 1 && s.schedules.length <= 12);
    }
    if (referenceSeries.length === 0) {
        // If still nothing, use all selected data as a last resort.
        referenceSeries = seriesData;
    }

    const referenceWeekStartTimes = referenceSeries.flatMap(s => s.schedules).map(s => getWeekStartDate(s.startDateObj)).filter(Boolean);

    // Find the most common start date from the reference series to determine the official season start.
    const dateCounts = referenceWeekStartTimes.reduce((acc, time) => {
        acc[time] = (acc[time] || 0) + 1;
        return acc;
    }, {});

    let seasonStartTimestamp = 0;
    let maxCount = 0;
    for (const time in dateCounts) {
        if (dateCounts[time] > maxCount) {
            maxCount = dateCounts[time];
            seasonStartTimestamp = parseInt(time, 10);
        }
    }

    // Now, get all unique weeks from ALL selected series to build the calendar rows.
    const allWeekStartTimes = allSchedules.map(s => getWeekStartDate(s.startDateObj)).filter(Boolean);
    const uniqueSortedWeekStartTimes = [...new Set(allWeekStartTimes)].sort((a, b) => a - b);

    // Find the index of the official season start week.
    let startIndex = uniqueSortedWeekStartTimes.findIndex(weekStartTime => weekStartTime === seasonStartTimestamp);
    if (startIndex === -1) { // Fallback if no common start date is found
        // This can happen if only one series is selected, so there's no "most common" date.
        // In that case, we should just start from the beginning of that series' schedule.
        if (referenceWeekStartTimes.length > 0) {
            const earliestReferenceStart = Math.min(...referenceWeekStartTimes);
            startIndex = uniqueSortedWeekStartTimes.findIndex(weekStartTime => weekStartTime === earliestReferenceStart);
        }
        // If still not found, fallback to the very first week of all available weeks.
        if (startIndex === -1) {
            startIndex = 0;
        }
    }

    const weekStartTimes = uniqueSortedWeekStartTimes.slice(startIndex, startIndex + maxSeasonLength);

    // --- Force calendar to have the max number of weeks ---
    if (weekStartTimes.length < maxSeasonLength && weekStartTimes.length > 0) {
        const lastWeekTime = weekStartTimes[weekStartTimes.length - 1];
        const oneWeekInMillis = 7 * 24 * 60 * 60 * 1000;
        const weeksToAdd = maxSeasonLength - weekStartTimes.length;
        for (let i = 1; i <= weeksToAdd; i++) {
            weekStartTimes.push(lastWeekTime + (i * oneWeekInMillis));
        }
    }

    const calendarWeeks = weekStartTimes.map(startTime => {
        const weekStart = new Date(startTime);
        const weekEnd = new Date(startTime);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
        return { start: weekStart, end: weekEnd };
    });

    return (
        <div ref={ref} className={`mt-8 p-6 shadow-lg border rounded-md transition-all duration-300 ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'}`}>
            <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => setIsExpanded(prev => !prev)}>
                <h2 className={`text-2xl font-semibold flex items-center gap-2 ${isDarkMode ? 'text-neutral-200' : 'text-blue-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                    Generated Calendar Schedule
                </h2>
            </div>
            {isExpanded && (
                <div className="overflow-x-auto mt-4">
                    <table className={`min-w-full divide-y ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
                        <thead className={isDarkMode ? 'bg-neutral-900' : 'bg-gray-50'}>
                        <tr>
                            <th scope="col" className={`px-6 py-3 text-left text-xs font-medium ${isDarkMode ? 'text-neutral-300' : 'text-gray-500'} uppercase`}>Week</th>
                            <th scope="col" className={`px-3 py-3 text-left text-xs font-medium ${isDarkMode ? 'text-neutral-300' : 'text-gray-500'} uppercase`}>Start Date</th>
                            {seriesData.map(season => {
                                let ownedCount = 0;
                                let wishlistCount = 0;
                                season.schedules?.forEach(sch => {
                                    const state = getItemState(season, sch);
                                    if (state === 'Purchased') ownedCount++;
                                    if (state === 'Wishlist') wishlistCount++;
                                });

                                return (
                                    <th key={season.series_id || season.season_name} scope="col" className={`px-3 py-3 text-left text-xs font-medium ${isDarkMode ? 'text-neutral-300' : 'text-gray-500'} uppercase`}>
                                        <div className="text-center">{season.season_name}</div> {/* Centered series name */}
                                        {season.race_frequency && (
                                            <div className={`text-[0.65rem] leading-tight ${isDarkMode ? 'text-neutral-400' : 'text-gray-400'} font-normal normal-case text-center`}> {/* Centered frequency */}
                                                {applyReplacements(season.race_frequency, localTimeReplacements)}
                                            </div>
                                        )}
                                        {contentState && (ownedCount > 0 || wishlistCount > 0) && (
                                            <div className="text-center mt-1 space-x-2 text-[0.7rem] normal-case font-bold">
                                                {ownedCount > 0 && <span className="text-green-600 dark:text-green-400">Own: {ownedCount}</span>}
                                                {wishlistCount > 0 && <span className="text-yellow-600 dark:text-yellow-400">Wish: {wishlistCount}</span>}
                                            </div>
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className={`${isDarkMode ? 'bg-neutral-800' : 'bg-white'} divide-y ${isDarkMode ? 'divide-neutral-700' : 'divide-gray-200'}`}>
                        {calendarWeeks.map((week, i) => {
                            const isCurrentWeek = now >= week.start && now < week.end;
                            return (
                                <tr key={i} className={`transition-colors duration-300 ${isCurrentWeek ? (isDarkMode ? 'bg-yellow-900/50' : 'bg-yellow-100') : ''}`}>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${isDarkMode ? 'text-neutral-100' : 'text-gray-900'} text-center`}>{i + 1}</td>
                                    <td className={`px-3 py-4 whitespace-nowrap text-sm ${isDarkMode ? 'text-neutral-300' : 'text-gray-600'}`}>
                                        {week.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </td>
                                    {seriesData.map(season => {
                                        const schedule = season.schedules?.find(s => getWeekStartDate(s.startDateObj) === week.start.getTime());
                                        let cellContentHtml = '';
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

                                            const isRingMeister = season.season_name.includes('Ring Meister');
                                            const isTrackPlusCar = season.season_name.includes('Draft Master') || season.season_name.includes('Outlaw Micro Showdown');
                                            const isSpecialSeries = isRingMeister || isTrackPlusCar;
                                            if (isSpecialSeries) {
                                                weeklyCarsPart = getCarsForWeek(season, schedule);
                                            }

                                            // 2. Apply replacements (the function checks if minimizer is active)
                                            trackPart = applyReplacements(trackPart, trackNameReplacements);
                                            configPart = applyReplacements(configPart, trackConfigReplacements);

                                            // 3. Construct display parts
                                            let trackNameForDisplay;
                                            let subTextForDisplay = '';

                                            if (isSpecialSeries) {
                                                const minimizedCars = applyCarListReplacements(weeklyCarsPart, carConfigReplacements);
                                                if (isTrackPlusCar) {
                                                    trackNameForDisplay = trackPart; // Already minimized if active
                                                    if (configPart && configPart.toLowerCase() !== 'oval' && configPart.toLowerCase() !== 'n/a' && configPart.trim() !== '') {
                                                        trackNameForDisplay += ` - ${configPart}`; // Already minimized if active
                                                    }
                                                    subTextForDisplay = minimizedCars; // Car type as subtext
                                                } else if (isRingMeister) {
                                                    trackNameForDisplay = minimizedCars; // Only car type
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
                                                // Append the rain chance information instead of replacing the track name
                                                trackDisplayHtml += ` <span class="text-blue-400 font-normal">(${rainChance}%)</span>`;
                                            }
                                            cellContentHtml = `<div class="flex flex-col justify-center">${trackDisplayHtml}<span class="text-xs ${isDarkMode ? 'text-neutral-400' : 'text-gray-600'}">${subTextForDisplay || ''}</span></div>`;
                                        }

                                        const itemState = schedule ? getItemState(season, schedule) : 'Empty';
                                        let bgClass = '';
                                        if (itemState === 'Purchased') {
                                            bgClass = isDarkMode ? 'bg-green-900/40' : 'bg-green-100/60';
                                        } else if (itemState === 'Wishlist') {
                                            bgClass = isDarkMode ? 'bg-yellow-900/40' : 'bg-yellow-100/60';
                                        }

                                        return <td key={`${season.series_id || season.season_name}-${i}`} className={`px-3 py-4 text-sm ${bgClass} ${isDarkMode ? 'text-neutral-100' : 'text-gray-500'}`} dangerouslySetInnerHTML={{ __html: cellContentHtml }}></td>;
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            )}
        </div>
    );
});

export default CalendarTable;