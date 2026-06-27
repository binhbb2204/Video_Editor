package services

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"video-editor-backend/models"
)

// getFFmpegPath returns the path to ffmpeg executable
func getFFmpegPath() string {
	// Check local ffmpeg folder first so the project can run without a system install.
	localPath := filepath.Join("ffmpeg", "bin", "ffmpeg.exe")
	if runtime.GOOS != "windows" {
		localPath = filepath.Join("ffmpeg", "bin", "ffmpeg")
	}
	if _, err := os.Stat(localPath); err == nil {
		absPath, _ := filepath.Abs(localPath)
		return absPath
	}
	// Fall back to PATH
	return "ffmpeg"
}

// getFFprobePath returns the path to ffprobe executable
func getFFprobePath() string {
	// Check local ffmpeg folder first so the project can run without a system install.
	localPath := filepath.Join("ffmpeg", "bin", "ffprobe.exe")
	if runtime.GOOS != "windows" {
		localPath = filepath.Join("ffmpeg", "bin", "ffprobe")
	}
	if _, err := os.Stat(localPath); err == nil {
		absPath, _ := filepath.Abs(localPath)
		return absPath
	}
	return "ffprobe"
}

// ExportVideo runs FFmpeg to burn subtitles into video
func ExportVideo(ctx context.Context, job *models.ExportJob, subtitles []models.Subtitle, globalStyle models.GlobalStyle, resolution string) error {
	// Generate ASS subtitle file
	assPath := filepath.Join("temp", job.ID+".ass")
	if err := generateASSFile(assPath, subtitles, globalStyle, resolution); err != nil {
		return fmt.Errorf("failed to generate ASS file: %w", err)
	}
	defer os.Remove(assPath) // Clean up temp file

	// Use job duration (which includes subtitle extensions)
	duration := job.Duration

	// Determine resolution
	var videoWidth, videoHeight int
	switch resolution {
	case "4k":
		videoWidth, videoHeight = 3840, 2160
	case "720":
		videoWidth, videoHeight = 1280, 720
	default: // 1080
		videoWidth, videoHeight = 1920, 1080
	}

	// Build FFmpeg command
	absAssPath, _ := filepath.Abs(assPath)
	escapedAssPath := strings.ReplaceAll(absAssPath, "\\", "/")
	escapedAssPath = strings.ReplaceAll(escapedAssPath, ":", "\\:")

	if job.SubtitleOnly {
		// Subtitle-only mode: create black background video with subtitles
		return exportSubtitleOnly(ctx, job, escapedAssPath, videoWidth, videoHeight, duration)
	}

	// Timeline export mode: create video with clips, gaps, and subtitles
	return exportTimeline(ctx, job, escapedAssPath, videoWidth, videoHeight, duration, resolution)
}

// exportTimeline creates a video from timeline clips with gaps filled with black
func exportTimeline(ctx context.Context, job *models.ExportJob, assPath string, width, height int, duration float64, resolution string) error {
	threads := runtime.NumCPU()
	if threads > 8 {
		threads = 8
	}

	clips := job.Clips

	// Sort clips by zOrder to ensure correct layering
	sort.SliceStable(clips, func(i, j int) bool {
		if clips[i].ZOrder == clips[j].ZOrder {
			return clips[i].StartTimeInTimeline < clips[j].StartTimeInTimeline
		}
		return clips[i].ZOrder < clips[j].ZOrder
	})

	// If no clips, treat as subtitle-only
	if len(clips) == 0 {
		return exportSubtitleOnly(ctx, job, assPath, width, height, duration)
	}

	// Build complex filter for timeline using overlay with setpts for timing
	var inputs []string
	var filterParts []string

	// Input 0: Black background for full duration
	inputs = append(inputs, "-f", "lavfi", "-i", fmt.Sprintf("color=c=black:s=%dx%d:d=%.3f:r=30", width, height, duration))

	// Input 1: Silent audio for full duration
	inputs = append(inputs, "-f", "lavfi", "-i", fmt.Sprintf("anullsrc=r=48000:cl=stereo:d=%.3f", duration))

	// Add video file inputs
	for _, videoFile := range job.VideoFiles {
		inputs = append(inputs, "-i", videoFile)
	}

	// Process each clip: trim, scale, and prepare for overlay
	for i, clip := range clips {
		videoInputIdx := clip.VideoIndex + 2 // +2 because 0=black, 1=audio
		clipLabel := fmt.Sprintf("clip%d", i)

		tw := clip.TransformWidth
		if tw == 0 { tw = 100 }
		th := clip.TransformHeight
		if th == 0 { th = 100 }

		targetW := int(tw / 100.0 * float64(width))
		targetH := int(th / 100.0 * float64(height))
		if targetW <= 0 { targetW = width }
		if targetH <= 0 { targetH = height }

		// Trim from source, scale, and set timestamp for when to appear
		filterParts = append(filterParts, fmt.Sprintf(
			"[%d:v]trim=start=%.3f:duration=%.3f,setpts=PTS-STARTPTS+%.3f/TB,scale=%d:%d,setsar=1,setpts=PTS-STARTPTS+%.3f/TB[%s]",
			videoInputIdx, clip.StartOffset, clip.Duration, clip.StartTimeInTimeline,
			targetW, targetH, clip.StartTimeInTimeline, clipLabel,
		))
	}

	// Create overlay chain - overlay each clip on the black background
	// Each overlay uses 'enable' to only show during the clip's time range
	currentLabel := "0:v"
	for i, clip := range clips {
		clipLabel := fmt.Sprintf("clip%d", i)
		outLabel := fmt.Sprintf("v%d", i)
		startTime := clip.StartTimeInTimeline
		endTime := clip.StartTimeInTimeline + clip.Duration

		tw := clip.TransformWidth
		if tw == 0 { tw = 100 }
		th := clip.TransformHeight
		if th == 0 { th = 100 }
		tx := clip.TransformX
		if tx == 0 { tx = 50 }
		ty := clip.TransformY
		if ty == 0 { ty = 50 }

		targetW := int(tw / 100.0 * float64(width))
		targetH := int(th / 100.0 * float64(height))
		posX := int(tx/100.0*float64(width)) - targetW/2
		posY := int(ty/100.0*float64(height)) - targetH/2

		filterParts = append(filterParts, fmt.Sprintf(
			"[%s][%s]overlay=%d:%d:enable='between(t,%.3f,%.3f)':shortest=0[%s]",
			currentLabel, clipLabel, posX, posY, startTime, endTime, outLabel,
		))
		currentLabel = outLabel
	}

	// Add subtitle overlay at the end
	filterParts = append(filterParts, fmt.Sprintf("[%s]ass='%s'[vout]", currentLabel, assPath))

	// Build audio mix from video clips
	// Each clip's audio is trimmed and delayed to match its timeline position
	audioLabels := []string{}
	for i, clip := range clips {
		videoInputIdx := clip.VideoIndex + 2 // +2 because 0=black, 1=audio
		audioLabel := fmt.Sprintf("a%d", i)
		delayMs := int(clip.StartTimeInTimeline * 1000)
		
		// Trim audio from source, then delay to timeline position
		filterParts = append(filterParts, fmt.Sprintf(
			"[%d:a]atrim=start=%.3f:duration=%.3f,asetpts=PTS-STARTPTS,adelay=%d|%d[%s]",
			videoInputIdx, clip.StartOffset, clip.Duration, delayMs, delayMs, audioLabel,
		))
		audioLabels = append(audioLabels, fmt.Sprintf("[%s]", audioLabel))
	}

	// Mix all audio streams together (or use silent if no clips have audio)
	var audioMapArg string
	if len(audioLabels) > 0 {
		// Mix clip audios with silent base to ensure full duration
		allAudioInputs := fmt.Sprintf("[1:a]%s", strings.Join(audioLabels, ""))
		filterParts = append(filterParts, fmt.Sprintf(
			"%samix=inputs=%d:duration=longest:normalize=0[aout]",
			allAudioInputs, len(audioLabels)+1,
		))
		audioMapArg = "[aout]"
	} else {
		audioMapArg = "1:a"
	}

	// Join all filter parts
	filterComplex := strings.Join(filterParts, ";")

	args := []string{}
	args = append(args, inputs...)
	args = append(args,
		"-filter_complex", filterComplex,
		"-map", "[vout]",
		"-map", audioMapArg,
		"-c:v", "libx264",
		"-preset", "fast",
		"-crf", "23",
		"-threads", strconv.Itoa(threads),
		"-c:a", "aac",
		"-b:a", "192k",
		"-pix_fmt", "yuv420p",
		"-movflags", "+faststart",
		"-t", fmt.Sprintf("%.3f", duration),
		"-y",
		"-progress", "pipe:1",
		job.OutputFile,
	)

	log.Printf("FFmpeg command: %s %v", getFFmpegPath(), args)
	log.Printf("Filter complex: %s", filterComplex)

	cmd := exec.CommandContext(ctx, getFFmpegPath(), args...)
	stderr, _ := cmd.StderrPipe()
	stdout, _ := cmd.StdoutPipe()

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start FFmpeg: %w", err)
	}

	go parseProgress(stdout, job, duration)

	// Log stderr for debugging
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			log.Printf("FFmpeg stderr: %s", scanner.Text())
		}
	}()

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("FFmpeg failed: %w", err)
	}

	return nil
}

// exportSubtitleOnly creates a black background video with subtitles
func exportSubtitleOnly(ctx context.Context, job *models.ExportJob, assPath string, width, height int, duration float64) error {
	threads := runtime.NumCPU()
	if threads > 8 {
		threads = 8
	}

	// Use color source to generate black background, then add subtitles
	args := []string{
		"-f", "lavfi",
		"-i", fmt.Sprintf("color=c=black:s=%dx%d:d=%.3f:r=30", width, height, duration),
		"-f", "lavfi",
		"-i", fmt.Sprintf("anullsrc=r=48000:cl=stereo:d=%.3f", duration), // Silent audio
		"-vf", fmt.Sprintf("ass='%s'", assPath),
		"-c:v", "libx264",
		"-preset", "medium",
		"-crf", "22",
		"-threads", strconv.Itoa(threads),
		"-c:a", "aac",
		"-b:a", "128k",
		"-pix_fmt", "yuv420p",
		"-movflags", "+faststart",
		"-shortest",
		"-y",
		"-progress", "pipe:1",
		job.OutputFile,
	}

	cmd := exec.CommandContext(ctx, getFFmpegPath(), args...)
	stderr, _ := cmd.StderrPipe()
	stdout, _ := cmd.StdoutPipe()

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start FFmpeg: %w", err)
	}

	go parseProgress(stdout, job, duration)

	// Log stderr for debugging
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			// Uncomment for debugging:
			// log.Printf("FFmpeg: %s", scanner.Text())
		}
	}()

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("FFmpeg failed: %w", err)
	}

	return nil
}

// parseProgress reads FFmpeg progress output and updates job progress
func parseProgress(stdout io.Reader, job *models.ExportJob, duration float64) {
	scanner := bufio.NewScanner(stdout)
	timeRegex := regexp.MustCompile(`out_time_ms=(\d+)`)

	for scanner.Scan() {
		line := scanner.Text()
		if matches := timeRegex.FindStringSubmatch(line); len(matches) > 1 {
			timeMs, _ := strconv.ParseInt(matches[1], 10, 64)
			timeSec := float64(timeMs) / 1000000.0
			if duration > 0 {
				progress := int((timeSec / duration) * 100)
				if progress > 100 {
					progress = 100
				}
				job.Progress = progress
				log.Printf("Progress updated: %d%% (timeSec: %.2f, duration: %.2f)", progress, timeSec, duration)
			} else {
				log.Printf("Cannot calculate progress, duration is 0")
			}
		}
	}
	
	if err := scanner.Err(); err != nil {
		log.Printf("Error reading stdout progress: %v", err)
	}
}

// getVideoDuration returns video duration in seconds
func getVideoDuration(inputFile string) (float64, error) {
	cmd := exec.Command(getFFprobePath(),
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		inputFile,
	)

	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}

	duration, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
	if err != nil {
		return 0, err
	}

	return duration, nil
}

// generateASSFile creates an ASS subtitle file from the subtitle data
func generateASSFile(outputPath string, subtitles []models.Subtitle, globalStyle models.GlobalStyle, resolution string) error {
	// Determine video dimensions for positioning
	var videoWidth, videoHeight int
	switch resolution {
	case "4k":
		videoWidth, videoHeight = 3840, 2160
	case "720":
		videoWidth, videoHeight = 1280, 720
	default:
		videoWidth, videoHeight = 1920, 1080
	}

	// ASS header
	header := fmt.Sprintf(`[Script Info]
Title: VideoEditor Export
ScriptType: v4.00+
PlayResX: %d
PlayResY: %d
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
`, videoWidth, videoHeight)

	// Create styles and dialogues
	var styles []string
	var dialogues []string
	
	for i, sub := range subtitles {
		// Merge global style with subtitle's own style
		mergedStyle := mergeStyles(globalStyle, sub.Style)
		styleName := fmt.Sprintf("Style%d", i)
		
		// Generate style for this specific subtitle
		styles = append(styles, createASSStyle(styleName, mergedStyle, videoWidth))

		startTime := formatASSTime(sub.StartTime)
		endTime := formatASSTime(sub.EndTime)

		// Calculate position
		posX := int(mergedStyle.X / 100.0 * float64(videoWidth))
		posY := int(mergedStyle.Y / 100.0 * float64(videoHeight))

		// Escape text and add position override
		text := strings.ReplaceAll(sub.Text, "\n", "\\N")
		text = fmt.Sprintf("{\\pos(%d,%d)}%s", posX, posY, text)

		dialogue := fmt.Sprintf("Dialogue: 0,%s,%s,%s,,0,0,0,,%s", startTime, endTime, styleName, text)
		dialogues = append(dialogues, dialogue)
	}

	// Events header
	events := "\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"

	// Write ASS file
	content := header + strings.Join(styles, "") + events + strings.Join(dialogues, "\n")
	return os.WriteFile(outputPath, []byte(content), 0644)
}

// createASSStyle generates ASS style definition
func createASSStyle(name string, style models.GlobalStyle, videoWidth int) string {
	// Convert hex color to ASS format (&HAABBGGRR)
	primaryColor := hexToASS(style.Color)
	outlineColor := hexToASS(style.OutlineColor)

	// In frontend, sizes are relative to a REFERENCE_WIDTH of 1280
	scaleFactor := float64(videoWidth) / 1280.0

	// Calculate font size relative to video width
	fontSize := style.FontSize
	if fontSize == 0 {
		fontSize = 32
	}
	scaledFontSize := int(float64(fontSize) * scaleFactor)

	// Scale outline width
	outlineWidth := style.OutlineWidth
	scaledOutlineWidth := int(float64(outlineWidth) * scaleFactor)

	// Font weight (bold if >= 600)
	bold := 0
	if style.FontWeight == "bold" || style.FontWeight == "700" || style.FontWeight == "600" {
		bold = 1
	}

	// Alignment (ASS uses numpad style: 1-3 bottom, 4-6 middle, 7-9 top)
	// We use center (5) as default since we're using \pos override
	alignment := 5

	return fmt.Sprintf("Style: %s,%s,%d,%s,&H00FFFFFF,%s,&H80000000,%d,0,0,0,100,100,0,0,1,%d,0,%d,10,10,10,1\n",
		name,
		style.FontFamily,
		scaledFontSize,
		primaryColor,
		outlineColor,
		bold,
		scaledOutlineWidth,
		alignment,
	)
}

// hexToASS converts #RRGGBB to &HAABBGGRR format
func hexToASS(hex string) string {
	if len(hex) < 7 {
		return "&H00FFFFFF"
	}
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) != 6 {
		return "&H00FFFFFF"
	}
	// Convert RGB to BGR and add alpha
	r := hex[0:2]
	g := hex[2:4]
	b := hex[4:6]
	return fmt.Sprintf("&H00%s%s%s", b, g, r)
}

// formatASSTime converts seconds to ASS time format (H:MM:SS.CC)
func formatASSTime(seconds float64) string {
	h := int(seconds) / 3600
	m := (int(seconds) % 3600) / 60
	s := int(seconds) % 60
	cs := int((seconds - float64(int(seconds))) * 100)
	return fmt.Sprintf("%d:%02d:%02d.%02d", h, m, s, cs)
}

// mergeStyles merges subtitle style with global style
func mergeStyles(global models.GlobalStyle, sub models.SubtitleStyle) models.GlobalStyle {
	result := global

	if sub.FontFamily != "" {
		result.FontFamily = sub.FontFamily
	}
	if sub.FontSize != 0 {
		result.FontSize = sub.FontSize
	}
	if sub.Color != "" {
		result.Color = sub.Color
	}
	if sub.OutlineColor != "" {
		result.OutlineColor = sub.OutlineColor
	}
	if sub.OutlineWidth != 0 {
		result.OutlineWidth = sub.OutlineWidth
	}
	if sub.X != 0 {
		result.X = sub.X
	}
	if sub.Y != 0 {
		result.Y = sub.Y
	}

	return result
}
