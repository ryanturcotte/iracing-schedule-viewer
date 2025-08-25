import { useCallback } from 'react';

const fetchFileContent = async (fileName, fileDataMap) => {
    // Handle uploaded files from the map
    if (fileDataMap.has(fileName)) {
        const file = fileDataMap.get(fileName);
        if (file.type.startsWith('application/json')) {
            return { type: 'json', data: JSON.parse(await file.text()) };
        }
        if (file.type.startsWith('application/pdf')) {
            return { type: 'pdf', data: file };
        }
    }

    // Handle hosted files
    try {
        const scheduleFileUrl = `${import.meta.env.BASE_URL}schedules/${fileName}`;
        const response = await fetch(scheduleFileUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        if (fileName.endsWith('.json')) {
            return { type: 'json', data: await response.json() };
        }
        if (fileName.endsWith('.pdf')) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/pdf")) {
                return { type: 'pdf', data: await response.blob() };
            } else {
                throw new Error(`Expected PDF, but received content type: ${contentType || 'N/A'} for ${fileName}`);
            }
        }
    } catch (e) {
        console.error(`Could not fetch hosted file ${fileName}:`, e);
    }
    
    throw new Error(`File ${fileName} not found or accessible. If not uploading, ensure the file path is correct on the server.`);
};

export const useFileLoader = () => {
    const loadFile = useCallback(async (fileName, fileDataMap) => await fetchFileContent(fileName, fileDataMap), []);

    return { loadFile };
};