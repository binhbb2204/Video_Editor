package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"video-editor-backend/handlers"
)

func main() {
	// Create required directories
	dirs := []string{"uploads", "exports", "temp"}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Fatalf("Failed to create directory %s: %v", dir, err)
		}
	}

	// Get absolute paths for logging
	absPath, _ := filepath.Abs(".")
	log.Printf("Server running from: %s", absPath)

	// Setup Gin router
	r := gin.Default()

	// CORS configuration
	config := cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://127.0.0.1:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders:    []string{"Content-Length", "Content-Disposition"},
		AllowCredentials: true,
	}
	r.Use(cors.New(config))

	// Increase max upload size (2GB for large videos)
	r.MaxMultipartMemory = 2 << 30

	// API routes
	api := r.Group("/api")
	{
		api.POST("/export", handlers.StartExport)
		api.GET("/export/status/:id", handlers.GetExportStatus)
		api.GET("/export/download/:id", handlers.DownloadExport)
	}

	// Start server
	log.Println("Starting server on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
