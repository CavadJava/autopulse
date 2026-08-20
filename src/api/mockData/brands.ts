export interface Brand {
  ad: string;
  populyar: boolean;
  modellər: string[];
}

export const BRANDS: Brand[] = [
  { ad: 'Mercedes', populyar: true, modellər: ['E200', 'E250', 'C200', 'S500', 'GLE', 'CLA'] },
  { ad: 'Toyota', populyar: true, modellər: ['Camry', 'Corolla', 'Land Cruiser', 'RAV4', 'Prius'] },
  { ad: 'Changan', populyar: true, modellər: ['CS35', 'CS55', 'Eado', 'UNI-T'] },
  { ad: 'Hyundai', populyar: true, modellər: ['Sonata', 'Tucson', 'Elantra', 'Santa Fe'] },
  { ad: 'BMW', populyar: true, modellər: ['3 Series', '5 Series', 'X5', 'X3', '7 Series'] },
  { ad: 'Nissan', populyar: true, modellər: ['Altima', 'Qashqai', 'X-Trail', 'Patrol'] },
  { ad: 'LADA (VAZ)', populyar: true, modellər: ['Granta', 'Vesta', 'Niva', '2107'] },
  { ad: 'Chevrolet', populyar: true, modellər: ['Malibu', 'Cruze', 'Tahoe', 'Camaro'] },
  { ad: 'Land Rover', populyar: true, modellər: ['Range Rover', 'Discovery', 'Defender'] },
  { ad: 'Kia', populyar: true, modellər: ['Sportage', 'Optima', 'Sorento', 'Rio'] },
  { ad: 'Opel', populyar: true, modellər: ['Astra', 'Insignia', 'Corsa'] },
  { ad: 'Ford', populyar: true, modellər: ['Focus', 'Fusion', 'Explorer', 'Mustang'] },
  { ad: 'Volkswagen', populyar: false, modellər: ['Passat', 'Tiguan', 'Golf', 'Jetta'] },
  { ad: 'Audi', populyar: false, modellər: ['A4', 'A6', 'Q5', 'Q7'] },
  { ad: 'Tesla', populyar: false, modellər: ['Model 3', 'Model S', 'Model Y', 'Model X', 'Cybertruck', 'Roadster'] },
  { ad: 'Abarth', populyar: false, modellər: ['500', '595'] },
  { ad: 'Hanomag', populyar: false, modellər: ['Kurier'] },
  { ad: 'Piaggio', populyar: false, modellər: ['Ape', 'Porter'] },
  { ad: 'AC Cars', populyar: false, modellər: ['Cobra'] },
  { ad: 'Haval', populyar: false, modellər: ['H6', 'Jolion', 'F7'] },
  { ad: 'Plymouth', populyar: false, modellər: ['Barracuda'] },
  { ad: 'Acura', populyar: false, modellər: ['MDX', 'TLX'] },
  { ad: 'Hawtai', populyar: false, modellər: ['Santa Fe'] },
  { ad: 'Polestar', populyar: false, modellər: ['1', '2', '3'] },
];

export const CAR_GENERATIONS: Record<string, { period: string; ad: string; şəkil: string }[]> = {
  'Tesla|Model Y': [
    {
      period: '2025 - 2026',
      ad: 'I Restaylinq',
      şəkil: 'https://images.unsplash.com/photo-1617704548623-340376564e68?w=500&q=80',
    },
    {
      period: '2020 - 2024',
      ad: 'I Nəsil',
      şəkil: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?w=500&q=80',
    },
  ],
};

export const DEFAULT_GENERATIONS = [
  {
    period: '2020 - 2026',
    ad: 'Cari nəsil',
    şəkil: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=500&q=80',
  },
];

export const MODIFICATIONS: Record<string, string[]> = {
  'Tesla|Model Y': ['50.0 kWh / 451 a.g.', '75.0 kWh / 451 a.g.', '75.0 kWh / 554 a.g.'],
};

export const DEFAULT_MODIFICATIONS = ['2.0L / 150 a.g.', '2.5L / 190 a.g.', '3.0L / 249 a.g.'];
