import { describe, it, expect } from 'vitest';
import { isPlateValid, isVinValid, vinChecksumValid, isYearValid, detailsValid } from '../vehicle-validation';

describe('vehicle-validation', () => {
  it('validates Nigeria plate format', () => {
    expect(isPlateValid('Nigeria', 'ABC-123DE')).toBe(true);
    expect(isPlateValid('Nigeria', 'AB-123DE')).toBe(false);
    expect(isPlateValid('Nigeria', 'ABC-12DE')).toBe(false);
    expect(isPlateValid('Nigeria', 'ABC-123D')).toBe(false);
  });

  it('validates Generic plate format', () => {
    expect(isPlateValid('Generic', 'AB 123-CD')).toBe(true);
    expect(isPlateValid('Generic', 'A')).toBe(false);
  });

  it('validates VIN characters and checksum', () => {
    expect(isVinValid('1HGCM82633A004352')).toBe(true);
    expect(vinChecksumValid('1HGCM82633A004352')).toBe(true);
    expect(isVinValid('1HGCM82633A00435I')).toBe(false);
  });

  it('validates year range', () => {
    expect(isYearValid(2000)).toBe(true);
    expect(isYearValid(1899)).toBe(false);
    expect(isYearValid(new Date().getFullYear() + 1)).toBe(false);
  });

  it('validates details grouping', () => {
    const currentYear = new Date().getFullYear();
    expect(detailsValid({
      region: 'Nigeria',
      plate: 'ABC-123DE',
      vin: '1HGCM82633A004352',
      brand: 'Toyota',
      model: 'Corolla',
      year: currentYear,
    })).toBe(true);
    expect(detailsValid({
      region: 'Nigeria',
      plate: 'ABC-12DE',
      vin: '1HGCM82633A004352',
      brand: 'Toyota',
      model: 'Corolla',
      year: currentYear,
    })).toBe(false);
  });
});
