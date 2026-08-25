package parts

import (
	"bytes"
	_ "image/png" // register PNG decoder for excelize's AddPictureFromBytes validation
	"testing"

	"github.com/xuri/excelize/v2"
)

// buildFixtureWorkbook creates a minimal in-memory .xlsx with one sheet
// ("MODEL 3"), a header row, and two data rows — one with an embedded
// image, one without — mirroring the real source file's layout
// (data starts at row 3; columns A=NO, B=IMAGE, C=OEM, D=DESC, E=YEAR, F=PRICE).
func buildFixtureWorkbook(t *testing.T) []byte {
	t.Helper()
	f := excelize.NewFile()
	sheet := "MODEL 3"
	f.SetSheetName(f.GetSheetName(0), sheet)

	f.SetCellValue(sheet, "A1", "Tesla Model 3 parts")
	f.SetCellValue(sheet, "A2", "NO.")
	f.SetCellValue(sheet, "B2", "IMAGE")
	f.SetCellValue(sheet, "C2", "OEM")
	f.SetCellValue(sheet, "D2", "DESC.")
	f.SetCellValue(sheet, "E2", "YEAR")
	f.SetCellValue(sheet, "F2", "PRICE USD/PCS")

	f.SetCellValue(sheet, "A3", 1)
	f.SetCellValue(sheet, "C3", "1494949-00-A")
	f.SetCellValue(sheet, "D3", "The front logo of the Tesla MD3")
	f.SetCellValue(sheet, "E3", "2019-2021")
	f.SetCellValue(sheet, "F3", "Made in China＝$1.4")
	// 1x1 white opaque PNG bytes, minimal valid image (verified to decode
	// via Go's image/png package, which excelize uses to validate pictures)
	pngBytes := []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
		0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0x0F, 0x04, 0x00,
		0x09, 0xFB, 0x03, 0xFD, 0xFB, 0x5E, 0x6B, 0x2B, 0x00, 0x00, 0x00, 0x00,
		0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
	}
	if err := f.AddPictureFromBytes(sheet, "B3", &excelize.Picture{
		Extension: ".png",
		File:      pngBytes,
		Format:    &excelize.GraphicOptions{},
	}); err != nil {
		t.Fatalf("AddPictureFromBytes failed: %v", err)
	}

	f.SetCellValue(sheet, "A4", 2)
	f.SetCellValue(sheet, "C4", "/")
	f.SetCellValue(sheet, "D4", "Tesla MD3 rear logo, no image")
	f.SetCellValue(sheet, "E4", "2019-2021")
	f.SetCellValue(sheet, "F4", "No stock now")

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("workbook write failed: %v", err)
	}
	return buf.Bytes()
}

func TestParseWorkbook(t *testing.T) {
	data := buildFixtureWorkbook(t)

	rows, err := ParseWorkbook(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("ParseWorkbook failed: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}

	r1 := rows[0]
	if r1.Model != "model3" {
		t.Errorf("row 1: expected model=model3, got %q", r1.Model)
	}
	if r1.OEM == nil || *r1.OEM != "1494949-00-A" {
		t.Errorf("row 1: unexpected OEM %v", r1.OEM)
	}
	if r1.Description == nil || *r1.Description != "The front logo of the Tesla MD3" {
		t.Errorf("row 1: unexpected description %v", r1.Description)
	}
	if r1.Prices.MadeInChina == nil || *r1.Prices.MadeInChina != 1.4 {
		t.Errorf("row 1: unexpected parsed price %v", r1.Prices.MadeInChina)
	}
	if len(r1.ImageBytes) == 0 {
		t.Errorf("row 1: expected image bytes to be extracted, got none")
	}
	if r1.ImageExt != ".png" {
		t.Errorf("row 1: expected .png extension, got %q", r1.ImageExt)
	}

	r2 := rows[1]
	if r2.OEM == nil || *r2.OEM != "/" {
		t.Errorf("row 2: expected oem '/', got %v", r2.OEM)
	}
	if len(r2.ImageBytes) != 0 {
		t.Errorf("row 2: expected no image bytes, got %d bytes", len(r2.ImageBytes))
	}
	if r2.Prices.MadeInChina != nil {
		t.Errorf("row 2: expected no parsed price for 'No stock now', got %v", *r2.Prices.MadeInChina)
	}
	if r2.PriceRaw == nil || *r2.PriceRaw != "No stock now" {
		t.Errorf("row 2: expected raw price preserved, got %v", r2.PriceRaw)
	}
}

func TestSheetNameToModel_TrimsWhitespace(t *testing.T) {
	if SheetNameToModel["MODEL Y"] != "modely" {
		t.Errorf("expected trimmed 'MODEL Y' to map to modely, got %q", SheetNameToModel["MODEL Y"])
	}
}
