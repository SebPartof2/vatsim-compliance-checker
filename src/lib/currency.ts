import specJson from "@/data/currency-requirements.json";

/**
 * Currency requirements — how much controlling time a member needs at a
 * facility to remain on its roster. Devs edit `currency-requirements.json`.
 */

export type CurrencyPeriod = "quarter" | "half";

export interface CurrencyRequirement {
  period: CurrencyPeriod;
  hours?: number; // applies to both roles unless home/visitor override
  home?: number; // required hours as a home controller
  visitor?: number; // required hours as a visiting controller
}

interface CurrencySpec {
  facilities: Record<string, CurrencyRequirement>;
}

const spec = specJson as unknown as CurrencySpec;

/**
 * Requirement for a facility code, or null if unknown. There is intentionally
 * no default — callers should surface "unknown" rather than assume a value.
 */
export function getCurrencyRequirement(
  code: string,
): CurrencyRequirement | null {
  return spec.facilities[code.toUpperCase()] ?? null;
}

/**
 * Required hours for a facility given the controller's role, or null if unknown
 * for that role. Uses the role-specific value if present, else `hours`.
 */
export function requiredHours(
  req: CurrencyRequirement,
  isHome: boolean,
): number | null {
  const roleValue = isHome ? req.home : req.visitor;
  const h = roleValue ?? req.hours;
  return typeof h === "number" ? h : null;
}

export interface PeriodWindow {
  start: number; // epoch ms, inclusive
  end: number; // epoch ms, exclusive
  label: string; // e.g. "Q3 2026" or "H2 2026"
}

/**
 * The current period window for a given basis, relative to `ref`.
 * quarter -> the calendar quarter containing `ref`.
 * half    -> the calendar half-year (H1 = Jan–Jun, H2 = Jul–Dec) containing `ref`.
 */
export function currentPeriodWindow(
  period: CurrencyPeriod,
  ref: Date,
): PeriodWindow {
  const year = ref.getFullYear();

  if (period === "half") {
    const secondHalf = ref.getMonth() >= 6;
    const startMonth = secondHalf ? 6 : 0;
    return {
      start: new Date(year, startMonth, 1).getTime(),
      end: new Date(year, startMonth + 6, 1).getTime(),
      label: `${secondHalf ? "H2" : "H1"} ${year}`,
    };
  }

  const q = Math.floor(ref.getMonth() / 3);
  return {
    start: new Date(year, q * 3, 1).getTime(),
    end: new Date(year, q * 3 + 3, 1).getTime(),
    label: `Q${q + 1} ${year}`,
  };
}
