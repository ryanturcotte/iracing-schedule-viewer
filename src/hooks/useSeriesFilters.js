import { useState, useMemo, useCallback, useEffect } from 'react';
import { getCookie } from '../utils/cookies';

export const useSeriesFilters = (seasonsData, seriesHasRainMap) => {
    const [selectedLicenseLevels, setSelectedLicenseLevels] = useState(() => new Set(getCookie('selectedLicenseLevels') || []));
    const [selectedSeriesIds, setSelectedSeriesIds] = useState(() => new Set(getCookie('selectedSeriesIds') || []));
    const [selectedTrackTypes, setSelectedTrackTypes] = useState(() => new Set(getCookie('selectedTrackTypes') || []));
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearchInput, setShowSearchInput] = useState(false);
    const [filterByRain, setFilterByRain] = useState(() => getCookie('filterByRain') ?? false);
    const [includeYearLongSeries, setIncludeYearLongSeries] = useState(() => getCookie('includeYearLongSeries') || false);
    const [allSeriesSelected, setAllSeriesSelected] = useState(false);

    const filteredSeries = useMemo(() => {
        if (!seasonsData || !Array.isArray(seasonsData) || seasonsData.length === 0) return [];
        return seasonsData.filter(season => {
            if (!season || !season.schedules) return false;

            const isYearLong = season.schedules.length > 12;
            if (isYearLong && !includeYearLongSeries) return false;

            if (!season.license_group_human_readable) return false;
            const matchesLevel = selectedLicenseLevels.size === 0 || selectedLicenseLevels.has(season.license_group_human_readable);

            const seasonTrackTypesList = season.track_types?.map(tt => tt.track_type).filter(Boolean) || [];
            const matchesTrackType = selectedTrackTypes.size === 0 || (seasonTrackTypesList.length > 0 && seasonTrackTypesList.some(stt => selectedTrackTypes.has(stt)));

            const seriesKey = season.series_id || season.season_name;
            const matchesRain = !filterByRain || seriesHasRainMap.get(seriesKey);

            const searchHaystack = `${season.series_name || ''} ${season.season_name || ''}`.toLowerCase();
            const matchesSearch = !searchTerm || searchHaystack.includes(searchTerm.toLowerCase());
            
            return matchesLevel && matchesSearch && matchesTrackType && matchesRain;
        });
    }, [seasonsData, selectedLicenseLevels, searchTerm, selectedTrackTypes, includeYearLongSeries, filterByRain, seriesHasRainMap]);

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
    const handleTrackTypeChange = useCallback((type) => { setSelectedTrackTypes(prev => { const newSet = new Set(prev); if (newSet.has(type)) newSet.delete(type); else newSet.add(type); return newSet; }); }, []);
    
    const resetFilters = useCallback(() => {
        setSelectedSeriesIds(new Set());
        setSelectedLicenseLevels(new Set());
        setSelectedTrackTypes(new Set());
        setSearchTerm('');
        setFilterByRain(false);
        setIncludeYearLongSeries(false);
    }, []);

    return {
        selectedLicenseLevels, selectedSeriesIds, setSelectedSeriesIds,
        selectedTrackTypes, searchTerm, showSearchInput,
        filterByRain, setFilterByRain,
        includeYearLongSeries, setIncludeYearLongSeries,
        allSeriesSelected, filteredSeries,
        handleLicenseLevelChange, handleSearchToggle, handleSearchChange,
        handleSeriesSelectionChange, handleTrackTypeChange, handleSelectAllChange,
        resetFilters,
    };
};