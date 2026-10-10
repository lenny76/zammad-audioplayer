# Zammad Audio Player

Chrome / Edge extension for playing WAV and MP3 ticket attachments inside Zammad, with optional Whisper-compatible transcription. Configure your own Zammad URL: no installation is hardcoded and no Zammad server changes are required.

Community project, not affiliated with Zammad. Interface languages: English and Italian. The browser language is used automatically (English fallback); choose Automatic, Italiano or English in settings. Reload Zammad tabs after changing the interface language. Transcription language is a separate setting and does not change when you switch the interface.

## Install

1. Clone this repository or download and extract its ZIP.
2. Open chrome://extensions or edge://extensions and enable Developer mode.
3. Select **Load unpacked** and choose the folder containing manifest.json.
4. Click the extension icon to open settings.
5. Enter your Zammad base URL, for example https://helpdesk.example.org, under **Zammad base URL / Indirizzo base Zammad**. Click **Save Zammad domain / Salva dominio Zammad** and approve access to that site.
6. Reload your Zammad tab. Open a ticket with a WAV/MP3 attachment. Audio loads automatically; press **Play / Riproduci** to listen.

When upgrading from a development build with a fixed Zammad domain, configure the Zammad URL once. Your existing Whisper settings remain saved. To update an unpacked installation, replace the files, reload the extension and reload Zammad. Keep the extension folder in a permanent location.

## Playback

- Play/pause, seek bar, ±10-second jumps, volume, and 1×/1.5×/2× speed.
- PCM WAV recordings play from memory: seeking does not rely on server Range support. Faster PCM playback also raises pitch.
- MP3 and other WAV encodings use the browser player and a direct-link fallback; playback/seek support depends on codec, server and page policy.
- Dynamically loaded attachments are detected. Original download links remain available.
- Recognized audio attachments load automatically when detected, including dynamically inserted ticket content. Playback starts only when you press Play. Failed loads expose **Riprova caricamento**. Only one recording plays at a time per tab.

## Optional transcription

Open **Settings / Impostazioni**, enter the full API endpoint, model, language and optional Bearer API key, then save and authorize that server.

Example OpenAI configuration:

| Setting | Value |
| --- | --- |
| Endpoint | https://api.openai.com/v1/audio/transcriptions |
| Model | whisper-1 |
| Language | it, or blank for automatic detection |
| API key | Your key, entered locally in settings |

A self-hosted service must accept an OpenAI-compatible multipart POST with file, model, optional language and response_format=json, returning a JSON object containing text. For example, http://192.168.1.50:8000/v1/audio/transcriptions. Set the model expected by your server.

**Transcribe / Trascrivi** sends only the selected recording to the configured service. The text appears in the card and can be copied; the extension does not write it into the ticket.

Application limits: 25 MiB per recording and 25 seconds per network operation. A timeout does not guarantee that the server cancelled processing; check before retrying. Closing a ticket does not cancel an already submitted transcription.

## Permissions and privacy

The extension requests site access only for the exact Zammad and transcription hosts you configure. The manifest declares HTTP/HTTPS as optional host permissions so users can choose their own servers; it does not request access to all websites. Dynamic content scripts run only on the configured Zammad site. One Zammad installation can be configured at a time; reload old tabs after changing it. Previously granted host permissions may remain listed in browser extension settings.

HTTPS is supported for any host. HTTP is allowed only for localhost, 127.0.0.1, ::1 and 192.168.x.x. HTTP sends audio and any API key without encryption. Subpath Zammad deployments are not currently supported: enter the origin only.

API keys are stored in the local browser profile, without sync, with access restricted to trusted extension contexts. This is not an encrypted credential vault. An organization can use a proxy to keep provider keys on its own server. API requests omit cookies and reject redirects; attachment requests use the existing Zammad session.

No analytics, telemetry or transcript persistence. Audio and transcript data remain in the page while open, apart from explicitly requested transmission to the configured service. See [PRIVACY.md](PRIVACY.md). Never commit API keys, recordings or ticket screenshots.

## Compatibility and tests

Chrome / Edge Manifest V3 (Chromium 102+). Attachment detection requires a recognizable WAV/MP3 filename or audio MIME attribute on a link using /api/v1/ticket_attachment/{ticket}/{article}/{attachment}. UI changes in Zammad may require adjustments. PCM playback and transcription have been confirmed by a user on one installation; configurable domains are covered by simulated tests and still need real-browser verification.

Run with Node.js 18+; no dependencies required:

~~~sh
node tests/pcm-player.test.mjs
node tests/domain-settings.test.mjs
node tests/i18n.test.mjs
~~~

Before reporting a bug, include extension/browser/Zammad versions, codec if available, and the error message. Remove customer data, tokens and private hostnames.

## Documentation

- [Chrome dynamic content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [OpenAI transcription API](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)

Publishing a source repository does not publish the extension to browser stores. Repository users install it with Developer mode; store distribution requires a separate submission.

## Build a release ZIP

Run `node tools/package.mjs` with Node.js 18+. The ZIP is written to dist/ and contains only extension runtime files and public documentation, including both language catalogs. The builder verifies file contents and CRCs before writing the archive.
