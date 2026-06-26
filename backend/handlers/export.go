package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"video-editor-backend/models"
	"video-editor-backend/services"
)

// In-memory job storage (use Redis/DB for production)
var (
	jobs     = make(map[string]*models.ExportJob)
	jobsLock sync.RWMutex
)

// StartExport handles POST /api/export
func StartExport(c *gin.Context) {
	jobID := uuid.New().String()

	// Check if this is subtitle-only mode
	subtitleOnly := c.PostForm("subtitleOnly") == "true"
	durationStr := c.PostForm("duration")

	var duration float64
	if durationStr != "" {
		var err error
		duration, err = strconv.ParseFloat(durationStr, 64)
		if err != nil {
			duration = 0
		}
	}

	// Get subtitles and style from form data
	subtitlesJSON := c.PostForm("subtitles")
	globalStyleJSON := c.PostForm("globalStyle")
	resolution := c.DefaultPostForm("resolution", "1080")
	format := c.DefaultPostForm("format", "mp4")

	// Parse subtitles
	var subtitles []models.Subtitle
	if subtitlesJSON != "" {
		if err := json.Unmarshal([]byte(subtitlesJSON), &subtitles); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid subtitles JSON"})
			return
		}
	}

	// Parse global style
	var globalStyle models.GlobalStyle
	if globalStyleJSON != "" {
		if err := json.Unmarshal([]byte(globalStyleJSON), &globalStyle); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid globalStyle JSON"})
			return
		}
	}

	// Determine output extension
	outputExt := ".mp4"
	if format == "webm" {
		outputExt = ".webm"
	}
	outputPath := filepath.Join("exports", jobID+outputExt)

	// Create job
	job := &models.ExportJob{
		ID:           jobID,
		Status:       "pending",
		Progress:     0,
		OutputFile:   outputPath,
		SubtitleOnly: subtitleOnly,
		Duration:     duration,
	}

	if subtitleOnly {
		// Subtitle-only mode - no video files
		if duration <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Valid duration is required for subtitle-only export"})
			return
		}
	} else {
		// Parse clips metadata
		clipsJSON := c.PostForm("clips")
		videoCountStr := c.PostForm("videoCount")

		if clipsJSON == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Clips data is required"})
			return
		}

		var clips []models.VideoClip
		if err := json.Unmarshal([]byte(clipsJSON), &clips); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid clips JSON"})
			return
		}

		videoCount, _ := strconv.Atoi(videoCountStr)
		if videoCount == 0 {
			videoCount = 1
		}

		// Save uploaded video files
		videoFiles := make([]string, videoCount)
		for i := 0; i < videoCount; i++ {
			file, err := c.FormFile("video_" + strconv.Itoa(i))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Video file " + strconv.Itoa(i) + " is required"})
				return
			}

			inputPath := filepath.Join("uploads", jobID+"_"+strconv.Itoa(i)+filepath.Ext(file.Filename))
			if err := c.SaveUploadedFile(file, inputPath); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save video"})
				return
			}
			videoFiles[i] = inputPath
		}

		job.VideoFiles = videoFiles
		job.Clips = clips
	}

	jobsLock.Lock()
	jobs[jobID] = job
	jobsLock.Unlock()

	// Start export in background
	go func() {
		job.Status = "processing"

		err := services.ExportVideo(job, subtitles, globalStyle, resolution)
		if err != nil {
			log.Printf("Export failed for job %s: %v", jobID, err)
			job.Status = "failed"
			job.Error = err.Error()
		} else {
			job.Status = "completed"
			job.Progress = 100
		}
	}()

	c.JSON(http.StatusOK, gin.H{
		"jobId":   jobID,
		"message": "Export started",
	})
}

// GetExportStatus handles GET /api/export/status/:id
func GetExportStatus(c *gin.Context) {
	jobID := c.Param("id")

	jobsLock.RLock()
	job, exists := jobs[jobID]
	jobsLock.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":       job.ID,
		"status":   job.Status,
		"progress": job.Progress,
		"error":    job.Error,
	})
}

// DownloadExport handles GET /api/export/download/:id
func DownloadExport(c *gin.Context) {
	jobID := c.Param("id")

	jobsLock.RLock()
	job, exists := jobs[jobID]
	jobsLock.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	if job.Status != "completed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Export not completed yet"})
		return
	}

	// Serve the file for download
	filename := "LipChamp_Export_" + jobID[:8] + filepath.Ext(job.OutputFile)
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.File(job.OutputFile)
}
