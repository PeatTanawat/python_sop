# Python SOP Chrome Side Panel

The extension opens Python SOP in Chrome's right side panel. It can capture the active Chrome tab, edit screenshots, draw red boxes, and copy the steps into Word.

## Install

1. Download and unzip `Python_SOP_Chrome_Extension.zip`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the unzipped `chrome_extension` folder.
5. Click the Python SOP icon in Chrome's toolbar. The workspace opens on the right. If you already loaded an earlier version, click its **Reload** button first.

Chrome will ask to let the extension read and capture pages on all websites. Allow this permission to use **Capture**; Chrome still blocks protected pages such as `chrome://` pages and the Chrome Web Store. The extension captures a page only when you click its capture controls.

## Use

Open the tab to capture and click the Python SOP toolbar icon. Press the round start button, review the tab preview, then click **Capture**. Each image appears in order with its own name field. **Add row** lets you add image files from your computer. Enter one overall description at the bottom, then choose a folder with **Save images**. **Copy for Word** copies each image followed by its name, then the overall description at the end.

The extension captures Chrome tabs only. Chrome's protected pages (such as `chrome://` pages and the Chrome Web Store) cannot be captured. To update the extension, download the new zip, extract it, then use **Reload** on `chrome://extensions`.
