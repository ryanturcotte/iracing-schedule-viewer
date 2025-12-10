import React from 'react';
import { formatTrackType } from '../utils/formatting';

const PrintableSchedule = ({
    seriesData,
    getCarsForWeek,
    applyReplacements,
    isMinimizerActive,
    trackNameReplacements,
    trackConfigReplacements,
    carConfigReplacements,
    applyCarListReplacements
}) => {
    // --- Date Calculation Logic (Adapted and aligned with CalendarTable) ---
    const allSchedules = seriesData.flatMap(s => s.schedules);

    // Helper to normalize any date to the beginning of its iRacing week (Tuesday 00:00 UTC)
    const getWeekStartDate = (date) => {
        if (!date) return null;
        const d = new Date(date);
        const dayOfWeek = d.getUTCDay();
        const daysToSubtract = (dayOfWeek - 2 + 7) % 7;
        d.setUTCDate(d.getUTCDate() - daysToSubtract);
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime();
    };

    // --- Determine max season length ---
    const scheduleLengths = seriesData.map(s => s.schedules.length);
    let maxSeasonLength = 12; // Default min length
    if (scheduleLengths.length > 0) {
        maxSeasonLength = Math.max(...scheduleLengths);
    }
    if (maxSeasonLength < 12) maxSeasonLength = 12;

    // --- Determine season's start date ---
    let referenceSeries = seriesData.filter(s => s.schedules.length === maxSeasonLength);
    if (referenceSeries.length === 0) referenceSeries = seriesData.filter(s => s.schedules.length > 1 && s.schedules.length <= 12);
    if (referenceSeries.length === 0) referenceSeries = seriesData;

    const referenceWeekStartTimes = referenceSeries.flatMap(s => s.schedules).map(s => getWeekStartDate(s.startDateObj)).filter(Boolean);
    const dateCounts = referenceWeekStartTimes.reduce((acc, time) => { acc[time] = (acc[time] || 0) + 1; return acc; }, {});

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
    if (startIndex === -1) {
        if (referenceWeekStartTimes.length > 0) {
            const earliestReferenceStart = Math.min(...referenceWeekStartTimes);
            startIndex = uniqueSortedWeekStartTimes.findIndex(weekStartTime => weekStartTime === earliestReferenceStart);
        }
        if (startIndex === -1) startIndex = 0;
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
    } else if (weekStartTimes.length === 0 && maxSeasonLength > 0) {
        // Fallback if no dates at all (e.g. data load issue), just generate placeholder weeks
        // Use current week as start? Or just unknown.
        // Let's just create empty placeholders
        for (let i = 0; i < maxSeasonLength; i++) {
            weekStartTimes.push(0); // special marker for unknown
        }
    }

    const weekDates = weekStartTimes.map(timestamp => {
        if (!timestamp) return { start: '', end: '' };
        const start = new Date(timestamp);
        const end = new Date(timestamp);
        end.setUTCDate(end.getUTCDate() + 6);
        return {
            start: start.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
            end: end.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
            timestamp: timestamp
        };
    });

    // 1. Prepare Data Rows
    const rows = [
        { label: 'Time', type: 'frequency' },
        { label: 'License', type: 'license' },
        { label: 'Style', type: 'style' },
        { label: 'Series', type: 'name' }, // Headers for dates go here
    ];
    for (let i = 0; i < weekDates.length; i++) {
        rows.push({ label: `Week ${i + 1}`, type: 'week', weekIndex: i });
    }

    // Helper to get cell content and rain status for a specific series and row type
    const getCellContent = (series, rowType, weekIndex) => {
        if (!series) return { text: '', hasRain: false };

        if (rowType === 'frequency') {
            return { text: series.race_frequency || '', hasRain: false };
        }
        if (rowType === 'license') {
            return { text: series.license_group_human_readable || '', hasRain: false };
        }
        if (rowType === 'style') {
            return { text: series.track_types?.map(tt => formatTrackType(tt.track_type)).filter(Boolean).join(' / ') || '', hasRain: false };
        }
        if (rowType === 'name') {
            return { text: series.season_name || '', hasRain: false };
        }
        if (rowType === 'week') {
            // Find schedule by DATE, not index
            const weekTimestamp = weekDates[weekIndex]?.timestamp;
            if (!weekTimestamp) return { text: '', hasRain: false }; // Should not happen if logic is correct

            const schedule = series.schedules.find(s => getWeekStartDate(s.startDateObj) === weekTimestamp);

            if (!schedule) return { text: '', hasRain: false };

            let trackPart = '';
            let configPart = '';
            let weeklyCarsPart = '';

            // Extract logic (similar to csvExporter and CalendarTable)
            if (schedule.track && typeof schedule.track === 'object' && schedule.track.track_name) {
                trackPart = schedule.track.track_name;
                configPart = schedule.track.config_name || '';
            } else if (schedule.track_name) {
                const separator = " - ";
                const separatorIndex = schedule.track_name.lastIndexOf(separator);
                if (separatorIndex !== -1) {
                    trackPart = schedule.track_name.substring(0, separatorIndex);
                    configPart = schedule.track_name.substring(separatorIndex + separator.length);
                } else {
                    trackPart = schedule.track_name;
                }
            }

            const isRingMeister = series.season_name.includes("Ring Meister");
            const isTrackPlusCar = series.season_name.includes("Draft Master") || series.season_name.includes("Outlaw Micro Showdown");
            const isSpecialSeries = isRingMeister || isTrackPlusCar;

            if (isSpecialSeries) {
                weeklyCarsPart = getCarsForWeek(series, schedule);
            }

            // Apply Replacements
            trackPart = applyReplacements(trackPart, trackNameReplacements);
            configPart = applyReplacements(configPart, trackConfigReplacements);

            let cellData = '';
            // Construct Cell Data
            if (isSpecialSeries) {
                const minimizedCars = applyCarListReplacements(weeklyCarsPart, carConfigReplacements);
                if (isTrackPlusCar) {
                    let displayTrack = trackPart;
                    if (configPart && configPart.toLowerCase() !== 'oval' && configPart.toLowerCase() !== 'n/a' && configPart.trim() !== '') {
                        displayTrack += ` - ${configPart}`;
                    }
                    cellData = `${displayTrack} - ${minimizedCars}`;
                } else if (isRingMeister) {
                    cellData = minimizedCars;
                }
            } else {
                cellData = trackPart;
                if (configPart && configPart.toLowerCase() !== 'oval' && configPart.toLowerCase() !== 'n/a' && configPart.trim() !== '') {
                    cellData += ` - ${configPart}`;
                }
            }

            const rainChance = schedule.rain_chance || schedule.track?.rain_chance || 0;
            if (rainChance > 0) {
                cellData += ` (${rainChance}%)`;
            }

            return { text: cellData, hasRain: rainChance > 0 };
        }
        return { text: '', hasRain: false };
    };

    return (
        <div className="w-full bg-white text-black p-4 font-sans print:p-0">
            <style>{`
                @media print {
                    @page {
                        size: landscape;
                        margin: 0.5cm;
                    }
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        background: white;
                    }
                    /* Ensure table borders print */
                    table, th, td {
                        border: 4px solid black !important;
                    }
                }
                .bg-rain-pattern {
                    background-image: repeating-linear-gradient(
                        45deg,
                        #ffffff,
                        #ffffff 10px,
                        #bfdbfe 10px,   /* Tailwind blue-200 */
                        #bfdbfe 20px
                    ) !important;
                    background-color: #eff6ff !important; /* Tailwind blue-50 fallback */
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
            `}</style>

            <table className="w-full border-collapse border-4 border-gray-400 text-xs sm:text-sm">
                <tbody>
                    {rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                            {/* First Column: Label */}
                            <td className="border-4 border-gray-400 p-1 font-bold bg-gray-100 print:bg-gray-100 w-24">
                                {row.label}
                            </td>
                            {/* Subsequent Columns: Series Data */}
                            {seriesData.map((series) => {
                                const { text, hasRain } = getCellContent(series, row.type, row.weekIndex);
                                return (
                                    <td
                                        key={series.series_id || series.season_name}
                                        className={`border-4 border-gray-400 p-1 text-center ${hasRain ? 'bg-rain-pattern' : ''}`}
                                    >
                                        {text}
                                    </td>
                                );
                            })}

                            {/* Date Columns */}
                            {row.type === 'name' ? (
                                <>
                                    <td className="border-4 border-gray-400 p-1 font-bold text-center w-16 bg-gray-100 print:bg-gray-100">Week Start</td>
                                    <td className="border-4 border-gray-400 p-1 font-bold text-center w-16 bg-gray-100 print:bg-gray-100">Week End</td>
                                </>
                            ) : row.type === 'week' ? (
                                <>
                                    <td className="border-4 border-gray-400 p-1 text-center whitespace-nowrap">
                                        {weekDates[row.weekIndex]?.start || ''}
                                    </td>
                                    <td className="border-4 border-gray-400 p-1 text-center whitespace-nowrap">
                                        {weekDates[row.weekIndex]?.end || ''}
                                    </td>
                                </>
                            ) : (
                                /* Empty cells for Time, License, Style rows */
                                <>
                                    <td className="border-4 border-gray-400 p-1 bg-gray-50"></td>
                                    <td className="border-4 border-gray-400 p-1 bg-gray-50"></td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default PrintableSchedule;
