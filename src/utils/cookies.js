export const setCookie = (name, value, days) => {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    // Convert Set to Array before stringifying
    const valueToStore = value instanceof Set ? Array.from(value) : value;
    document.cookie = name + "=" + (JSON.stringify(valueToStore) || "") + expires + "; path=/";
};

export const getCookie = (name) => {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
            const value = c.substring(nameEQ.length, c.length);
            try {
                return JSON.parse(value);
            } catch (e) {
                console.error(`Error parsing cookie ${name}:`, e);
                return null;
            }
        }
    }
    return null;
};