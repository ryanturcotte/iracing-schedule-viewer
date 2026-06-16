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
    applyCarListReplacements,
    timeReplacements,
    showLegend,
    showDates,
    paginate,
    currentPage = 0,
    customCellStyles = {},
    paintTool = { type: null, color: null },
    onCellClick = () => {},
    onMoveSeries = () => {}
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
    const prepareRows = () => {
        const rows = [
            { label: 'Time', type: 'frequency' },
            { label: 'License', type: 'license' },
            { label: 'Style', type: 'style' },
            { label: 'Series', type: 'name' }, // Headers for dates go here
        ];
        for (let i = 0; i < weekDates.length; i++) {
            rows.push({ label: `Week ${i + 1}`, type: 'week', weekIndex: i });
        }
        return rows;
    };
    const rows = prepareRows();

    // Helper to get cell content and rain status for a specific series and row type
    const getCellContent = (series, rowType, weekIndex) => {
        if (!series) return { text: '', hasRain: false };

        if (rowType === 'frequency') {
            const freqText = series.race_frequency || '';
            const processedFreq = applyReplacements(freqText, timeReplacements);
            return { text: processedFreq, hasRain: false };
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
            if (!weekTimestamp) return { text: '', hasRain: false };

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

    // --- Pagination Logic ---
    const MAX_COLS_PER_PAGE = 8;
    // If not paginate, just one chunk with all data
    const chunks = paginate && seriesData.length > MAX_COLS_PER_PAGE
        ? Array.from({ length: Math.ceil(seriesData.length / MAX_COLS_PER_PAGE) }, (_, i) =>
            seriesData.slice(i * MAX_COLS_PER_PAGE, i * MAX_COLS_PER_PAGE + MAX_COLS_PER_PAGE)
        )
        : [seriesData];

    return (
        <div className="w-full bg-white text-black p-4 font-sans print:p-0">
            <style>{`
                @media print {
                    @page {
                        size: landscape;
                        margin: 0.2cm;
                    }
                    html, body {
                        height: auto !important;
                        overflow: visible !important;
                        margin: 0 !important;
                    }
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        background: white;
                    }
                    /* Ensure table borders print */
                    table, th, td {
                        border: 2px solid black !important;
                        vertical-align: middle !important;
                        padding: 0 2px !important; /* Force tight horizontal padding */
                    }
                    tr {
                        break-inside: avoid;
                    }
                    tr.week-row {
                        height: 2.85rem !important;
                    }
                    /* Bold bottom border for series header */
                    td.print-bold-bottom {
                        border-bottom-width: 3px !important;
                    }
                }
                .bg-rain-pattern {
                    /* Cloud/Rain effect: Light blue background with subtle diagonal rain streaks */
                    background-color: #eff6ff !important; /* sky-50 */
                    background-image: repeating-linear-gradient(
                        135deg,
                        transparent,
                        transparent 5px,
                        #bfdbfe 5px,   /* blue-200 */
                        #bfdbfe 7px
                    ) !important;
                    print-color-adjust: exact !important;
                }
                .bg-slashes-pattern {
                    background-image: repeating-linear-gradient(
                        45deg,
                        transparent,
                        transparent 3px,
                        rgba(0,0,0,0.2) 3px,
                        rgba(0,0,0,0.2) 6px
                    ) !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                .page-break {
                    page-break-after: always; /* Legacy */
                    break-after: page;        /* Modern */
                }
            `}</style>

            {chunks.map((chunkSeries, chunkIndex) => (
                <div
                    key={chunkIndex}
                    className={`
                        ${chunkIndex < chunks.length - 1 ? "page-break mb-8 print:mb-0" : ""}
                        ${chunkIndex === currentPage ? 'block' : 'hidden print:block'}
                    `}
                >
                    <table className="w-full border-collapse border-4 print:border-2 border-gray-400 text-sm print:text-[10px] table-fixed">
                        {/* ... table content ... */}
                        <colgroup>
                            {showLegend && <col className="w-20 print:w-12" />}
                            {chunkSeries.map(s => (
                                <col key={s.series_id || s.season_name} />
                            ))}
                            {showDates && <col className="w-16 print:w-12" />}
                            {showDates && <col className="w-16 print:w-12" />}
                        </colgroup>
                        <tbody>
                            {rows.map((row, rowIndex) => {
                                const isWeekRow = row.type === 'week';
                                const rowClass = isWeekRow ? 'week-row h-14 print:h-auto' : 'h-auto';

                                return (
                                    <tr key={rowIndex} className={rowClass}>
                                        {/* First Column: Legend (Optional) */}
                                        {showLegend && (
                                            <td className={`border-4 print:border-2 border-gray-400 p-1 print:p-0 font-bold whitespace-nowrap bg-gray-100 print:bg-gray-100 ${row.type === 'name' ? 'border-b-black print-bold-bottom' : ''}`}>
                                                {row.label}
                                            </td>
                                        )}

                                        {/* Series Columns (Dynamic equal width via table-fixed) */}
                                        {chunkSeries.map((series) => {
                                            const { text, hasRain } = getCellContent(series, row.type, row.weekIndex);
                                            const isSeriesHeader = row.type === 'name';

                                            let fontSizeClass = '';
                                            if (isWeekRow) {
                                                if (text && text.length > 100) fontSizeClass = 'text-[10px] print:text-[8px] leading-tight';
                                                else if (text && text.length > 60) fontSizeClass = 'text-xs print:text-[9px] leading-tight';
                                                else fontSizeClass = 'text-sm print:text-[11px]';
                                            } else {
                                                fontSizeClass = 'text-xs print:text-[10px]';
                                            }

                                            let cellId = '';
                                            if (isWeekRow) {
                                                cellId = `${series.series_id || series.season_name}-week-${row.weekIndex}`;
                                            } else {
                                                cellId = `${series.series_id || series.season_name}-${row.type}-header`;
                                            }
                                            
                                            // Determine custom styles if present
                                            const cellStyleObj = customCellStyles[cellId] || {};
                                            const styleProp = {};
                                            if (cellStyleObj.bg) styleProp.backgroundColor = cellStyleObj.bg;
                                            if (cellStyleObj.fg) styleProp.color = cellStyleObj.fg;
                                            if (cellStyleObj.bold) styleProp.fontWeight = 'bold';

                                            let textDeco = [];
                                            if (cellStyleObj.underline) textDeco.push('underline');
                                            if (cellStyleObj.strikethrough) textDeco.push('line-through');
                                            if (textDeco.length > 0) styleProp.textDecoration = textDeco.join(' ');

                                            let extraClassNames = '';
                                            if (cellStyleObj.bg_pattern) {
                                                extraClassNames += ` ${cellStyleObj.bg_pattern}`;
                                            }

                                            const applyRainPattern = hasRain && !cellStyleObj.bg && !cellStyleObj.bg_pattern;

                                            return (
                                                <td
                                                    key={series.series_id || series.season_name}
                                                    data-cell-id={cellId}
                                                    onClick={() => { if (paintTool.type) onCellClick(cellId); }}
                                                    style={styleProp}
                                                    className={`border-4 print:border-2 border-gray-400 p-1 print:p-0 text-center break-words ${applyRainPattern ? 'bg-rain-pattern' : ''} ${extraClassNames} ${isSeriesHeader ? 'border-b-black print-bold-bottom' : ''} ${fontSizeClass} ${paintTool.type ? 'cursor-crosshair hover:opacity-80' : ''}`}
                                                >
                                                    {isSeriesHeader ? (
                                                        <div className="flex flex-col items-center">
                                                            <div className="flex w-full justify-between items-center print:hidden mb-1 px-1">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); onMoveSeries(series.series_id || series.season_name, -1); }}
                                                                    className="text-gray-400 hover:text-blue-600 focus:outline-none bg-white hover:bg-gray-100 rounded shadow-xs leading-none p-1"
                                                                    title="Move Left"
                                                                >
                                                                    ◀
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); onMoveSeries(series.series_id || series.season_name, 1); }}
                                                                    className="text-gray-400 hover:text-blue-600 focus:outline-none bg-white hover:bg-gray-100 rounded shadow-xs leading-none p-1"
                                                                    title="Move Right"
                                                                >
                                                                    ▶
                                                                </button>
                                                            </div>
                                                            <span className="font-extrabold">{text}</span>
                                                        </div>
                                                    ) : text}
                                                </td>
                                            );
                                        })}

                                        {/* Date Columns (Optional) */}
                                        {showDates && (
                                            row.type === 'name' ? (
                                                <>
                                                    <td className="border-4 print:border-2 border-gray-400 p-1 print:p-0 font-bold text-center bg-gray-100 print:bg-gray-100 whitespace-nowrap border-b-black print-bold-bottom">Start</td>
                                                    <td className="border-4 print:border-2 border-gray-400 p-1 print:p-0 font-bold text-center bg-gray-100 print:bg-gray-100 whitespace-nowrap border-b-black print-bold-bottom">End</td>
                                                </>
                                            ) : row.type === 'week' ? (
                                                <>
                                                    <td className="border-4 print:border-2 border-gray-400 p-1 print:p-0 text-center whitespace-nowrap">
                                                        {weekDates[row.weekIndex]?.start || ''}
                                                    </td>
                                                    <td className="border-4 print:border-2 border-gray-400 p-1 print:p-0 text-center whitespace-nowrap">
                                                        {weekDates[row.weekIndex]?.end || ''}
                                                    </td>
                                                </>
                                            ) : (
                                                /* Empty cells for Time, License, Style rows */
                                                <>
                                                    <td className="border-4 print:border-2 border-gray-400 p-1 print:p-0 bg-gray-50"></td>
                                                    <td className="border-4 print:border-2 border-gray-400 p-1 print:p-0 bg-gray-50"></td>
                                                </>
                                            )
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

export default PrintableSchedule;
