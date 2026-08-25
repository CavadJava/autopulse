package parts

import (
	"fmt"
	_ "image/gif"  // register GIF decoder for excelize's picture handling
	_ "image/jpeg" // register JPEG decoder for excelize's picture handling
	_ "image/png"  // register PNG decoder for excelize's picture handling
	"io"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

type ParsedRow struct {
	Model       string
	RowNo       *int
	OEM         *string
	Description *string
	YearRange   *string
	PriceRaw    *string
	Prices      ParsedPrices
	ImageBytes  []byte
	ImageExt    string
}

// SheetNameToModel maps a trimmed sheet name (as found in the source
// workbook) to the model key used throughout the API and DB. Sheet names
// in the source file can have trailing spaces (e.g. "MODEL Y "); always
// trim before lookup.
var SheetNameToModel = map[string]string{
	"MODEL 3":     "model3",
	"MODEL Y":     "modely",
	"MODEL S":     "models",
	"MODEL X":     "modelx",
	"CYBER TRUCK": "cybertruck",
}

// ParseWorkbook reads an .xlsx file (Tesla parts catalog format: one sheet
// per model, header rows 1-2, data starting row 3, columns A=NO, B=IMAGE,
// C=OEM, D=DESC, E=YEAR, F=PRICE) and returns one ParsedRow per data row
// across all recognized sheets. Sheets whose trimmed name isn't in
// SheetNameToModel are skipped. Rows with no OEM, description, and price
// text are skipped (treated as blank trailing rows).
func ParseWorkbook(r io.Reader) ([]ParsedRow, error) {
	f, err := excelize.OpenReader(r)
	if err != nil {
		return nil, fmt.Errorf("parts: opening workbook: %w", err)
	}
	defer f.Close()

	var allRows []ParsedRow

	for _, sheetName := range f.GetSheetList() {
		model, ok := SheetNameToModel[strings.TrimSpace(sheetName)]
		if !ok {
			continue
		}

		rows, err := f.GetRows(sheetName)
		if err != nil {
			return nil, fmt.Errorf("parts: reading sheet %q: %w", sheetName, err)
		}

		// GetPictureCells walks the sheet's drawing relationships once and
		// returns every anchored picture cell ref directly (e.g. "B3",
		// "B7", ...) — linear in the number of pictures, unlike calling
		// GetPictures per row (which re-walks the drawing relationships on
		// every call and was the dominant cost of a large upload).
		pictureCellRefs, err := f.GetPictureCells(sheetName)
		if err != nil {
			return nil, fmt.Errorf("parts: getting picture cells for sheet %q: %w", sheetName, err)
		}

		pictureCells := map[string][]byte{} // cell ref, e.g. "B3" -> image bytes
		pictureExts := map[string]string{}
		maxPictureRow := 0
		for _, ref := range pictureCellRefs {
			pics, err := f.GetPictures(sheetName, ref)
			if err != nil || len(pics) == 0 {
				continue
			}
			pictureCells[ref] = pics[0].File
			pictureExts[ref] = "." + strings.TrimPrefix(pics[0].Extension, ".")

			if _, rowNum, err := excelize.CellNameToCoordinates(ref); err == nil && rowNum > maxPictureRow {
				maxPictureRow = rowNum
			}
		}

		// Picture cell refs are independent of GetRows's row list, so a row
		// that contains only an image (no other cell values) can have a
		// higher row number than GetRows ever reports. We iterate the row
		// space up to max(len(rows), maxPictureRow) rather than just
		// len(rows), so those image-only trailing rows still produce a
		// ParsedRow (with nil for all non-image fields) instead of being
		// silently dropped.
		rowCount := len(rows)
		if maxPictureRow > rowCount {
			rowCount = maxPictureRow
		}

		for i := 0; i < rowCount; i++ {
			rowNum := i + 1
			if rowNum < 3 {
				continue // rows 1-2 are title/header
			}

			var row []string
			if i < len(rows) {
				row = rows[i]
			}
			get := func(colIdx int) string {
				if colIdx < len(row) {
					return strings.TrimSpace(row[colIdx])
				}
				return ""
			}

			noStr := get(0)
			oem := get(2)
			desc := get(3)
			year := get(4)
			price := get(5)

			cellRef := fmt.Sprintf("B%d", rowNum)
			imgBytes, hasImage := pictureCells[cellRef]

			if noStr == "" && oem == "" && desc == "" && year == "" && price == "" && !hasImage {
				continue
			}

			var rowNo *int
			if n, err := strconv.Atoi(noStr); err == nil {
				rowNo = &n
			}

			pr := ParsedRow{
				Model:       model,
				RowNo:       rowNo,
				OEM:         strPtrOrNil(oem),
				Description: strPtrOrNil(desc),
				YearRange:   strPtrOrNil(year),
				PriceRaw:    strPtrOrNil(price),
				Prices:      ParsePriceText(price),
			}

			if hasImage {
				pr.ImageBytes = imgBytes
				pr.ImageExt = pictureExts[cellRef]
			}

			allRows = append(allRows, pr)
		}
	}

	// Belt-and-suspenders check: Model always comes from the hardcoded
	// SheetNameToModel map above, so this should never trip in practice —
	// but it's a cheap real safety net if that mapping logic changes later.
	for _, pr := range allRows {
		if !ValidModels[pr.Model] {
			return nil, fmt.Errorf("parts: unrecognized model %q produced during parsing", pr.Model)
		}
	}

	return allRows, nil
}

func strPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
