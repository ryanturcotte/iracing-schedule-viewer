import { timeReplacements, trackNameReplacements, trackConfigReplacements } from '../replacementMappings';
import { formatTrackType } from './formatting';

// Helper to escape special characters for RegExp
const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
};

const applyReplacements = (text, replacementsList, isMinimizerActive) => {
    if (!text || typeof text !== 'string' || !isMinimizerActive) return text;
    let newText = text;
    for (const rule of replacementsList) {
        newText = newText.replace(new RegExp(escapeRegExp(rule.original), 'gi'), rule.replacement);
    }
    return newText;
};

export const generateCsv = ({ seasonsData, selectedSeriesIds, isMinimizerActive, getCarsForWeek, applyCarListReplacements, carConfigReplacements }) => {
    const selected = seasonsData.filter(season => selectedSeriesIds.has(season.series_id || season.season_name));
    if (selected.length === 0) {
        return { success: false, message: 'Please select at least one series to generate CSV.' };
    }

    const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;

    const dataRows = {
        Time: ['Time'], License: ['License'], Style: ['Style'], Name: ['Name']
    };
    for (let i = 1; i <= 12; i++) {
        dataRows[`Track${i}`] = [`Track${i}`];
    }

    selected.forEach(series => {
        const frequencyText = series.race_frequency ? applyReplacements(series.race_frequency, timeReplacements, isMinimizerActive) : 'N/A';
        dataRows.Time.push(frequencyText);
        dataRows.License.push(series.license_group_human_readable || 'N/A');
        const seriesStyles = series.track_types?.map(tt => formatTrackType(tt.track_type)).filter(Boolean).join(' / ') || 'N/A';
        dataRows.Style.push(seriesStyles);
        dataRows.Name.push(series.season_name);

        for (let i = 0; i < 12; i++) {
            const schedule = series.schedules.find(s => s.race_week_num === i);
            let cellData = '';

            if (schedule) {
                let trackPart = '';
                let configPart = '';
                let weeklyCarsPart = '';

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

                const rainChance = schedule.rain_chance || schedule.track?.rain_chance || 0;

                trackPart = applyReplacements(trackPart, trackNameReplacements, isMinimizerActive);
                configPart = applyReplacements(configPart, trackConfigReplacements, isMinimizerActive);

                if (isSpecialSeries) {
                    const minimizedCars = applyCarListReplacements(weeklyCarsPart, carConfigReplacements); // Use the passed-in function
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

                if (rainChance > 0) {
                    cellData += ` (${rainChance}%)`;
                }
            }
            dataRows[`Track${i + 1}`].push(cellData);
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

    return { success: true, message: 'CSV generated successfully!' };
};
