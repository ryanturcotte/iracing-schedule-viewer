import React, { useState, useMemo, useRef } from 'react';
import { trackNameReplacements, carConfigReplacements } from '../replacementMappings';
import { baseContent } from '../data/iracingContent';

const ContentList = ({ selectedSeriesData, isDarkMode, applyReplacements, isMinimizerActive, contentState, updateContent, importState, exportState }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [message, setMessage] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const fileInputRef = useRef(null);

    const uniqueItems = useMemo(() => {
        if (!selectedSeriesData || selectedSeriesData.length === 0) return { tracks: [], cars: [] };
        const tracksSet = new Set();
        const carsSet = new Set();

        selectedSeriesData.forEach(series => {
            const isRingMeister = series.season_name.includes("Ring Meister");
            const isTrackPlusCar = series.season_name.includes("Draft Master") || series.season_name.includes("Outlaw Micro Showdown");

            series.schedules?.forEach(schedule => {
                // Tracks
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

                if (trackPart) {
                    const cleanedTrackPart = trackPart.replace(/,?\s*Constant weather.*$/i, '').trim();
                    let finalTrackName = cleanedTrackPart;
                    if (isMinimizerActive) {
                        finalTrackName = applyReplacements(finalTrackName, trackNameReplacements);
                    }
                    tracksSet.add(finalTrackName);
                }

                // Cars
                // Just relying on season.car_types for general series
                if (series.car_types) {
                    series.car_types.forEach(ct => {
                        let finalCarName = ct.car_type;
                         if (isMinimizerActive) {
                             finalCarName = applyReplacements(finalCarName, carConfigReplacements);
                         }
                        carsSet.add(finalCarName);
                    });
                }
            });
        });

        // Add master lists
        baseContent.freeTracks.forEach(t => tracksSet.add(t));
        baseContent.freeCars.forEach(c => carsSet.add(c));
        baseContent.allOtherCars.forEach(c => carsSet.add(c));

        return {
            tracks: Array.from(tracksSet).sort((a, b) => a.localeCompare(b)),
            cars: Array.from(carsSet).sort((a, b) => a.localeCompare(b))
        };
    }, [selectedSeriesData, isMinimizerActive, applyReplacements]);

    if (!isExpanded) {
        return (
            <div className={`mt-6 mb-4 border rounded-md p-4 ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-300'}`}>
                <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsExpanded(true)}>
                    <div>
                        <h2 className={`text-xl font-semibold flex items-center gap-2 ${isDarkMode ? 'text-neutral-200' : 'text-blue-700'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                            </svg>
                            Buying Guide (Content Ownership)
                        </h2>
                        <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-gray-500'}`}>Manage your owned tracks and cars to highlight them in the schedule.</p>
                    </div>
                </div>
            </div>
        );
    }

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const jsonData = event.target.result;
            const res = importState(jsonData);
            setMessage(res.message);
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    const StatusSelect = ({ type, name }) => {
        const value = contentState?.[type]?.[name] || 'Empty';
        
        return (
            <select
                value={value}
                onChange={(e) => updateContent(type, name, e.target.value)}
                className={`text-sm rounded border px-2 py-1 ${isDarkMode ? 'bg-neutral-700 border-neutral-600 text-white' : 'bg-white border-gray-300 text-black'} ${value !== 'Empty' ? 'font-semibold' : ''}`}
            >
                <option value="Empty">Unowned / Base</option>
                <option value="Free">Free</option>
                <option value="Purchased">Purchased</option>
                <option value="Wishlist">Wishlist</option>
            </select>
        );
    };

    const filterItems = (list) => {
        if (!searchQuery) return list;
        return list.filter(item => item.toLowerCase().includes(searchQuery.toLowerCase()));
    };

    const tracksToShow = filterItems(uniqueItems.tracks);
    const carsToShow = filterItems(uniqueItems.cars);

    return (
        <div className={`mt-6 mb-4 border rounded-md p-4 shadow-sm ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-300'}`}>
            <div className="flex justify-between items-start mb-4">
                <div>
                     <h2 className={`text-xl font-semibold flex items-center gap-2 cursor-pointer ${isDarkMode ? 'text-neutral-200' : 'text-blue-700'}`} onClick={() => setIsExpanded(false)}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                        Buying Guide (Content Ownership)
                    </h2>
                     <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-gray-500'}`}>Set items as Purchased or Wishlist. These details will be added to the tables and CSV exports.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={exportState}
                        className={`text-sm px-3 py-1.5 rounded transition ${isDarkMode ? 'bg-neutral-700 hover:bg-neutral-600 text-white' : 'bg-blue-100 hover:bg-blue-200 text-blue-800'}`}
                    >
                        Export JSON
                    </button>
                    <div>
                        <input type="file" accept=".json" onChange={handleFileChange} className="hidden" ref={fileInputRef} />
                        <button
                            onClick={() => fileInputRef.current.click()}
                            className={`text-sm px-3 py-1.5 rounded transition ${isDarkMode ? 'bg-neutral-700 hover:bg-neutral-600 text-white' : 'bg-green-100 hover:bg-green-200 text-green-800'}`}
                        >
                            Import JSON
                        </button>
                    </div>
                </div>
            </div>

            {message && <p className={`text-sm mb-4 p-2 rounded ${message.includes('success') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{message}</p>}

            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Search content..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full max-w-sm px-3 py-1.5 text-sm rounded border ${isDarkMode ? 'bg-neutral-700 border-neutral-600 text-white placeholder-neutral-400' : 'bg-white border-gray-300 text-black'}`}
                />
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                    <h3 className={`font-semibold mb-2 border-b pb-1 ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>Tracks</h3>
                    <div className="max-h-96 overflow-y-auto pr-2">
                        {tracksToShow.length === 0 ? <p className="text-sm text-gray-500 italic">No tracks found.</p> : tracksToShow.map(track => (
                            <div key={track} className={`flex justify-between items-center py-1.5 border-b last:border-0 ${isDarkMode ? 'border-neutral-700/50' : 'border-gray-100'}`}>
                                <span className={`text-sm mr-2 ${isDarkMode ? 'text-neutral-300' : 'text-gray-800'}`}>{track}</span>
                                <StatusSelect type="tracks" name={track} />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex-1">
                    <h3 className={`font-semibold mb-2 border-b pb-1 ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>Cars</h3>
                    <div className="max-h-96 overflow-y-auto pr-2">
                        {carsToShow.length === 0 ? <p className="text-sm text-gray-500 italic">No cars found.</p> : carsToShow.map(car => (
                            <div key={car} className={`flex justify-between items-center py-1.5 border-b last:border-0 ${isDarkMode ? 'border-neutral-700/50' : 'border-gray-100'}`}>
                                <span className={`text-sm mr-2 ${isDarkMode ? 'text-neutral-300' : 'text-gray-800'}`}>{car}</span>
                                <StatusSelect type="cars" name={car} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContentList;
