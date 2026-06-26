export const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

export const parseTime = (timeStr) => {
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const sParts = parts[2].split(/[.,]/);
    const s = parseFloat(sParts[0]);
    const ms = sParts.length > 1 ? parseFloat(sParts[1]) : 0;
    return h * 3600 + m * 60 + s + ms / 1000;
};
