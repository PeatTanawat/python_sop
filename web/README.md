# Sara SOP Web

This is the browser version of the SOP screenshot tool. It is a static site and can be deployed as a Render Static Site using the root `render.yaml` file.

## Features

- Share a screen or app window and capture it after a short countdown.
- Upload one or more existing screenshots.
- Crop images, draw multiple red boxes, and undo edits.
- Add image names and descriptions, then copy the SOP to Word.
- Optionally choose a local output folder in Chrome or Edge.
- Keep the workspace in browser storage; screenshots are not uploaded to the web host.

## Browser notes

Screen sharing requires a browser permission prompt. For best results, share the target app window and keep this page open in another window or monitor while capturing. A website cannot listen for a global Space key while another app is active.

Folder writing uses the File System Access API, available in Chromium browsers on a secure origin. Other browsers can still use the app; their workspace is stored in the current browser and device.

## Deploy

Connect this repository to Render and create a Blueprint from `render.yaml`, or create a Static Site with `web` as the publish directory. The Render service name is `python_sop`.
