package models

import "context"

// Subtitle represents a single subtitle entry
type Subtitle struct {
	ID        string        `json:"id"`
	Text      string        `json:"text"`
	StartTime float64       `json:"startTime"`
	EndTime   float64       `json:"endTime"`
	Style     SubtitleStyle `json:"style,omitempty"`
}

// SubtitleStyle holds styling options for subtitles
type SubtitleStyle struct {
	FontFamily        string  `json:"fontFamily,omitempty"`
	FontSize          int     `json:"fontSize,omitempty"`
	FontWeight        string  `json:"fontWeight,omitempty"`
	Color             string  `json:"color,omitempty"`
	OutlineColor      string  `json:"outlineColor,omitempty"`
	OutlineWidth      int     `json:"outlineWidth,omitempty"`
	OutlineOpacity    float64 `json:"outlineOpacity,omitempty"`
	BackgroundColor   string  `json:"backgroundColor,omitempty"`
	BackgroundOpacity float64 `json:"backgroundOpacity,omitempty"`
	Alignment         string  `json:"alignment,omitempty"`
	X                 float64 `json:"x,omitempty"`
	Y                 float64 `json:"y,omitempty"`
	Width             float64 `json:"width,omitempty"`
}

// GlobalStyle is the default style applied to all subtitles
type GlobalStyle struct {
	FontFamily        string  `json:"fontFamily"`
	FontSize          int     `json:"fontSize"`
	FontWeight        string  `json:"fontWeight"`
	Color             string  `json:"color"`
	OutlineColor      string  `json:"outlineColor"`
	OutlineWidth      int     `json:"outlineWidth"`
	OutlineOpacity    float64 `json:"outlineOpacity"`
	BackgroundColor   string  `json:"backgroundColor"`
	BackgroundOpacity float64 `json:"backgroundOpacity"`
	Alignment         string  `json:"alignment"`
	X                 float64 `json:"x"`
	Y                 float64 `json:"y"`
	Width             float64 `json:"width"`
}

// ExportRequest is the JSON payload for export endpoint
type ExportRequest struct {
	Subtitles   []Subtitle  `json:"subtitles"`
	GlobalStyle GlobalStyle `json:"globalStyle"`
	Resolution  string      `json:"resolution"`
	Format      string      `json:"format"`
}

// VideoClip represents a clip on the timeline
type VideoClip struct {
	VideoIndex          int     `json:"videoIndex"`
	StartTimeInTimeline float64 `json:"startTimeInTimeline"`
	StartOffset         float64 `json:"startOffset"`
	Duration            float64 `json:"duration"`
	ZOrder              int     `json:"zOrder"`
	TransformX          float64 `json:"transformX"`
	TransformY          float64 `json:"transformY"`
	TransformWidth      float64 `json:"transformWidth"`
	TransformHeight     float64 `json:"transformHeight"`
}

// ExportJob tracks the status of an export job
type ExportJob struct {
	ID           string             `json:"id"`
	Status       string             `json:"status"` // pending, processing, completed, failed
	Progress     int                `json:"progress"`
	OutputFile   string             `json:"-"`
	ProjectName  string             `json:"-"`
	Error        string             `json:"error,omitempty"`
	SubtitleOnly bool               `json:"-"` // True if exporting subtitles over black background
	Duration     float64            `json:"-"` // Total duration of export
	VideoFiles   []string           `json:"-"` // Paths to uploaded video files
	Clips        []VideoClip        `json:"-"` // Timeline clips with positions
	Cancel       context.CancelFunc `json:"-"`
}
