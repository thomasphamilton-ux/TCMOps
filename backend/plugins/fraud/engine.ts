export interface FraudFlag {
  type: string;
  severity: number;
  details: string;
}

interface DailyTimeRecord {
  clockIn: Date | null;
  clockOut: Date | null;
}

const MAX_SHIFT_HOURS = 16;

export const fraudEngine = {
  checkInvalidRange(record: DailyTimeRecord): FraudFlag | null {
    if (record.clockIn && record.clockOut && record.clockOut <= record.clockIn) {
      return { type: "invalid_time_range", severity: 3, details: "Clock-out is not after clock-in" };
    }
    return null;
  },

  checkExcessiveShift(record: DailyTimeRecord): FraudFlag | null {
    if (!record.clockIn || !record.clockOut) return null;
    const hours = (record.clockOut.getTime() - record.clockIn.getTime()) / 3_600_000;
    if (hours > MAX_SHIFT_HOURS) {
      return {
        type: "excessive_shift_length",
        severity: 2,
        details: `Shift length ${hours.toFixed(1)}h exceeds ${MAX_SHIFT_HOURS}h`,
      };
    }
    return null;
  },

  checkExcessiveEdits(editCount: number): FraudFlag | null {
    if (editCount > 5) {
      return { type: "excessive_edits", severity: 1, details: `Edited ${editCount} times` };
    }
    return null;
  },

  evaluate(record: DailyTimeRecord): FraudFlag | null {
    return this.checkInvalidRange(record) ?? this.checkExcessiveShift(record);
  },
};
