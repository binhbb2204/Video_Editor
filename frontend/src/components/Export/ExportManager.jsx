import React, { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { X, CheckCircle, Loader2, Download } from 'lucide-react';

const API_URL = 'http://localhost:8080';

export const ExportManager = () => {
    const { exportJobs, updateExportJob, removeExportJob } = useStore();
    const pollIntervals = useRef({});

    useEffect(() => {
        const pollInterval = setInterval(async () => {
            // Read latest state directly from store to avoid dependency cycle
            const currentJobs = useStore.getState().exportJobs;
            const activeJobs = currentJobs.filter(j => j.status === 'processing' || j.status === 'pending');

            for (const job of activeJobs) {
                try {
                    const response = await fetch(`${API_URL}/api/export/status/${job.id}`);
                    if (!response.ok) {
                        updateExportJob(job.id, { status: 'failed', error: 'Failed to get status' });
                        continue;
                    }
                    const data = await response.json();
                    updateExportJob(job.id, { status: data.status, progress: data.progress, error: data.error });
                    
                    if (data.status === 'completed' || data.status === 'failed' || data.status === 'canceled') {
                        if (data.status === 'completed') {
                            // Un-dismiss if it was dismissed
                            const cJob = useStore.getState().exportJobs.find(j => j.id === job.id);
                            if (cJob && cJob.dismissed) {
                                updateExportJob(job.id, { dismissed: false });
                            }

                            // Auto trigger download
                            const downloadUrl = `${API_URL}/api/export/download/${job.id}`;
                            const a = document.createElement('a');
                            a.href = downloadUrl;
                            a.download = `${cJob?.name || 'video'}.mp4`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);

                            // Auto dismiss after 4 seconds
                            setTimeout(() => {
                                const finalJob = useStore.getState().exportJobs.find(j => j.id === job.id);
                                if (finalJob && !finalJob.dismissed) {
                                    updateExportJob(job.id, { dismissed: true });
                                }
                            }, 4000);
                        }
                    }
                } catch (error) {
                    console.error('Polling error:', error);
                    updateExportJob(job.id, { status: 'failed', error: 'Network error' });
                }
            }
        }, 1000);

        return () => clearInterval(pollInterval);
    }, [updateExportJob]);

    const handleDismiss = (e, id) => {
        e.stopPropagation();
        updateExportJob(id, { dismissed: true });
    };

    const handleDownload = (e, id) => {
        e.stopPropagation();
        window.location.href = `${API_URL}/api/export/download/${id}`;
        // Auto remove after download
        setTimeout(() => removeExportJob(id), 1000);
    };

    // Render Toasts
    const visibleJobs = exportJobs.filter(j => !j.dismissed);

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
            {visibleJobs.map((job) => {
                const isCompleted = job.status === 'completed';
                const isFailed = job.status === 'failed' || job.status === 'canceled';
                
                return (
                    <div 
                        key={job.id}
                        className="w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden pointer-events-auto transform transition-all duration-300 animate-slide-in-right flex flex-col"
                        style={{ animation: 'slideInRight 0.3s ease-out' }}
                        onClick={() => {
                            // User requested: Click vào phần còn lại của toast (không phải X) → mở lại modal
                            // Since we have an ExportModal, we can trigger it. 
                            // But maybe opening ExportModal is handled by VideoEditor? 
                            // We can just set an event or let ExportModal read from store.
                            // Actually, ExportModal is controlled by VideoEditor's local state `isExportModalOpen`.
                            // So clicking the toast can just trigger a custom event that VideoEditor listens to.
                            window.dispatchEvent(new CustomEvent('open-export-modal'));
                        }}
                    >
                        {/* Top bar */}
                        <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                            <div className="flex items-center gap-2">
                                {isCompleted ? (
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                ) : isFailed ? (
                                    <X className="w-4 h-4 text-red-500" />
                                ) : (
                                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                                )}
                                <span className="text-xs font-semibold text-zinc-200">
                                    {isCompleted ? 'Export Completed!' : isFailed ? 'Export Failed' : `Exporting — ${job.progress}%`}
                                </span>
                            </div>
                            <button 
                                onClick={(e) => handleDismiss(e, job.id)}
                                className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        
                        {/* Content / Progress */}
                        {isCompleted ? null : isFailed ? (
                            <div className="px-3 pb-3 text-[10px] text-red-400">
                                {job.error}
                            </div>
                        ) : (
                            <div className="h-1 w-full bg-zinc-800">
                                <div 
                                    className="h-full bg-blue-500 transition-all duration-300 ease-out" 
                                    style={{ width: `${job.progress}%` }} 
                                />
                            </div>
                        )}
                    </div>
                );
            })}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}} />
        </div>
    );
};
