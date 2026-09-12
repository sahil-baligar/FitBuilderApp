# Running FitBuilder on your phone

Three ways, cheapest first. All of them need your phone and laptop on the **same Wi-Fi**.

## 1. Expo Go — fastest, no build, no Apple/Google account

Best for day-to-day development. Camera, photo library and local storage all work.

```bash
# terminal 1 — the API
npm run dev:api            # listens on 0.0.0.0:8788

# terminal 2 — the app
npm run dev:mobile         # Expo dev server, prints a QR code
```

Then:

1. Install **Expo Go** from the App Store or Play Store.
2. iPhone: open the Camera app and point it at the QR code in terminal 2. Android: open Expo Go and scan from inside the app.
3. The app loads over Wi-Fi and hot-reloads as files change.

You do **not** need to edit any config. The app derives the API host from the Expo dev server it loaded from, so it finds your laptop automatically even when your IP changes.

If the phone cannot connect, it is almost always Windows Firewall or a network that isolates clients:

- Allow Node through the firewall for **Private** networks, or run once in an admin PowerShell:
  ```powershell
  New-NetFirewallRule -DisplayName "FitBuilder dev" -Direction Inbound -Protocol TCP -LocalPort 8081,8085,8788 -Action Allow -Profile Private
  ```
- On a guest / corporate / hotel network that blocks device-to-device traffic, start Expo with a tunnel instead: `npx expo start --tunnel` (slower, but works anywhere). With a tunnel the API is not reachable, so also set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to a deployed API URL.
- Check the laptop's current address with `ipconfig`; this machine was last seen at **192.168.10.14**.

## 2. Mobile web — no install at all

The Expo web build is the same app. With the dev server running, open this on your phone's browser:

```
http://192.168.10.14:8085
```

Add it to your home screen for a full-screen, app-like shell. Note that web has no camera capture, only photo library, and stores images in IndexedDB rather than the filesystem.

## 3. A real installable build — TestFlight / Play Store

Needed only when you want the app installed without Expo Go, or want to ship. Uses Expo Application Services:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios      # needs a paid Apple Developer account ($99/yr)
eas build --platform android  # free; produces an .apk/.aab you can sideload
```

Android is the cheap path: `eas build --platform android --profile preview` gives you an APK you can install directly from a link. iOS requires the Apple Developer Program before a device build will install.

For these builds set a real API URL in `apps/mobile/.env`, since your laptop will not be reachable:

```
EXPO_PUBLIC_API_URL=https://your-api.up.railway.app
```

## What works without any API keys

The app runs fully offline-capable against local models and stubs:

| Feature | Without keys |
| --- | --- |
| Add garment, wardrobe, outfits, library | Fully working |
| Background removal / cutout | Real, local BiRefNet on CPU (~10 s per image) |
| Auto-tagging (colour, pattern, material, weather) | Real, local Ollama `qwen2.5vl:7b` (~75 s per image) |
| AI stylist | Real, local Ollama |
| Ghost mannequin, try-on, style frames | Stubbed — returns the input image, labelled `mock` |

Set `FAL_KEY` in `apps/api/.env` to turn on the real ghost-mannequin, try-on and style-frame renders. Set `OPENAI_API_KEY` to move tagging and the stylist off local models onto ChatGPT, which is far faster than CPU Ollama.
