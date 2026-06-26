# Video Editor

A full-stack video subtitle editor that lets you upload video files, edit subtitles on a timeline, style captions, and export the final video with burned-in subtitles.

## What this app does

- Upload one or more video files.
- Edit subtitle content and timing.
- Customize subtitle styling.
- Preview the video while editing.
- Export the final rendered video.

## Tech Stack

- Frontend: React, React Router, Zustand, Tailwind CSS
- Backend: Go, Gin, CORS
- Video processing: FFmpeg / FFprobe

## Prerequisites

Before running the project, install these tools:

- Node.js 18+ and npm
- Go 1.21+
- FFmpeg and FFprobe

### FFmpeg requirement

The backend uses FFmpeg to render the final video. You need FFmpeg available in one of these ways:

- Installed globally and added to `PATH`
- Installed locally in `backend/ffmpeg/bin/ffmpeg.exe` and `backend/ffmpeg/bin/ffprobe.exe`

If FFmpeg is missing, export will fail.

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/binhbb2204/Video_Editor.git
cd Video_Editor
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Install backend dependencies

No extra package install is needed beyond Go modules. The backend dependencies are downloaded automatically the first time you run or build it.

If needed, you can pre-download them with:

```bash
cd ..\backend
go mod download
```

## Run the app

### Backend

```bash
cd backend
go run .
```

The backend runs on `http://localhost:8080`.

### Frontend

Open a second terminal:

```bash
cd frontend
npm start
```

The frontend runs on `http://localhost:3000`.

## API Endpoints

The backend exposes these endpoints under `/api`:

- `POST /api/export` - start a video export job
- `GET /api/export/status/:id` - check export progress
- `GET /api/export/download/:id` - download the rendered video

## Notes

- The backend automatically creates `uploads`, `exports`, and `temp` folders when it starts.
- CORS is configured for `http://localhost:3000` and `http://127.0.0.1:3000`.
- Large uploads are supported through the backend upload limit.

## Project Structure

```text
backend/   Go API and FFmpeg export service
frontend/  React editor UI
```