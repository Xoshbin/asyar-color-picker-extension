/**
 * CSS keywords are single tokens (`royalblue`); the UI wants words
 * ("Royal Blue"). This splits a keyword into the words it was built from and
 * leaves anything it cannot fully decompose alone, so an unknown future
 * keyword still renders as a capitalised name rather than half a phrase.
 */

const COLOR_NAME_WORDS = [
  'alice',
  'almond',
  'antique',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanched',
  'blue',
  'blush',
  'brick',
  'brown',
  'burly',
  'cadet',
  'chartreuse',
  'chiffon',
  'chocolate',
  'coral',
  'corn',
  'cornflower',
  'cream',
  'crimson',
  'cyan',
  'dark',
  'deep',
  'dim',
  'dodger',
  'drab',
  'fire',
  'floral',
  'forest',
  'fuchsia',
  'gainsboro',
  'ghost',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'grey',
  'honeydew',
  'hot',
  'indian',
  'indigo',
  'ivory',
  'khaki',
  'lace',
  'lavender',
  'lawn',
  'light',
  'lime',
  'linen',
  'magenta',
  'marine',
  'maroon',
  'medium',
  'midnight',
  'mint',
  'misty',
  'moccasin',
  'navajo',
  'navy',
  'old',
  'olive',
  'orange',
  'orchid',
  'pale',
  'papaya',
  'peach',
  'peru',
  'pink',
  'plum',
  'powder',
  'puff',
  'purple',
  'rebecca',
  'red',
  'rose',
  'rosy',
  'royal',
  'saddle',
  'salmon',
  'sandy',
  'sea',
  'shell',
  'sienna',
  'silk',
  'silver',
  'sky',
  'slate',
  'smoke',
  'snow',
  'spring',
  'steel',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'whip',
  'white',
  'wood',
  'yellow',
] as const;

/** Longest first, so `goldenrod` wins over `gold` and `oldlace` over `old`. */
const BY_LENGTH = [...COLOR_NAME_WORDS].sort((a, b) => b.length - a.length);

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** `royalblue` → `Royal Blue`, `goldenrod` → `Goldenrod`, `''` → `''`. */
export function displayColorName(keyword: string): string {
  const name = keyword.trim().toLowerCase();
  if (!name) return '';

  const parts: string[] = [];
  let index = 0;
  while (index < name.length) {
    const word = BY_LENGTH.find((candidate) => name.startsWith(candidate, index));
    if (!word) return capitalise(name);
    parts.push(word);
    index += word.length;
  }
  return parts.map(capitalise).join(' ');
}
