import React from 'react';
import { trackNameReplacements, trackConfigReplacements, carConfigReplacements } from '../replacementMappings';

const CalendarTable = React.forwardRef(({ seriesData, isDarkMode, getCarsForWeek, applyReplacements, applyCarListReplacements, isMinimizerActive, timeReplacements: localTimeReplacements }, ref) => {
    if (!seriesData || seriesData.length === 0) return null;        
    
    const allSchedules = seriesData.flatMap(s => s.schedules);
    if (allSchedules.length === 0) return <p>No schedules found for selected series.</p>;

    const dates = allSchedules.map(s => s.startDateObj);
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    // iRacing weeks start on Tuesday 00:00 UTC. The schedule dates are these Tuesdays.
    // We generate week boundaries from Tuesday (inclusive) to the next Tuesday (exclusive).
    const calendarWeeks = [];
    if (!isNaN(minDate.getTime())) {
        let weekIterator = new Date(minDate.getTime());
        while(weekIterator <= maxDate) {
            const weekStart = new Date(weekIterator.getTime());
            const weekEnd = new Date(weekIterator.getTime());
            // A week runs for 7 full days.
            weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

            calendarWeeks.push({ start: weekStart, end: weekEnd });
            weekIterator = weekEnd;
        }
    }

    const now = new Date(); // The current moment in time (UTC based).

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
                        {calendarWeeks.map((week, i) => {
                            const isCurrentWeek = now >= week.start && now < week.end;
                            return (
                            <tr key={i} className={`transition-colors duration-300 ${isCurrentWeek ? (isDarkMode ? 'bg-yellow-900/50' : 'bg-yellow-100') : ''}`}>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${isDarkMode ? 'text-neutral-100' : 'text-gray-900'} text-center`}>{i + 1}</td>
                                {seriesData.map(season => {
                                    const schedule = season.schedules?.find(s => s.startDateObj.getTime() === week.start.getTime());
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
                                            // Append the rain chance information instead of replacing the track name
                                            trackDisplayHtml += ` <span class="text-blue-400 font-normal">(${rainChance}%)</span>`;
                                        }
                                        cellContentHtml = `<div class="flex flex-col">${trackDisplayHtml}<span class="text-xs ${isDarkMode ? 'text-neutral-400' : 'text-gray-600'}">${subTextForDisplay || ''}</span></div>`;
                                    }
                                    return <td key={`${season.series_id || season.season_name}-${i}`} className={`px-3 py-4 whitespace-nowrap text-sm ${isDarkMode ? 'text-neutral-100' : 'text-gray-500'}`} dangerouslySetInnerHTML={{ __html: cellContentHtml }}></td>;
                                })}
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

export default CalendarTable;