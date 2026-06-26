import { create } from 'zustand';
import { DEFAULT_STYLE, DEFAULT_ZOOM } from '../constants';

export const useStore = create((set, get) => ({
    // State
    videoClips: [],
    subtitles: [],
    globalStyle: { ...DEFAULT_STYLE },
    duration: 10,
    currentTime: 0,
    isPlaying: false,
    zoom: DEFAULT_ZOOM,
    selectedSubtitleId: null,
    selectedClipId: null,

    // Actions
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

    // Video Clips
    addVideoClip: (clip) => set((state) => ({ videoClips: [...state.videoClips, clip] })),
    updateVideoClip: (id, updates) => set((state) => ({
        videoClips: state.videoClips.map((c) => (c.id === id ? { ...c, ...updates } : c))
    })),
    removeVideoClip: (id) => set((state) => ({
        videoClips: state.videoClips.filter((c) => c.id !== id)
    })),

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
