import React from 'react';
import {
    Play,
    Pause,
    Plus,
    Volume2,
    VolumeX,
    Download,
    Trash2,
    Scissors,
    MonitorPlay
} from 'lucide-react';

export const PlayIcon = (props) => <Play size={20} fill="currentColor" {...props} />;
export const PauseIcon = (props) => <Pause size={20} fill="currentColor" {...props} />;
export const PlusIcon = (props) => <Plus size={16} {...props} />;
export const VolumeIcon = (props) => <Volume2 size={20} {...props} />;
export const MuteIcon = (props) => <VolumeX size={20} {...props} />;
export const ExportIcon = (props) => <Download size={16} {...props} />;
export const TrashIcon = (props) => <Trash2 size={14} {...props} />;
export const SplitIcon = (props) => <Scissors size={14} {...props} />;
export const VideoIcon = (props) => <MonitorPlay size={24} {...props} />;
