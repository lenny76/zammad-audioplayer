# Privacy

Zammad Audio Player has no telemetry or developer-operated backend.

## Locally stored settings

The configured Zammad origin and Whisper endpoint/model/language/API key are stored in chrome.storage.local, restricted to trusted extension contexts. They are not synchronized to other profiles. The API key can be removed using **Elimina chiave salvata**. Uninstalling the extension removes extension storage.

## Recordings and transcription

Recognized WAV/MP3 attachments are retrieved automatically when detected on the configured Zammad installation, using the existing session. Playback starts only after the user presses Play. Recordings are processed in memory; the extension does not initiate a file download to disk. Normal browser memory/cache mechanisms still apply.

Clicking **Trascrivi** retrieves the selected attachment and uploads it to the transcription endpoint configured by the user. A configured Bearer API key is sent only to that endpoint. The endpoint operator’s retention and processing policies apply. No transcript is written to the Zammad ticket or saved in extension storage. Copying text uses the local clipboard.

## Access

The browser requests permission for the configured hosts. Content scripts are registered only for the configured Zammad origin. Changing the origin updates future injection; reload previously open Zammad tabs. Previously granted permissions can be removed in the browser’s extension settings.

HTTP is permitted only for loopback addresses and 192.168.x.x. Traffic to HTTP endpoints is not encrypted.
