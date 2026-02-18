export const plateSchemas: Record<string, RegExp> = {
  Nigeria: /^[A-Z]{3}-\d{3}[A-Z]{2}$/i,
  Generic: /^[A-Z0-9- ]{3,20}$/i,
};

export function isPlateValid(region: keyof typeof plateSchemas, plate: string): boolean {
  return plateSchemas[region].test(plate.trim());
}

const vinAllowed = /^[A-HJ-NPR-Z0-9]{17}$/i;

export function vinChecksumValid(vin: string): boolean {
  const map: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  };
  const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  const chars = vin.toUpperCase().split("");
  const sum = chars.reduce((acc, ch, idx) => {
    const val = ch >= "0" && ch <= "9" ? Number(ch) : map[ch] ?? 0;
    return acc + val * weights[idx];
  }, 0);
  const check = sum % 11;
  const checkChar = check === 10 ? "X" : String(check);
  return chars[8] === checkChar;
}

export function isVinValid(vin: string): boolean {
  const trimmed = vin.trim().toUpperCase();
  return vinAllowed.test(trimmed) && vinChecksumValid(trimmed);
}

export function isYearValid(year: number): boolean {
  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear;
}

export function detailsValid(params: {
  region: keyof typeof plateSchemas;
  plate: string;
  vin: string;
  brand: string;
  model: string;
  year: number;
}): boolean {
  const vinOk = !params.vin || isVinValid(params.vin);
  return (
    isPlateValid(params.region, params.plate) &&
    vinOk &&
    !!params.brand &&
    !!params.model &&
    isYearValid(params.year)
  );
}
