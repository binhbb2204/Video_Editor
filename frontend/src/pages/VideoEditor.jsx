import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Timeline } from '../components/Timeline/Timeline';
import { VideoPreview } from '../components/Preview/VideoPreview';
import { SubtitleEditor } from '../components/Subtitle/SubtitleEditor';
import { StylingPanel } from '../components/Styling/StylingPanel';
import { ExportModal } from '../components/Export/ExportModal';
import { PlusIcon, ExportIcon } from '../components/Icons';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const VideoEditor = () => {
  const { addVideoClip, setDuration } = useStore();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(300);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Initial duration setup
  useEffect(() => {
    // Only set default if no duration is present, but keep it minimal initially
    // The actual duration will be set on import.
  }, [setDuration]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      // We create a temporary video element to get the real duration
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = url;

      let durationSet = false;

      const setVideoDuration = () => {
        if (durationSet) return;

        let vidDuration = tempVideo.duration;
        // For large files, duration might be Infinity initially
        if (!Number.isFinite(vidDuration) || vidDuration <= 0) {
          return; // Wait for valid duration
        }

        durationSet = true;
        console.log('Video duration detected:', vidDuration, 'seconds');

        addVideoClip({
          id: `clip-${Date.now()}`,
          name: file.name,
          url: url,
          duration: vidDuration,
          startTimeInTimeline: 0,
          startOffset: 0,
          playbackRate: 1
        });
        // Set timeline duration to exactly match the video duration
        setDuration(vidDuration + 0.1);
      };

      // Try both events - loadedmetadata fires first but may have Infinity
      // durationchange fires when actual duration becomes available
      tempVideo.onloadedmetadata = setVideoDuration;
      tempVideo.ondurationchange = setVideoDuration;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-zinc-900 flex items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-xl z-50 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="font-black text-xs">LC</span>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">LipChamp</h1>
            <p className="text-[10px] text-zinc-500 font-medium">Professional SRT Editor</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center space-x-8 text-xs font-medium text-zinc-400">
          <button className="hover:text-white transition">File</button>
          <button className="hover:text-white transition">Edit</button>
          <button className="text-white border-b-2 border-blue-500 pb-1">Timeline</button>
          <button className="hover:text-white transition">Subtitles</button>
        </nav>

        <div className="flex items-center space-x-4">
          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2">
            <PlusIcon />
            <span>Import</span>
            <input type="file" className="hidden" onChange={handleFileUpload} accept="video/*" />
          </label>
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 shadow-lg shadow-blue-600/20 text-white"
          >
            <ExportIcon />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Subtitle Editor (Collapsible) */}
        <div
          style={{ width: isLeftPanelOpen ? leftPanelWidth : 40 }}
          className="flex-shrink-0 border-r border-zinc-900 h-full relative flex flex-col transition-all duration-300"
        >
          {isLeftPanelOpen ? (
            <>
              <SubtitleEditor />
              {/* Toggle Button */}
              <button
                onClick={() => setIsLeftPanelOpen(false)}
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-12 bg-zinc-800 hover:bg-zinc-700 rounded-r-lg flex items-center justify-center z-50 border border-zinc-700 border-l-0 transition-colors"
                title="Hide Subtitles"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-400" />
              </button>
              {/* Resizer */}
              <div
                className="absolute top-0 bottom-0 -right-0.5 w-1 cursor-col-resize z-40 hover:bg-blue-500 transition-colors"
                onMouseDown={(e) => {
                  const startX = e.clientX;
                  const startWidth = leftPanelWidth;
                  const onMouseMove = (moveEvent) => {
                    setLeftPanelWidth(Math.max(250, Math.min(600, startWidth + (moveEvent.clientX - startX))));
                  };
                  const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                  };
                  document.addEventListener('mousemove', onMouseMove);
                  document.addEventListener('mouseup', onMouseUp);
                }}
              />
            </>
          ) : (
            <button
              onClick={() => setIsLeftPanelOpen(true)}
              className="flex flex-col items-center justify-center h-full py-4 hover:bg-zinc-800/30 transition-colors cursor-pointer w-full"
              title="Show Subtitles"
            >
              <ChevronRight className="w-4 h-4 text-zinc-500 mb-2" />
              <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                Subtitles
              </span>
            </button>
          )}
        </div>

        {/* Center: Video Preview */}
        <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden min-w-[400px]">
          <div className="flex-1 overflow-hidden relative">
            <VideoPreview />
          </div>

          {/* Bottom Area: Timeline */}
          <div style={{ height: bottomPanelHeight }} className="flex-shrink-0 border-t border-zinc-900 relative">
            {/* Resizer */}
            <div
              className="absolute -top-0.5 left-0 right-0 h-1 cursor-row-resize z-50 hover:bg-blue-500 transition-colors"
              onMouseDown={(e) => {
                const startY = e.clientY;
                const startHeight = bottomPanelHeight;
                const onMouseMove = (moveEvent) => {
                  setBottomPanelHeight(Math.max(150, Math.min(600, startHeight - (moveEvent.clientY - startY))));
                };
                const onMouseUp = () => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
              }}
            />
            <Timeline />
          </div>
        </div>

        {/* Right Panel: Styling (Collapsible) */}
        <div
          style={{ width: isRightPanelOpen ? rightPanelWidth : 40 }}
          className="flex-shrink-0 border-l border-zinc-900 h-full relative flex flex-col transition-all duration-300"
        >
          {isRightPanelOpen ? (
            <>
              <StylingPanel />
              {/* Toggle Button */}
              <button
                onClick={() => setIsRightPanelOpen(false)}
                className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-12 bg-zinc-800 hover:bg-zinc-700 rounded-l-lg flex items-center justify-center z-50 border border-zinc-700 border-r-0 transition-colors"
                title="Hide Styling"
              >
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
              {/* Resizer */}
              <div
                className="absolute top-0 bottom-0 -left-0.5 w-1 cursor-col-resize z-40 hover:bg-blue-500 transition-colors"
                onMouseDown={(e) => {
                  const startX = e.clientX;
                  const startWidth = rightPanelWidth;
                  const onMouseMove = (moveEvent) => {
                    setRightPanelWidth(Math.max(200, Math.min(500, startWidth - (moveEvent.clientX - startX))));
                  };
                  const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                  };
                  document.addEventListener('mousemove', onMouseMove);
                  document.addEventListener('mouseup', onMouseUp);
                }}
              />
            </>
          ) : (
            <button
              onClick={() => setIsRightPanelOpen(true)}
              className="flex flex-col items-center justify-center h-full py-4 hover:bg-zinc-800/30 transition-colors cursor-pointer w-full"
              title="Show Styling"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-500 mb-2" />
              <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                Style
              </span>
            </button>
          )}
        </div>
      </div>

      {isExportModalOpen && <ExportModal onClose={() => setIsExportModalOpen(false)} />}
    </div>
  );
};

export default VideoEditor;