# Glare Removal UI - Design & Implementation Plan

## Overview

Build a React + Fastify application to test and compare glare removal results from Gemini AI against human-edited versions.

## Requirements

1. **Phase 1 (View-Only)**: Display test images in a comparison grid
   - 4 columns per row: clear (no glasses), glare (with glasses), gemini-result, human-edited
   - Two sections: "With Reference" and "Without Reference"
   - For "without reference" sets, clear column shows placeholder

2. **Phase 2 (Batch Processing)**: Add Gemini CLI integration
   - "Process All" button runs Gemini on all test images
   - Results saved to `gemini_result.jpg` in each test set folder
   - Progress indicator during processing

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Backend**: Fastify + TypeScript
- **Gemini CLI**: Uses authenticated `gemini` command via mec@cloran.com

## Project Structure

```
lumatic_glare_removal/
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── TestResultsTab.tsx
│   │   │   └── ImageComparisonRow.tsx
│   │   ├── types.ts
│   │   └── api.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── server.ts
│   │   ├── routes/
│   │   │   ├── images.ts
│   │   │   └── process.ts
│   │   └── services/
│   │       └── gemini.ts
│   ├── tsconfig.json
│   └── package.json
├── test_set/
│   ├── with_reference/
│   └── without_reference/
└── package.json
```

## API Endpoints

### GET /api/images
Returns list of all test sets with their images.

Response:
```json
{
  "withReference": [
    {
      "id": "001_AcatecoMendoza_Natalia_71140_3964",
      "name": "AcatecoMendoza, Natalia",
      "images": {
        "clear": "/images/with_reference/001_.../clear.jpg",
        "glare": "/images/with_reference/001_.../glare.jpg",
        "humanEdited": "/images/with_reference/001_.../human_edited.jpg",
        "geminiResult": null
      }
    }
  ],
  "withoutReference": [...]
}
```

### POST /api/process
Triggers batch Gemini processing for all test sets.

Request:
```json
{
  "sets": ["001_AcatecoMendoza_Natalia_71140_3964", ...]
}
```

Response (streamed progress):
```json
{"status": "processing", "current": "001_...", "progress": 1, "total": 20}
{"status": "complete", "processed": 20, "failed": 0}
```

## Gemini Prompts

### With Reference (has clear photo)
```
Attached are two photos one with glasses and one without. I want you to take the one with glasses as a base image and it is VERY IMPORTANT to change nothing about that image except for the glass lenses - make sure to not change the shape of the glass frames, or any other pixels anywhere on the image, etc. The second image is without glasses and is meant to provide source material for what the subjects eyes look like beneath the glasses with glare - use that information to make the eyes look reasonable after you remove the glare (and don't remove the glass altogether!) from the glasses in the base image.
```

### Without Reference (glare only)
```
This image has a glare on the glasses. The goal is to generate an image just like this but remove the glare on the glasses. CRITICAL & VERY IMPORTANT to change nothing about that image except for the glass lenses - make sure to not change the shape of the glass frames or remove any part of them, or to change any other pixels anywhere on the image, etc.
```

## UI Components

### TestResultsTab
- Header with "Process All" button (Phase 2)
- Section: "With Reference Photos" - expandable
- Section: "Without Reference Photos" - expandable
- Each section contains ImageComparisonRow components

### ImageComparisonRow
- Person name/ID header
- 4 image slots: Clear, Glare, Gemini Result, Human Edited
- Each slot shows image or placeholder if missing
- Click to enlarge (modal)

## Implementation Steps

### Phase 1: View-Only UI

1. **Backend Setup**
   - Initialize Fastify project with TypeScript
   - Create GET /api/images endpoint
   - Serve static images from test_set directory
   - Configure CORS for frontend dev server

2. **Frontend Setup**
   - Initialize Vite + React + TypeScript project
   - Create basic App with single "Test Results" tab
   - Fetch and display image data from API

3. **Image Display**
   - Build ImageComparisonRow component
   - Build TestResultsTab with sections
   - Style grid layout (4 columns)
   - Add click-to-enlarge functionality

### Phase 2: Batch Processing

4. **Gemini Service**
   - Create gemini.ts service wrapper
   - Implement prompt templates for both modes
   - Handle CLI execution and output parsing

5. **Process Endpoint**
   - Create POST /api/process endpoint
   - Stream progress updates via SSE
   - Save results to gemini_result.jpg

6. **UI Integration**
   - Add "Process All" button
   - Show progress indicator
   - Refresh images after processing

## Port Configuration

Using project port registry:
- Frontend: $(bash tools/port.sh app)
- Backend API: $(bash tools/port.sh api)
