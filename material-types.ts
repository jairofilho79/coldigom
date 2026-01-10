/**
 * Enum containing all material types (instruments and voices) in English
 */
export enum MaterialKind {
  // Instruments - Strings
  Violin = 'Violin',
  ViolinI = 'Violin I',
  ViolinII = 'Violin II',
  Viola = 'Viola',
  Cello = 'Cello',
  DoubleBass = 'Double Bass',
  ContraBass = 'Contra Bass',
  Strings = 'Strings',
  Guitar = 'Guitar',

  // Instruments - Woodwinds
  Flute = 'Flute',
  FluteI = 'Flute I',
  FluteII = 'Flute II',
  Piccolo = 'Piccolo',
  Clarinet = 'Clarinet',
  ClarinetInBb = 'Clarinet in Bb',
  Oboe = 'Oboe',
  Bassoon = 'Bassoon',
  Contrabassoon = 'Contrabassoon',
  Saxophone = 'Saxophone',
  SopranoSaxophone = 'Soprano Saxophone',
  AltoSaxophone = 'Alto Saxophone',
  TenorSaxophone = 'Tenor Saxophone',
  Woodwinds = 'Woodwinds',

  // Instruments - Brass
  Trumpet = 'Trumpet',
  TrumpetInBb = 'Trumpet in Bb',
  FrenchHorn = 'French Horn',
  FrenchHornInF = 'French Horn in F',
  Trombone = 'Trombone',
  Flugelhorn = 'Flugelhorn',
  Tuba = 'Tuba',
  Cornet = 'Cornet',
  Euphonium = 'Euphonium',
  Baritone = 'Baritone',
  Brass = 'Brass',
  Glockenspiel = 'Glockenspiel',
  // Instruments - Percussion
  Drums = 'Drums',
  Timpani = 'Timpani',
  SnareDrum = 'Snare Drum',
  BassDrum = 'Bass Drum',
  Cymbal = 'Cymbal',
  SuspendedCymbal = 'Suspended Cymbal',
  Vibraphone = 'Vibraphone',
  OrchestraBells = 'Orchestra Bells',
  Percussion = 'Percussion',

  // Instruments - Keyboard
  Piano = 'Piano',
  Organ = 'Organ',
  Keyboard = 'Keyboard',

  // Instruments - Other
  Harp = 'Harp',
  Harmonica = 'Harmonica',
  ElectricBass = 'Electric Bass',

  // Scores and Charts
  Score = 'Score',
  ChordChart = 'Chord Chart',
  SheetMusic = 'Sheet Music',
  Base = 'Base',
  Harmony = 'Harmony',

  // Choir
  Choir = 'Choir',
  ChoirAndPiano = 'Choir and Piano',
  ChoirBass = 'Choir Bass',
  ChoirTenor = 'Choir Tenor',
  ChoirAlto = 'Choir Alto',
  ChoirSoprano = 'Choir Soprano',

  // MIDI Voices
  MIDIVoice = 'MIDI Voice',
  MIDIGeneral = 'MIDI General',
  MIDIChoir = 'MIDI Choir',
  MIDIBass = 'MIDI Bass',
  MIDIBassI = 'MIDI Bass I',
  MIDIBassII = 'MIDI Bass II',
  MIDIBaritone = 'MIDI Baritone',
  MIDITenor = 'MIDI Tenor',
  MIDITenorI = 'MIDI Tenor I',
  MIDITenorII = 'MIDI Tenor II',
  MIDIAlto = 'MIDI Alto',
  MIDIAltoI = 'MIDI Alto I',
  MIDIAltoII = 'MIDI Alto II',
  MIDISoprano = 'MIDI Soprano',
  MIDISopranoI = 'MIDI Soprano I',
  MIDISopranoII = 'MIDI Soprano II',
  MIDIFirstVoice = 'MIDI First Voice',
  MIDISecondVoice = 'MIDI Second Voice',
  MIDIInstruments = 'MIDI Instruments',
  MIDIScore = 'MIDI Score',
  MIDIMen = 'MIDI Men',
  MIDIWomen = 'MIDI Women',

  // Sung Voices
  SungVoice = 'Sung Voice',
  FirstVoice = 'First Voice',
  SecondVoice = 'Second Voice',
  BassVoice = 'Bass Voice',
  BaritoneVoice = 'Baritone Voice',
  TenorVoice = 'Tenor Voice',
  TenorVoiceI = 'Tenor Voice I',
  TenorVoiceII = 'Tenor Voice II',
  AltoVoice = 'Alto Voice',
  AltoVoiceI = 'Alto Voice I',
  AltoVoiceII = 'Alto Voice II',
  SopranoVoice = 'Soprano Voice',
  SopranoVoiceI = 'Soprano Voice I',
  SopranoVoiceII = 'Soprano Voice II',
  VoiceMen = 'Voice Men',
  VoiceWomen = 'Voice Women',

  // Audio Types
  Audio = 'Audio',
  AudioGeneral = 'Audio General',
  AudioGroup = 'Audio Group',
  AudioSolo = 'Audio Solo',
  Playback = 'Playback',
  RehearsalVersion = 'Rehearsal Version',
  Instrumental = 'Instrumental',

  // Other
  Lyrics = 'Lyrics',
  Unknown = 'Unknown',
  GesturesInEngraving = 'Gestures in Engraving',
  Experience = 'Experience',
  Slide = 'Slide',
}

