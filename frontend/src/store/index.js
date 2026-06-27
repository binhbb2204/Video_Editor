import { create } from 'zustand';
import { DEFAULT_STYLE, DEFAULT_ZOOM } from '../constants';

export const useStore = create((set, get) => ({
    // State
    videoClips: [],
    subtitles: [],
    importedMedia: [], // Media library items
    globalStyle: { ...DEFAULT_STYLE },
    duration: 10,
    currentTime: 0,
    isPlaying: false,
    zoom: DEFAULT_ZOOM,
    selectedSubtitleId: null,
    selectedClipId: null,
    projectResolution: { width: 1920, height: 1080 },
    projectName: "Untitled Project",
    exportJobs: [], // { id, name, status, progress, dismissed }

    // Actions
    addExportJob: (job) => set((state) => ({ exportJobs: [...state.exportJobs, job] })),
    updateExportJob: (id, updates) => set((state) => ({
        exportJobs: state.exportJobs.map(j => j.id === id ? { ...j, ...updates } : j)
    })),
    removeExportJob: (id) => set((state) => ({
        exportJobs: state.exportJobs.filter(j => j.id !== id)
    })),
    setProjectName: (name) => set({ projectName: name }),
    setProjectResolution: (res) => set({ projectResolution: res }),
    setDuration: (duration) => set({ duration }),

    // Computed duration: max of video clips end time and subtitle end time
    getDuration: () => {
        const { subtitles, videoClips } = get();

        // Get the end time of the last video clip
        let maxVideoEnd = 0;
        if (videoClips.length > 0) {
            maxVideoEnd = Math.max(...videoClips.map(c => c.startTimeInTimeline + c.duration));
        }

        // Get the end time of the last subtitle
        let maxSubEnd = 0;
        if (subtitles.length > 0) {
            maxSubEnd = Math.max(...subtitles.map(s => s.endTime));
        }

        // Return the maximum of both (allows subtitle to extend beyond video)
        return Math.max(maxVideoEnd, maxSubEnd);
    },

    setCurrentTime: (time) => set((state) => {
        const { subtitles, videoClips } = state;
        // Calculate effective duration (same as getDuration)
        let maxVideoEnd = 0;
        if (videoClips.length > 0) {
            maxVideoEnd = Math.max(...videoClips.map(c => c.startTimeInTimeline + c.duration));
        }
        let maxSubEnd = 0;
        if (subtitles.length > 0) {
            maxSubEnd = Math.max(...subtitles.map(s => s.endTime));
        }
        const effectiveDuration = Math.max(maxVideoEnd, maxSubEnd);

        return { currentTime: Math.max(0, Math.min(effectiveDuration, time)) };
    }),
    setPlaying: (isPlaying) => set({ isPlaying }),
    setZoom: (zoom) => set({ zoom }),

    setSelectedSubtitle: (id) => set({ selectedSubtitleId: id }),
    setSelectedClip: (id) => set({ selectedClipId: id }),

    updateGlobalStyle: (style) => set((state) => ({ globalStyle: { ...state.globalStyle, ...style } })),

    // Imported Media Library
    addImportedMedia: (media) => set((state) => ({ importedMedia: [...state.importedMedia, media] })),
    removeImportedMedia: (id) => set((state) => ({ importedMedia: state.importedMedia.filter(m => m.id !== id) })),

    // Video Clips
    addVideoClip: (clip) => set((state) => {
        // New clip gets zOrder = min(existing) - 1  → goes BELOW existing clips (like "added later = lower layer")
        const existingOrders = state.videoClips.map(c => c.zOrder ?? 0);
        const minOrder = existingOrders.length > 0 ? Math.min(...existingOrders) : 0;
        return {
            videoClips: [...state.videoClips, {
                ...clip,
                transformX: clip.transformX ?? 50,
                transformY: clip.transformY ?? 50,
                transformScale: clip.transformScale ?? 100,
                transformWidth: clip.transformWidth ?? 100,   // % of preview width
                transformHeight: clip.transformHeight ?? 100, // % of preview height
                zOrder: clip.zOrder ?? (minOrder - 1),
            }]
        };
    }),
    updateVideoClip: (id, updates) => set((state) => ({
        videoClips: state.videoClips.map((c) => (c.id === id ? { ...c, ...updates } : c))
    })),
    removeVideoClip: (id) => set((state) => ({
        videoClips: state.videoClips.filter((c) => c.id !== id)
    })),

    // Z-order controls
    bringForward: (id) => set((state) => {
        const clips = [...state.videoClips];
        const clip = clips.find(c => c.id === id);
        if (!clip) return {};
        // Find the nearest clip with higher zOrder and swap
        const higher = clips.filter(c => c.id !== id && (c.zOrder ?? 0) > (clip.zOrder ?? 0));
        if (higher.length === 0) return {}; // already on top
        const next = higher.reduce((a, b) => ((a.zOrder ?? 0) < (b.zOrder ?? 0) ? a : b));
        const newClips = clips.map(c => {
            if (c.id === id) return { ...c, zOrder: next.zOrder ?? 0 };
            if (c.id === next.id) return { ...c, zOrder: clip.zOrder ?? 0 };
            return c;
        });
        return { videoClips: newClips };
    }),
    sendBackward: (id) => set((state) => {
        const clips = [...state.videoClips];
        const clip = clips.find(c => c.id === id);
        if (!clip) return {};
        const lower = clips.filter(c => c.id !== id && (c.zOrder ?? 0) < (clip.zOrder ?? 0));
        if (lower.length === 0) return {};
        const prev = lower.reduce((a, b) => ((a.zOrder ?? 0) > (b.zOrder ?? 0) ? a : b));
        const newClips = clips.map(c => {
            if (c.id === id) return { ...c, zOrder: prev.zOrder ?? 0 };
            if (c.id === prev.id) return { ...c, zOrder: clip.zOrder ?? 0 };
            return c;
        });
        return { videoClips: newClips };
    }),
    bringToFront: (id) => set((state) => {
        const clips = state.videoClips;
        const maxOrder = Math.max(...clips.map(c => c.zOrder ?? 0));
        return { videoClips: clips.map(c => c.id === id ? { ...c, zOrder: maxOrder + 1 } : c) };
    }),
    sendToBack: (id) => set((state) => {
        const clips = state.videoClips;
        const minOrder = Math.min(...clips.map(c => c.zOrder ?? 0));
        return { videoClips: clips.map(c => c.id === id ? { ...c, zOrder: minOrder - 1 } : c) };
    }),

    // Subtitles
    addSubtitles: (newSubs) => set((state) => ({ subtitles: [...state.subtitles, ...newSubs] })),
    setSubtitles: (subtitles) => set({ subtitles }),
    updateSubtitle: (id, updates) => set((state) => ({
        subtitles: state.subtitles.map((s) => (s.id === id ? { ...s, ...updates } : s))
    })),
    deleteSubtitle: (id) => set((state) => ({
        subtitles: state.subtitles.filter((s) => s.id !== id)
    })),
    applyStyleToAllSubtitles: (style) => set((state) => ({
        subtitles: state.subtitles.map((s) => ({
            ...s,
            style: { ...s.style, ...style }
        }))
    })),

    // Advanced Operations
    splitAllAtCurrentTime: () => {
        const { currentTime, videoClips, subtitles, addVideoClip, addSubtitles, updateVideoClip, updateSubtitle } = get();
        // Implementation for split logic could go here if needed, or keeping it simple for now
        // For now, logging to console as it requires complex logic
        console.log("Split all at", currentTime);
    },

    splitVideoClipAtTime: (id, time) => {
        const { videoClips, updateVideoClip, addVideoClip } = get();
        const clip = videoClips.find(c => c.id === id);
        if (!clip) return;

        const relativeTime = time - clip.startTimeInTimeline;
        if (relativeTime <= 0 || relativeTime >= clip.duration) return;

        const firstPartDuration = relativeTime;
        const secondPartDuration = clip.duration - relativeTime;

        // Update first clip
        updateVideoClip(id, { duration: firstPartDuration });

        // Create second clip
        const newClip = {
            ...clip,
            id: `clip-${Date.now()}`,
            startTimeInTimeline: time,
            startOffset: clip.startOffset + relativeTime,
            duration: secondPartDuration
        };

        // Need to insert it right after the original? For now just append
        addVideoClip(newClip);
    },

    splitSubtitleAtTime: (id, time) => {
        const { subtitles, updateSubtitle, addSubtitles } = get();
        const sub = subtitles.find(s => s.id === id);
        if (!sub || time <= sub.startTime || time >= sub.endTime) return;

        const originalEndTime = sub.endTime;

        // Update first sub
        updateSubtitle(id, { endTime: time });

        // Create second sub
        const newSub = {
            ...sub,
            id: `sub-${Date.now()}`,
            startTime: time,
            endTime: originalEndTime,
            text: sub.text // Duplicate text or clear it? Usually duplicate or split text
        };

        addSubtitles([newSub]);
    },

    // Delete gap between subtitles and shift all subtitles after the gap to the left
    deleteGap: (gapStart, gapEnd) => {
        const { subtitles, setSubtitles } = get();
        const gapDuration = gapEnd - gapStart;

        if (gapDuration <= 0) return;

        const updatedSubs = subtitles.map(sub => {
            // If subtitle starts at or after the gap end, shift it left
            if (sub.startTime >= gapEnd - 0.001) {
                return {
                    ...sub,
                    startTime: sub.startTime - gapDuration,
                    endTime: sub.endTime - gapDuration
                };
            }
            return sub;
        });

        setSubtitles(updatedSubs);
    },

    // Delete gap between video clips and shift all clips after the gap to the left
    deleteVideoGap: (gapStart, gapEnd) => {
        const { videoClips } = get();
        const gapDuration = gapEnd - gapStart;

        if (gapDuration <= 0) return;

        const updatedClips = videoClips.map(clip => {
            // If clip starts at or after the gap end, shift it left
            if (clip.startTimeInTimeline >= gapEnd - 0.001) {
                return {
                    ...clip,
                    startTimeInTimeline: clip.startTimeInTimeline - gapDuration
                };
            }
            return clip;
        });

        set({ videoClips: updatedClips });
    },

    // Shift all video clips that start at or after 'fromTime' by 'shiftAmount' seconds
    shiftVideoClipsRight: (fromTime, shiftAmount, excludeId = null) => {
        const { videoClips } = get();

        if (shiftAmount === 0) return;

        const updatedClips = videoClips.map(clip => {
            if (clip.id === excludeId) return clip;
            if (clip.startTimeInTimeline >= fromTime - 0.001) {
                return {
                    ...clip,
                    startTimeInTimeline: Math.max(0, clip.startTimeInTimeline + shiftAmount)
                };
            }
            return clip;
        });

        set({ videoClips: updatedClips });
    },

    // Shift all subtitles that start at or after 'fromTime' by 'shiftAmount' seconds
    shiftSubtitlesRight: (fromTime, shiftAmount, excludeId = null) => {
        const { subtitles, setSubtitles } = get();

        if (shiftAmount === 0) return;

        const updatedSubs = subtitles.map(sub => {
            // Skip the excluded subtitle (the one being dragged)
            if (sub.id === excludeId) return sub;

            // If subtitle starts at or after fromTime, shift it
            if (sub.startTime >= fromTime - 0.001) {
                return {
                    ...sub,
                    startTime: Math.max(0, sub.startTime + shiftAmount),
                    endTime: sub.endTime + shiftAmount
                };
            }
            return sub;
        });

        setSubtitles(updatedSubs);
    }
}));
