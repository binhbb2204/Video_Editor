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
        selectedClipId,
        setSelectedSubtitle,
        setSelectedClip,
        updateSubtitle,
        updateVideoClip,
        bringForward,
        sendBackward,
        bringToFront,
        sendToBack,
        getDuration,
        projectResolution,
        addVideoClip,
        setDuration
    } = useStore();

    const videoRef = useRef(null);
    const mediaRefs = useRef({});
    const containerRef = useRef(null);
    const [innerBoxElement, setInnerBoxElement] = useState(null);
    const [interaction, setInteraction] = useState(null);
    const [clipInteraction, setClipInteraction] = useState(null);
    const [videoDimensions, setVideoDimensions] = useState({ width: 16, height: 9 });
    const [currentScale, setCurrentScale] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [guides, setGuides] = useState({ centerX: false, centerY: false });
    const [editingSubId, setEditingSubId] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [previewAreaElement, setPreviewAreaElement] = useState(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

    const handleContextMenu = (e, clipId) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedClip(clipId);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            clipId
        });
    };

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('pointerdown', handleClick);
        return () => window.removeEventListener('pointerdown', handleClick);
    }, []);

    // Track if we're currently playing to avoid seeking during playback
    const isPlayingRef = useRef(false);
    // Track last user-initiated seek time to detect manual seeks
    const lastUserSeekTime = useRef(null);
    // Track last frame time for subtitle-only playback
    const lastFrameTimeRef = useRef(null);

    const REFERENCE_WIDTH = 1280;

    useEffect(() => {
        if (!previewAreaElement) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry && entry.contentRect) {
                const availableW = entry.contentRect.width;
                const availableH = entry.contentRect.height;
                const aspW = projectResolution?.width || 1920;
                const aspH = projectResolution?.height || 1080;
                const aspectRatio = aspW / aspH;

                const canvasW = Math.min(availableW, availableH * aspectRatio);
                const canvasH = canvasW / aspectRatio;

                setCanvasSize({ width: canvasW, height: canvasH });
                setCurrentScale(canvasW / REFERENCE_WIDTH);
            }
        });
        observer.observe(previewAreaElement);
        return () => observer.disconnect();
    }, [previewAreaElement, projectResolution]);

    const innerBoxRef = useCallback((node) => {
        setInnerBoxElement(node);
    }, []);

    const previewAreaRef = useCallback((node) => {
        setPreviewAreaElement(node);
    }, []);

    // Find ALL clips at current time (for multi-layer / picture-in-picture)
    const clipsAtCurrentTime = videoClips.filter((clip) =>
        currentTime >= clip.startTimeInTimeline &&
        currentTime <= clip.startTimeInTimeline + clip.duration
    );
    const currentClip = clipsAtCurrentTime.length > 0 ? clipsAtCurrentTime[clipsAtCurrentTime.length - 1] : null;

    // Video clip transform handlers
    // clipInteraction: { type: 'move'|'resize-nw'|'resize-ne'|'resize-sw'|'resize-se', clipId, startX, startY, origX, origY, origW, origH }
    const handleClipPointerDown = (e, clipId, type = 'move') => {
        e.stopPropagation();
        e.preventDefault();
        setSelectedClip(clipId);
        const clip = videoClips.find(c => c.id === clipId);
        if (!clip) return;
        
        let origH = clip.transformHeight;
        if (!origH && innerBoxElement) {
            const clipNode = e.currentTarget.parentElement;
            if (clipNode) {
                const rect = innerBoxElement.getBoundingClientRect();
                origH = (clipNode.getBoundingClientRect().height / rect.height) * 100;
            }
        }

        setClipInteraction({
            type,
            clipId,
            startX: e.clientX,
            startY: e.clientY,
            origX: clip.transformX ?? 50,
            origY: clip.transformY ?? 50,
            origW: clip.transformWidth ?? 100,
            origH: origH || 100,
        });
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };

    const handleClipPointerMove = (e) => {
        if (!clipInteraction || !innerBoxElement) return;
        const rect = innerBoxElement.getBoundingClientRect();
        const dx = e.clientX - clipInteraction.startX;
        const dy = e.clientY - clipInteraction.startY;
        const pctX = (dx / rect.width) * 100;
        const pctY = (dy / rect.height) * 100;
        const { type, origX, origY, origW, origH } = clipInteraction;

        if (type === 'move') {
            // Allow dragging completely out of bounds
            let newX = origX + pctX;
            let newY = origY + pctY;
            
            let snapLineX = null;
            let snapLineY = null;

            if (!e.ctrlKey && !e.metaKey) {
                const snapThreshX = (10 / rect.width) * 100;
                const snapThreshY = (10 / rect.height) * 100;

                const snapTargetsX = [50, 0, 100];
                const snapTargetsY = [50, 0, 100];

                clipsAtCurrentTime.forEach(c => {
                    if (c.id === clipInteraction.clipId) return;
                    const cx = c.transformX ?? 50;
                    const cy = c.transformY ?? 50;
                    const cw = c.transformWidth ?? 100;
                    const ch = c.transformHeight ?? 100;
                    snapTargetsX.push(cx, cx - cw / 2, cx + cw / 2);
                    snapTargetsY.push(cy, cy - ch / 2, cy + ch / 2);
                });

                let minDiffX = Infinity;
                let bestSnapX = null;
                const testPointsX = [
                    { val: newX },
                    { val: newX - origW / 2 },
                    { val: newX + origW / 2 }
                ];
                for (const target of snapTargetsX) {
                    for (const pt of testPointsX) {
                        const diff = Math.abs(target - pt.val);
                        if (diff < snapThreshX && diff < minDiffX) {
                            minDiffX = diff;
                            bestSnapX = { offset: target - pt.val, line: target };
                        }
                    }
                }
                if (bestSnapX) {
                    newX += bestSnapX.offset;
                    snapLineX = bestSnapX.line;
                }

                let minDiffY = Infinity;
                let bestSnapY = null;
                const testPointsY = [
                    { val: newY },
                    { val: newY - origH / 2 },
                    { val: newY + origH / 2 }
                ];
                for (const target of snapTargetsY) {
                    for (const pt of testPointsY) {
                        const diff = Math.abs(target - pt.val);
                        if (diff < snapThreshY && diff < minDiffY) {
                            minDiffY = diff;
                            bestSnapY = { offset: target - pt.val, line: target };
                        }
                    }
                }
                if (bestSnapY) {
                    newY += bestSnapY.offset;
                    snapLineY = bestSnapY.line;
                }
            }

            setGuides(g => ({ ...g, clipSnapX: snapLineX, clipSnapY: snapLineY }));
            updateVideoClip(clipInteraction.clipId, { transformX: newX, transformY: newY });
        } else if (type === 'resize-se') {
            const newW = Math.max(5, origW + pctX * 2);
            const newH = origH * (newW / origW);
            updateVideoClip(clipInteraction.clipId, { transformWidth: newW, transformHeight: newH });
        } else if (type === 'resize-sw') {
            const newW = Math.max(5, origW - pctX * 2);
            const newX = origX + pctX;
            const newH = origH * (newW / origW);
            updateVideoClip(clipInteraction.clipId, { transformWidth: newW, transformHeight: newH, transformX: newX });
        } else if (type === 'resize-ne') {
            const newW = Math.max(5, origW + pctX * 2);
            const newY = origY + pctY;
            const newH = origH * (newW / origW);
            updateVideoClip(clipInteraction.clipId, { transformWidth: newW, transformHeight: newH, transformY: newY });
        } else if (type === 'resize-nw') {
            const newW = Math.max(5, origW - pctX * 2);
            const newX = origX + pctX;
            const newY = origY + pctY;
            const newH = origH * (newW / origW);
            updateVideoClip(clipInteraction.clipId, { transformWidth: newW, transformHeight: newH, transformX: newX, transformY: newY });
        } else if (type === 'resize-e') {
            const newW = Math.max(5, origW + pctX * 2);
            updateVideoClip(clipInteraction.clipId, { transformWidth: newW, transformHeight: origH });
        } else if (type === 'resize-w') {
            const newW = Math.max(5, origW - pctX * 2);
            const newX = origX + pctX;
            updateVideoClip(clipInteraction.clipId, { transformWidth: newW, transformHeight: origH, transformX: newX });
        } else if (type === 'resize-s') {
            const newH = Math.max(5, origH + pctY * 2);
            updateVideoClip(clipInteraction.clipId, { transformHeight: newH, transformWidth: origW });
        } else if (type === 'resize-n') {
            const newH = Math.max(5, origH - pctY * 2);
            const newY = origY + pctY;
            updateVideoClip(clipInteraction.clipId, { transformHeight: newH, transformY: newY, transformWidth: origW });
        }
    };

    const handleClipPointerUp = () => {
        setClipInteraction(null);
        setGuides(g => ({ ...g, clipSnapX: null, clipSnapY: null }));
    };

    // Only sync video position when NOT playing (user is scrubbing timeline)
    useEffect(() => {
        if (isPlaying) return; // Never seek during playback!
        
        clipsAtCurrentTime.forEach(clip => {
            const el = mediaRefs.current[clip.id];
            if (!el || el.currentTime === undefined) return;
            
            const targetVideoTime = (currentTime - clip.startTimeInTimeline) + clip.startOffset;
            const diff = Math.abs(el.currentTime - targetVideoTime);
            
            if (diff > 0.05) {
                el.currentTime = targetVideoTime;
            }
        });
    }, [currentTime, isPlaying]); // Removed clipsAtCurrentTime from deps - use stable ref

    // Track which clip IDs are currently playing to manage play/pause
    const playingClipIdsRef = useRef(new Set());

    // Handle play/pause transitions for ALL overlapping media
    useEffect(() => {
        isPlayingRef.current = isPlaying;

        // Reset frame time when play state changes
        if (isPlaying) {
            lastFrameTimeRef.current = performance.now();
        }

        // Use store directly to get fresh clips, avoid stale closure
        const storeState = useStore.getState();
        const storeTime = storeState.currentTime;
        const allClips = storeState.videoClips;
        
        const activeClips = allClips.filter(clip =>
            storeTime >= clip.startTimeInTimeline &&
            storeTime <= clip.startTimeInTimeline + clip.duration
        );

        if (isPlaying) {
            const newPlayingIds = new Set();
            activeClips.forEach(clip => {
                const el = mediaRefs.current[clip.id];
                if (!el || !el.play) return;
                
                // Only seek if significantly out of sync (initial play)
                const targetVideoTime = (storeTime - clip.startTimeInTimeline) + clip.startOffset;
                if (Math.abs((el.currentTime || 0) - targetVideoTime) > 0.3) {
                    el.currentTime = targetVideoTime;
                }
                el.play().catch(() => {});
                newPlayingIds.add(clip.id);
            });
            playingClipIdsRef.current = newPlayingIds;
        } else {
            // Pause all media elements
            Object.values(mediaRefs.current).forEach(el => {
                if (el && el.pause) el.pause();
            });
            playingClipIdsRef.current.clear();
        }
    }, [isPlaying, setPlaying]); // Only trigger on play/pause toggle, NOT on time changes

    // Track if we were in video mode last tick (to reset timer on transition)
    const wasInVideoModeRef = useRef(false);
    // Throttle UI updates during playback
    const lastUIUpdateRef = useRef(0);

    // RAF loop - handles both video-based and timer-based playback
    useEffect(() => {
        let raf;

        const tick = () => {
            if (!isPlayingRef.current) {
                lastFrameTimeRef.current = null;
                wasInVideoModeRef.current = false;
                raf = requestAnimationFrame(tick);
                return;
            }
            
            const effectiveDuration = getDuration();
            const storeState = useStore.getState();
            const storeTime = storeState.currentTime;
            const allClips = storeState.videoClips;
            
            // Find any playing video element at current time
            let videoBasedTime = null;
            for (const clip of allClips) {
                if (storeTime >= clip.startTimeInTimeline &&
                    storeTime <= clip.startTimeInTimeline + clip.duration) {
                    const el = mediaRefs.current[clip.id];
                    if (el && !el.paused && el.readyState >= 2) {
                        // Read time FROM the video element - let it be the source of truth
                        videoBasedTime = (el.currentTime - clip.startOffset) + clip.startTimeInTimeline;
                        break;
                    }
                }
            }
            
            let newTime;
            if (videoBasedTime !== null) {
                // Video-driven: read time from video, no seeking needed
                newTime = videoBasedTime;
                wasInVideoModeRef.current = true;
                lastFrameTimeRef.current = performance.now();
            } else {
                // Timer-driven: for gaps, subtitle-only, or post-video
                if (wasInVideoModeRef.current) {
                    // Just transitioned from video mode - reset timer
                    lastFrameTimeRef.current = performance.now();
                    wasInVideoModeRef.current = false;
                    raf = requestAnimationFrame(tick);
                    return;
                }
                
                const now = performance.now();
                if (lastFrameTimeRef.current) {
                    const deltaSeconds = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1);
                    newTime = storeTime + deltaSeconds;
                } else {
                    newTime = storeTime;
                }
                lastFrameTimeRef.current = now;
            }

            if (newTime >= effectiveDuration) {
                setCurrentTime(effectiveDuration);
                setPlaying(false);
            } else {
                // Throttle UI updates to ~15fps to avoid excessive re-renders
                const now = performance.now();
                if (now - lastUIUpdateRef.current > 66) { // ~15fps for UI
                    setCurrentTime(newTime);
                    lastUIUpdateRef.current = now;
                }
            }

            // During playback, manage which clips should be playing/paused
            // as the playhead moves through different clips
            const activeClipIds = new Set();
            for (const clip of allClips) {
                const inRange = newTime >= clip.startTimeInTimeline &&
                                newTime <= clip.startTimeInTimeline + clip.duration;
                const el = mediaRefs.current[clip.id];
                if (!el) continue;
                
                if (inRange) {
                    activeClipIds.add(clip.id);
                    if (el.paused && el.play) {
                        const targetVideoTime = (newTime - clip.startTimeInTimeline) + clip.startOffset;
                        el.currentTime = targetVideoTime;
                        el.play().catch(() => {});
                    }
                } else {
                    if (!el.paused && el.pause) {
                        el.pause();
                    }
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
            className="flex flex-col w-full h-full relative bg-[#1a1a2e] overflow-hidden isolate"
            onPointerMove={(e) => { handlePointerMove(e); handleClipPointerMove(e); }}
            onPointerUp={(e) => { handlePointerUp(e); handleClipPointerUp(); }}
        >
            <div 
                ref={previewAreaRef} 
                className="flex-1 w-full relative flex items-center justify-center p-12 overflow-hidden"
                onPointerDown={() => {
                    if (selectedClipId) setSelectedClip(null);
                    if (selectedSubtitleId) setSelectedSubtitle(null);
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    try {
                        const data = e.dataTransfer.getData('application/json');
                        if (!data || !innerBoxElement) return;
                        
                        const media = JSON.parse(data);
                        if (!media.url) return;

                        const clip = {
                            id: `clip-${Date.now()}`,
                            name: media.name,
                            url: media.url,
                            duration: media.duration,
                            startTimeInTimeline: currentTime, // Place at playhead!
                            startOffset: 0,
                            playbackRate: 1,
                            transformX: 50,
                            transformY: 50,
                            transformWidth: 100,
                            transformHeight: 100,
                            zOrder: videoClips.length // Place on top
                        };

                        addVideoClip(clip);
                        setDuration(Math.max(getDuration(), clip.startTimeInTimeline + clip.duration + 0.1));
                    } catch (err) {
                        console.error('Failed to parse dropped media:', err);
                    }
                }}
            >
                <div
                    ref={innerBoxRef}
                    className="video-inner-box relative bg-black shadow-2xl flex items-center justify-center overflow-visible"
                    style={{
                        width: canvasSize.width > 0 ? `${canvasSize.width}px` : '100%',
                        height: canvasSize.height > 0 ? `${canvasSize.height}px` : 'auto',
                        aspectRatio: `${projectResolution?.width || 1920} / ${projectResolution?.height || 1080}`,
                    }}
                >
                    {/* Shadow overlay to dim content that overflows outside the canvas */}
                    <div 
                        className="absolute inset-0 pointer-events-none z-[1000]"
                        style={{ boxShadow: '0 0 0 9999px rgba(26,26,46,0.85)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />

                    {/* Empty State */}
                    {videoClips.length === 0 && subtitles.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-4 z-[2000] pointer-events-none">
                            <div className="w-16 h-16 bg-zinc-900/50 rounded-2xl flex items-center justify-center border border-zinc-800 shadow-xl backdrop-blur-sm">
                                <PlusIcon className="text-zinc-500 w-8 h-8" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-zinc-500 text-xs">Drop media here</p>
                            </div>
                        </div>
                    )}

                    {/* Render all clips at current time sorted by zOrder (higher = on top) */}
                    {clipsAtCurrentTime.length > 0 && (
                            [...clipsAtCurrentTime]
                                .sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0))
                                .map((clip, sortedIdx, sortedArr) => {
                                const tx = clip.transformX ?? 50;
                                const ty = clip.transformY ?? 50;
                                const tw = clip.transformWidth ?? 100; // % of container width
                                const th = clip.transformHeight ?? 100;
                                const isThisSelected = selectedClipId === clip.id;
                                // Handle size in px for handle dots
                                const hDot = Math.max(8, 10 * currentScale);
                                const zIdx = (clip.zOrder ?? 0) + 10; // base z for rendering
                                return (
                                    <div
                                        key={`layer-${clip.id}`}
                                        className="absolute"
                                        style={{
                                            left: `${tx}%`,
                                            top: `${ty}%`,
                                            width: `${tw}%`,
                                            height: th ? `${th}%` : 'auto',
                                            transform: 'translate(-50%, -50%)',
                                            zIndex: zIdx,
                                            outline: isThisSelected ? `${Math.max(1, 1.5 * currentScale)}px solid #3b82f6` : 'none',
                                            borderRadius: 4,
                                            overflow: 'hidden',
                                            cursor: clipInteraction?.type === 'move' ? 'grabbing' : 'grab',
                                        }}
                                        onPointerDown={(e) => handleClipPointerDown(e, clip.id, 'move')}
                                        onContextMenu={(e) => handleContextMenu(e, clip.id)}
                                    >
                                        {clip.type === 'image' ? (
                                            <img
                                                ref={el => { if (el) mediaRefs.current[clip.id] = el; }}
                                                src={clip.url}
                                                className="w-full h-full block object-fill pointer-events-none"
                                                alt={clip.name}
                                            />
                                        ) : clip.type === 'audio' ? (
                                            <audio
                                                ref={el => { if (el) mediaRefs.current[clip.id] = el; }}
                                                src={clip.url}
                                                onLoadedMetadata={handleLoadedMetadata}
                                                muted={sortedIdx > 0 ? true : isMuted}
                                            />
                                        ) : (
                                            <video
                                                ref={el => { if (el) mediaRefs.current[clip.id] = el; }}
                                                src={clip.url}
                                                className="w-full h-full block object-fill pointer-events-none"
                                                onLoadedMetadata={handleLoadedMetadata}
                                                muted={sortedIdx > 0 ? true : isMuted}
                                                playsInline
                                            />
                                        )}

                                        {/* 8-point resize handles */}
                                        {isThisSelected && [
                                            { type: 'resize-nw', top: 0,    left: 0,    cursor: 'nwse-resize', tx: '-50%', ty: '-50%' },
                                            { type: 'resize-ne', top: 0,    left: '100%', cursor: 'nesw-resize', tx: '-50%', ty: '-50%' },
                                            { type: 'resize-sw', top: '100%', left: 0,  cursor: 'nesw-resize', tx: '-50%', ty: '-50%' },
                                            { type: 'resize-se', top: '100%', left: '100%', cursor: 'nwse-resize', tx: '-50%', ty: '-50%' },
                                            { type: 'resize-n',  top: 0,    left: '50%', cursor: 'ns-resize', tx: '-50%', ty: '-50%' },
                                            { type: 'resize-s',  top: '100%', left: '50%', cursor: 'ns-resize', tx: '-50%', ty: '-50%' },
                                            { type: 'resize-e',  top: '50%', left: '100%', cursor: 'ew-resize', tx: '-50%', ty: '-50%' },
                                            { type: 'resize-w',  top: '50%', left: 0,    cursor: 'ew-resize', tx: '-50%', ty: '-50%' },
                                        ].map(h => (
                                            <div
                                                key={h.type}
                                                onPointerDown={(e) => { e.stopPropagation(); handleClipPointerDown(e, clip.id, h.type); }}
                                                style={{
                                                    position: 'absolute',
                                                    top: h.top,
                                                    left: h.left,
                                                    width: hDot,
                                                    height: hDot,
                                                    background: '#fff',
                                                    border: '2px solid #3b82f6',
                                                    borderRadius: '50%',
                                                    cursor: h.cursor,
                                                    zIndex: 200,
                                                    transform: `translate(${h.tx}, ${h.ty})`,
                                                    pointerEvents: 'auto',
                                                    boxShadow: '0 0 4px rgba(59,130,246,0.8)',
                                                }}
                                            />
                                        ))}
                                    </div>
                                );
                            })
                        )}

                        {/* Floating toolbar for selected clip */}
                        {selectedClipId && clipsAtCurrentTime.some(c => c.id === selectedClipId) && (() => {
                            const clip = clipsAtCurrentTime.find(c => c.id === selectedClipId);
                            const sortedAll = [...clipsAtCurrentTime].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));
                            const isTop = sortedAll[sortedAll.length - 1]?.id === selectedClipId;
                            const isBottom = sortedAll[0]?.id === selectedClipId;
                            return (
                                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-1 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-xl px-2 py-1 shadow-xl pointer-events-auto"
                                    onPointerDown={e => e.stopPropagation()}
                                >
                                    <button onClick={() => sendToBack(selectedClipId)} disabled={isBottom}
                                        className="px-2 py-1 text-[10px] font-bold rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition text-zinc-300 flex items-center gap-1"
                                        title="Send to Back"
                                    >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="8" width="8" height="7" rx="1" opacity=".4"/><rect x="4" y="4" width="8" height="7" rx="1" opacity=".7"/><rect x="7" y="1" width="8" height="7" rx="1"/></svg>
                                        Back
                                    </button>
                                    <button onClick={() => sendBackward(selectedClipId)} disabled={isBottom}
                                        className="px-2 py-1 text-[10px] font-bold rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition text-zinc-300 flex items-center gap-1"
                                        title="Send Backward"
                                    >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="10 6 6 10 2 6"/><line x1="6" y1="2" x2="6" y2="10"/></svg>
                                        Backward
                                    </button>
                                    <div className="w-px h-4 bg-zinc-700 mx-0.5" />
                                    <button onClick={() => bringForward(selectedClipId)} disabled={isTop}
                                        className="px-2 py-1 text-[10px] font-bold rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition text-zinc-300 flex items-center gap-1"
                                        title="Bring Forward"
                                    >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="2 10 6 6 10 10"/><line x1="6" y1="14" x2="6" y2="6"/></svg>
                                        Forward
                                    </button>
                                    <button onClick={() => bringToFront(selectedClipId)} disabled={isTop}
                                        className="px-2 py-1 text-[10px] font-bold rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition text-zinc-300 flex items-center gap-1"
                                        title="Bring to Front"
                                    >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><rect x="7" y="1" width="8" height="7" rx="1"/><rect x="4" y="4" width="8" height="7" rx="1" opacity=".7"/><rect x="1" y="8" width="8" height="7" rx="1" opacity=".4"/></svg>
                                        Front
                                    </button>
                                </div>
                            );
                        })()}

                        {/* Position Guides */}
                        {guides.centerX && (
                            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-cyan-400 pointer-events-none z-50" style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.8)' }} />
                        )}
                        {guides.centerY && (
                            <div className="absolute left-0 right-0 top-1/2 h-px bg-cyan-400 pointer-events-none z-50" style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.8)' }} />
                        )}
                        {guides.clipSnapX !== null && guides.clipSnapX !== undefined && (
                            <div className="absolute top-0 bottom-0 w-px bg-[#00D4FF] pointer-events-none z-[600]" style={{ left: `${guides.clipSnapX}%`, boxShadow: '0 0 8px rgba(0, 212, 255, 0.8)' }} />
                        )}
                        {guides.clipSnapY !== null && guides.clipSnapY !== undefined && (
                            <div className="absolute left-0 right-0 h-px bg-[#00D4FF] pointer-events-none z-[600]" style={{ top: `${guides.clipSnapY}%`, boxShadow: '0 0 8px rgba(0, 212, 255, 0.8)' }} />
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
            {/* Context Menu */}
            {contextMenu && (
                <div 
                    className="fixed bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 z-[9999] min-w-[160px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button onClick={() => bringToFront(contextMenu.clipId)} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition">Bring to Front</button>
                    <button onClick={() => bringForward(contextMenu.clipId)} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition">Bring Forward</button>
                    <button onClick={() => sendBackward(contextMenu.clipId)} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition">Send Backward</button>
                    <button onClick={() => sendToBack(contextMenu.clipId)} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition">Send to Back</button>
                </div>
            )}
        </div>
    );
};
