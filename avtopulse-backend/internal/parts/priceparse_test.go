package parts

import "testing"

func TestParsePriceText(t *testing.T) {
	cases := []struct {
		name  string
		input string
		want  ParsedPrices
	}{
		{
			name:  "simple made in china",
			input: "Made in China＝$1.4",
			want:  ParsedPrices{MadeInChina: floatPtr(1.4)},
		},
		{
			name:  "made in china plus original new",
			input: "Made in China＝$23.5                original new= $35",
			want:  ParsedPrices{MadeInChina: floatPtr(23.5), OriginalNew: floatPtr(35)},
		},
		{
			name:  "all three tiers, newline separated, mixed case",
			input: "Made in China = $60\nOriginal new = $115\nOriginal Used = $85",
			want:  ParsedPrices{MadeInChina: floatPtr(60), OriginalNew: floatPtr(115), OriginalUsed: floatPtr(85)},
		},
		{
			name:  "no stock, no numeric match",
			input: "No stock now",
			want:  ParsedPrices{},
		},
		{
			name:  "empty string",
			input: "",
			want:  ParsedPrices{},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := ParsePriceText(c.input)
			if !floatPtrEq(got.MadeInChina, c.want.MadeInChina) {
				t.Errorf("MadeInChina: got %v, want %v", derefF(got.MadeInChina), derefF(c.want.MadeInChina))
			}
			if !floatPtrEq(got.OriginalNew, c.want.OriginalNew) {
				t.Errorf("OriginalNew: got %v, want %v", derefF(got.OriginalNew), derefF(c.want.OriginalNew))
			}
			if !floatPtrEq(got.OriginalUsed, c.want.OriginalUsed) {
				t.Errorf("OriginalUsed: got %v, want %v", derefF(got.OriginalUsed), derefF(c.want.OriginalUsed))
			}
		})
	}
}

func floatPtr(f float64) *float64 { return &f }

func floatPtrEq(a, b *float64) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func derefF(f *float64) any {
	if f == nil {
		return nil
	}
	return *f
}
