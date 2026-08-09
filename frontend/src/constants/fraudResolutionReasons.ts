export const FRAUD_RESOLUTION_REASONS: { value: string; label: string }[] = [
  { value: "approved", label: "Approved — legitimate, no action needed" },
  { value: "unapproved", label: "Unapproved — policy violation confirmed" },
  { value: "working_remote", label: "Approved off-site / remote work" },
  { value: "gps_error", label: "GPS or device inaccuracy" },
  { value: "corrected", label: "Data corrected to resolve discrepancy" },
  { value: "other", label: "Other (see notes)" },
];
