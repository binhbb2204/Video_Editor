import { formatTime, parseTime } from './time';

export const subtitlesToSRT = (subtitles) => {
    return subtitles
        .sort((a, b) => a.startTime - b.startTime)
        .map((sub, index) => {
            const start = formatTime(sub.startTime).replace('.', ',');
            const end = formatTime(sub.endTime).replace('.', ',');
            return `${index + 1}\n${start} --> ${end}\n${sub.text}\n`;
        })
        .join('\n');
};

export const srtToSubtitles = (srt) => {
    const blocks = srt.trim().split(/\n\s*\n/);
    return blocks.map((block, index) => {
        const lines = block.split('\n');
        if (lines.length < 3) return null;

        const timeLine = lines[1];
        const [startStr, endStr] = timeLine.split(' --> ');
        const text = lines.slice(2).join('\n');

        return {
            id: `srt-${index}-${Date.now()}`,
            startTime: parseTime(startStr.replace(',', '.')),
            endTime: parseTime(endStr.replace(',', '.')),
            text: text.trim()
        };
    }).filter((s) => s !== null);
};
