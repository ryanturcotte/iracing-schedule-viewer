import React, { useMemo } from 'react';
import { trackNameReplacements, trackConfigReplacements } from '../replacementMappings';

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

export default TracksDisplayTable;