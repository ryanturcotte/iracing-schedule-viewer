# iRacing Schedule Viewer and Spreadsheet Creator

Live App: https://ryanturcotte.github.io/iracing-schedule-viewer/

This is a successor to the Powershell app at https://github.com/ryanturcotte/iracing-calendar-spreadsheet

## How to use

1. Select a listed schedule or load your JSON or PDF of iRacing schedule information.
2. Mouse over the series name to see a condensed view of the track schedule. 3. Select the series you want to run.
4. Click Generate Table to see a schedule preview at bottom of page.
5. To generate the CSV file, click Generate CSV.
6. Download the Excel template to print your one-page calendar.

## How to use Excel template

1. Download the Excel template. Before creating your CSV, check off "Minimize Text" if you want track names to fit correctly. Open the created CSV and template.
2. There should be two tabs/sheets, one is the one-page template for 8 series and other which can accept "all" the series.
3. From the CSV, copy from cell B1 to the bottom right of your exported list (row 16).
4. Click back into the Excel template and click cell B1.
5. Use the "Paste Special" feature and choose to copy "Values". The keyboard shortcut Ctrl+Shift+V may work. The formatting/cell borders should stay the same.
6. Update the first "Week Start" cell (J5) to the start of the current season.
7. Print! If your landscape 8.5x11 page does not fit 8 series of 12 weeks, you may need to adjust column/row sizes, reduce font size, or lower page margins.

The Excel template also includes conditional cell formatting for Wet weeks!

## Known issues

1. The logic for extracting the series from the PDF isn't perfect and is missing many series (example: Street Stock). The JSON file (only available after the new Season starts) will be more reliable.
2. The PDF version removes series over 12 weeks. The JSON version includes them but could be better formatted.

## Background and AI Usage

This app began as an experiment in AI/LLM code creation using Google Gemini Canvas by [@zerske] (https://www.github.com/zerske). With well-crafted prompts and the iRacing JSON used in the Powershell app, Google Gemini was able to recreate all of the functionality, create a flexible UI, and add other useful features like filters for License level and Race style hosted in Canvas utilizing Node.js, React, and Tailwind CSS.

Getting it out of Canvas and into GitHub was a little more difficult because Gemini's instructions neglected to mention it was using Tailwind v3. But after running the Tailwind v4 upgrade, the original Canvas design was recreated. Continued prompting of Google Gemini Code Assist has gotten the app to it's current state.

The majority of code was written by Google Gemini with the exception of the text minimization list and simple fixes that were easier to change by hand.

## How to run locally (needs testing)

1. Install Node.js
2. Run 'npm install'
3. Run 'npm run dev'

