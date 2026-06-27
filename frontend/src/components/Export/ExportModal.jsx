import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { ExportIcon } from '../Icons';

const API_URL = 'http://localhost:8080';

export const ExportModal = ({ onClose }) => {
    const { videoClips, subtitles, globalStyle, getDuration, projectName, addExportJob, exportJobs, projectResolution } = useStore();
    const [format, setFormat] = useState('mp4');
    const [resolution, setResolution] = useState(`${projectResolution.width}x${projectResolution.height}`);
    
    // Global Export State Machine
    const activeJob = exportJobs.find(j => j.status === 'pending' || j.status === 'processing');
    let modalState = activeJob ? 'EXPORTING' : 'IDLE';

    const progress = activeJob ? activeJob.progress : 0;
    const exportStatus = activeJob 
        ? (activeJob.status === 'processing' ? `Encoding: ${progress}%` : activeJob.status)
        : '';

    // No polling here anymore

    const handleExport = async () => {
        const effectiveDuration = getDuration();

        if (modalState === 'EXPORTING') {
            console.warn('Export is already running. Please wait for it to finish.');
            return;
        }

        // Check if there's any content to export
        if (videoClips.length === 0 && subtitles.length === 0) {
            alert('No content to export. Add a video or subtitles first.');
            return;
        }

        try {
            // Prepare form data
            const formData = new FormData();

            if (videoClips.length > 0) {
                // Upload all unique video sources
                const uniqueUrls = [...new Set(videoClips.map(c => c.url))];
                const urlToIndex = {};

                for (let i = 0; i < uniqueUrls.length; i++) {
                    const url = uniqueUrls[i];
                    urlToIndex[url] = i;
                    const videoResponse = await fetch(url);
                    const videoBlob = await videoResponse.blob();
                    formData.append(`video_${i}`, videoBlob, `video_${i}.mp4`);
                }

                // Send clips metadata with timeline info
                const clipsData = videoClips.map(clip => ({
                    videoIndex: urlToIndex[clip.url],
                    startTimeInTimeline: clip.startTimeInTimeline,
                    startOffset: clip.startOffset,
                    duration: clip.duration,
                    zOrder: clip.zOrder ?? 0,
                    transformX: clip.transformX ?? 50,
                    transformY: clip.transformY ?? 50,
                    transformWidth: clip.transformWidth ?? 100,
                    transformHeight: clip.transformHeight ?? 100
                }));
                formData.append('clips', JSON.stringify(clipsData));
                formData.append('videoCount', uniqueUrls.length.toString());
            } else {
                // Subtitle-only mode - send duration for black background
                formData.append('subtitleOnly', 'true');
            }

            // Always send effective duration (includes subtitle extensions)
            formData.append('duration', effectiveDuration.toString());
            formData.append('subtitles', JSON.stringify(subtitles));
            formData.append('globalStyle', JSON.stringify(globalStyle));
            formData.append('resolution', resolution);
            formData.append('format', format);
            formData.append('projectName', projectName || "Untitled Project");

            // Start export
            const response = await fetch(`${API_URL}/api/export`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Export failed');
            }

            const data = await response.json();
            
            addExportJob({
                id: data.jobId,
                name: projectName || "Untitled Project",
                status: 'pending',
                progress: 0,
                dismissed: false
            });

            onClose();

        } catch (error) {
            console.error('Export error:', error);
            alert(`Error: ${error.message}`);
        }
    };

    const handleCancel = async () => {
        if (modalState !== 'EXPORTING' || !activeJob) {
            onClose();
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/export/cancel/${activeJob.id}`, {
                method: 'POST',
            });
            if (response.ok) {
                onClose();
            }
        } catch (error) {
            console.error('Cancel export error:', error);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="text-xl font-bold">Export Video</h3>
                    <button onClick={onClose} disabled={modalState === 'EXPORTING'} className="text-zinc-500 hover:text-white transition disabled:opacity-50">✕</button>
                </div>

                <div className="p-6 space-y-6">
                    {modalState === 'IDLE' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase">Resolution</label>
                                    <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm focus:ring-2 ring-blue-500 outline-none" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                                        <option value="1080">1080p Full HD</option>
                                        <option value="720">720p HD</option>
                                        <option value="4k">4K Ultra HD</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase">Format</label>
                                    <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm focus:ring-2 ring-blue-500 outline-none" value={format} onChange={(e) => setFormat(e.target.value)}>
                                        <option value="mp4">MP4 (Best)</option>
                                        <option value="webm">WebM</option>
                                    </select>
                                </div>
                            </div>
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-200">
                                <strong>Server Export:</strong> Video is processed on backend with FFmpeg for perfect quality and audio sync.
                            </div>
                        </>
                    )}

                    {modalState === 'EXPORTING' && (
                        <div className="py-12 flex flex-col items-center justify-center space-y-6">
                            <div className="relative w-32 h-32">
                                <svg className="w-full h-full -rotate-90">
                                    <circle cx="64" cy="64" r="60" className="stroke-zinc-800 fill-none" strokeWidth="8" />
                                    <circle cx="64" cy="64" r="60" className="stroke-blue-500 fill-none transition-all duration-300" strokeWidth="8" strokeDasharray="377" strokeDashoffset={377 - (377 * progress / 100)} strokeLinecap="round" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center text-2xl font-black">{progress}%</div>
                            </div>
                            <div className="text-center">
                                <p className="font-bold">{exportStatus}</p>
                                <p className="text-zinc-500 text-xs mt-1">FFmpeg processing with audio</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-zinc-950/50 flex space-x-3">
                    {modalState === 'EXPORTING' && (
                        <button onClick={handleCancel} className="flex-1 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10 rounded-xl transition border border-red-500/20">Cancel Export</button>
                    )}

                    {modalState === 'IDLE' && (
                        <>
                            <button onClick={onClose} className="flex-1 py-3 text-sm font-bold text-zinc-400 hover:text-white transition">Cancel</button>
                            <button onClick={handleExport} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition flex items-center justify-center space-x-2">
                                <ExportIcon /> <span>Start Export</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
