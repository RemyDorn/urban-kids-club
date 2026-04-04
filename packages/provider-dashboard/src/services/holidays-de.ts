// ============================================================
// Deutsche Schulferien 2026 – Alle 16 Bundesländer
// ============================================================
// Quelle: KMK Ferientermine, Stand April 2026
// ============================================================

export interface HolidayTemplate {
  name: string
  startDate: string
  endDate: string
}

export type Bundesland =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH'
  | 'HE' | 'MV' | 'NI' | 'NW' | 'RP' | 'SL'
  | 'SN' | 'ST' | 'SH' | 'TH'

export const BUNDESLAND_NAMES: Record<Bundesland, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
}

// Schulferien 2026 nach Bundesland
export const SCHULFERIEN_2026: Record<Bundesland, HolidayTemplate[]> = {
  NW: [
    { name: 'Osterferien NRW', startDate: '2026-03-30', endDate: '2026-04-11' },
    { name: 'Pfingstferien NRW', startDate: '2026-05-26', endDate: '2026-05-26' },
    { name: 'Sommerferien NRW', startDate: '2026-06-29', endDate: '2026-08-11' },
    { name: 'Herbstferien NRW', startDate: '2026-10-12', endDate: '2026-10-24' },
    { name: 'Weihnachtsferien NRW', startDate: '2026-12-21', endDate: '2027-01-05' },
  ],
  BY: [
    { name: 'Winterferien Bayern', startDate: '2026-02-16', endDate: '2026-02-20' },
    { name: 'Osterferien Bayern', startDate: '2026-03-30', endDate: '2026-04-10' },
    { name: 'Pfingstferien Bayern', startDate: '2026-05-26', endDate: '2026-06-05' },
    { name: 'Sommerferien Bayern', startDate: '2026-07-30', endDate: '2026-09-14' },
    { name: 'Herbstferien Bayern', startDate: '2026-11-02', endDate: '2026-11-06' },
    { name: 'Weihnachtsferien Bayern', startDate: '2026-12-23', endDate: '2027-01-07' },
  ],
  BW: [
    { name: 'Osterferien BW', startDate: '2026-03-30', endDate: '2026-04-10' },
    { name: 'Pfingstferien BW', startDate: '2026-05-26', endDate: '2026-06-06' },
    { name: 'Sommerferien BW', startDate: '2026-07-30', endDate: '2026-09-12' },
    { name: 'Herbstferien BW', startDate: '2026-10-26', endDate: '2026-10-31' },
    { name: 'Weihnachtsferien BW', startDate: '2026-12-23', endDate: '2027-01-09' },
  ],
  BE: [
    { name: 'Winterferien Berlin', startDate: '2026-02-02', endDate: '2026-02-07' },
    { name: 'Osterferien Berlin', startDate: '2026-03-30', endDate: '2026-04-10' },
    { name: 'Sommerferien Berlin', startDate: '2026-07-09', endDate: '2026-08-21' },
    { name: 'Herbstferien Berlin', startDate: '2026-10-19', endDate: '2026-10-31' },
    { name: 'Weihnachtsferien Berlin', startDate: '2026-12-21', endDate: '2027-01-02' },
  ],
  BB: [
    { name: 'Winterferien Brandenburg', startDate: '2026-02-02', endDate: '2026-02-07' },
    { name: 'Osterferien Brandenburg', startDate: '2026-03-30', endDate: '2026-04-10' },
    { name: 'Sommerferien Brandenburg', startDate: '2026-07-09', endDate: '2026-08-21' },
    { name: 'Herbstferien Brandenburg', startDate: '2026-10-19', endDate: '2026-10-31' },
    { name: 'Weihnachtsferien Brandenburg', startDate: '2026-12-21', endDate: '2027-01-02' },
  ],
  HB: [
    { name: 'Winterferien Bremen', startDate: '2026-02-02', endDate: '2026-02-03' },
    { name: 'Osterferien Bremen', startDate: '2026-03-23', endDate: '2026-04-04' },
    { name: 'Sommerferien Bremen', startDate: '2026-07-09', endDate: '2026-08-19' },
    { name: 'Herbstferien Bremen', startDate: '2026-10-12', endDate: '2026-10-24' },
    { name: 'Weihnachtsferien Bremen', startDate: '2026-12-23', endDate: '2027-01-05' },
  ],
  HH: [
    { name: 'Winterferien Hamburg', startDate: '2026-01-30', endDate: '2026-01-30' },
    { name: 'Frühjahrsferien Hamburg', startDate: '2026-03-02', endDate: '2026-03-13' },
    { name: 'Maiferien Hamburg', startDate: '2026-05-11', endDate: '2026-05-15' },
    { name: 'Sommerferien Hamburg', startDate: '2026-07-02', endDate: '2026-08-12' },
    { name: 'Herbstferien Hamburg', startDate: '2026-10-12', endDate: '2026-10-23' },
    { name: 'Weihnachtsferien Hamburg', startDate: '2026-12-21', endDate: '2027-01-02' },
  ],
  HE: [
    { name: 'Osterferien Hessen', startDate: '2026-04-06', endDate: '2026-04-18' },
    { name: 'Sommerferien Hessen', startDate: '2026-07-06', endDate: '2026-08-14' },
    { name: 'Herbstferien Hessen', startDate: '2026-10-19', endDate: '2026-10-30' },
    { name: 'Weihnachtsferien Hessen', startDate: '2026-12-21', endDate: '2027-01-08' },
  ],
  MV: [
    { name: 'Winterferien MV', startDate: '2026-02-02', endDate: '2026-02-14' },
    { name: 'Osterferien MV', startDate: '2026-03-30', endDate: '2026-04-08' },
    { name: 'Pfingstferien MV', startDate: '2026-05-22', endDate: '2026-05-26' },
    { name: 'Sommerferien MV', startDate: '2026-06-22', endDate: '2026-08-01' },
    { name: 'Herbstferien MV', startDate: '2026-10-24', endDate: '2026-10-28' },
    { name: 'Weihnachtsferien MV', startDate: '2026-12-21', endDate: '2027-01-02' },
  ],
  NI: [
    { name: 'Winterferien Niedersachsen', startDate: '2026-02-02', endDate: '2026-02-03' },
    { name: 'Osterferien Niedersachsen', startDate: '2026-03-23', endDate: '2026-04-04' },
    { name: 'Sommerferien Niedersachsen', startDate: '2026-07-09', endDate: '2026-08-19' },
    { name: 'Herbstferien Niedersachsen', startDate: '2026-10-12', endDate: '2026-10-24' },
    { name: 'Weihnachtsferien Niedersachsen', startDate: '2026-12-23', endDate: '2027-01-05' },
  ],
  RP: [
    { name: 'Osterferien Rheinland-Pfalz', startDate: '2026-03-23', endDate: '2026-04-03' },
    { name: 'Sommerferien Rheinland-Pfalz', startDate: '2026-07-20', endDate: '2026-08-28' },
    { name: 'Herbstferien Rheinland-Pfalz', startDate: '2026-10-12', endDate: '2026-10-23' },
    { name: 'Weihnachtsferien Rheinland-Pfalz', startDate: '2026-12-21', endDate: '2027-01-05' },
  ],
  SL: [
    { name: 'Winterferien Saarland', startDate: '2026-02-16', endDate: '2026-02-21' },
    { name: 'Osterferien Saarland', startDate: '2026-03-30', endDate: '2026-04-11' },
    { name: 'Sommerferien Saarland', startDate: '2026-07-20', endDate: '2026-08-28' },
    { name: 'Herbstferien Saarland', startDate: '2026-10-12', endDate: '2026-10-24' },
    { name: 'Weihnachtsferien Saarland', startDate: '2026-12-21', endDate: '2027-01-03' },
  ],
  SN: [
    { name: 'Winterferien Sachsen', startDate: '2026-02-09', endDate: '2026-02-21' },
    { name: 'Osterferien Sachsen', startDate: '2026-03-30', endDate: '2026-04-08' },
    { name: 'Sommerferien Sachsen', startDate: '2026-06-27', endDate: '2026-08-08' },
    { name: 'Herbstferien Sachsen', startDate: '2026-10-19', endDate: '2026-10-31' },
    { name: 'Weihnachtsferien Sachsen', startDate: '2026-12-23', endDate: '2027-01-03' },
  ],
  ST: [
    { name: 'Winterferien Sachsen-Anhalt', startDate: '2026-02-02', endDate: '2026-02-14' },
    { name: 'Osterferien Sachsen-Anhalt', startDate: '2026-03-30', endDate: '2026-04-04' },
    { name: 'Pfingstferien Sachsen-Anhalt', startDate: '2026-05-22', endDate: '2026-05-30' },
    { name: 'Sommerferien Sachsen-Anhalt', startDate: '2026-07-13', endDate: '2026-08-26' },
    { name: 'Herbstferien Sachsen-Anhalt', startDate: '2026-10-19', endDate: '2026-10-24' },
    { name: 'Weihnachtsferien Sachsen-Anhalt', startDate: '2026-12-19', endDate: '2027-01-02' },
  ],
  SH: [
    { name: 'Osterferien Schleswig-Holstein', startDate: '2026-04-06', endDate: '2026-04-18' },
    { name: 'Sommerferien Schleswig-Holstein', startDate: '2026-06-29', endDate: '2026-08-08' },
    { name: 'Herbstferien Schleswig-Holstein', startDate: '2026-10-12', endDate: '2026-10-24' },
    { name: 'Weihnachtsferien Schleswig-Holstein', startDate: '2026-12-21', endDate: '2027-01-06' },
  ],
  TH: [
    { name: 'Winterferien Thüringen', startDate: '2026-02-02', endDate: '2026-02-07' },
    { name: 'Osterferien Thüringen', startDate: '2026-03-30', endDate: '2026-04-11' },
    { name: 'Sommerferien Thüringen', startDate: '2026-06-27', endDate: '2026-08-08' },
    { name: 'Herbstferien Thüringen', startDate: '2026-10-05', endDate: '2026-10-17' },
    { name: 'Weihnachtsferien Thüringen', startDate: '2026-12-23', endDate: '2027-01-02' },
  ],
}

// Alle Bundesländer als Array
export const ALL_BUNDESLAENDER: Bundesland[] = Object.keys(SCHULFERIEN_2026) as Bundesland[]
