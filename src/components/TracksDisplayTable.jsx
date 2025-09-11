import React, { useMemo } from 'react';
import { trackNameReplacements } from '../replacementMappings';

// Component to display unique tracks from selected series
const TracksDisplayTable = ({ selectedSeriesData, isDarkMode, applyReplacements, isMinimizerActive }) => {
    const trackCounts = useMemo(() => {
        if (!selectedSeriesData || selectedSeriesData.length === 0) return [];
        const counts = new Map();

        selectedSeriesData.forEach(series => {
            const tracksInSeries = new Set();
            series.schedules?.forEach(schedule => {
                let trackPart = '';

                // Extract base track name
                if (schedule.track && typeof schedule.track === 'object' && schedule.track.track_name) {
                    trackPart = schedule.track.track_name;
                } else if (schedule.track_name) { // PDF-like data
                    const separator = " - ";
                    const separatorIndex = schedule.track_name.lastIndexOf(separator);
                    if (separatorIndex !== -1) {
                        // This logic is intentionally simple to get the base track name,
                        // even if the full string from the PDF contains other details.
                        trackPart = schedule.track_name.substring(0, separatorIndex);
                    } else {
                        trackPart = schedule.track_name;
                    }
                }

                if (trackPart) {
                    // Clean up extra details that might be included from PDF parsing, like weather info.
                    // This handles cases like "Track Name, Constant weather" and "Track Name Constant weather".
                    const cleanedTrackPart = trackPart
                        .replace(/,?\s*Constant weather.*$/i, '')
                        .trim();
                    tracksInSeries.add(cleanedTrackPart);
                }
            });

            tracksInSeries.forEach(trackName => {
                let finalTrackName = trackName;
                // Apply minimizer if active
                if (isMinimizerActive) {
                    finalTrackName = applyReplacements(finalTrackName, trackNameReplacements);
                }
                counts.set(finalTrackName, (counts.get(finalTrackName) || 0) + 1);
            });
        });

        return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }, [selectedSeriesData, isMinimizerActive, applyReplacements]);

    if (trackCounts.length === 0) {
        return <p className={`text-sm ${isDarkMode ? 'text-neutral-400' : 'text-gray-600'}`}>No tracks to display for selected series.</p>;
    }

    return (
        <div>
            <h3 className={`text-xl font-semibold mb-3 ${isDarkMode ? 'text-neutral-200' : 'text-gray-700'}`}>Tracks in Selected Series ({trackCounts.length})</h3>
            <div className={`max-h-[60vh] overflow-y-auto border rounded-md p-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-850' : 'border-gray-300 bg-gray-50'}`}>
                <table className={`w-full text-sm ${isDarkMode ? 'text-neutral-300' : 'text-gray-700'}`}>
                    <tbody>
                        {trackCounts.map((track, index) => (
                            <tr key={index} className={`border-b ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
                                <td className="py-1.5 pr-4">{track.name}</td>
                                <td className="py-1.5 text-right font-semibold">{track.count}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TracksDisplayTable;