import { useState, useEffect, useCallback } from 'react';
import { baseContent } from '../data/iracingContent';

const STORAGE_KEY = 'iracing-content-ownership';

export const useContentOwnership = () => {
    const [contentState, setContentState] = useState(() => {
        let savedObj = { tracks: {}, cars: {} };
        try {
            const savedState = localStorage.getItem(STORAGE_KEY);
            if (savedState) {
                savedObj = JSON.parse(savedState);
            }
        } catch (error) {
            console.error("Error loading content ownership from local storage:", error);
        }

        // Apply defaults for missing free content
        if (!savedObj.tracks) savedObj.tracks = {};
        if (!savedObj.cars) savedObj.cars = {};

        baseContent.freeTracks.forEach(track => {
            if (savedObj.tracks[track] === undefined) savedObj.tracks[track] = 'Free';
        });
        baseContent.freeCars.forEach(car => {
            if (savedObj.cars[car] === undefined) savedObj.cars[car] = 'Free';
        });

        return savedObj;
    });

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(contentState));
        } catch (error) {
            console.error("Error saving content ownership to local storage:", error);
        }
    }, [contentState]);

    const updateContent = useCallback((type, name, state) => {
        setContentState(prev => {
            const currentObj = prev[type] || {};
            const nextObj = { ...currentObj };
            
            if (state === 'Empty' || !state) {
                delete nextObj[name];
            } else {
                nextObj[name] = state;
            }

            return {
                ...prev,
                [type]: nextObj
            };
        });
    }, []);

    const importState = useCallback((jsonData) => {
        try {
            const parsed = JSON.parse(jsonData);
            if (parsed && typeof parsed === 'object' && (parsed.tracks || parsed.cars)) {
                setContentState({
                    tracks: parsed.tracks || {},
                    cars: parsed.cars || {}
                });
                return { success: true, message: 'Content data imported successfully.' };
            }
            return { success: false, message: 'Invalid file format. Missing tracks and cars JSON fields.' };
        } catch (error) {
            console.error('Failed to import content data:', error);
            return { success: false, message: 'Failed to parse JSON file.' };
        }
    }, []);

    const exportState = useCallback(() => {
        const jsonString = JSON.stringify(contentState, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        link.download = `iRacingContent-${year}${month}${day}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [contentState]);

    return {
        contentState,
        updateContent,
        importState,
        exportState
    };
};
