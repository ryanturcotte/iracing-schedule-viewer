export const formatTrackType = (type) => {
    if (!type || typeof type !== 'string') return '';
    return type
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};