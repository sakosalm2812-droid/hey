# Gesture recognition adapter contract

HEY does not ship a hand-tracking provider in this slice. Recognition stays unavailable until application bootstrap injects a supported adapter. Camera permission alone never enables detection.

## Adapter

```js
setGestureRecognitionAdapter({
  kind: "provider-name",
  async detect(frame, profile, { signal, maxFrameSize }) {
    // Return { id: "G01", confidence: 0.95 } or null.
  },
  stop(reason) {}, // optional cleanup hook
});
```

`frame` is a local `ImageData` image resized to 640 × 480. Capture is capped at 10 frames per second. The adapter receives an abort signal and must stop work when it is aborted. HEY accepts only known gesture IDs and confidence at or above the active profile threshold. Adapter installation is a trusted application integration point; an injected adapter must not upload frames unless a separately disclosed and authorized provider permits it.

## Frontend lifecycle

```js
await startGestureRecognition(profileId, { consent: true });
pauseGestureRecognition();
resumeGestureRecognition();
stopGestureRecognition(); // emergency stop / revoke camera session
subscribeToGestures((event, state) => { /* show active camera state */ });
```

`startGestureRecognition` requires an explicit consent flag, a browser camera API, and an installed adapter. It returns a structured `{ success, code, error }` result. State notifications include `camera`, `visible`, and `profileId`; use these to show the active camera indicator. Pause retains the camera stream and resumes the same session. Stop aborts pending provider work, stops camera tracks, detaches the video element, and invokes adapter cleanup. If a camera track ends, HEY stops the session. Where the browser exposes the Camera Permissions API, HEY also stops when that permission changes to denied and removes the listener when the session ends. Browsers without that API rely on `getUserMedia` and camera-track termination. A late camera response from a cancelled startup is discarded and cannot replace a newer session.

Gesture bindings are only published while their profile owns the active, consented recognition session. The current gesture event path publishes an application event; it does not provide OS mouse, media, presentation, or global input control. Action consumers must use the canonical authorization and device execution paths and verify their postcondition.
