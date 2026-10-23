import { CATEGORY_COLORS, DEFAULT_RULES, SCHEMA_VERSION, uid, type Game } from '../types';

type Row = [clue: string, answer: string, alts?: string[]];

function build(title: string, description: string, cats: [string, Row[]][], dd?: [number, number], final?: [category: string, ...Row]): Game {
  return {
    schema: SCHEMA_VERSION,
    id: uid(),
    title,
    description,
    rules: { ...DEFAULT_RULES },
    final: final && { category: final[0], clue: final[1], answer: final[2], alts: final[3] ?? [] },
    updatedAt: Date.now(),
    categories: cats.map(([name, rows], ci) => ({
      id: uid(),
      name,
      color: CATEGORY_COLORS[ci % CATEGORY_COLORS.length],
      questions: rows.map(([clue, answer, alts], qi) => ({
        id: uid(),
        clue,
        answer,
        alts: alts ?? [],
        value: (qi + 1) * 200,
        dailyDouble: dd ? dd[0] === ci && dd[1] === qi : false,
      })),
    })),
  };
}

export function generalKnowledge(): Game {
  return build(
    'General Knowledge',
    'A friendly five-by-five starter board. Edit anything.',
    [
      [
        'Science',
        [
          ['This planet is known as the Red Planet.', 'Mars'],
          ['H2O is the chemical formula for this liquid.', 'Water'],
          ['This force keeps the planets in orbit around the Sun.', 'Gravity'],
          ['This gas makes up about 78% of Earth’s atmosphere.', 'Nitrogen'],
          ['Organelles known as the "powerhouse" of the cell.', 'Mitochondria', ['Mitochondrion']],
        ],
      ],
      [
        'Geography',
        [
          ['The largest ocean on Earth.', 'Pacific Ocean', ['Pacific', 'The Pacific']],
          ['The capital city of Japan.', 'Tokyo'],
          ['This river flows through Cairo, Egypt.', 'Nile', ['The Nile', 'Nile River']],
          ['The smallest country in the world by area.', 'Vatican City', ['The Vatican', 'Vatican']],
          ['This mountain range forms part of the boundary between Europe and Asia.', 'Ural Mountains', ['Urals', 'The Urals']],
        ],
      ],
      [
        'History',
        [
          ['The first president of the United States.', 'George Washington', ['Washington']],
          ['Ancient Egyptian pyramids were built as tombs for these rulers.', 'Pharaohs', ['Pharaoh']],
          ['The Berlin Wall fell in this year.', '1989'],
          ['The Pilgrims sailed to America in 1620 aboard this ship.', 'The Mayflower', ['Mayflower']],
          ['This German is credited with introducing movable-type printing to Europe around 1440.', 'Johannes Gutenberg', ['Gutenberg']],
        ],
      ],
      [
        'Animals',
        [
          ['The largest land animal.', 'African elephant', ['Elephant', 'The elephant']],
          ['The only mammals capable of true, sustained flight.', 'Bats', ['Bat']],
          ['A group of lions is called this.', 'A pride', ['Pride']],
          ['This cephalopod has eight arms.', 'Octopus', ['An octopus']],
          ['The fastest land animal.', 'Cheetah', ['The cheetah']],
        ],
      ],
      [
        'Food',
        [
          ['Said to keep the doctor away when eaten daily.', 'An apple', ['Apple']],
          ['This Italian dish is flat dough with toppings, baked.', 'Pizza'],
          ['The main ingredient of guacamole.', 'Avocado', ['Avocados']],
          ['The world’s most expensive spice by weight comes from the stigmas of this crocus.', 'Saffron'],
          ['Fermented soybean paste used to make a classic Japanese soup.', 'Miso'],
        ],
      ],
    ],
    [3, 3],
    ['Chemistry', 'This metal has the chemical symbol Fe.', 'Iron'],
  );
}

export function worldTour(): Game {
  return build(
    'World Tour',
    'Geography from capitals to continents.',
    [
      [
        'Capitals',
        [
          ['The capital of Canada.', 'Ottawa'],
          ['The capital of Australia (it is not Sydney).', 'Canberra'],
          ['The capital of Egypt.', 'Cairo'],
          ['The capital of Brazil.', 'Brasilia', ['Brasília']],
          ['The capital of Mongolia.', 'Ulaanbaatar', ['Ulan Bator']],
        ],
      ],
      [
        'Rivers & Lakes',
        [
          ['The river that flows through Paris.', 'The Seine', ['Seine']],
          ['The largest of the Great Lakes by surface area.', 'Lake Superior', ['Superior']],
          ['The river that flows through Baghdad.', 'The Tigris', ['Tigris']],
          ['Lake Victoria is shared by Uganda, Kenya and this country.', 'Tanzania'],
          ['The largest river in South America by volume.', 'The Amazon', ['Amazon']],
        ],
      ],
      [
        'Landmarks',
        [
          ['The Eiffel Tower stands in this city.', 'Paris'],
          ['The Taj Mahal is in this country.', 'India'],
          ['The Colosseum is in this city.', 'Rome'],
          ['Machu Picchu is in this country.', 'Peru'],
          ['The Sagrada Família basilica is in this Spanish city.', 'Barcelona'],
        ],
      ],
      [
        'Continents',
        [
          ['The largest continent by area.', 'Asia'],
          ['The Sahara Desert is on this continent.', 'Africa'],
          ['The only continent with no permanent residents.', 'Antarctica'],
          ['The smallest continent by land area.', 'Australia', ['Oceania', 'Australia/Oceania']],
          ['Istanbul sits in both Europe and Asia; it is in this country.', 'Turkey'],
        ],
      ],
    ],
    [1, 3],
    ['Big Countries', 'The largest country in the world by land area.', 'Russia'],
  );
}

export function scienceTech(): Game {
  return build(
    'Science & Tech',
    'Space, the body, computers and chemistry.',
    [
      [
        'Space',
        [
          ['Our galaxy is called this.', 'The Milky Way', ['Milky Way']],
          ['The largest planet in our solar system.', 'Jupiter'],
          ['The planet best known for its prominent rings.', 'Saturn'],
          ['He was the first person to walk on the Moon.', 'Neil Armstrong', ['Armstrong']],
          ['The closest known star to the Sun.', 'Proxima Centauri', ['Proxima']],
        ],
      ],
      [
        'Human Body',
        [
          ['This organ pumps blood around the body.', 'The heart', ['Heart']],
          ['The largest organ of the human body.', 'Skin', ['The skin']],
          ['Your skin makes this vitamin when exposed to sunlight.', 'Vitamin D', ['D']],
          ['An adult human skeleton has this many bones.', '206'],
          ['Blood vessels that carry blood away from the heart.', 'Arteries', ['Artery']],
        ],
      ],
      [
        'Computers',
        [
          ['CPU stands for this.', 'Central Processing Unit'],
          ['The smallest unit of digital data, a 0 or a 1.', 'A bit', ['Bit']],
          ['This markup language structures web pages.', 'HTML', ['HyperText Markup Language']],
          ['He co-founded Microsoft with Paul Allen.', 'Bill Gates', ['Gates']],
          ['Tim Berners-Lee invented this in 1989.', 'The World Wide Web', ['World Wide Web', 'The Web', 'WWW']],
        ],
      ],
      [
        'Chemistry',
        [
          ['The chemical symbol for gold.', 'Au'],
          ['Na is the chemical symbol for this element.', 'Sodium'],
          ['The most abundant element in the universe.', 'Hydrogen'],
          ['The element with atomic number 6.', 'Carbon'],
          ['The lightest noble gas.', 'Helium'],
        ],
      ],
    ],
    [2, 2],
    ['Science Legends', 'He developed the theory of general relativity.', 'Albert Einstein', ['Einstein']],
  );
}

export function familyNight(): Game {
  return build(
    'Family Night',
    'Easy, friendly clues for all ages.',
    [
      [
        'Fairy Tales',
        [
          ['This girl in a red cloak visits her grandmother and meets a wolf.', 'Little Red Riding Hood', ['Red Riding Hood']],
          ['Three of these animals build houses of straw, sticks and bricks.', 'Pigs', ['The three little pigs', 'Pig']],
          ['She follows a white rabbit down a rabbit hole.', 'Alice', ['Alice in Wonderland']],
          ['This wooden puppet’s nose grows when he lies.', 'Pinocchio'],
          ['He wrote “The Ugly Duckling”.', 'Hans Christian Andersen', ['Andersen']],
        ],
      ],
      [
        'Colours & Shapes',
        [
          ['Mixing blue and yellow makes this colour.', 'Green'],
          ['A shape with three sides.', 'Triangle', ['A triangle']],
          ['Mixing red and white makes this colour.', 'Pink'],
          ['A shape with six sides.', 'Hexagon', ['A hexagon']],
          ['The number of colours traditionally counted in a rainbow.', 'Seven', ['7']],
        ],
      ],
      [
        'Everyday Life',
        [
          ['The day that comes after Friday.', 'Saturday'],
          ['The season that comes after summer.', 'Autumn', ['Fall']],
          ['A spider has this many legs.', 'Eight', ['8']],
          ['A leap year has this many days.', '366'],
          ['The number of hours in a week.', '168'],
        ],
      ],
      [
        'Music',
        [
          ['This instrument has black and white keys.', 'Piano', ['The piano']],
          ['A six-string instrument that is often strummed.', 'Guitar', ['The guitar']],
          ['A standard violin has this many strings.', 'Four', ['4']],
          ['He composed the “Für Elise” piano piece.', 'Beethoven', ['Ludwig van Beethoven']],
          ['This Austrian child prodigy composed “The Magic Flute”.', 'Mozart', ['Wolfgang Amadeus Mozart']],
        ],
      ],
    ],
    [0, 3],
    ['Space', 'The planet closest to the Sun.', 'Mercury'],
  );
}

export function blankGame(): Game {
  const rows: Row[] = [0, 1, 2, 3, 4].map(() => ['', '']);
  return build(
    'Untitled Game',
    '',
    [1, 2, 3, 4, 5].map((n) => [`Category ${n}`, rows.map((r) => [...r] as Row)] as [string, Row[]]),
    undefined,
    ['Final Round', '', ''],
  );
}

export const TEMPLATES: { name: string; make: () => Game }[] = [
  { name: 'General Knowledge', make: generalKnowledge },
  { name: 'World Tour', make: worldTour },
  { name: 'Science & Tech', make: scienceTech },
  { name: 'Family Night', make: familyNight },
  { name: 'Blank 5×5 board', make: blankGame },
];
