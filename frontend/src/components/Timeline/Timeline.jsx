import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useStore } from '../../store';
import { formatTime } from '../../utils/time';
import { SplitIcon, TrashIcon } from '../Icons';

// Parse time input string to seconds
// Supports: "1:30", "1:30.5", "00:01:30", "00:01:30.500", "90" (seconds), "1.5" (seconds)
const parseTimeInput = (input) => {
    if (!input || typeof input !== 'string') return null;

    input = input.trim();

    // Try parsing as pure seconds (e.g., "90" or "90.5")
    if (/^\d+(\.\d+)?$/.test(input)) {
        return parseFloat(input);
    }

    // Parse formats with colons (mm:ss, hh:mm:ss, with optional milliseconds)
    const parts = input.split(':');

    if (parts.length === 2) {
        // mm:ss or mm:ss.ms
        const minutes = parseInt(parts[0], 10);
        const secondsPart = parts[1].split('.');
        const seconds = parseInt(secondsPart[0], 10);
        const ms = secondsPart[1] ? parseFloat('0.' + secondsPart[1]) : 0;

        if (isNaN(minutes) || isNaN(seconds)) return null;
        return minutes * 60 + seconds + ms;
    }

    if (parts.length === 3) {
        // hh:mm:ss or hh:mm:ss.ms
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const secondsPart = parts[2].split('.');
        const seconds = parseInt(secondsPart[0], 10);
        const ms = secondsPart[1] ? parseFloat('0.' + secondsPart[1]) : 0;

        if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
        return hours * 3600 + minutes * 60 + seconds + ms;
    }

    return null;
};

export const Timeline = () => {
    const {
        videoClips,
        subtitles,
        currentTime,
        duration,
        zoom,
        isPlaying,
        setCurrentTime,
        setZoom,
        setSelectedClip,
        setSelectedSubtitle,
        selectedClipId,
        selectedSubtitleId,
        splitAllAtCurrentTime,
        updateVideoClip,
        updateSubtitle,
        removeVideoClip,
        deleteSubtitle,
        splitVideoClipAtTime,
        splitSubtitleAtTime,
        deleteGap,
        shiftSubtitlesRight,
        getDuration
    } = useStore();

    // Effective duration: accounts for subtitle-only projects
    const effectiveDuration = getDuration();

    const containerRef = useRef(null);
    const isDraggingPlayhead = useRef(false);
    const dragActionRef = useRef(null);
    const [snapLine, setSnapLine] = useState(null);
    const [snappedSubId, setSnappedSubId] = useState(null);
    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const [frozenLanes, setFrozenLanes] = useState(null); // Freeze non-dragged lanes
    const [contextMenu, setContextMenu] = useState(null);
    const [timeInputValue, setTimeInputValue] = useState('');
    const [isEditingTime, setIsEditingTime] = useState(false);

    const subtitlesRef = useRef(subtitles);
    useEffect(() => { subtitlesRef.current = subtitles; }, [subtitles]);

    const frozenLanesRef = useRef(null);
    useEffect(() => { frozenLanesRef.current = frozenLanes; }, [frozenLanes]);

    const actionsRef = useRef({ updateVideoClip, updateSubtitle, setCurrentTime, shiftSubtitlesRight });
    useEffect(() => {
        actionsRef.current = { updateVideoClip, updateSubtitle, setCurrentTime, shiftSubtitlesRight };
    }, [updateVideoClip, updateSubtitle, setCurrentTime, shiftSubtitlesRight]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    // Auto-scroll timeline when playhead reaches edge of visible area
    useEffect(() => {
        if (!isPlaying || !containerRef.current) return;

        const container = containerRef.current;
        const playheadPosition = currentTime * zoom;
        const containerWidth = container.clientWidth;
        const scrollLeft = container.scrollLeft;
        const visibleEnd = scrollLeft + containerWidth;

        // If playhead is past 85% of visible area, scroll to keep it in view
        const threshold = scrollLeft + (containerWidth * 0.85);

        if (playheadPosition > threshold) {
            // Scroll so playhead is at 20% from left
            const newScrollLeft = playheadPosition - (containerWidth * 0.2);
            container.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
        }
    }, [currentTime, zoom, isPlaying]);

    // --- STACKING LOGIC ---
    const { subLanes, totalLanes } = useMemo(() => {
        // DURING DRAG: Use frozen lanes for non-dragged items, calculate only dragged item
        if (isDraggingNode && frozenLanes && selectedSubtitleId) {
            const draggedSub = subtitles.find(s => s.id === selectedSubtitleId);
            if (draggedSub) {
                const result = new Map(frozenLanes);

                // Calculate lane for dragged subtitle only
                const originalLane = dragActionRef.current?.originalLane || 0;
                const laneOffset = dragActionRef.current?.laneOffset || 0;
                const targetLane = Math.max(0, originalLane + laneOffset);

                // Check collision with frozen others
                const otherSubs = subtitles.filter(s => s.id !== selectedSubtitleId);
                let placedLane = targetLane;

                for (let lane = targetLane; lane < 100; lane++) { // Max 100 lanes
                    let collision = false;
                    for (const other of otherSubs) {
                        const otherLane = frozenLanes.get(other.id);
                        if (otherLane === lane) {
                            // Check time overlap
                            const hasOverlap = !(draggedSub.endTime <= other.startTime + 0.001 ||
                                draggedSub.startTime >= other.endTime - 0.001);
                            if (hasOverlap) {
                                collision = true;
                                break;
                            }
                        }
                    }
                    if (!collision) {
                        placedLane = lane;
                        break;
                    }
                }

                result.set(selectedSubtitleId, placedLane);
                const maxLane = Math.max(...Array.from(result.values()), 0);
                return { subLanes: result, totalLanes: maxLane + 1 };
            }
        }

        // NORMAL MODE: Standard greedy lane assignment
        const sortedSubs = [...subtitles].sort((a, b) => a.startTime - b.startTime);
        const laneEndTimes = [];
        const subToLane = new Map();

        sortedSubs.forEach((sub) => {
            let placed = false;
            for (let i = 0; i < laneEndTimes.length; i++) {
                if (sub.startTime >= laneEndTimes[i] - 0.001) {
                    subToLane.set(sub.id, i);
                    laneEndTimes[i] = sub.endTime;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                subToLane.set(sub.id, laneEndTimes.length);
                laneEndTimes.push(sub.endTime);
            }
        });

        return { subLanes: subToLane, totalLanes: Math.max(1, laneEndTimes.length) };
    }, [subtitles, isDraggingNode, selectedSubtitleId, frozenLanes]);

    // Calculate gaps between subtitles
    const gaps = useMemo(() => {
        if (subtitles.length < 2) return [];

        const sortedSubs = [...subtitles].sort((a, b) => a.startTime - b.startTime);
        const detectedGaps = [];
        const MIN_GAP_THRESHOLD = 0.1; // Minimum gap size to show (in seconds)

        for (let i = 0; i < sortedSubs.length - 1; i++) {
            const currentSub = sortedSubs[i];
            const nextSub = sortedSubs[i + 1];
            const gapStart = currentSub.endTime;
            const gapEnd = nextSub.startTime;
            const gapDuration = gapEnd - gapStart;

            if (gapDuration >= MIN_GAP_THRESHOLD) {
                detectedGaps.push({
                    id: `gap-${currentSub.id}-${nextSub.id}`,
                    startTime: gapStart,
                    endTime: gapEnd,
                    duration: gapDuration,
                    afterSubId: currentSub.id,
                    beforeSubId: nextSub.id
                });
            }
        }

        return detectedGaps;
    }, [subtitles]);

    const handleScroll = (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.1 : 0.9;
            setZoom(Math.max(5, Math.min(500, zoom * delta)));
        }
    };

    const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        isDraggingPlayhead.current = true;
        updatePlayhead(e);
    };

    const updatePlayhead = useCallback((e) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + containerRef.current.scrollLeft;
        const time = x / zoom;
        actionsRef.current.setCurrentTime(Math.max(0, time));
    }, [zoom]);

    const handleClipMouseDown = (e, clipId) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        const clip = videoClips.find((c) => c.id === clipId);
        if (!clip) return;

        setSelectedClip(clipId);
        dragActionRef.current = {
            type: 'move-clip',
            id: clipId,
            startX: e.clientX,
            originalStartTime: clip.startTimeInTimeline
        };
    };

    const handleSubMouseDown = (e, subId, type = 'move-sub') => {
        e.stopPropagation();
        if (e.button !== 0) return;
        const sub = subtitles.find((s) => s.id === subId);
        if (!sub) return;

        // Capture current lane
        // NOTE: subLanes comes from the PREVIOUS render cycle, which is correct for "original lane"
        const currentLane = subLanes.get(subId) || 0;

        // Freeze all current lanes before dragging
        setFrozenLanes(new Map(subLanes));

        setSelectedSubtitle(subId);
        setIsDraggingNode(true); // Enable drag mode layout
        dragActionRef.current = {
            type,
            id: subId,
            startX: e.clientX,
            startY: e.clientY,
            originalStartTime: sub.startTime,
            originalEndTime: sub.endTime,
            originalLane: currentLane, // Store original lane
            laneOffset: 0
        };
    };

    const handleContextMenu = (e, type, id) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, type, id });
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDraggingPlayhead.current) {
                updatePlayhead(e);
            } else if (dragActionRef.current) {
                const action = dragActionRef.current;
                const deltaX = e.clientX - action.startX;
                const deltaTime = deltaX / zoom;

                // Snapping Logic
                const SNAP_THRESHOLD_PX = 2; // 2px snap range (minimal)
                const SNAP_THRESHOLD = SNAP_THRESHOLD_PX / zoom;

                // Helper to check snap against a target time
                const checkSnap = (targetTime, candidateTime) => {
                    if (Math.abs(candidateTime - targetTime) < SNAP_THRESHOLD) {
                        return targetTime;
                    }
                    return null;
                };

                // Use Ref for subtitles to avoid re-binding listener
                const currentSubtitles = subtitlesRef.current || [];

                if (action.type === 'move-clip') {
                    const newStart = Math.max(0, action.originalStartTime + deltaTime);
                    actionsRef.current.updateVideoClip(action.id, { startTimeInTimeline: newStart });
                } else if (action.type === 'move-sub') {
                    // Y-axis drag for lane switching
                    const deltaY = e.clientY - action.startY;
                    const laneOffset = Math.round(deltaY / 48); // 48px per lane
                    action.laneOffset = laneOffset;

                    const subDuration = (action.originalEndTime || 0) - action.originalStartTime;
                    let newStart = Math.max(0, action.originalStartTime + deltaTime);
                    let newEnd = newStart + subDuration;

                    // Get current lane for dragged subtitle
                    const currentLane = action.originalLane + laneOffset;

                    // Find subtitles in the SAME lane only
                    const sameLaneSubs = currentSubtitles.filter(s => {
                        if (s.id === action.id) return false;
                        const otherLane = frozenLanesRef.current?.get(s.id) ?? 0;
                        return otherLane === currentLane;
                    });

                    // Sort by startTime
                    sameLaneSubs.sort((a, b) => a.startTime - b.startTime);

                    // Determine drag direction
                    const isDraggingRight = deltaTime > 0;
                    const isDraggingLeft = deltaTime < 0;

                    if (isDraggingLeft) {
                        // BLOCK LEFT: Find the nearest subtitle to the left and clamp
                        const blockingSub = sameLaneSubs.find(other =>
                            other.endTime > action.originalStartTime - 0.001 &&
                            other.endTime <= action.originalStartTime + 0.001
                        ) || sameLaneSubs.filter(other => other.endTime <= action.originalStartTime).pop();

                        if (blockingSub && newStart < blockingSub.endTime) {
                            // Clamp to the blocking subtitle's end
                            newStart = blockingSub.endTime;
                            newEnd = newStart + subDuration;
                        }

                        // Also block if would overlap with any subtitle on left
                        for (const other of sameLaneSubs) {
                            if (other.startTime < newEnd && other.endTime > newStart) {
                                // Collision! Clamp to the right edge of blocking subtitle
                                if (other.endTime <= action.originalStartTime + 0.001) {
                                    newStart = other.endTime;
                                    newEnd = newStart + subDuration;
                                }
                            }
                        }
                    }

                    if (isDraggingRight) {
                        // RIPPLE RIGHT: Push all subtitles that would collide
                        // Find subtitles that start AFTER the original position (to the right)
                        const rightSubs = sameLaneSubs.filter(s => s.startTime >= action.originalEndTime - 0.001);

                        // Check if we would collide with any
                        const collidingSub = rightSubs.find(other =>
                            newEnd > other.startTime && newStart < other.endTime
                        );

                        if (collidingSub) {
                            // Calculate how much we need to push
                            const pushAmount = newEnd - collidingSub.startTime;
                            if (pushAmount > 0) {
                                // Push all subtitles from this point onward
                                actionsRef.current.shiftSubtitlesRight(collidingSub.startTime, pushAmount, action.id);
                            }
                        }
                    }

                    // Snapping (optional visual feedback)
                    const otherSubs = currentSubtitles.filter(s => s.id !== action.id);
                    let bestSnap = null;
                    let targetSubId = null;

                    for (const other of otherSubs) {
                        let s = checkSnap(other.endTime, newStart);
                        if (s !== null) { bestSnap = s; targetSubId = other.id; break; }
                        s = checkSnap(other.startTime, newStart);
                        if (s !== null) { bestSnap = s; targetSubId = other.id; break; }
                        s = checkSnap(other.startTime, newEnd);
                        if (s !== null) { bestSnap = s - subDuration; targetSubId = other.id; break; }
                        s = checkSnap(other.endTime, newEnd);
                        if (s !== null) { bestSnap = s - subDuration; targetSubId = other.id; break; }
                    }

                    if (bestSnap !== null && !isDraggingRight) {
                        // Only apply snapping when not in ripple mode
                        newStart = bestSnap;
                        newEnd = newStart + subDuration;
                        setSnapLine(newStart < action.originalStartTime + deltaTime ? newStart : newEnd);
                        setSnappedSubId(targetSubId);
                    } else {
                        setSnapLine(null);
                        setSnappedSubId(null);
                    }

                    actionsRef.current.updateSubtitle(action.id, {
                        startTime: newStart,
                        endTime: newEnd
                    });

                } else if (action.type === 'resize-sub-start') {
                    let newStart = Math.max(0, Math.min((action.originalEndTime || 0) - 0.1, action.originalStartTime + deltaTime));

                    // Snap start
                    const otherSubs = currentSubtitles.filter(s => s.id !== action.id);
                    let foundSnap = null;
                    for (const other of otherSubs) {
                        const s = checkSnap(other.endTime, newStart) || checkSnap(other.startTime, newStart);
                        if (s !== null && s < (action.originalEndTime || 0) - 0.1) {
                            newStart = s;
                            foundSnap = s;
                            setSnappedSubId(other.id);
                            break;
                        }
                    }
                    if (foundSnap !== null) setSnapLine(foundSnap); else { setSnapLine(null); setSnappedSubId(null); }

                    actionsRef.current.updateSubtitle(action.id, { startTime: newStart });
                } else if (action.type === 'resize-sub-end') {
                    let newEnd = Math.max(action.originalStartTime + 0.1, (action.originalEndTime || 0) + deltaTime);

                    // Snap end
                    const otherSubs = currentSubtitles.filter(s => s.id !== action.id);
                    let foundSnap = null;
                    for (const other of otherSubs) {
                        const s = checkSnap(other.startTime, newEnd) || checkSnap(other.endTime, newEnd);
                        if (s !== null && s > action.originalStartTime + 0.1) {
                            newEnd = s;
                            foundSnap = s;
                            setSnappedSubId(other.id);
                            break;
                        }
                    }
                    if (foundSnap !== null) setSnapLine(foundSnap); else { setSnapLine(null); setSnappedSubId(null); }

                    actionsRef.current.updateSubtitle(action.id, { endTime: newEnd });
                }
            }
        };

        const handleMouseUp = () => {
            isDraggingPlayhead.current = false;
            dragActionRef.current = null;
            setIsDraggingNode(false);
            setFrozenLanes(null);
            setSnapLine(null);
            setSnappedSubId(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [updatePlayhead, zoom]); // Removed 'subtitles' and 'selectedSubtitleId' to prevent stutter

    const renderRuler = () => {
        const marks = [];
        const step = zoom < 20 ? 10 : zoom < 100 ? 5 : 1;
        // Don't render infinite marks, cap at reasonable length or duration
        const renderDuration = Math.max(effectiveDuration, 60);

        for (let i = 0; i <= renderDuration; i += step) {
            marks.push(
                <div key={i} className="absolute border-l border-zinc-700 h-full select-none text-[10px] text-zinc-500 pl-1 pointer-events-none" style={{ left: i * zoom }}>
                    {formatTime(i)}
                </div>
            );
        }
        return marks;
    };

    return (
        <div className="flex flex-col h-full bg-zinc-900 border-t border-zinc-800">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 text-xs shrink-0">
                <div className="flex items-center space-x-4">
                    <button onClick={splitAllAtCurrentTime} className="flex items-center space-x-1 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition select-none">
                        <SplitIcon />
                        <span>Split All</span>
                    </button>
                    {videoClips.length === 0 && subtitles.length === 0 ? (
                        <div className="font-mono text-sm bg-black px-4 py-0.5 rounded border border-zinc-800 text-zinc-500 italic">
                            Import video...
                        </div>
                    ) : (
                        <div className="flex items-center font-mono text-sm bg-black px-2 py-0.5 rounded border border-zinc-800">
                            <input
                                type="text"
                                className="bg-transparent text-blue-400 w-28 text-center focus:outline-none focus:bg-zinc-800 rounded cursor-text hover:bg-zinc-800/50 transition"
                                value={isEditingTime ? timeInputValue : formatTime(currentTime)}
                                onChange={(e) => {
                                    setTimeInputValue(e.target.value);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.target.blur();
                                    }
                                    if (e.key === 'Escape') {
                                        setIsEditingTime(false);
                                        setTimeInputValue('');
                                        e.target.blur();
                                    }
                                }}
                                onBlur={(e) => {
                                    if (isEditingTime) {
                                        const input = timeInputValue.trim();
                                        const parsed = parseTimeInput(input);
                                        if (parsed !== null && parsed >= 0 && parsed <= effectiveDuration) {
                                            setCurrentTime(parsed);
                                        }
                                        setIsEditingTime(false);
                                        setTimeInputValue('');
                                    }
                                }}
                                onFocus={(e) => {
                                    setIsEditingTime(true);
                                    setTimeInputValue(formatTime(currentTime));
                                    setTimeout(() => e.target.select(), 0);
                                }}
                                title="Click to edit - Enter to jump to time"
                            />
                            <span className="text-zinc-600 mx-1">/</span>
                            <span className="text-zinc-400">{formatTime(effectiveDuration)}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center space-x-2">
                    <span className="text-zinc-500 select-none">Zoom</span>
                    <button onClick={() => setZoom(zoom * 0.8)} className="p-1 hover:bg-zinc-800 rounded text-lg">-</button>
                    <input type="range" min="5" max="500" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-32 accent-blue-500" />
                    <button onClick={() => setZoom(zoom * 1.2)} className="p-1 hover:bg-zinc-800 rounded text-lg">+</button>
                </div>
            </div>

            <div ref={containerRef} className="flex-1 overflow-auto relative scroll-smooth" onWheel={handleScroll} onMouseDown={handleMouseDown}>
                <div className="relative min-h-full" style={{ width: Math.max(containerRef.current?.clientWidth || 0, effectiveDuration * zoom + 200) }}>
                    <div className="sticky top-0 z-20 h-8 bg-zinc-900 border-b border-zinc-800 pointer-events-none">{renderRuler()}</div>

                    {/* Video Track */}
                    <div className="relative h-20 border-b border-zinc-800/50 bg-zinc-950/30 flex items-center">
                        <div className="absolute left-0 top-0 text-[10px] text-zinc-600 pl-2 pt-1 uppercase tracking-widest font-bold pointer-events-none z-10 sticky left-0">Video Track</div>
                        {videoClips.map((clip) => (
                            <div
                                key={clip.id}
                                onContextMenu={(e) => handleContextMenu(e, 'clip', clip.id)}
                                className={`absolute h-14 rounded overflow-hidden cursor-move border-2 select-none ${selectedClipId === clip.id ? 'border-blue-500 bg-blue-500/20' : 'border-zinc-700 bg-zinc-800/40'}`}
                                style={{ left: clip.startTimeInTimeline * zoom, width: clip.duration * zoom, top: 15 }}
                                onMouseDown={(e) => handleClipMouseDown(e, clip.id)}
                            >
                                <div className="px-2 py-1 text-[10px] font-medium truncate text-zinc-300">{clip.name}</div>
                            </div>
                        ))}
                    </div>

                    {/* Subtitle Track Area */}
                    <div
                        className="relative bg-zinc-950/10 transition-[height] duration-200"
                        style={{ height: `${Math.max(120, (totalLanes * 48) + 40)}px` }}
                    >
                        <div className="absolute left-0 top-0 text-[10px] text-zinc-600 pl-2 pt-1 uppercase tracking-widest font-bold pointer-events-none z-10 sticky left-0">Subtitle Tracks</div>
                        {subtitles.map((sub) => {
                            const lane = subLanes.get(sub.id) || 0;
                            return (
                                <div
                                    key={sub.id}
                                    onContextMenu={(e) => handleContextMenu(e, 'sub', sub.id)}
                                    className={`absolute h-10 rounded border flex items-center px-2 group select-none transition-shadow ${selectedSubtitleId === sub.id ? 'border-blue-500 bg-blue-600/30 shadow-[0_0_15px_rgba(59,130,246,0.3)] z-10' : snappedSubId === sub.id ? 'border-yellow-400 bg-yellow-400/20 shadow-[0_0_10px_rgba(250,204,21,0.5)] z-20' : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-800/80'}`}
                                    style={{
                                        left: sub.startTime * zoom,
                                        width: Math.max(15, (sub.endTime - sub.startTime) * zoom),
                                        top: 35 + (lane * 48),
                                        cursor: 'move'
                                    }}
                                    onMouseDown={(e) => handleSubMouseDown(e, sub.id, 'move-sub')}
                                >
                                    <span className="text-[11px] truncate text-zinc-200 font-medium">{sub.text || '(empty)'}</span>
                                    <div className="absolute inset-y-0 left-0 w-1.5 cursor-col-resize hover:bg-white/40 z-20" onMouseDown={(e) => handleSubMouseDown(e, sub.id, 'resize-sub-start')} />
                                    <div className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-white/40 z-20" onMouseDown={(e) => handleSubMouseDown(e, sub.id, 'resize-sub-end')} />
                                </div>
                            );
                        })}

                        {/* Gap Indicators with Delete Button */}
                        {gaps.map((gap) => {
                            const gapWidth = gap.duration * zoom;
                            // Only show if gap is wide enough to be visible
                            if (gapWidth < 20) return null;

                            return (
                                <div
                                    key={gap.id}
                                    className="absolute h-10 flex items-center justify-center group cursor-pointer"
                                    style={{
                                        left: gap.startTime * zoom,
                                        width: gapWidth,
                                        top: 35
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                    }}
                                >
                                    {/* Gap visual indicator - dashed border */}
                                    <div className="absolute inset-0 border-2 border-dashed border-zinc-600/50 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800/20" />

                                    {/* Delete gap button - compact icon only */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteGap(gap.startTime, gap.endTime);
                                            }}
                                            className="flex items-center justify-center w-6 h-6 bg-red-600 hover:bg-red-500 rounded text-white transition-all shadow-lg"
                                            title="Delete this gap"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Snap Line Indicator */}
                    {snapLine !== null && (
                        <div className="absolute top-8 bottom-0 w-px bg-yellow-400 z-50 pointer-events-none shadow-[0_0_10px_rgba(250,204,21,0.8)]" style={{ left: snapLine * zoom }}>
                            <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-yellow-400" />
                        </div>
                    )}

                    <div className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none" style={{ left: currentTime * zoom }}>
                        <div className="absolute top-0 -left-1.5 w-3 h-3 bg-red-500 rounded-b-full shadow-lg" />
                    </div>
                </div>
            </div>

            {contextMenu && (
                <div
                    className="fixed z-[100] bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl py-1 min-w-[160px] animate-in fade-in duration-75"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-zinc-300 hover:bg-blue-600 hover:text-white text-left" onClick={() => { if (contextMenu.type === 'clip') splitVideoClipAtTime(contextMenu.id, currentTime); else splitSubtitleAtTime(contextMenu.id, currentTime); setContextMenu(null); }}>
                        <SplitIcon /> <span>Split at Playhead</span>
                    </button>
                    <div className="h-px bg-zinc-800 my-1 mx-2" />
                    <button className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-red-400 hover:bg-red-600 hover:text-white text-left" onClick={() => { if (contextMenu.type === 'clip') removeVideoClip(contextMenu.id); else deleteSubtitle(contextMenu.id); setContextMenu(null); }}>
                        <TrashIcon /> <span>Delete Item</span>
                    </button>
                </div>
            )}
        </div>
    );
};
