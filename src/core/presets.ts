import type { Resolution } from "./optics";

export const RESOLUTIONS: Record<string, Resolution> = {
  "WUXGA 1920×1200": { width: 1920, height: 1200 },
  "Full HD 1920×1080": { width: 1920, height: 1080 },
  "4K UHD 3840×2160": { width: 3840, height: 2160 },
  "4K DCI 4096×2160": { width: 4096, height: 2160 },
  "WXGA 1280×800": { width: 1280, height: 800 },
};

export const DEFAULT_RESOLUTION = "WUXGA 1920×1200";

/** Cores fáceis de distinguir para identificar projetores. */
export const PROJECTOR_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899", "#84cc16"];
