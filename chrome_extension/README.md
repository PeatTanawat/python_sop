# Sara SOP Chrome Side Panel

The extension opens Sara SOP in Chrome's right side panel. It can show a live preview of the active Chrome tab, capture screenshots, edit them, draw red boxes, and copy the steps into a document.

## Install

1. Download and unzip `Sara_SOP_Chrome_Extension.zip` into a folder on your computer.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the extracted folder that contains `manifest.json`.
5. Click the Sara SOP icon in Chrome's toolbar. The workspace opens on the right. If you already loaded an earlier version, click its **Reload** button first.

To capture a page, open it first and click the Sara SOP toolbar icon. This grants temporary access to that tab for the capture. If you switch to another tab and its preview is unavailable, click the Sara SOP toolbar icon on that tab to grant access. Opening Sara SOP from Chrome's side panel menu does not grant access to the tab. Chrome still blocks protected pages such as `chrome://` pages and the Chrome Web Store.

## Use

Open the tab to capture and click the Sara SOP toolbar icon. Review and accept the Privacy Policy, then press **Start** to open the workspace. Review the tab preview and click **Capture**. Each image appears in order with its own name field. Click an image to open the full-page editor, where you can browse and rename images, drag to reorder them, add images from your device, draw red boxes, and assign descriptions to image ranges. Image and description links reuse one editor tab. The workspace shows each description with its image range. In the workspace, choose a folder with **Save images** to save image files there. **Copy for Document** copies the images and inserts each description after its image range.

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for the policy text. A public version is available at `/privacy-policy.html` on the Sara SOP website.

© Tanawat

The extension captures Chrome tabs only. Chrome's protected pages (such as `chrome://` pages and the Chrome Web Store) cannot be captured. To update the extension, download the new zip, extract it, then use **Reload** on `chrome://extensions`.
