import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../../store';
import { PlayIcon, PauseIcon, PlusIcon, VolumeIcon, MuteIcon } from '../Icons';
import { SkipBack, Rewind, FastForward } from 'lucide-react';

export const VideoPreview = () => {
    const {
        videoClips,
        subtitles,
        currentTime,
        isPlaying,
        setPlaying,
        setCurrentTime,
        globalStyle,
        selectedSubtitleId,
        setSelectedSubtitle,
        updateSubtitle,
        getDuration
    } = useStore();

    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const [innerBoxElement, setInnerBoxElement] = useState(null);
    const [interaction, setInteraction] = useState(null);
    const [videoDimensions, setVideoDimensions] = useState({ width: 16, height: 9 });
    const [currentScale, setCurrentScale] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [guides, setGuides] = useState({ centerX: false, centerY: false });
    const [editingSubId, setEditingSubId] = useState(null);

    // Track if we're currently playing to avoid seeking during playback
    const isPlayingRef = useRef(false);
    // Track last user-initiated seek time to detect manual seeks
    const lastUserSeekTime = useRef(null);
    // Track last frame time for subtitle-only playback
    const lastFrameTimeRef = useRef(null);

    const REFERENCE_WIDTH = 1280;

    useEffect(() => {
        if (!innerBoxElement) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry && entry.contentRect.width > 0) {
                setCurrentScale(entry.contentRect.width / REFERENCE_WIDTH);
            }
        });
        observer.observe(innerBoxElement);
        return () => observer.disconnect();
    }, [innerBoxElement]);

    const innerBoxRef = useCallback((node) => {
        setInnerBoxElement(node);
    }, []);

    const currentClip = videoClips.find((clip) =>
        currentTime >= clip.startTimeInTimeline &&
        currentTime <= clip.startTimeInTimeline + clip.duration
    );

    // Only sync video position when:
    // 1. Not playing (user is seeking via timeline)
    // 2. Just started playing (need initial position)
    useEffect(() => {
        if (!videoRef.current || !currentClip) return;

        const targetVideoTime = (currentTime - currentClip.startTimeInTimeline) + currentClip.startOffset;

        const diff = Math.abs(videoRef.current.currentTime - targetVideoTime);

        // Allow seeking if we're NOT playing OR if the difference is significant (manual seek)
        // When playing normally, diff is small (~0.016s), so this won't interfere with playback
        if (!isPlaying || diff > 0.5) {
            if (diff > 0.1) {
                videoRef.current.currentTime = targetVideoTime;
            }
        }
    }, [currentTime, currentClip, isPlaying]);

    // Handle play/pause transitions
    useEffect(() => {
        isPlayingRef.current = isPlaying;

        // Reset frame time when play state changes
        if (isPlaying) {
            lastFrameTimeRef.current = performance.now();
        }

        if (!videoRef.current) return;

        if (isPlaying && currentClip) {
            // When starting to play, sync to correct position first
            const targetVideoTime = (currentTime - currentClip.startTimeInTimeline) + currentClip.startOffset;
            if (Math.abs(videoRef.current.currentTime - targetVideoTime) > 0.3) {
                videoRef.current.currentTime = targetVideoTime;
            }
            videoRef.current.play().catch(() => setPlaying(false));
        } else if (videoRef.current) {
            videoRef.current.pause();
        }
    }, [isPlaying, currentClip, setPlaying]);

    // Track if we were in video mode last tick (to reset timer on transition)
    const wasInVideoModeRef = useRef(false);

    // RAF loop - handles both video-based and timer-based playback
    useEffect(() => {
        let raf;

        const tick = () => {
            const effectiveDuration = getDuration(); // Get fresh duration each tick

            if (isPlayingRef.current) {
                const storeCurrentTime = useStore.getState().currentTime;
                const storeVideoClips = useStore.getState().videoClips;

                // Find current clip at this exact time
                const clipAtCurrentTime = storeVideoClips.find((clip) =>
                    storeCurrentTime >= clip.startTimeInTimeline &&
                    storeCurrentTime <= clip.startTimeInTimeline + clip.duration
                );

                const isVideoMode = videoRef.current && clipAtCurrentTime && !videoRef.current.paused;

                if (isVideoMode) {
                    // Video-based playback - sync from video element
                    const nextTime = (videoRef.current.currentTime - clipAtCurrentTime.startOffset) + clipAtCurrentTime.startTimeInTimeline;
                    setCurrentTime(nextTime);
                    wasInVideoModeRef.current = true;
                } else {
                    // Timer-based playback for:
                    // 1. Gaps between video clips (no clipAtCurrentTime)
                    // 2. After all videos end (subtitle continues)
                    // 3. Subtitle-only mode (videoClips.length === 0)
                    // 4. Video paused but we should still be playing

                    // Reset timer if we just transitioned from video mode
                    if (wasInVideoModeRef.current) {
                        lastFrameTimeRef.current = performance.now();
                        wasInVideoModeRef.current = false;
                    }

                    const now = performance.now();
                    if (lastFrameTimeRef.current) {
                        const deltaMs = now - lastFrameTimeRef.current;
                        const deltaSeconds = deltaMs / 1000;

                        // Cap delta to prevent huge jumps (max 100ms per frame)
                        const cappedDelta = Math.min(deltaSeconds, 0.1);
                        const newTime = storeCurrentTime + cappedDelta;

                        if (newTime >= effectiveDuration) {
                            // Reached end, stop playback
                            setCurrentTime(effectiveDuration);
                            setPlaying(false);
                        } else {
                            setCurrentTime(newTime);
                        }
                    }
                    lastFrameTimeRef.current = now;
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [setCurrentTime, getDuration, setPlaying]);

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setVideoDimensions({
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight
            });
        }
    };

    const activeSubtitles = subtitles.filter((s) => currentTime >= s.startTime && currentTime <= s.endTime);

    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0,0,0';
    };

    const handlePointerDown = (e, subId, type, handle = 'center') => {
        e.stopPropagation();
        setSelectedSubtitle(subId);
        const sub = subtitles.find((s) => s.id === subId);
        if (!sub) return;

        const style = { ...globalStyle, ...sub.style };
        setInteraction({
            type,
            handle,
            startX: e.clientX,
            startY: e.clientY,
            originalX: style.x,
            originalY: style.y,
            originalSize: style.fontSize,
            originalWidth: style.width
        });
        e.target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!interaction || !selectedSubtitleId || !innerBoxElement) return;
        const sub = subtitles.find((s) => s.id === selectedSubtitleId);
        if (!sub) return;

        const rect = innerBoxElement.getBoundingClientRect();
        const deltaX = e.clientX - interaction.startX;
        const deltaY = e.clientY - interaction.startY;

        const SNAP_THRESHOLD = 2; // 2% threshold for snapping

        if (interaction.type === 'move') {
            const pctX = (deltaX / rect.width) * 100;
            const pctY = (deltaY / rect.height) * 100;
            let newX = Math.round((interaction.originalX + pctX) * 10) / 10;
            let newY = Math.round((interaction.originalY + pctY) * 10) / 10;

            // Snap to center
            const snapCenterX = Math.abs(newX - 50) < SNAP_THRESHOLD;
            const snapCenterY = Math.abs(newY - 50) < SNAP_THRESHOLD;

            if (snapCenterX) newX = 50;
            if (snapCenterY) newY = 50;

            setGuides({ centerX: snapCenterX, centerY: snapCenterY });

            updateSubtitle(selectedSubtitleId, {
                style: { ...sub.style, x: newX, y: newY }
            });
        } else if (interaction.type === 'resize') {
            const h = interaction.handle;
            if (h === 'left' || h === 'right') {
                const pctDeltaX = (deltaX / rect.width) * 100;
                const widthDelta = pctDeltaX * (h === 'left' ? -2 : 2);
                updateSubtitle(selectedSubtitleId, {
                    style: { ...sub.style, width: Math.round(Math.max(5, interaction.originalWidth + widthDelta) * 10) / 10 }
                });
            }
            if (h.includes('top') || h.includes('bottom')) {
                const factor = h.includes('top') ? -1 : 1;
                const sizeDelta = (deltaY / rect.height) * 1000 * factor;
                updateSubtitle(selectedSubtitleId, {
                    style: { ...sub.style, fontSize: Math.round(Math.max(8, interaction.originalSize + sizeDelta)) }
                });
            }
        }
    };

    const handlePointerUp = (e) => {
        setInteraction(null);
        setGuides({ centerX: false, centerY: false });
    };

    const getSubStyle = (sub) => {
        const s = { ...globalStyle, ...sub.style };
        const isSelected = selectedSubtitleId === sub.id;
        const outlineRgb = hexToRgb(s.outlineColor);

        const scaledFontSize = s.fontSize * currentScale;
        const scaledOutline = s.outlineWidth * currentScale;
        const scaledPaddingY = 12 * currentScale;
        const scaledPaddingX = 24 * currentScale;

        return {
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.width}%`,
            transform: `translate(-${s.alignment === 'center' ? 50 : s.alignment === 'right' ? 100 : 0}%, -50%)`,
            color: s.color,
            fontSize: `${scaledFontSize}px`,
            fontFamily: s.fontFamily,
            fontWeight: s.fontWeight,
            textAlign: s.textAlign || 'center',
            WebkitTextStroke: `${scaledOutline}px rgba(${outlineRgb}, ${s.outlineOpacity ?? 1})`,
            textShadow: `0 ${2 * currentScale}px ${4 * currentScale}px rgba(0,0,0,0.5)`,
            backgroundColor: `rgba(${hexToRgb(s.backgroundColor)}, ${s.backgroundOpacity})`,
            padding: `${scaledPaddingY}px ${scaledPaddingX}px`,
            borderRadius: `${6 * currentScale}px`,
            whiteSpace: 'pre-wrap',
            cursor: interaction?.type === 'move' ? 'grabbing' : 'move',
            userSelect: 'none',
            zIndex: isSelected ? 50 : 40,
            outline: isSelected ? `${Math.max(1, 2 * currentScale)}px solid #3b82f6` : 'none',
            pointerEvents: 'auto',
            lineHeight: '1.2'
        };
    };

    return (
        <div
            ref={containerRef}
            className="flex flex-col w-full h-full relative bg-[#050505] overflow-hidden"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            <div className="flex-1 w-full relative flex items-center justify-center p-12 overflow-hidden">
                {videoClips.length === 0 && subtitles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center space-y-4">
                        <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center border border-zinc-800 shadow-2xl">
                            <PlusIcon className="text-zinc-500" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-base font-bold text-zinc-300 uppercase tracking-widest">Import Video</h3>
                            <p className="text-zinc-500 text-xs">Drop a file or use the button above</p>
                        </div>
                    </div>
                ) : (
                    <div
                        ref={innerBoxRef}
                        className="video-inner-box relative bg-black shadow-2xl flex items-center justify-center overflow-hidden"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            aspectRatio: videoClips.length > 0 ? `${videoDimensions.width} / ${videoDimensions.height}` : '16 / 9',
                            width: 'auto',
                            height: 'auto',
                            flexBasis: '100%'
                        }}
                    >
                        {currentClip ? (
                            <video
                                ref={videoRef}
                                src={currentClip.url}
                                className="max-w-full max-h-full block object-contain pointer-events-none"
                                onLoadedMetadata={handleLoadedMetadata}
                                muted={isMuted}
                                playsInline
                            />
                        ) : (
                            <div className="w-full h-full bg-black" />
                        )}

                        {/* Position Guides */}
                        {guides.centerX && (
                            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-cyan-400 pointer-events-none z-50" style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.8)' }} />
                        )}
                        {guides.centerY && (
                            <div className="absolute left-0 right-0 top-1/2 h-px bg-cyan-400 pointer-events-none z-50" style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.8)' }} />
                        )}

                        <div className="absolute inset-0 pointer-events-none">
                            {activeSubtitles.map((sub) => {
                                const isSelected = selectedSubtitleId === sub.id;
                                const isEditing = editingSubId === sub.id;
                                const hSize = Math.max(10, 14 * currentScale);
                                return (
                                    <div
                                        key={sub.id}
                                        style={getSubStyle(sub)}
                                        onPointerDown={(e) => !isEditing && handlePointerDown(e, sub.id, 'move')}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            setEditingSubId(sub.id);
                                            setSelectedSubtitle(sub.id);
                                        }}
                                    >
                                        {isEditing ? (
                                            <span
                                                contentEditable
                                                suppressContentEditableWarning
                                                ref={(el) => {
                                                    if (el && !el.dataset.focused) {
                                                        el.dataset.focused = 'true';
                                                        el.focus();
                                                        // Select all text
                                                        const range = document.createRange();
                                                        range.selectNodeContents(el);
                                                        const sel = window.getSelection();
                                                        sel.removeAllRanges();
                                                        sel.addRange(range);
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    updateSubtitle(sub.id, { text: e.target.innerText });
                                                    setEditingSubId(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        setEditingSubId(null);
                                                    } else if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        updateSubtitle(sub.id, { text: e.target.innerText });
                                                        setEditingSubId(null);
                                                    }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                style={{
                                                    outline: 'none',
                                                    cursor: 'text',
                                                    display: 'block'
                                                }}
                                            >
                                                {sub.text}
                                            </span>
                                        ) : (
                                            sub.text
                                        )}
                                        {isSelected && !isEditing && (
                                            <div className="absolute inset-0 pointer-events-none">
                                                <div className="absolute -top-1 -left-1 bg-white border border-blue-500 rounded-sm cursor-nwse-resize z-50 pointer-events-auto" style={{ width: hSize, height: hSize, transform: 'translate(-50%, -50%)' }} onPointerDown={(e) => handlePointerDown(e, sub.id, 'resize', 'top-left')} />
                                                <div className="absolute -top-1 -right-1 bg-white border border-blue-500 rounded-sm cursor-nesw-resize z-50 pointer-events-auto" style={{ width: hSize, height: hSize, transform: 'translate(50%, -50%)' }} onPointerDown={(e) => handlePointerDown(e, sub.id, 'resize', 'top-right')} />
                                                <div className="absolute -bottom-1 -left-1 bg-white border border-blue-500 rounded-sm cursor-nesw-resize z-50 pointer-events-auto" style={{ width: hSize, height: hSize, transform: 'translate(-50%, 50%)' }} onPointerDown={(e) => handlePointerDown(e, sub.id, 'resize', 'bottom-left')} />
                                                <div className="absolute -bottom-1 -right-1 bg-white border border-blue-500 rounded-sm cursor-nwse-resize z-50 pointer-events-auto" style={{ width: hSize, height: hSize, transform: 'translate(50%, 50%)' }} onPointerDown={(e) => handlePointerDown(e, sub.id, 'resize', 'bottom-right')} />
                                                <div className="absolute top-1/2 -left-1 bg-white border border-blue-500 rounded-sm cursor-ew-resize z-50 pointer-events-auto" style={{ width: hSize, height: hSize, transform: 'translate(-50%, -50%)' }} onPointerDown={(e) => handlePointerDown(e, sub.id, 'resize', 'left')} />
                                                <div className="absolute top-1/2 -right-1 bg-white border border-blue-500 rounded-sm cursor-ew-resize z-50 pointer-events-auto" style={{ width: hSize, height: hSize, transform: 'translate(50%, -50%)' }} onPointerDown={(e) => handlePointerDown(e, sub.id, 'resize', 'right')} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="h-12 shrink-0 bg-zinc-900/50 border-t border-zinc-800/50 flex items-center justify-center space-x-2 px-4 backdrop-blur-sm relative">
                {/* Seek to Start */}
                <button
                    onClick={() => setCurrentTime(0)}
                    className="text-zinc-400 hover:text-white transition-all p-1.5 hover:bg-zinc-800/50 rounded"
                    title="Seek to Start"
                >
                    <SkipBack className="w-4 h-4" />
                </button>

                {/* -5s */}
                <button
                    onClick={() => setCurrentTime(Math.max(0, currentTime - 5))}
                    className="text-zinc-400 hover:text-white transition-all p-1.5 hover:bg-zinc-800/50 rounded flex items-center gap-1"
                    title="Back 5 seconds"
                >
                    <Rewind className="w-4 h-4" />
                    <span className="text-[10px] font-medium">5s</span>
                </button>

                {/* -1F */}
                <button
                    onClick={() => setCurrentTime(currentTime - 1 / 30)}
                    className="text-zinc-500 hover:text-white transition-all px-2 py-1 hover:bg-zinc-800/30 rounded text-[10px] font-mono"
                >
                    -1F
                </button>

                {/* Play/Pause */}
                <button
                    onClick={() => setPlaying(!isPlaying)}
                    className={`w-10 h-10 flex items-center justify-center rounded-full hover:scale-105 transition-all shadow-lg mx-2 ${isPlaying ? 'bg-zinc-100 text-black' : 'bg-blue-600 text-white'}`}
                >
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>

                {/* +1F */}
                <button
                    onClick={() => setCurrentTime(currentTime + 1 / 30)}
                    className="text-zinc-500 hover:text-white transition-all px-2 py-1 hover:bg-zinc-800/30 rounded text-[10px] font-mono"
                >
                    +1F
                </button>

                {/* +5s */}
                <button
                    onClick={() => setCurrentTime(currentTime + 5)}
                    className="text-zinc-400 hover:text-white transition-all p-1.5 hover:bg-zinc-800/50 rounded flex items-center gap-1"
                    title="Forward 5 seconds"
                >
                    <span className="text-[10px] font-medium">5s</span>
                    <FastForward className="w-4 h-4" />
                </button>

                {/* Mute */}
                <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="absolute right-4 text-zinc-500 hover:text-white transition p-1.5 hover:bg-zinc-800/50 rounded"
                    title={isMuted ? "Unmute" : "Mute"}
                >
                    {isMuted ? <MuteIcon /> : <VolumeIcon />}
                </button>
            </div>
        </div>
    );
};
