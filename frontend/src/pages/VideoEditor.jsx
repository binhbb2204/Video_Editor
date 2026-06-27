import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Timeline } from '../components/Timeline/Timeline';
import { VideoPreview } from '../components/Preview/VideoPreview';
import { SubtitleEditor } from '../components/Subtitle/SubtitleEditor';
import { MediaLibrary } from '../components/MediaLibrary/MediaLibrary';
import { StylingPanel } from '../components/Styling/StylingPanel';
import { ExportModal } from '../components/Export/ExportModal';
import { ExportManager } from '../components/Export/ExportManager';
import { ExportIcon } from '../components/Icons';
import { ChevronLeft, ChevronRight, Film, Type, Palette, Loader2 } from 'lucide-react';

const VideoEditor = () => {
  const { addVideoClip, setDuration, addImportedMedia, projectName, setProjectName, exportJobs, updateExportJob } = useStore();
  const [localProjectName, setLocalProjectName] = useState(projectName);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(300);
  const [activeLeftTab, setActiveLeftTab] = useState('media'); // 'media', 'subtitle', null
  const [closingLeftTab, setClosingLeftTab] = useState(null);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  const toggleLeftTab = (tab) => {
    if (activeLeftTab === tab) {
      setClosingLeftTab(tab);
      setActiveLeftTab(null);
    } else {
      setActiveLeftTab(tab);
      setClosingLeftTab(null);
    }
  };

  useEffect(() => {
    setLocalProjectName(projectName);
  }, [projectName]);

  const handleNameBlur = () => {
    setProjectName(localProjectName.trim() || "Untitled Project");
    if (!localProjectName.trim()) {
      setLocalProjectName("Untitled Project");
    }
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  // Initial duration setup
  useEffect(() => {
    // Only set default if no duration is present, but keep it minimal initially
    const unsubscribe = useStore.subscribe(
      (state) => state.videoClips,
      (clips) => {
        if (clips.length === 0) {
          useStore.getState().setDuration(10);
        }
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleOpenExportModal = () => {
        setIsExportModalOpen(true);
        exportJobs.forEach(job => updateExportJob(job.id, { dismissed: false }));
    };
    window.addEventListener('open-export-modal', handleOpenExportModal);
    return () => window.removeEventListener('open-export-modal', handleOpenExportModal);
  }, [exportJobs, updateExportJob]);

  const activeExports = exportJobs.filter(j => j.status === 'processing' || j.status === 'pending');
  const hasActiveExports = activeExports.length > 0;
  const overallProgress = hasActiveExports 
    ? Math.round(activeExports.reduce((acc, job) => acc + job.progress, 0) / activeExports.length) 
    : 0;

  const handleExportClick = () => {
      setIsExportModalOpen(true);
      exportJobs.forEach(job => updateExportJob(job.id, { dismissed: false }));
  };

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

        // Also add to media library
        // Generate thumbnail
        tempVideo.currentTime = 1;
        tempVideo.onseeked = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 90;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(tempVideo, 0, 0, 160, 90);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.6);
          addImportedMedia({
            id: `media-${Date.now()}`,
            name: file.name,
            url: url,
            type: 'video',
            duration: vidDuration,
            thumbnail
          });
        };
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
      <header className="h-14 border-b border-blue-900/30 flex items-center justify-between px-4 bg-gradient-to-r from-zinc-900/90 via-zinc-900/80 to-zinc-900/90 backdrop-blur-xl z-50 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
            <span className="font-black text-[10px]">VE</span>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">VideoEditor</h1>
            <p className="text-[10px] text-blue-400/60 font-medium">Professional SRT Editor</p>
          </div>
        </div>

        <div className="hidden md:flex items-center justify-center flex-1 mx-4">
          <input
            type="text"
            value={localProjectName}
            onChange={(e) => setLocalProjectName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            className="bg-transparent hover:bg-zinc-800/50 focus:bg-zinc-800/80 text-zinc-200 text-sm font-semibold text-center border border-transparent hover:border-zinc-700 focus:border-blue-500 rounded px-3 py-1 outline-none transition-all w-64 placeholder:text-zinc-600"
            placeholder="Enter project name..."
          />
        </div>

        <div className="flex items-center space-x-4">
          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 border border-zinc-700/50">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Import</span>
            <input type="file" className="hidden" onChange={handleFileUpload} accept="video/*" />
          </label>
          {hasActiveExports ? (
            <button
              onClick={handleExportClick}
              className="bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 border border-zinc-700/50 text-blue-400 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-blue-500/20" style={{ width: `${overallProgress}%` }} />
              <Loader2 className="w-4 h-4 animate-spin relative z-10" />
              <span className="relative z-10">Exporting {overallProgress}%</span>
            </button>
          ) : (
            <button
              onClick={handleExportClick}
              className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-2 shadow-lg shadow-blue-600/25 text-white"
            >
              <ExportIcon />
              <span>Export</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Far Left Icon Sidebar */}
        <div className="w-16 bg-zinc-950 border-r border-zinc-800/50 flex flex-col items-center py-4 space-y-4 shrink-0 z-10">
          <button
            onClick={() => toggleLeftTab('media')}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeLeftTab === 'media' ? 'bg-blue-600/20 text-blue-500' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            title="My Media"
          >
            <Film className="w-5 h-5" />
            <span className="text-[9px] font-medium mt-1">Media</span>
          </button>
          
          <button
            onClick={() => toggleLeftTab('subtitle')}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeLeftTab === 'subtitle' ? 'bg-blue-600/20 text-blue-500' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            title="Subtitles"
          >
            <Type className="w-5 h-5" />
            <span className="text-[9px] font-medium mt-1">Text</span>
          </button>

          <button
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${isRightPanelOpen ? 'bg-blue-600/20 text-blue-500' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            title="Style"
          >
            <Palette className="w-5 h-5" />
            <span className="text-[9px] font-medium mt-1">Style</span>
          </button>
        </div>

        {/* Left Panel: Dynamic based on activeLeftTab */}
        <div
          style={{ width: activeLeftTab ? leftPanelWidth : 0 }}
          className={`flex-shrink-0 h-full relative flex flex-col transition-all duration-300 bg-zinc-900 overflow-hidden border-zinc-800/50 ${activeLeftTab ? 'border-r opacity-100' : 'border-r-0 opacity-0'}`}
        >
          <div style={{ width: leftPanelWidth }} className="h-full flex flex-col relative">
            {(activeLeftTab || closingLeftTab) === 'media' && <MediaLibrary />}
            {(activeLeftTab || closingLeftTab) === 'subtitle' && <SubtitleEditor />}
            
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
          </div>
        </div>

        {/* Center: Video Preview */}
        <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden min-w-[400px]">
          <div className="flex-1 overflow-hidden relative">
            <VideoPreview />
          </div>

          {/* Bottom Area: Timeline */}
          <div style={{ height: bottomPanelHeight }} className="flex-shrink-0 border-t border-zinc-800/50 relative">
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
          className="flex-shrink-0 border-l border-zinc-800/50 h-full relative flex flex-col transition-all duration-300"
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
      <ExportManager />
    </div>
  );
};

export default VideoEditor;