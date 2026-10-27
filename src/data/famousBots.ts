import { AIDifficulty } from '../types/chess';

export interface FamousBotProfile {
  id: string;
  name: string;
  handle: string;
  title: string;
  category: 'Creators' | 'Chess Personalities' | 'Super Grandmasters';
  elo: number;
  engineDifficulty: AIDifficulty;
  accentColor: string;
  badgeColor: string;
  avatarText: string;
  description: string;
  introQuote: string;
  moveQuotes: string[];
  captureQuotes: string[];
  checkQuotes: string[];
}

export const FAMOUS_BOTS: FamousBotProfile[] = [
  // CREATORS & STREAMERS
  {
    id: 'mrbeast',
    name: 'MrBeast',
    handle: '@MrBeast',
    title: 'CREATOR',
    category: 'Creators',
    elo: 850,
    engineDifficulty: 'novice',
    accentColor: 'from-cyan-400 to-blue-600',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    avatarText: 'MB',
    description: 'High-energy aggressive openings and chaotic piece giveaways!',
    introQuote: 'In this video, if you beat me at Chess, you win +48 ELO!',
    moveQuotes: [
      'I just bought this square for $100,000!',
      'Wait until you see the trap I set up on the next move!',
      'Karl told me to push this pawn, so here we go!',
    ],
    captureQuotes: [
      'BOOM! Say goodbye to that piece!',
      'That piece just got eliminated from the challenge!',
    ],
    checkQuotes: [
      'CHECK! Last King standing wins the island!',
    ],
  },
  {
    id: 'xqc',
    name: 'xQc',
    handle: '@xQc',
    title: 'STREAMER',
    category: 'Creators',
    elo: 1050,
    engineDifficulty: 'novice',
    accentColor: 'from-sky-500 to-indigo-700',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    avatarText: 'xQc',
    description: 'Hyper-fast instincts, wild early Queen attacks, and pure chaos.',
    introQuote: 'Chat, watch this 6-move speedrun! Dud, he has no idea.',
    moveQuotes: [
      'Dud, what even is this position?!',
      'Go agane! Push everything forward!',
      'Chat, is this theory? I think I invented a new gambit.',
    ],
    captureQuotes: [
      'YOINK! Free piece, thank you very much!',
      'Clapped! Absolutely rolled!',
    ],
    checkQuotes: [
      'CHECK! Wait, is that mate?!',
    ],
  },
  {
    id: 'pokimane',
    name: 'Pokimane',
    handle: '@pokimanelol',
    title: 'CREATOR',
    category: 'Creators',
    elo: 1150,
    engineDifficulty: 'novice',
    accentColor: 'from-pink-500 to-rose-600',
    badgeColor: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
    avatarText: 'PK',
    description: 'Balanced, solid development with sneaky tactical knights.',
    introQuote: 'Good luck! Please be nice to my Queen today!',
    moveQuotes: [
      'Let me develop my pieces nice and safely.',
      'Wait, I actually really like this move!',
      'Hmm, let’s keep the center locked down.',
    ],
    captureQuotes: [
      'Sorry! I had to take that one!',
      'Ooh, free material!',
    ],
    checkQuotes: [
      'Check! Watch your King!',
    ],
  },
  {
    id: 'markrober',
    name: 'Mark Rober',
    handle: '@MarkRober',
    title: 'ENGINEER',
    category: 'Creators',
    elo: 1400,
    engineDifficulty: 'intermediate',
    accentColor: 'from-orange-500 to-amber-600',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    avatarText: 'MR',
    description: 'Calculated geometric traps engineered with NASA-level precision.',
    introQuote: 'I ran 10,000 physics simulations on this opening.',
    moveQuotes: [
      'Notice the parabolic trajectory of that Knight.',
      'This pawn structure is stronger than carbon fiber.',
      'Glitter-bomb trap armed on the d-file.',
    ],
    captureQuotes: [
      'Target acquired and neutralized!',
      'Science wins again!',
    ],
    checkQuotes: [
      'Check! Calculated to 4 decimal places.',
    ],
  },

  // CHESS PERSONALITIES & MASTERS
  {
    id: 'botez',
    name: 'Andrea Botez',
    handle: '@itsandreabotez',
    title: 'CREATOR',
    category: 'Chess Personalities',
    elo: 1850,
    engineDifficulty: 'intermediate',
    accentColor: 'from-fuchsia-500 to-purple-700',
    badgeColor: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
    avatarText: 'AB',
    description: 'Ultra-aggressive kingside attacks and fearless sacrifices.',
    introQuote: 'No Botez Gambits today—only all-out checkmate attacks!',
    moveQuotes: [
      'We don’t play defense here, we only attack!',
      'Pushing pawns toward your King!',
      'Alex told me to play slow, so naturally I’m sacrificing a piece.',
    ],
    captureQuotes: [
      'LET’S GO!! Huge capture!',
      'Snatched! My pieces are flying in!',
    ],
    checkQuotes: [
      'CHECK!! Where is your King going?!',
    ],
  },
  {
    id: 'annacramling',
    name: 'Anna Cramling',
    handle: '@AnnaCramling',
    title: 'WFM',
    category: 'Chess Personalities',
    elo: 2100,
    engineDifficulty: 'intermediate',
    accentColor: 'from-emerald-500 to-teal-700',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    avatarText: 'AC',
    description: 'Creative unorthodox setups, tricky knights, and wholesome tenacity.',
    introQuote: 'Let’s have a wonderful game! Beware of the Cow Opening!',
    moveQuotes: [
      'Look at how happy this Knight is!',
      'My mom taught me this positional squeeze!',
      'Quiet improving moves make all the difference.',
    ],
    captureQuotes: [
      'Aha! Tactical strike!',
      'Thank you for that piece!',
    ],
    checkQuotes: [
      'Check! Knock knock on the King!',
    ],
  },
  {
    id: 'gothamchess',
    name: 'GothamChess',
    handle: 'IM Levy Rozman',
    title: 'IM',
    category: 'Chess Personalities',
    elo: 2350,
    engineDifficulty: 'grandmaster',
    accentColor: 'from-red-600 to-rose-800',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    avatarText: 'GC',
    description: 'Caro-Kann mastery, venomous tactics, and legendary Rook sacrifices.',
    introQuote: 'Welcome to Guess the ELO! Prepare for... THE ROOOOOOK!!',
    moveQuotes: [
      'Never play f6... unless I’m the one doing it.',
      'This position is absolute cinema for my pieces.',
      'Look at the evaluation bar right now!',
    ],
    captureQuotes: [
      'AND HE SACRIFICES... THE ROOOOOOK!!',
      'DANGER LEVELS!! I take yours first!',
    ],
    checkQuotes: [
      'CHECK!! Put this game in the recap!',
    ],
  },
  {
    id: 'naroditsky',
    name: 'Daniel Naroditsky',
    handle: 'GM Danya',
    title: 'GM',
    category: 'Chess Personalities',
    elo: 2650,
    engineDifficulty: 'grandmaster',
    accentColor: 'from-indigo-600 to-blue-900',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    avatarText: 'DN',
    description: 'Deeply instructive positional harmony and lightning-fast endgame technique.',
    introQuote: 'Notice how every piece coordinates harmoniously toward the center.',
    moveQuotes: [
      'A classic prophylactic move—improving our worst-placed piece.',
      'Let’s centralize and maintain the tension.',
      'This is a textbook motif from Nimzowitsch.',
    ],
    captureQuotes: [
      'Liquidating into a favourable tactical sequence.',
      'Clinical capture to shatter the pawn structure.',
    ],
    checkQuotes: [
      'Check—forcing a critical concession from your King.',
    ],
  },

  // SUPER GRANDMASTERS & BOSSES
  {
    id: 'hikaru',
    name: 'Hikaru Nakamura',
    handle: 'GM Hikaru',
    title: 'GM',
    category: 'Super Grandmasters',
    elo: 2875,
    engineDifficulty: 'alien_mind',
    accentColor: 'from-amber-500 to-red-700',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    avatarText: 'HN',
    description: '5-time US Champion & Speed Chess Legend. Calculates 10 moves ahead instantly.',
    introQuote: 'Takes, takes, takes, Knight c6 and we’re just chilling, chat.',
    moveQuotes: [
      'Yeah, I saw this line 8 moves ago. Wait, look at the ceiling.',
      'Takes, takes, takes, Bishop b4, Castle, and it’s completely winning.',
      'I literally don’t care, I’m just pushing the h-pawn.',
    ],
    captureQuotes: [
      'Takes, takes, and you’re just losing a piece here.',
      'Free juicer! Thank you very much!',
    ],
    checkQuotes: [
      'Check. Chat, it’s forced mate in 14.',
    ],
  },
  {
    id: 'magnus',
    name: 'Magnus Carlsen',
    handle: 'GM Magnus Carlsen',
    title: 'GOAT',
    category: 'Super Grandmasters',
    elo: 2882,
    engineDifficulty: 'alien_mind',
    accentColor: 'from-yellow-400 via-amber-500 to-yellow-700',
    badgeColor: 'bg-yellow-500/25 text-yellow-300 border-yellow-400/50',
    avatarText: 'MC',
    description: '5-time World Chess Champion. Unmatched intuition and relentless endgame grind.',
    introQuote: 'Sit down. Let’s see if you can survive the endgame.',
    moveQuotes: [
      'Slight inaccuracy from you. That’s all I need.',
      'I don’t play for draws—I’ll squeeze this position for 100 moves.',
      'Pure intuition. Every square on your side is weak now.',
    ],
    captureQuotes: [
      'Simplifying into a trivially winning endgame.',
      'Your defense just collapsed.',
    ],
    checkQuotes: [
      'Check. There is no escape.',
    ],
  },
  {
    id: 'mittens',
    name: 'Mittens',
    handle: 'Demon Cat Bot',
    title: 'BOSS',
    category: 'Super Grandmasters',
    elo: 3200,
    engineDifficulty: 'alien_mind',
    accentColor: 'from-rose-600 via-fuchsia-700 to-purple-950',
    badgeColor: 'bg-rose-500/25 text-rose-300 border-rose-500/50',
    avatarText: '🐾',
    description: 'Behind those innocent eyes lies an unstoppable calculation monster.',
    introQuote: 'Meow. Hehehe. Oppenheimer quoted the Bhagavad Gita about my chess.',
    moveQuotes: [
      'Meow. Every move you make brings the void closer.',
      'Hehehe. I like watching your pieces squirm.',
      'Purr... there is no hope on the evaluation bar.',
    ],
    captureQuotes: [
      'MEOW! Delicious chess piece!',
      'Hehehe! Another piece vanishes into the abyss!',
    ],
    checkQuotes: [
      'MEOW! CHECK! Run, little King, run!',
    ],
  },
];
