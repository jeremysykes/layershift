# depth-aware-parallax-video

Depth-aware parallax video effect using per-pixel UV displacement with Parallax Occlusion Mapping (POM). A precomputed depth map drives the displacement so near objects move more than far objects, creating a convincing 3D effect from a single 2D video.

## Controls

- **Mouse** — move the cursor to shift the parallax viewpoint
- **Space** — play / pause the video
- **Mobile** — tap "Enable motion" to use gyroscope input

## Prerequisites

The `precompute` script needs **FFmpeg** (which includes `ffprobe` and `ffmpeg`) to read video metadata and extract frames.

- **macOS:** `brew install ffmpeg`
- **Windows:** [FFmpeg downloads](https://ffmpeg.org/download.html) or `winget install FFmpeg`
- **Linux:** `apt install ffmpeg` / `dnf install ffmpeg` (or your distro's package manager)

Ensure `ffprobe` and `ffmpeg` are on your PATH.

## Setup

```bash
npm install
```

## Precompute depth data

Extracts frames from the source video and runs depth estimation (Depth Anything v1 Small) to produce a packed binary depth map.

```bash
npm run precompute
```

This generates `public/depth-data.bin` and `public/depth-meta.json`.

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```
