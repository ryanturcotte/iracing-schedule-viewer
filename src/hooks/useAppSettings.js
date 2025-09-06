import { useState } from 'react';
import { getCookie } from '../utils/cookies';

export const useAppSettings = () => {
    const [isDarkMode, setIsDarkMode] = useState(() => getCookie('isDarkMode') ?? true);
    const [isMinimizerActive, setIsMinimizerActive] = useState(() => getCookie('isMinimizerActive') || false);
    const [isDebugMode, setIsDebugMode] = useState(() => getCookie('isDebugMode') ?? false);

    const resetAppSettings = () => {
        setIsDarkMode(true);
        setIsMinimizerActive(false);
        setIsDebugMode(false);
    };

    return {
        isDarkMode,
        setIsDarkMode,
        isMinimizerActive,
        setIsMinimizerActive,
        isDebugMode,
        setIsDebugMode,
        resetAppSettings,
    };
};