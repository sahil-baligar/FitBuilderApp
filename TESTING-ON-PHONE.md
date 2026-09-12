# Running FitBuilder on your phone

**You do not need an Expo account.** Expo Go asks you to sign in only on its own home screen, to list projects saved to an account. A local dev server is reached by URL and needs no login. Skip the sign-in and use the "Enter URL manually" option described below.

## Where to run commands

Every command below runs from the **repo root**, which is the `app` folder:

```powershell
cd C:\Users\sahil\Documents\Code\FitBuilder\app
```

`C:\Users\sahil\Documents\Code\FitBuilder` is just the parent folder. It has no `package.json`, so npm fails there with `ENOENT ... Could not read package.json`.

## Ports

| Service | Port |
| --- | --- |
| API | 8788 |
| Expo (dev server + web) | 8085 |

Expo's default port 8081 is permanently taken on this machine by the AbuseGuard project, so the npm scripts pin 8085. In non-interactive shells Expo will silently skip starting rather than prompt, which looks like nothing happened.

## 1. Expo Go — fastest, no build, no account

```powershell
cd C:\Users\sahil\Documents\Code\FitBuilder\app

# terminal 1 — the API
npm run dev:api

# terminal 2 — the app
npm run dev:mobile
```

Then on your phone, on the **same Wi-Fi**:

1. Install **Expo Go** from the App Store or Play Store. It must support SDK 57.
2. Open Expo Go. If it asks you to sign in, **dismiss it**.
3. Tap **Enter URL manually** and type:

   ```
   exp://192.168.10.14:8085
   ```

   Replace the address if your laptop's IP changed. Find it with `ipconfig`, under the Wi-Fi adapter's IPv4 address.

Alternatively, if terminal 2 is a normal interactive window it prints a QR code. iPhone: scan it with the Camera app. Android: scan from inside Expo Go. Both open the same URL.

You do not need to configure the API address. The app derives it from the Expo dev server it loaded from, so it finds your laptop automatically even when your IP changes.

### If the phone cannot connect

- Allow Node through Windows Firewall for **Private** networks, or run once in an admin PowerShell:
  ```powershell
  New-NetFirewallRule -DisplayName "FitBuilder dev" -Direction Inbound -Protocol TCP -LocalPort 8085,8788 -Action Allow -Profile Private
  ```
- Confirm the server is reachable by opening `http://192.168.10.14:8085` in your phone's browser. A page means the network is fine and the problem is Expo Go.
- On a guest, corporate or hotel network that isolates devices, use `npx expo start --tunnel` from `apps/mobile`. The tunnel carries the app but **not** the API, so also set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to a deployed API URL.

## 2. Mobile web — no install at all

With the dev server running, open this in your phone's browser:

```
http://192.168.10.14:8085
```

Add it to your home screen for a full-screen shell. Web has no camera capture, only photo library, and stores images in IndexedDB rather than the filesystem.

## 3. A real installable build — TestFlight / Play Store

Needed only to install without Expo Go, or to ship. **This is the one place an Expo account is genuinely required**, because builds run on Expo's servers.

```powershell
npm install -g eas-cli
eas login                     # create the account at expo.dev first
eas build:configure
eas build --platform android --profile preview   # free; produces an installable APK
eas build --platform ios                          # needs Apple Developer Program, $99/yr
```

Android is the cheap path. For these builds set a real API URL in `apps/mobile/.env`, since your laptop will not be reachable:

```
EXPO_PUBLIC_API_URL=https://your-api.up.railway.app
```

## What works without any API keys

| Feature | Without keys |
| --- | --- |
| Add garment, wardrobe, outfits, library | Fully working |
| Background removal / cutout | Real, local BiRefNet on CPU (~10 s per image) |
| Auto-tagging (colour, pattern, material, weather) | Real, local Ollama `qwen2.5vl:7b` (~75 s per image) |
| AI stylist | Real, local Ollama |
| Ghost mannequin, try-on, style frames | Stubbed — returns the input image, labelled `mock` |

Set `FAL_KEY` in `apps/api/.env` to turn on the real ghost-mannequin, try-on and style-frame renders. Set `OPENAI_API_KEY` to move tagging and the stylist off local models onto ChatGPT, which is far faster than CPU Ollama.

Local models are memory-hungry: the API grows to several GB while BiRefNet and Ollama are active. That is development-only — with `FAL_KEY` set, cutouts go to fal and the local model never loads.
