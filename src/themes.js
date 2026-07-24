// ─────────────────────────────────────────────────────────────
// DeepVue Theme Tracker — dated snapshots (Valen updates these in AI-OS).
// A position's in/off-theme is judged against the snapshot nearest its ENTRY date.
// in-theme (green)  = sector is TOP-5 in the 1-week OR 1-month tracker
// off-theme (red)   = not in either top-5
// Source of truth = Valen's DeepVue charts. Add a new dated block each update.
// ─────────────────────────────────────────────────────────────

export const THEME_SNAPSHOTS = {
  // 2026-06-26 = the 06-28 snapshot BACKDATED 2 trading days by VALEN'S MANUAL JUDGMENT
  // (2026-07-07): his 6/26 entries (CRWD/FTNT cyber, MRNA biotech) predate the first logged
  // snapshot but the leaders were the same — Cyber 1W #1, Biotech top-5. Auditable here + in
  // trading/context/deepvue-themes.md.
  "2026-06-26": {
    month: [["Genomics",26.5],["Airlines",19.3],["Biotechnology",16.84],["HealthCare",12.04],["Home Construction",11.29],["Banks",10.55],["Aerospace",10.36],["Medical",6.9],["Industrials",5.67],["Retail",5.63],["Transports",5.3],["Utilities",4.69],["Cybersecurity",4.66],["Real Estate",2.69],["Materials",0.74],["Growth Stocks",-2.75],["Social Media",-4.4],["Bitcoin",-5.76],["Software",-6.62],["Robotics",-7.15],["Semiconductors",-7.15],["Quantum",-7.6],["Gold Miners",-7.73],["China Internet",-8.19],["Silver Miners",-8.33],["Telecom",-9.27],["AI",-10.57],["Steel",-12.53],["Oil & Gas",-16.61],["Solar",-19.87],["Bitcoin Miners",-24.78]],
    week:  [["Cybersecurity",11.4],["Genomics",11.22],["Software",8.59],["Biotechnology",7.81],["HealthCare",6.82],["Social Media",6.62],["Silver Miners",6.13],["Gold Miners",5.15],["Aerospace",5.08],["Medical",4.55],["Transports",3.15],["Bitcoin",2.95],["China Internet",2.84],["Airlines",2.22],["Robotics",2.21],["Industrials",2.05],["Banks",1.67],["Materials",1.66],["Utilities",0.48],["Telecom",0.39],["Real Estate",0.38],["Retail",-0.18],["Home Construction",-0.41],["Steel",-1.99],["AI",-2.43],["Growth Stocks",-2.82],["Quantum",-3.05],["Oil & Gas",-3.14],["Solar",-3.16],["Semiconductors",-4.3],["Bitcoin Miners",-20.33]],
    day:   [],
  },
  "2026-06-28": {
    month: [["Genomics",26.5],["Airlines",19.3],["Biotechnology",16.84],["HealthCare",12.04],["Home Construction",11.29],["Banks",10.55],["Aerospace",10.36],["Medical",6.9],["Industrials",5.67],["Retail",5.63],["Transports",5.3],["Utilities",4.69],["Cybersecurity",4.66],["Real Estate",2.69],["Materials",0.74],["Growth Stocks",-2.75],["Social Media",-4.4],["Bitcoin",-5.76],["Software",-6.62],["Robotics",-7.15],["Semiconductors",-7.15],["Quantum",-7.6],["Gold Miners",-7.73],["China Internet",-8.19],["Silver Miners",-8.33],["Telecom",-9.27],["AI",-10.57],["Steel",-12.53],["Oil & Gas",-16.61],["Solar",-19.87],["Bitcoin Miners",-24.78]],
    week:  [["Cybersecurity",11.4],["Genomics",11.22],["Software",8.59],["Biotechnology",7.81],["HealthCare",6.82],["Social Media",6.62],["Silver Miners",6.13],["Gold Miners",5.15],["Aerospace",5.08],["Medical",4.55],["Transports",3.15],["Bitcoin",2.95],["China Internet",2.84],["Airlines",2.22],["Robotics",2.21],["Industrials",2.05],["Banks",1.67],["Materials",1.66],["Utilities",0.48],["Telecom",0.39],["Real Estate",0.38],["Retail",-0.18],["Home Construction",-0.41],["Steel",-1.99],["AI",-2.43],["Growth Stocks",-2.82],["Quantum",-3.05],["Oil & Gas",-3.14],["Solar",-3.16],["Semiconductors",-4.3],["Bitcoin Miners",-20.33]],
    day:   [],
  },
  "2026-07-04": {
    month: [["Genomics",26.21],["Biotechnology",19.13],["Airlines",16.49],["HealthCare",12.98],["Home Construction",10.35],["Aerospace",8.70],["Banks",8.03],["Medical",7.66],["Industrials",5.58],["Retail",5.21],["Transports",4.77],["Utilities",4.24],["Real Estate",2.74],["Cybersecurity",1.52],["Materials",0.95],["Growth Stocks",-2.89],["Semiconductors",-6.31],["Social Media",-6.74],["Robotics",-8.00],["Quantum",-8.15],["Bitcoin",-8.36],["Software",-10.66],["Gold Miners",-10.93],["China Internet",-11.79],["AI",-11.82],["Telecom",-12.68],["Silver Miners",-12.88],["Steel",-13.54],["Oil & Gas",-16.46],["Solar",-22.07],["Bitcoin Miners",-25.62]],
    week:  [["Genomics",19.16],["Cybersecurity",11.47],["Biotechnology",9.89],["HealthCare",7.58],["Software",7.16],["Airlines",6.48],["Social Media",5.85],["Home Construction",5.72],["Medical",5.62],["Aerospace",5.20],["Transports",4.82],["Industrials",3.23],["Banks",2.66],["Retail",2.66],["Materials",2.24],["Silver Miners",2.13],["Robotics",2.05],["China Internet",2.04],["Utilities",1.53],["Gold Miners",0.99],["Real Estate",0.09],["Telecom",-0.96],["Bitcoin",-1.25],["AI",-2.37],["Growth Stocks",-3.42],["Steel",-3.53],["Solar",-3.83],["Semiconductors",-4.78],["Quantum",-5.10],["Oil & Gas",-6.48],["Bitcoin Miners",-25.06]],
    day:   [["Gold Miners",4.48],["Silver Miners",3.90],["Medical",3.80],["Biotechnology",2.93],["Bitcoin",2.56],["HealthCare",2.52],["Utilities",2.21],["Materials",1.94],["Aerospace",1.78],["Steel",1.37],["Real Estate",1.13],["Home Construction",0.74],["Genomics",0.68],["Transports",0.53],["Industrials",0.30],["Software",0.25],["Retail",0.25],["Airlines",-0.09],["Cybersecurity",-0.12],["Oil & Gas",-0.13],["Social Media",-0.21],["China Internet",-0.52],["Banks",-1.10],["Robotics",-1.76],["Solar",-2.56],["AI",-2.80],["Quantum",-3.34],["Telecom",-3.73],["Growth Stocks",-4.17],["Semiconductors",-4.54],["Bitcoin Miners",-9.49]],
  },
  "2026-07-07": {
    month: [["Genomics",28.45],["Airlines",19.80],["Biotechnology",16.60],["Aerospace",11.51],["Banks",11.49],["HealthCare",11.09],["Home Construction",9.57],["Cybersecurity",7.89],["Medical",7.38],["Industrials",6.61],["Retail",5.10],["Transports",4.60],["Utilities",3.64],["Real Estate",1.79],["Materials",0.68],["Growth Stocks",-0.96],["Social Media",-2.25],["Bitcoin",-2.38],["Robotics",-5.02],["Semiconductors",-5.27],["Software",-5.40],["China Internet",-5.99],["Quantum",-6.45],["Gold Miners",-7.36],["AI",-7.69],["Telecom",-8.24],["Silver Miners",-8.90],["Steel",-10.81],["Oil & Gas",-16.55],["Solar",-18.14],["Bitcoin Miners",-20.13]],
    week:  [["Cybersecurity",14.84],["Genomics",12.93],["Software",10.00],["Social Media",9.01],["Biotechnology",7.59],["Bitcoin",6.64],["Aerospace",6.18],["HealthCare",5.91],["Gold Miners",5.56],["Silver Miners",5.47],["China Internet",5.31],["Medical",5.02],["Robotics",4.57],["Industrials",2.97],["Airlines",2.65],["Banks",2.53],["Transports",2.46],["Materials",1.60],["Telecom",1.53],["AI",0.71],["Steel",-0.05],["Real Estate",-0.49],["Utilities",-0.53],["Retail",-0.68],["Growth Stocks",-1.03],["Solar",-1.07],["Quantum",-1.85],["Home Construction",-1.95],["Semiconductors",-2.36],["Oil & Gas",-3.08],["Bitcoin Miners",-15.40]],
    // day = the "Since Open" view (momentum ex overnight gaps) of the 07-06 US session — real intraday demand rank
    day:   [["Bitcoin",3.91],["Cybersecurity",3.26],["Software",2.63],["Bitcoin Miners",2.28],["Genomics",1.97],["Solar",1.84],["Robotics",1.22],["Steel",1.10],["AI",1.01],["Banks",0.95],["Aerospace",0.69],["Social Media",0.61],["Industrials",0.47],["Growth Stocks",0.31],["Telecom",0.31],["Quantum",0.25],["Medical",0.13],["Airlines",0.12],["Materials",0.12],["China Internet",0.08],["Biotechnology",-0.20],["Oil & Gas",-0.27],["Semiconductors",-0.45],["HealthCare",-0.51],["Retail",-0.67],["Transports",-0.68],["Utilities",-0.90],["Gold Miners",-0.98],["Real Estate",-0.98],["Home Construction",-1.55],["Silver Miners",-1.82]],
  },
  "2026-07-08": {
    month: [["Genomics",17.45],["Airlines",16.11],["Biotechnology",15.63],["HealthCare",9.50],["Cybersecurity",8.48],["Banks",7.52],["Home Construction",6.95],["Aerospace",5.85],["Medical",4.77],["Retail",4.36],["Utilities",4.01],["Industrials",3.53],["Transports",3.29],["Real Estate",1.10],["Bitcoin",0.36],["Materials",-0.21],["Social Media",-4.40],["Growth Stocks",-5.23],["Software",-5.93],["China Internet",-5.97],["Semiconductors",-7.34],["Robotics",-8.71],["AI",-8.80],["Quantum",-9.04],["Telecom",-11.06],["Steel",-11.93],["Gold Miners",-12.31],["Silver Miners",-13.54],["Oil & Gas",-16.55],["Solar",-22.19],["Bitcoin Miners",-24.12]],
    week:  [["Cybersecurity",13.97],["Software",11.05],["Social Media",10.38],["China Internet",7.96],["Biotechnology",7.93],["Bitcoin",7.85],["Genomics",6.21],["HealthCare",5.89],["Medical",4.19],["Aerospace",3.26],["Banks",0.78],["Real Estate",0.67],["Transports",0.61],["Gold Miners",0.12],["Robotics",-0.05],["Utilities",-0.33],["Retail",-0.45],["Materials",-0.64],["Silver Miners",-0.73],["Telecom",-0.85],["Industrials",-0.95],["Airlines",-1.43],["Steel",-2.59],["AI",-3.27],["Oil & Gas",-3.74],["Home Construction",-4.20],["Solar",-5.29],["Quantum",-5.49],["Growth Stocks",-5.65],["Semiconductors",-8.70],["Bitcoin Miners",-18.94]],
    // day = the "Since Open" view (momentum ex overnight gaps) of the 07-07 US session — leaders rested/sold intraday (trims day)
    day:   [["Oil & Gas",1.31],["Bitcoin",1.23],["Real Estate",0.82],["Semiconductors",0.25],["Biotechnology",0.22],["Social Media",0.20],["Utilities",0.15],["China Internet",0.04],["HealthCare",0.00],["Steel",-0.34],["Transports",-0.75],["AI",-0.80],["Materials",-0.87],["Retail",-0.91],["Banks",-0.94],["Medical",-1.06],["Industrials",-1.17],["Cybersecurity",-1.38],["Quantum",-1.47],["Home Construction",-1.48],["Telecom",-1.51],["Software",-1.78],["Robotics",-1.88],["Growth Stocks",-1.98],["Genomics",-2.11],["Solar",-2.21],["Aerospace",-2.29],["Airlines",-2.31],["Gold Miners",-3.31],["Silver Miners",-3.38],["Bitcoin Miners",-4.26]],
  },
  "2026-07-09": {
    month: [["Genomics",25.32],["Biotechnology",16.56],["Airlines",13.76],["Cybersecurity",11.87],["HealthCare",7.84],["Banks",4.80],["Aerospace",4.44],["Semiconductors",4.09],["Retail",4.08],["Industrials",3.58],["Home Construction",3.24],["Bitcoin",3.19],["Medical",2.36],["Transports",2.34],["Utilities",2.28],["Growth Stocks",2.22],["Social Media",0.76],["China Internet",0.11],["AI",0.08],["Quantum",-0.20],["Materials",-0.93],["Real Estate",-1.23],["Software",-3.52],["Telecom",-4.70],["Robotics",-5.24],["Silver Miners",-6.63],["Gold Miners",-6.74],["Steel",-8.76],["Oil & Gas",-8.89],["Bitcoin Miners",-10.49],["Solar",-15.47]],
    week:  [["Cybersecurity",10.34],["China Internet",10.32],["Social Media",8.32],["Software",4.85],["Biotechnology",4.79],["Bitcoin",4.08],["HealthCare",1.65],["Aerospace",1.20],["Genomics",1.06],["Oil & Gas",0.61],["Medical",0.45],["Robotics",-0.06],["Telecom",-0.35],["Industrials",-0.43],["Transports",-0.68],["AI",-0.92],["Banks",-1.78],["Utilities",-1.82],["Steel",-1.83],["Quantum",-2.24],["Real Estate",-2.41],["Materials",-2.79],["Semiconductors",-3.04],["Retail",-3.07],["Growth Stocks",-3.57],["Airlines",-4.48],["Gold Miners",-4.51],["Solar",-4.77],["Silver Miners",-5.61],["Home Construction",-8.57],["Bitcoin Miners",-16.13]],
    // day = the "Since Open" view (momentum ex overnight gaps). Risk-off rotation intraday — Bitcoin Miners/Semis/AI led since-open while the 1W leaders (Cyber/China Internet/Social) rested.
    day:   [["Bitcoin Miners",5.80],["Semiconductors",3.07],["AI",2.07],["Telecom",2.06],["Oil & Gas",1.85],["Quantum",1.65],["Growth Stocks",1.21],["Genomics",0.79],["Steel",0.75],["Solar",0.71],["Bitcoin",0.69],["Robotics",0.45],["Social Media",0.25],["Cybersecurity",0.22],["Transports",-0.13],["Airlines",-0.19],["Industrials",-0.19],["Biotechnology",-0.30],["China Internet",-0.34],["Software",-0.44],["HealthCare",-0.66],["Retail",-0.68],["Gold Miners",-0.76],["Utilities",-0.83],["Silver Miners",-1.08],["Medical",-1.37],["Aerospace",-1.50],["Real Estate",-1.56],["Banks",-1.64],["Materials",-1.65],["Home Construction",-2.93]],
  },
  // Weekend upload 2026-07-12 (data = Fri 2026-07-10 US close) — governs the coming week's entries.
  "2026-07-12": {
    month: [["Genomics",23.12],["Cybersecurity",14.61],["Biotechnology",13.40],["Airlines",12.36],["Banks",5.62],["HealthCare",5.59],["Retail",3.83],["Aerospace",3.74],["Industrials",3.60],["Semiconductors",3.39],["Utilities",3.25],["Bitcoin",3.10],["Transports",2.55],["Growth Stocks",1.80],["Home Construction",1.55],["Medical",0.79],["China Internet",0.69],["AI",0.44],["Materials",0.24],["Social Media",0.13],["Telecom",-0.18],["Quantum",-0.19],["Software",-0.58],["Real Estate",-1.85],["Silver Miners",-1.89],["Robotics",-2.65],["Gold Miners",-2.65],["Steel",-6.85],["Oil & Gas",-9.63],["Solar",-11.15],["Bitcoin Miners",-12.09]],
    week:  [["Bitcoin",8.83],["China Internet",7.81],["Social Media",5.81],["Medical",3.91],["Cybersecurity",3.86],["Oil & Gas",2.21],["Software",2.00],["Transports",1.58],["HealthCare",1.49],["Biotechnology",0.98],["Real Estate",0.95],["Banks",0.78],["Steel",0.72],["Retail",0.39],["Utilities",0.15],["Materials",0.12],["Gold Miners",0.11],["Aerospace",-1.39],["Silver Miners",-1.43],["Genomics",-1.76],["Industrials",-1.79],["Robotics",-2.71],["Telecom",-3.06],["AI",-3.31],["Airlines",-3.40],["Home Construction",-6.43],["Quantum",-6.60],["Semiconductors",-6.84],["Solar",-7.08],["Growth Stocks",-7.65],["Bitcoin Miners",-12.00]],
    // day = Friday's "Since Open" (momentum ex gaps). Oversold-beta bounce inside a down week —
    // Semis/Materials/Oil&Gas led since-open while the 1W leaders (Bitcoin/China Internet/Social/Cyber) rested.
    day:   [["Semiconductors",1.69],["Materials",1.19],["Oil & Gas",0.98],["Retail",0.95],["Silver Miners",0.86],["Utilities",0.64],["Steel",0.62],["Gold Miners",0.59],["Industrials",0.43],["Home Construction",0.38],["Banks",0.20],["Solar",0.15],["Robotics",0.08],["Telecom",-0.06],["Real Estate",-0.07],["Aerospace",-0.18],["AI",-0.19],["Medical",-0.19],["Transports",-0.22],["Bitcoin",-0.26],["China Internet",-0.60],["Quantum",-0.62],["Social Media",-0.69],["Airlines",-1.16],["HealthCare",-1.22],["Growth Stocks",-2.00],["Biotechnology",-2.50],["Software",-2.70],["Cybersecurity",-2.83],["Genomics",-3.73],["Bitcoin Miners",-3.76]],
  },
  // Daily refresh 2026-07-15 (data = Mon 2026-07-14 US close). Drop had Since Open + 1W only —
  // month = CARRIED from 2026-07-12 (no fresh 1M panel; the weekly ranks own 1M tagging).
  "2026-07-15": {
    month: [["Genomics",23.12],["Cybersecurity",14.61],["Biotechnology",13.40],["Airlines",12.36],["Banks",5.62],["HealthCare",5.59],["Retail",3.83],["Aerospace",3.74],["Industrials",3.60],["Semiconductors",3.39],["Utilities",3.25],["Bitcoin",3.10],["Transports",2.55],["Growth Stocks",1.80],["Home Construction",1.55],["Medical",0.79],["China Internet",0.69],["AI",0.44],["Materials",0.24],["Social Media",0.13],["Telecom",-0.18],["Quantum",-0.19],["Software",-0.58],["Real Estate",-1.85],["Silver Miners",-1.89],["Robotics",-2.65],["Gold Miners",-2.65],["Steel",-6.85],["Oil & Gas",-9.63],["Solar",-11.15],["Bitcoin Miners",-12.09]],
    week:  [["Oil & Gas",7.18],["Cybersecurity",6.84],["Bitcoin",4.90],["China Internet",4.76],["Steel",3.12],["Social Media",2.44],["Semiconductors",1.35],["Telecom",0.55],["Banks",0.23],["AI",0.18],["Software",0.06],["Utilities",-0.15],["Retail",-0.32],["Transports",-0.42],["Real Estate",-0.45],["Bitcoin Miners",-1.80],["Industrials",-1.88],["Solar",-2.11],["Growth Stocks",-2.29],["Materials",-2.63],["HealthCare",-3.18],["Quantum",-3.33],["Biotechnology",-3.59],["Robotics",-4.04],["Genomics",-4.33],["Gold Miners",-4.53],["Medical",-5.13],["Aerospace",-5.21],["Home Construction",-5.61],["Silver Miners",-5.82],["Airlines",-7.08]],
    // day = Monday's "Since Open" (momentum ex gaps). HW→SW rotation printing intraday:
    // Cyber/Software led real demand while Semis faded from open pre-TSMC and healthcare kept bleeding.
    day:   [["Cybersecurity",5.59],["Software",3.61],["Bitcoin",1.08],["Solar",0.97],["Social Media",0.63],["AI",0.17],["Steel",0.02],["Growth Stocks",0.00],["Banks",-0.03],["Retail",-0.09],["Genomics",-0.17],["Aerospace",-0.21],["Robotics",-0.33],["Biotechnology",-0.46],["Utilities",-0.52],["Real Estate",-0.60],["Industrials",-0.67],["Telecom",-0.74],["China Internet",-0.76],["Quantum",-0.81],["Transports",-0.86],["Home Construction",-0.88],["Oil & Gas",-0.88],["HealthCare",-0.98],["Materials",-1.00],["Airlines",-1.34],["Semiconductors",-1.41],["Gold Miners",-1.60],["Silver Miners",-1.60],["Medical",-2.12],["Bitcoin Miners",-4.09]],
  },
  // Daily refresh 2026-07-16 (data = Wed 2026-07-15 US close) — FRESH 1M panel this drop.
  "2026-07-16": {
    month: [["Genomics",23.16],["Cybersecurity",15.81],["Biotechnology",11.27],["Airlines",5.82],["HealthCare",4.38],["Banks",3.96],["Software",3.57],["Social Media",2.27],["Industrials",2.20],["Bitcoin",2.14],["China Internet",1.93],["Retail",1.56],["Utilities",1.55],["Transports",1.20],["Aerospace",1.12],["Home Construction",1.02],["Medical",0.38],["Real Estate",-1.76],["Robotics",-2.94],["Materials",-3.22],["Growth Stocks",-4.28],["AI",-4.50],["Semiconductors",-4.71],["Gold Miners",-7.53],["Telecom",-7.81],["Steel",-8.12],["Silver Miners",-8.17],["Quantum",-8.30],["Oil & Gas",-10.77],["Solar",-11.47],["Bitcoin Miners",-19.66]],
    week:  [["Oil & Gas",6.17],["China Internet",5.51],["Bitcoin",1.91],["Steel",1.72],["Retail",1.69],["Social Media",1.58],["Cybersecurity",0.88],["Real Estate",0.61],["Banks",0.56],["Transports",0.17],["Utilities",-0.18],["Software",-0.90],["HealthCare",-2.22],["Semiconductors",-2.24],["Telecom",-2.63],["Biotechnology",-2.77],["Materials",-2.85],["Industrials",-2.96],["Solar",-3.02],["Home Construction",-3.33],["AI",-4.26],["Medical",-4.32],["Growth Stocks",-4.44],["Genomics",-5.39],["Aerospace",-5.73],["Quantum",-5.75],["Robotics",-5.80],["Silver Miners",-5.88],["Gold Miners",-6.02],["Bitcoin Miners",-6.16],["Airlines",-6.27]],
    // day = Wednesday's "Since Open" (momentum ex gaps). TSMC-eve tech de-risk: Cyber/Semis/AI led the
    // DOWNSIDE intraday while Medical/Retail/Airlines/Banks absorbed the money.
    day:   [["Medical",1.44],["Retail",1.24],["Airlines",1.23],["Banks",0.97],["Biotechnology",0.88],["Home Construction",0.80],["China Internet",0.71],["HealthCare",0.64],["Social Media",0.13],["Aerospace",0.06],["Transports",-0.09],["Genomics",-0.10],["Real Estate",-0.11],["Solar",-0.13],["Bitcoin Miners",-0.13],["Steel",-0.26],["Materials",-0.32],["Industrials",-0.40],["Bitcoin",-0.42],["Gold Miners",-0.59],["Silver Miners",-0.61],["Robotics",-0.66],["Software",-0.76],["Growth Stocks",-0.95],["Utilities",-1.12],["Oil & Gas",-1.39],["AI",-1.97],["Quantum",-2.13],["Telecom",-2.27],["Semiconductors",-2.65],["Cybersecurity",-3.25]],
  },
  "2026-07-17": {
    // 1M NOT provided this drop — CARRIED from 2026-07-16 (tagging uses the latest monthly ranks).
    month: [["Genomics",23.16],["Cybersecurity",15.81],["Biotechnology",11.27],["Airlines",5.82],["HealthCare",4.38],["Banks",3.96],["Software",3.57],["Social Media",2.27],["Industrials",2.20],["Bitcoin",2.14],["China Internet",1.93],["Retail",1.56],["Utilities",1.55],["Transports",1.20],["Aerospace",1.12],["Home Construction",1.02],["Medical",0.38],["Real Estate",-1.76],["Robotics",-2.94],["Materials",-3.22],["Growth Stocks",-4.28],["AI",-4.50],["Semiconductors",-4.71],["Gold Miners",-7.53],["Telecom",-7.81],["Steel",-8.12],["Silver Miners",-8.17],["Quantum",-8.30],["Oil & Gas",-10.77],["Solar",-11.47],["Bitcoin Miners",-19.66]],
    // Fresh 1W: Banks + Transports IN the top-5 (Bitcoin/Steel out) — defensive/cyclical weekly leadership,
    // China Internet the lone risk theme and strengthening.
    week:  [["China Internet",7.72],["Retail",3.80],["Banks",3.69],["Transports",3.26],["Oil & Gas",2.95],["Steel",1.87],["Social Media",1.31],["Real Estate",1.27],["Bitcoin",0.66],["Cybersecurity",0.35],["Home Construction",0.32],["Medical",-0.10],["Software",-0.46],["Utilities",-0.50],["Solar",-1.15],["Materials",-1.20],["Industrials",-1.22],["HealthCare",-1.98],["Semiconductors",-2.15],["Telecom",-2.86],["Robotics",-2.90],["Airlines",-3.88],["Growth Stocks",-4.17],["Biotechnology",-4.40],["AI",-4.46],["Quantum",-5.65],["Gold Miners",-5.76],["Aerospace",-5.80],["Genomics",-5.89],["Silver Miners",-6.04],["Bitcoin Miners",-8.61]],
    // day = Thursday's "Since Open" (momentum ex gaps). Second straight defensive session POST-TSMC:
    // Medical/Home-Construction/Banks green while AI/Semis/Cyber/Quantum stayed red intraday.
    day:   [["Medical",2.90],["Home Construction",2.66],["Banks",2.40],["Transports",2.26],["Real Estate",1.68],["Retail",1.59],["Materials",1.15],["Airlines",1.00],["Industrials",0.76],["HealthCare",0.72],["Utilities",0.51],["Bitcoin",0.05],["Biotechnology",-0.02],["Steel",-0.17],["China Internet",-0.25],["Robotics",-0.45],["Software",-0.50],["Oil & Gas",-1.04],["Cybersecurity",-1.16],["Semiconductors",-1.19],["Telecom",-1.26],["AI",-1.40],["Aerospace",-1.61],["Quantum",-1.85],["Solar",-1.85],["Gold Miners",-2.03],["Silver Miners",-2.03],["Social Media",-2.08],["Growth Stocks",-2.19],["Genomics",-3.28],["Bitcoin Miners",-5.91]],
  },
  "2026-07-24": {
    // His MYT view date — data = US Thu 07-23 session. GATE CHANGE on 1W again: metals/crypto sweep
    // OUT (only Bitcoin Miners survive at #1, +11.56 vs 1M −17.91 = violent V-turn), defensives/quality
    // in (HealthCare/Aerospace/Utilities/Real Estate). NH/NL flipped negative (70H/73L); down-4% day
    // count 489 vs 154 up + sheet down4=319 ≥300 = documented selling extreme. Selective tape.
    month: [["Cybersecurity",8.20],["Genomics",7.80],["China Internet",7.27],["Biotechnology",6.11],["HealthCare",5.80],["Transports",5.06],["Social Media",3.95],["Bitcoin",3.79],["Banks",2.89],["Utilities",2.49],["Industrials",2.13],["Aerospace",0.97],["Retail",0.70],["Real Estate",0.69],["Medical",0.65],["Steel",0.05],["Software",-0.25],["Oil & Gas",-0.41],["Materials",-1.14],["Home Construction",-2.87],["Gold Miners",-3.40],["Telecom",-3.86],["Silver Miners",-4.14],["Airlines",-5.97],["AI",-6.35],["Robotics",-6.36],["Semiconductors",-6.73],["Solar",-9.75],["Growth Stocks",-10.45],["Quantum",-12.16],["Bitcoin Miners",-17.91]],
    week:  [["Bitcoin Miners",11.56],["HealthCare",1.58],["Aerospace",1.26],["Utilities",1.09],["Real Estate",1.06],["Industrials",0.83],["Transports",0.65],["Steel",0.57],["Medical",0.45],["China Internet",0.34],["Gold Miners",0.19],["Bitcoin",0.19],["Biotechnology",0.16],["Banks",-0.01],["Silver Miners",-0.33],["Oil & Gas",-0.64],["Materials",-0.69],["Retail",-1.59],["Home Construction",-2.67],["Semiconductors",-3.35],["Telecom",-3.45],["Social Media",-4.13],["Solar",-4.14],["AI",-4.24],["Quantum",-4.25],["Robotics",-4.38],["Airlines",-4.96],["Growth Stocks",-5.11],["Genomics",-5.43],["Software",-6.97],["Cybersecurity",-9.15]],
    // day = Thursday's "Since Open" (momentum ex gaps): miners + defense/industrial quality green,
    // Software/Oil&Gas/Cyber worst; semis mildly green intraday but 1W −3.35 = bounce, not repair.
    day:   [["Bitcoin Miners",3.72],["Aerospace",2.48],["Industrials",1.59],["Biotechnology",1.48],["Utilities",1.18],["HealthCare",1.03],["Genomics",0.99],["Gold Miners",0.78],["Silver Miners",0.76],["Semiconductors",0.51],["Quantum",0.50],["Home Construction",0.45],["Airlines",0.45],["Banks",0.28],["Real Estate",0.27],["Medical",0.16],["Growth Stocks",-0.11],["Materials",-0.26],["Steel",-0.35],["Transports",-0.36],["Bitcoin",-0.39],["Telecom",-0.59],["AI",-0.60],["Solar",-0.64],["Robotics",-0.69],["Social Media",-0.77],["China Internet",-0.91],["Retail",-1.13],["Cybersecurity",-1.99],["Oil & Gas",-2.80],["Software",-2.82]],
  },
  "2026-07-23": {
    // His MYT view date — data = US Wed 07-22 session (Since Open = Wed intraday). GATE CHANGE on 1W:
    // crypto+metals sweep (Bitcoin Miners/Bitcoin/Gold/Silver/Steel); China Internet/Real Estate/Banks
    // rotate out. Semis led Since Open (+2.72) but sit 1M rank-last — bounce inside a broken month.
    month: [["Cybersecurity",11.88],["Genomics",6.73],["HealthCare",5.93],["Biotechnology",5.65],["China Internet",5.55],["Banks",5.11],["Transports",3.96],["Retail",3.78],["Utilities",2.71],["Bitcoin",2.30],["Real Estate",2.25],["Medical",2.21],["Social Media",2.08],["Software",1.96],["Oil & Gas",-0.11],["Materials",-1.55],["Industrials",-1.62],["Aerospace",-1.87],["Home Construction",-1.95],["Airlines",-2.84],["Steel",-2.97],["Telecom",-3.67],["Gold Miners",-5.84],["Silver Miners",-6.83],["Robotics",-8.97],["AI",-10.36],["Solar",-12.09],["Semiconductors",-12.26],["Growth Stocks",-13.49],["Quantum",-14.10],["Bitcoin Miners",-20.59]],
    week:  [["Bitcoin Miners",9.36],["Bitcoin",6.02],["Gold Miners",4.51],["Silver Miners",4.23],["Steel",2.38],["Oil & Gas",1.46],["Retail",1.45],["Solar",1.13],["China Internet",0.80],["Banks",0.74],["Real Estate",0.69],["Materials",0.47],["Utilities",0.46],["Semiconductors",0.22],["Transports",-0.10],["Industrials",-0.84],["Home Construction",-0.89],["HealthCare",-1.25],["Biotechnology",-1.35],["Telecom",-1.45],["Aerospace",-1.68],["AI",-1.89],["Robotics",-2.73],["Quantum",-2.81],["Growth Stocks",-2.89],["Cybersecurity",-2.96],["Social Media",-2.96],["Airlines",-3.59],["Medical",-3.76],["Software",-3.97],["Genomics",-4.29]],
    // day = Wednesday's "Since Open" (momentum ex gaps): defensive/commodity board, semis + bitcoin
    // miners the only growth-side green; Software worst (−3.05) into the GOOGL/NOW/TXN/INTC prints.
    day:   [["Bitcoin Miners",3.64],["Semiconductors",2.72],["Utilities",1.46],["Gold Miners",1.00],["Materials",0.97],["Steel",0.81],["Silver Miners",0.56],["Quantum",0.51],["Bitcoin",0.51],["Oil & Gas",0.40],["Industrials",0.36],["AI",0.02],["Robotics",-0.03],["Solar",-0.04],["Aerospace",-0.05],["Retail",-0.08],["Home Construction",-0.20],["Transports",-0.27],["Airlines",-0.30],["Banks",-0.30],["Telecom",-0.46],["Real Estate",-0.64],["Biotechnology",-0.72],["Growth Stocks",-0.81],["China Internet",-0.90],["HealthCare",-0.96],["Genomics",-1.04],["Social Media",-1.39],["Medical",-1.61],["Cybersecurity",-1.83],["Software",-3.05]],
  },
  "2026-07-22": {
    // Morning drop (his MYT view date) — data = US Tue 07-21 close. Bitcoin seizes #1 1W (+3.86,
    // 1M +5.64 from flat); monthly leaders (Cyber/Biotech/HC/Genomics) all week-negative = pausing.
    month: [["Cybersecurity",12.32],["Biotechnology",8.97],["HealthCare",7.64],["Genomics",7.39],["China Internet",7.13],["Banks",5.87],["Bitcoin",5.64],["Transports",5.45],["Software",3.12],["Real Estate",3.04],["Retail",2.41],["Social Media",2.34],["Medical",1.80],["Utilities",0.36],["Oil & Gas",-0.47],["Industrials",-1.23],["Airlines",-1.60],["Telecom",-2.49],["Materials",-3.30],["Aerospace",-3.86],["Home Construction",-4.37],["Steel",-4.43],["AI",-8.74],["Robotics",-9.10],["Silver Miners",-9.66],["Gold Miners",-10.11],["Growth Stocks",-10.22],["Solar",-11.43],["Semiconductors",-11.47],["Quantum",-13.49],["Bitcoin Miners",-22.16]],
    week:  [["Bitcoin",3.86],["China Internet",2.50],["Real Estate",1.68],["Steel",1.58],["Banks",1.19],["Bitcoin Miners",1.12],["Oil & Gas",0.91],["Transports",0.45],["Retail",0.44],["Social Media",-0.47],["HealthCare",-0.54],["Software",-0.58],["Silver Miners",-0.93],["Cybersecurity",-1.06],["Utilities",-1.08],["Biotechnology",-1.48],["Materials",-1.55],["Industrials",-1.78],["Gold Miners",-1.80],["Solar",-2.37],["Telecom",-2.47],["Medical",-2.70],["Home Construction",-2.92],["Aerospace",-3.89],["AI",-3.91],["Growth Stocks",-4.10],["Genomics",-4.20],["Semiconductors",-4.39],["Airlines",-4.94],["Robotics",-5.50],["Quantum",-5.93]],
  },
  "2026-07-21": {
    // Valen's MYT view date (his label convention) — data = US Mon 07-20 session, 2nd intraday read
    // ~11:55 ET (supersedes the 10:30 ET read; 1W + 1M only,
    // no Since Open panel; day omitted on purpose — widget falls back correctly). Growth selling deepened
    // intraday (Genomics 1W −9.71→−10.98); China Internet = the only theme accelerating on BOTH horizons.
    month: [["Cybersecurity",15.41],["Genomics",9.25],["China Internet",8.12],["Biotechnology",7.55],["Banks",6.32],["HealthCare",6.21],["Transports",5.93],["Retail",5.19],["Medical",4.50],["Software",4.28],["Social Media",3.14],["Real Estate",2.87],["Bitcoin",1.46],["Airlines",1.09],["Utilities",1.08],["Home Construction",-0.40],["Industrials",-0.82],["Materials",-3.83],["Oil & Gas",-5.52],["Aerospace",-5.57],["Telecom",-5.63],["Steel",-8.02],["AI",-8.07],["Growth Stocks",-8.49],["Robotics",-8.89],["Solar",-9.85],["Semiconductors",-10.44],["Quantum",-13.09],["Gold Miners",-16.15],["Silver Miners",-16.92],["Bitcoin Miners",-23.33]],
    week:  [["China Internet",3.63],["Bitcoin",3.02],["Retail",2.32],["Real Estate",2.26],["Steel",1.97],["Banks",1.71],["Oil & Gas",0.18],["Transports",0.09],["Social Media",-0.05],["Utilities",-0.42],["Materials",-0.46],["Software",-0.96],["Medical",-1.37],["Home Construction",-1.53],["Cybersecurity",-1.61],["Industrials",-1.65],["HealthCare",-2.30],["Solar",-4.11],["Aerospace",-4.32],["Telecom",-5.30],["Biotechnology",-5.48],["Airlines",-5.65],["Robotics",-6.50],["Gold Miners",-6.65],["Silver Miners",-7.02],["AI",-7.35],["Growth Stocks",-7.35],["Bitcoin Miners",-7.84],["Semiconductors",-8.05],["Quantum",-9.25],["Genomics",-10.98]],
  },
  "2026-07-19": {
    // Weekend upload, data = Fri 2026-07-17 US close (Jul 18-19 = weekend). Fresh 1M this drop (no more carry).
    month: [["Cybersecurity",15.78],["Genomics",14.31],["Biotechnology",10.69],["HealthCare",6.32],["Banks",5.67],["Transports",3.61],["China Internet",3.59],["Retail",2.69],["Software",1.57],["Medical",1.20],["Real Estate",0.71],["Utilities",0.24],["Industrials",-0.24],["Social Media",-0.37],["Airlines",-0.56],["Home Construction",-0.95],["Bitcoin",-2.21],["Aerospace",-3.67],["Materials",-4.15],["Oil & Gas",-6.70],["Telecom",-6.92],["Growth Stocks",-7.50],["AI",-9.19],["Robotics",-9.19],["Steel",-9.25],["Semiconductors",-9.65],["Solar",-11.03],["Quantum",-12.69],["Gold Miners",-18.25],["Silver Miners",-19.60],["Bitcoin Miners",-31.32]],
    // 1W top-5 turnover: Bitcoin + Steel IN, China Internet + Oil & Gas OUT vs 07-17. Value/financials own the week;
    // every high-beta growth theme deep red (Semis −6.15 · AI −6.19 · Quantum −7.07 · Btc Miners −13.71).
    week:  [["Banks",4.52],["Retail",3.98],["Bitcoin",3.18],["Transports",3.03],["Steel",2.97],["Real Estate",2.88],["Cybersecurity",2.01],["China Internet",1.51],["Home Construction",1.48],["Materials",0.74],["Software",0.35],["Oil & Gas",0.31],["Utilities",-0.42],["Solar",-0.44],["Industrials",-0.56],["HealthCare",-1.03],["Social Media",-1.13],["Medical",-1.46],["Gold Miners",-3.01],["Silver Miners",-3.08],["Biotechnology",-3.35],["Telecom",-3.42],["Aerospace",-3.71],["Growth Stocks",-4.05],["Airlines",-4.18],["Robotics",-4.42],["Genomics",-4.78],["Semiconductors",-6.15],["AI",-6.19],["Quantum",-7.07],["Bitcoin Miners",-13.71]],
    // day = Fri 07-17 "Since Open" (momentum ex gaps). Mirror-image of the week: the beaten-up growth complex
    // (Btc Miners/Cyber/Bitcoin/Quantum/AI/Semis) caught the intraday bid while the week's leaders were sold —
    // oversold bounce INSIDE the down-rotation, not a leadership change yet.
    day:   [["Bitcoin Miners",3.28],["Cybersecurity",2.44],["Bitcoin",2.16],["Quantum",2.12],["Telecom",1.97],["AI",1.82],["Growth Stocks",1.75],["Semiconductors",1.57],["Silver Miners",1.51],["Gold Miners",1.31],["Solar",1.28],["Genomics",1.22],["Software",1.16],["Biotechnology",1.12],["Steel",1.08],["China Internet",0.79],["Oil & Gas",0.73],["Industrials",0.65],["Social Media",0.64],["Robotics",0.57],["Aerospace",0.34],["HealthCare",0.02],["Transports",-0.41],["Materials",-0.53],["Real Estate",-0.57],["Retail",-0.62],["Banks",-0.82],["Airlines",-0.85],["Utilities",-1.59],["Medical",-2.00],["Home Construction",-2.44]],
  },
};

// Normalize ANY date shape to ISO (YYYY-MM-DD) — manual positions carry M/D/YY strings,
// which compare lexically ABOVE every ISO key and silently resolved to the LATEST snapshot.
const dnorm = (d) => {
  if (!d) return "";
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/); // M/D/YY or M/D/YYYY
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  const t = new Date(s);
  return isNaN(t) ? "" : t.toISOString().slice(0, 10);
};
// The first dated DeepVue snapshot — theme metrics only exist from here forward.
export const THEME_COVERAGE_START = Object.keys(THEME_SNAPSHOTS).sort()[0] || null;

// nearest snapshot on or before the given date.
// HONESTY RULES (Valen 2026-07-05):
//  · date BEFORE the first snapshot → null (a later theme never judges an older trade)
//  · date PROVIDED but unreadable/missing → null (never guess with the latest theme —
//    the trade might be from before coverage; it shows as Untagged instead)
//  · NO date argument at all (current-view widgets like the Theme Strip) → latest snapshot
// Backfilling older dated snapshots into THEME_SNAPSHOTS auto-extends coverage backwards.
export function snapshotFor(date) {
  const keys = Object.keys(THEME_SNAPSHOTS).sort();
  if (!keys.length) return null;
  if (date != null && date !== "") {
    const d = dnorm(date);
    if (!d || d < keys[0]) return null;
    let pick = keys[0];
    for (const k of keys) { if (k <= d) pick = k; else break; }
    return { date: pick, ...THEME_SNAPSHOTS[pick] };
  }
  const k = keys[keys.length - 1];
  return { date: k, ...THEME_SNAPSHOTS[k] };
}
export function latestSnapshot() { const keys = Object.keys(THEME_SNAPSHOTS).sort(); return keys.length ? { date: keys[keys.length - 1], ...THEME_SNAPSHOTS[keys[keys.length - 1]] } : null; }

export function top5(tf, date) { const s = snapshotFor(date); return s && s[tf] ? s[tf].slice(0, 5).map(x => x[0]) : []; }
// themes that are TOP-5 in BOTH 1W and 1M (the consistent leaders)
export function consistentTop(date) { const w = new Set(top5("week", date)); return top5("month", date).filter(t => w.has(t)); }

const rankIn = (list, sector) => { const i = (list || []).findIndex(([n]) => n === sector); return i < 0 ? null : i + 1; };
export function themeRanks(sector, date) {
  // TRADE context — a date is required. null/missing/unreadable entry = no judgement at all
  // (snapshotFor's latest-snapshot fallback is ONLY for current-view widgets that pass no date).
  if (!sector || date == null || date === "" || !dnorm(date)) return null;
  const s = snapshotFor(date); if (!s) return null;
  return { day: rankIn(s.day, sector), week: rankIn(s.week, sector), month: rankIn(s.month, sector), date: s.date };
}
// 'in' if top-5 in week OR month at that date; 'off' otherwise; null if sector unknown
export function themeFit(sector, entryDate) {
  if (!sector) return null;
  const r = themeRanks(sector, entryDate); if (!r) return null;
  return ((r.week && r.week <= 5) || (r.month && r.month <= 5)) ? "in" : "off";
}
