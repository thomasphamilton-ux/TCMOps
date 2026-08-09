export interface FaceMatchResult {
  match: boolean;
  confidence: number;
}

/**
 * Integration point for a real facial-recognition provider (AWS Rekognition,
 * Azure Face, face-api.js, etc). Swap the body of compareFaces() for a real
 * provider call — the rest of the app only depends on this function's shape,
 * so nothing else needs to change when a real provider is wired in.
 */
export const facialEngine = {
  async compareFaces(imageBase64: string, storedTemplate: string): Promise<FaceMatchResult> {
    void imageBase64;
    void storedTemplate;
    return { match: true, confidence: 0.92 };
  },
};
