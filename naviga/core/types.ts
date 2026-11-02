// Tipi dei dati in naviga/data/. Condivisi tra PWA e (in futuro) app nativa.
import type { Feature, FeatureCollection, MultiPolygon, Polygon, LineString } from 'geojson';

export type Lang = 'it' | 'en';
export type Text = Record<Lang, string>;

export type ZoneProps = {
  id: string;
  zona: 'A' | 'B' | 'C' | 'perimetro';
  fascia?: '0-300' | '300-600' | 'oltre-600';
  nome: string;
  fonte: string;
  stato: string;
};
export type ZoneFeature = Feature<Polygon | MultiPolygon | LineString, ZoneProps>;
export type Zones = FeatureCollection<Polygon | MultiPolygon | LineString, ZoneProps>;

export type Rule = {
  id: string;
  testo: Text;
  riferimento: string;
  fonte: string;
  limiteNodi?: number;
  distanzaMetri?: number;
};
export type Rules = { annualita: number; documento: string; fonteUrl: string; regole: Rule[] };

export type PoiType = 'grotta' | 'scoglio' | 'cala' | 'porto' | 'altro';
export type Poi = {
  id: string;
  nome: Text;
  tipo: PoiType;
  descrizione: Text;
  lat: number;
  lon: number;
  accessoNoleggio: 'consentito' | 'solo esterno' | 'vietato';
  verificato: boolean;
  fonteCoordinate: string;
};

export type Config = {
  zonaBAutorizzata: boolean;
  portoRientroId: string;
  avvisoGrottaMetri: number;
  tolleranzaVelocitaNodi: number;
  numeri: { guardiaCostiera: string; emergenza: string; whatsappNoleggio: string };
};
