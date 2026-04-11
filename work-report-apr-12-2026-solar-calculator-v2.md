DATE  : Apr 12, 2026
REPO NAME : solar calculator v2

- Updated the EEI optimizer rows and chart to separate EEI adjustment and include export in total saving
- Added panel quantity control to each EEI future simulation popup
- Improved the EEI future simulation popup with live saving results and tighter chart scaling
- Added morning offset to the EEI future simulation popup and fixed package price lookup to use the nearest matching package
- Added total saving formula notes above the EEI report and inside each panel row
- Removed the top-level panel quantity slider from the EEI system pick section
- Expanded the EEI savings chart height and relaxed the y-axis bounds for better readability
- Updated the EEI optimizer export logic to cap export by post-offset usage and treat excess as donated energy
- Clarified the EEI report note to explain that positive red EEI adjustment reduces total saving
- Compared the EEI optimizer and original domestic calculator outputs for 300 kWh at 10 panels and identified the formula mismatch
- Compared the EEI optimizer and original domestic calculator outputs for RM300 at 10 panels and confirmed they still diverge
- Compared the EEI optimizer and original domestic calculator outputs for RM300 at 11 panels and confirmed they still diverge
- Aligned the EEI optimizer EEI benefit math with the original calculator and allowed signed EEI impact in the chart and popup

=====================
