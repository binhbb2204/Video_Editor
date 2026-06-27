import React, { useRef } from 'react';
import { useStore } from '../../store';
import { PlusIcon, TrashIcon } from '../Icons';
import { Film, Image, Music, GripVertical } from 'lucide-react';

export const MediaLibrary = () => {
    const { importedMedia, addImportedMedia, removeImportedMedia, addVideoClip, setDuration, getDuration } = useStore();
    const fileInputRef = useRef(null);

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach((file) => {
            const url = URL.createObjectURL(file);
            const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image';
            const id = `media-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

            if (type === 'video') {
                const tempVideo = document.createElement('video');
                tempVideo.preload = 'metadata';
                tempVideo.src = url;
                let done = false;
                const onMeta = () => {
                    if (done) return;
                    let d = tempVideo.duration;
                    if (!Number.isFinite(d) || d <= 0) return;
                    done = true;
                    // Generate thumbnail
                    tempVideo.currentTime = 1;
                    tempVideo.onseeked = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 160;
                        canvas.height = 90;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(tempVideo, 0, 0, 160, 90);
                        const thumbnail = canvas.toDataURL('image/jpeg', 0.6);
                        addImportedMedia({ id, name: file.name, url, type, duration: d, thumbnail });
                    };
                };
                tempVideo.onloadedmetadata = onMeta;
                tempVideo.ondurationchange = onMeta;
            } else if (type === 'audio') {
                const tempAudio = document.createElement('audio');
                tempAudio.preload = 'metadata';
                tempAudio.src = url;
                tempAudio.onloadedmetadata = () => {
                    addImportedMedia({ id, name: file.name, url, type, duration: tempAudio.duration, thumbnail: null });
                };
            } else {
                addImportedMedia({ id, name: file.name, url, type, duration: 5, thumbnail: url });
            }
        });
        e.target.value = '';
    };

    const handleDragStart = (e, media) => {
        e.dataTransfer.setData('application/json', JSON.stringify(media));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleAddToTimeline = (media) => {
        const currentDuration = getDuration();
        const clip = {
            id: `clip-${Date.now()}`,
            name: media.name,
            url: media.url,
            duration: media.duration,
            startTimeInTimeline: currentDuration > 0 ? currentDuration : 0,
            startOffset: 0,
            playbackRate: 1
        };
        addVideoClip(clip);
        setDuration(clip.startTimeInTimeline + clip.duration + 0.1);
    };

    const getTypeIcon = (type) => {
        if (type === 'video') return <Film className="w-3.5 h-3.5" />;
        if (type === 'audio') return <Music className="w-3.5 h-3.5" />;
        return <Image className="w-3.5 h-3.5" />;
    };

    const formatDuration = (d) => {
        if (!d || !Number.isFinite(d)) return '';
        const m = Math.floor(d / 60);
        const s = Math.floor(d % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
                <h2 className="font-bold text-sm tracking-tight flex items-center space-x-2">
                    <span className="text-blue-400 uppercase">My Media</span>
                </h2>
            </div>

            <div className="p-3">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/20"
                >
                    <PlusIcon />
                    <span>Import Media</span>
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept="video/*,audio/*,image/*"
                    multiple
                />
            </div>

            <div className="flex-1 overflow-auto px-3 pb-3">
                {importedMedia.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-8 text-zinc-500">
                        <Film className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-xs">Import videos, images,</p>
                        <p className="text-xs">or audio files</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {importedMedia.map((media) => (
                            <div
                                key={media.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, media)}
                                className="group relative bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 hover:border-blue-500/50 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing transition-all"
                            >
                                {/* Thumbnail */}
                                <div className="aspect-video bg-zinc-900 flex items-center justify-center relative overflow-hidden">
                                    {media.thumbnail ? (
                                        <img src={media.thumbnail} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex items-center justify-center text-zinc-600">
                                            {getTypeIcon(media.type)}
                                        </div>
                                    )}

                                    {/* Duration badge */}
                                    {media.duration > 0 && (
                                        <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] text-zinc-300 px-1.5 py-0.5 rounded font-mono">
                                            {formatDuration(media.duration)}
                                        </span>
                                    )}

                                    {/* Drag grip */}
                                    <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <GripVertical className="w-3 h-3 text-zinc-400" />
                                    </div>

                                    {/* Hover actions */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleAddToTimeline(media); }}
                                            className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white transition"
                                            title="Add to timeline"
                                        >
                                            <PlusIcon />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeImportedMedia(media.id); }}
                                            className="p-1.5 bg-red-600/80 hover:bg-red-500 rounded text-white transition"
                                            title="Remove"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>

                                {/* Name */}
                                <div className="px-2 py-1.5 flex items-center gap-1.5">
                                    <span className="text-zinc-500">{getTypeIcon(media.type)}</span>
                                    <span className="text-[10px] text-zinc-300 font-medium truncate flex-1">{media.name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
