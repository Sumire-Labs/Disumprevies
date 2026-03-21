// Re-export from the canonical source of truth in detectors/base.ts.
// Keeping this file avoids breaking existing import paths.
export type {
  Detector,
  DetectionResult,
  DetectionAction,
  DetectionContext,
  MessageDetectionContext,
  // Legacy aliases
  DetectionResult as DetectorResult,
  DetectionAction as DetectorAction,
  DetectionContext as DetectorContext,
  MessageDetectionContext as MessageDetectorContext,
} from '../detectors/base.js';
