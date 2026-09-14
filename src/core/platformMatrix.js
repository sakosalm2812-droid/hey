export const RELEASE_STATUS = Object.freeze({
  verifiedSource: "verified_source",
  nativeBuildRequired: "native_build_required",
  nativeProjectRequired: "native_project_required",
});

export const RELEASE_SURFACES = Object.freeze([
  {
    id: "web",
    name: "Web",
    family: "Browser",
    status: RELEASE_STATUS.verifiedSource,
    statusLabel: "Source verified",
    detail: "Responsive HEY interface for current evergreen browsers.",
    releaseGate: "Deploy over HTTPS and verify authentication, providers, storage, voice permissions, and service-worker behavior against production.",
  },
  ...["windows", "macos", "linux"].map((id) => ({
    id,
    name: id === "macos" ? "macOS" : `${id[0].toUpperCase()}${id.slice(1)}`,
    family: "Desktop",
    status: RELEASE_STATUS.nativeBuildRequired,
    statusLabel: "Native build required",
    detail: "Tauri desktop target with permission-gated native capabilities.",
    releaseGate: "Build, sign, install, and exercise every declared native capability on target hardware before publishing.",
  })),
  ...["ios", "android"].map((id) => ({
    id,
    name: id === "ios" ? "iOS" : "Android",
    family: "Mobile",
    status: RELEASE_STATUS.nativeProjectRequired,
    statusLabel: "Native project required",
    detail: "Responsive web experience is supported; the native mobile package is not initialized in this checkout.",
    releaseGate: "Initialize the Tauri mobile project, implement mobile adapters, run device tests, sign the app, and pass store review.",
  })),
]);

export function getReleaseSurface(id) {
  return RELEASE_SURFACES.find((surface) => surface.id === id) || null;
}

export function isReleaseVerified(id) {
  return getReleaseSurface(id)?.status === RELEASE_STATUS.verifiedSource;
}

export default RELEASE_SURFACES;
