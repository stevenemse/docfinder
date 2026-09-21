/**
 * Géographie du Cameroun — source de vérité partagée.
 * Le chef-lieu de chaque région est en première position : c'est la valeur
 * par défaut quand on change de région. L'utilisateur peut toujours choisir
 * « Autre (préciser) » pour saisir une ville non listée.
 */

export const CITY_OTHER = '__other__';

export interface CameroonRegion {
  name: string;
  cities: string[];
}

export const CAMEROON_REGIONS: readonly CameroonRegion[] = [
  {
    name: 'Centre',
    cities: [
      'Yaoundé', 'Mbalmayo', 'Obala', 'Mfou', "Sa'a", 'Bafia', 'Éséka',
      'Akonolinga', 'Nanga-Eboko', 'Monatélé', 'Ntui', 'Ngoumou'
    ]
  },
  {
    name: 'Littoral',
    cities: [
      'Douala', 'Édéa', 'Nkongsamba', 'Loum', 'Manjo', 'Melong',
      'Dibombari', 'Yabassi', 'Ndom', 'Nlonako'
    ]
  },
  {
    name: 'Ouest',
    cities: [
      'Bafoussam', 'Dschang', 'Bafang', 'Bangangté', 'Mbouda', 'Foumban',
      'Foumbot', 'Bandja', 'Bamendjou', 'Tonga', 'Galim', 'Kekem'
    ]
  },
  {
    name: 'Sud-Ouest',
    cities: [
      'Buéa', 'Limbe', 'Kumba', 'Tiko', 'Mutengene', 'Mamfe',
      'Mundemba', 'Ekondo-Titi', 'Nguti', 'Tombel', 'Bangem'
    ]
  },
  {
    name: 'Nord-Ouest',
    cities: [
      'Bamenda', 'Bafut', 'Bali', 'Batibo', 'Mbengwi', 'Kumbo',
      'Jakiri', 'Nkambé', 'Wum', 'Fundong', 'Njinikom', 'Belo'
    ]
  },
  {
    name: 'Nord',
    cities: [
      'Garoua', 'Guider', 'Pitoa', 'Bibémi', 'Figuil', 'Tcholliré',
      'Touboro', 'Rey-Bouba', 'Dembo'
    ]
  },
  {
    name: 'Extrême-Nord',
    cities: [
      'Maroua', 'Mokolo', 'Mora', 'Kaélé', 'Yagoua', 'Kousséri',
      'Bogo', 'Mindif', 'Tokombéré', 'Waza', 'Makary'
    ]
  },
  {
    name: 'Adamaoua',
    cities: [
      'Ngaoundéré', 'Banyo', 'Tibati', 'Meiganga', 'Tignère',
      'Ngaoundal', 'Bélel', 'Martap', 'Kontcha', 'Dir'
    ]
  },
  {
    name: 'Est',
    cities: [
      'Bertoua', 'Batouri', 'Bélabo', 'Abong-Mbang', 'Doumé',
      'Garoua-Boulaï', 'Yokadouma', 'Mindourou', 'Ngoura', 'Moloundou', 'Lomié'
    ]
  },
  {
    name: 'Sud',
    cities: [
      'Ebolowa', 'Kribi', 'Ambam', 'Sangmélima', 'Bipindi', 'Lolodorf',
      'Mvangan', 'Olamzé', 'Zoétélé', 'Akom II'
    ]
  }
];

/** Villes d'une région donnée (le chef-lieu est en tête). */
export function citiesOfRegion(regionName: string): string[] {
  return CAMEROON_REGIONS.find(r => r.name === regionName)?.cities ?? [];
}

/** Liste des noms de régions (ordre officiel). */
export function regionNames(): string[] {
  return CAMEROON_REGIONS.map(r => r.name);
}
