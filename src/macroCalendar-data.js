// High-impact US macro events — VERIFIED dates only (never extrapolate a schedule).
// Sources checked 2026-07-27: federalreserve.gov FOMC calendar · bls.gov CPI schedule.
// Add new entries only with a confirmed date + source.
export const MACRO_EVENTS = [
  { d: "2026-07-29", label: "FOMC rate decision", detail: "2:00pm ET statement · 2:30pm press conference · no dot plot at this meeting" },
  { d: "2026-08-12", label: "CPI (July)", detail: "8:30am ET — inflation print" },
  { d: "2026-09-16", label: "FOMC rate decision", detail: "2:00pm ET · includes dot plot (SEP)" },
  { d: "2026-10-28", label: "FOMC rate decision", detail: "2:00pm ET · no dot plot" },
  { d: "2026-12-09", label: "FOMC rate decision", detail: "2:00pm ET · includes dot plot (SEP)" },
];
