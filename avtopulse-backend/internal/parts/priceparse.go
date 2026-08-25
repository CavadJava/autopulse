package parts

import (
	"regexp"
	"strconv"
)

type ParsedPrices struct {
	MadeInChina  *float64
	OriginalNew  *float64
	OriginalUsed *float64
}

var (
	madeInChinaRe  = regexp.MustCompile(`(?i)made\s*in\s*china\s*[＝=]\s*\$?\s*([\d.]+)`)
	originalNewRe  = regexp.MustCompile(`(?i)original\s*new\s*[＝=]\s*\$?\s*([\d.]+)`)
	originalUsedRe = regexp.MustCompile(`(?i)original\s*used\s*[＝=]\s*\$?\s*([\d.]+)`)
)

// ParsePriceText extracts up to three price tiers from the free-text PRICE
// column of the source spreadsheet. Any tier not found in the text is left
// nil. Text that matches none of the patterns (e.g. "No stock now") returns
// a zero-value ParsedPrices — callers should keep the original raw string
// separately (see NewPart.PriceRaw) since this parser is best-effort.
func ParsePriceText(raw string) ParsedPrices {
	var result ParsedPrices

	if m := madeInChinaRe.FindStringSubmatch(raw); m != nil {
		if v, err := strconv.ParseFloat(m[1], 64); err == nil {
			result.MadeInChina = &v
		}
	}
	if m := originalNewRe.FindStringSubmatch(raw); m != nil {
		if v, err := strconv.ParseFloat(m[1], 64); err == nil {
			result.OriginalNew = &v
		}
	}
	if m := originalUsedRe.FindStringSubmatch(raw); m != nil {
		if v, err := strconv.ParseFloat(m[1], 64); err == nil {
			result.OriginalUsed = &v
		}
	}

	return result
}
