export interface PerDiemInput {
  miles: number;
  hours: number;
  stayedOvernight: boolean;
}

export interface PerDiemResult {
  eligible: boolean;
  reason: string;
  amount: number; // cents
}

const PER_DIEM_AMOUNT_CENTS = 4500;
const MIN_MILES = 50;
const MIN_HOURS = 8;

export const perDiemEngine = {
  distanceRule(miles: number) {
    return miles > MIN_MILES;
  },

  hoursRule(hours: number) {
    return hours >= MIN_HOURS;
  },

  overnightRule(stayedOvernight: boolean) {
    return stayedOvernight === true;
  },

  evaluate({ miles, hours, stayedOvernight }: PerDiemInput): PerDiemResult {
    const eligible = this.distanceRule(miles) || this.overnightRule(stayedOvernight) || this.hoursRule(hours);
    return {
      eligible,
      reason: eligible ? "Rule matched (distance, hours, or overnight stay)" : "No per diem rules matched",
      amount: eligible ? PER_DIEM_AMOUNT_CENTS : 0,
    };
  },
};
