import React, { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { PlusIcon, TrashIcon } from '../Icons';
import { subtitlesToSRT, srtToSubtitles } from '../../utils/srt-parser';
import { formatTime } from '../../utils/time';

export const SubtitleEditor = () => {
    const [mode, setMode] = useState('cards');
    const {
        subtitles,
        currentTime,
        addSubtitles,
        setSubtitles,
        updateSubtitle,
        deleteSubtitle,
        setSelectedSubtitle,
        selectedSubtitleId,
        setCurrentTime
    } = useStore();

    const [rawSrt, setRawSrt] = useState('');

    // Sync internal state with store when subtitles change elsewhere OR when switching modes
    useEffect(() => {
        setRawSrt(subtitlesToSRT(subtitles));
    }, [subtitles]);

    const handleSrtChange = (val) => {
        setRawSrt(val);
        try {
            const newSubs = srtToSubtitles(val);
            // Only update store if parsing results in actual subtitles to avoid clearing on empty lines
            if (newSubs.length > 0 || val.trim() === '') {
                setSubtitles(newSubs);
            }
        } catch (e) {
            // Keep user input but don't sync invalid SRT to store
            console.warn("Invalid SRT format being typed...");
        }
    };

    const addSubtitleAtPlayhead = () => {
        const id = `sub-${Date.now()}`;
        addSubtitles([{
            id,
            text: "New Subtitle",
            startTime: currentTime,
            endTime: currentTime + 3,
        }]);
        setSelectedSubtitle(id);
    };

    return (
        <div className="flex flex-col h-full bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
                <h2 className="font-bold text-sm tracking-tight flex items-center space-x-2">
                    <span className="text-blue-500 uppercase">Subtitles</span>
                </h2>
                <div className="flex bg-zinc-800 p-1 rounded-lg">
                    <button
                        onClick={() => setMode('cards')}
                        className={`px-3 py-1 text-xs rounded-md transition ${mode === 'cards' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        Visual
                    </button>
                    <button
                        onClick={() => setMode('srt')}
                        className={`px-3 py-1 text-xs rounded-md transition ${mode === 'srt' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        Raw SRT
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                {mode === 'cards' ? (
                    <div className="p-4 space-y-3">
                        <button
                            onClick={addSubtitleAtPlayhead}
                            className="w-full py-3 flex items-center justify-center space-x-2 border-2 border-dashed border-zinc-700 rounded-xl hover:border-blue-500 hover:bg-blue-500/5 transition group"
                        >
                            <PlusIcon />
                            <span className="text-sm font-medium text-zinc-400 group-hover:text-blue-400">Add Subtitle Line</span>
                        </button>

                        {subtitles.sort((a, b) => a.startTime - b.startTime).map((sub, idx) => (
                            <div
                                key={sub.id}
                                onClick={() => { setSelectedSubtitle(sub.id); setCurrentTime(sub.startTime); }}
                                className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${selectedSubtitleId === sub.id ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/50' : 'border-zinc-800 bg-zinc-800/50 hover:border-zinc-700'}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-bold text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">#{idx + 1}</span>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deleteSubtitle(sub.id); }}
                                            className="p-1 text-zinc-500 hover:text-red-500 transition"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex space-x-2 mb-2 text-[11px] font-mono text-zinc-400">
                                    <div className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 w-24 text-center">
                                        {formatTime(sub.startTime)}
                                    </div>
                                    <span className="flex items-center">→</span>
                                    <div className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 w-24 text-center">
                                        {formatTime(sub.endTime)}
                                    </div>
                                </div>
                                <textarea
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 resize-none min-h-[60px]"
                                    value={sub.text}
                                    onChange={(e) => updateSubtitle(sub.id, { text: e.target.value })}
                                    placeholder="Subtitle text..."
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col">
                        <textarea
                            className="flex-1 w-full h-full bg-zinc-950 p-4 font-mono text-sm text-blue-400 focus:outline-none resize-none leading-relaxed"
                            value={rawSrt}
                            onChange={(e) => handleSrtChange(e.target.value)}
                            spellCheck={false}
                            placeholder={'1\n00:00:01,000 --> 00:00:04,000\nStart editing...'}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
