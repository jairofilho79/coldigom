// Seed script to populate the database with 50 praises
// Run with: wrangler d1 execute coldigom --local --file=scripts/seed.sql
// Or use the API directly

function escapeSQLValue(value: string): string {
  if (value === null || value === undefined) return '';
  return value.replace(/'/g, "''");
}

function generateUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${hex[16]}${(parseInt(hex[17], 16) & 0x3 | 0x8).toString(16)}${hex.slice(18,22)}-${hex.slice(22,34)}`;
}

// Material Kinds
const materialKinds = [
  { id: generateUUID(), name: 'Áudio' },
  { id: generateUUID(), name: 'Partitura' },
  { id: generateUUID(), name: 'MIDI' },
  { id: generateUUID(), name: 'Letra' },
  { id: generateUUID(), name: 'Cifra' },
  { id: generateUUID(), name: 'Vozes' },
  { id: generateUUID(), name: 'Instrumentos' },
  { id: generateUUID(), name: 'Playalong' },
];

// Tags
const tags = [
  { id: generateUUID(), name: 'Coletânea' },
  { id: generateUUID(), name: 'Avulsos' },
  { id: generateUUID(), name: 'CIAs' },
  { id: generateUUID(), name: 'GLTM' },
  { id: generateUUID(), name: 'PES' },
  { id: generateUUID(), name: 'Migrados' },
  { id: generateUUID(), name: 'Diversos' },
];

// 50 Praises with realistic Brazilian gospel songs
const praises = [
  { number: '001', name: 'Aleluia', author: 'Heitor P. de Oliveira', rhythm: 'Marcha', tonality: 'Sol Maior', category: 'Adoração' },
  { number: '002', name: 'Cristo Vive', author: 'Anselmo Silva', rhythm: 'Balada', tonality: 'Ré Maior', category: 'Alegria' },
  { number: '003', name: 'Deus é Amor', author: 'Hellen G. da Silva', rhythm: 'Valsa', tonality: 'Dó Maior', category: 'Amor' },
  { number: '004', name: 'Em Nome de Jesus', author: 'Roberto Lopes', rhythm: 'Balada', tonality: 'Mi Maior', category: 'Poder' },
  { number: '005', name: 'Grande é o Senhor', author: 'Mário de Oliveira', rhythm: 'Marcha', tonality: 'Fá Maior', category: 'Adoração' },
  { number: '006', name: 'Himno da Vitória', author: 'César A. Ferreira', rhythm: 'Marcha', tonality: 'Si Bemol Maior', category: 'Vitória' },
  { number: '007', name: 'Jeová Jireh', author: 'José R. Santos', rhythm: 'Balada', tonality: 'Sol Maior', category: 'Providência' },
  { number: '008', name: 'Louvai ao Senhor', author: 'Pedro H. Costa', rhythm: 'Marcha', tonality: 'Dó Maior', category: 'Adoração' },
  { number: '009', name: 'Maranata', author: 'Silas F. de Lima', rhythm: 'Balada', tonality: 'Ré Maior', category: 'Esperança' },
  { number: '010', name: 'Nome Superexaltado', author: 'André L. Martins', rhythm: 'Balada', tonality: 'Sol Maior', category: 'Adoração' },
  { number: '011', name: 'O Amor de Deus', author: 'Marcos V. Silva', rhythm: 'Valsa', tonality: 'Dó Maior', category: 'Amor' },
  { number: '012', name: 'Pecador', author: 'Ronaldo C. Pinto', rhythm: 'Balada', tonality: 'Mi Maior', category: 'Conversão' },
  { number: '013', name: 'Quão Grande é Deus', author: 'Sérgio A. Rodrigues', rhythm: 'Marcha', tonality: 'Fá Maior', category: 'Adoração' },
  { number: '014', name: 'Santo, Santo, Santo', author: 'Ricardo B. Santos', rhythm: 'Hino', tonality: 'Si Bemol Maior', category: 'Adoração' },
  { number: '015', name: 'Tão Grande Salvação', author: 'Fábio J. Oliveira', rhythm: 'Balada', tonality: 'Sol Maior', category: 'Salvação' },
  { number: '016', name: 'Tu és Deus', author: 'Paulo R. Costa', rhythm: 'Marcha', tonality: 'Dó Maior', category: 'Adoração' },
  { number: '017', name: 'Ungido do Senhor', author: 'Carlos E. Lima', rhythm: 'Balada', tonality: 'Ré Maior', category: 'Cristo' },
  { number: '018', name: 'Vem, Espírito Santo', author: 'Bruno M. Ferreira', rhythm: 'Balada', tonality: 'Sol Maior', category: 'Espírito Santo' },
  { number: '019', name: 'Vencedor', author: 'Leonardo F. Santos', rhythm: 'Marcha', tonality: 'Fá Maior', category: 'Vitória' },
  { number: '020', name: 'Zeus, o Deus Vivo', author: 'Rafael A. Oliveira', rhythm: 'Marcha', tonality: 'Si Bemol Maior', category: 'Adoração' },
  { number: '021', name: 'Alegrai-vos', author: 'Gustavo L. Silva', rhythm: 'Balada', tonality: 'Dó Maior', category: 'Alegria' },
  { number: '022', name: 'Bendito Seja', author: 'Thiago R. Costa', rhythm: 'Valsa', tonality: 'Sol Maior', category: 'Adoração' },
  { number: '023', name: 'Casa de Oração', author: 'Daniel P. Martins', rhythm: 'Balada', tonality: 'Ré Maior', category: 'Igreja' },
  { number: '024', name: 'Deus está Aqui', author: 'Fernando J. Lima', rhythm: 'Marcha', tonality: 'Fá Maior', category: 'Presença' },
  { number: '025', name: 'Ele é o Rei', author: 'Vinícius A. Santos', rhythm: 'Marcha', tonality: 'Si Bemol Maior', category: 'Reino' },
  { number: '026', name: 'Faz-me um Instrumento', author: 'Lucas B. Oliveira', rhythm: 'Balada', tonality: 'Dó Maior', category: 'Serviço' },
  { number: '027', name: 'Glória a Deus', author: 'Matheus C. Costa', rhythm: 'Hino', tonality: 'Sol Maior', category: 'Adoração' },
  { number: '028', name: 'Honra e Glória', author: 'Gabriel D. Silva', rhythm: 'Marcha', tonality: 'Ré Maior', category: 'Adoração' },
  { number: '029', name: 'Incomparável', author: 'Diego E. Santos', rhythm: 'Balada', tonality: 'Mi Maior', category: 'Adoração' },
  { number: '030', name: 'Jesus, Meu Amigo', author: 'Rodrigo F. Lima', rhythm: 'Balada', tonality: 'Fá Maior', category: 'Amor' },
  { number: '031', name: 'Luz do Mundo', author: 'Alexandre G. Costa', rhythm: 'Balada', tonality: 'Dó Maior', category: 'Luz' },
  { number: '032', name: 'Manso e Humilde', author: 'Henrique H. Oliveira', rhythm: 'Valsa', tonality: 'Sol Maior', category: 'Cristo' },
  { number: '033', name: 'Noite de Paz', author: 'Igor I. Santos', rhythm: 'Valsa', tonality: 'Dó Maior', category: 'Natal' },
  { number: '034', name: 'Oh, Quão Lindo', author: 'João J. Silva', rhythm: 'Balada', tonality: 'Ré Maior', category: 'Beleza' },
  { number: '035', name: 'Pai Nosso', author: 'Leonardo K. Lima', rhythm: 'Balada', tonality: 'Fá Maior', category: 'Oração' },
  { number: '036', name: 'Qualquer Dia', author: 'Marcelo L. Costa', rhythm: 'Balada', tonality: 'Si Bemol Maior', category: 'Esperança' },
  { number: '037', name: 'Restaura-me', author: 'Natanael M. Santos', rhythm: 'Balada', tonality: 'Dó Maior', category: 'Renovação' },
  { number: '038', name: 'Salmo 23', author: 'Otávio N. Oliveira', rhythm: 'Balada', tonality: 'Sol Maior', category: 'Salmo' },
  { number: '039', name: 'Te Louvarei', author: 'Paulo O. Silva', rhythm: 'Marcha', tonality: 'Ré Maior', category: 'Adoração' },
  { number: '040', name: 'Tudo é de Deus', author: 'Quéliton P. Lima', rhythm: 'Balada', tonality: 'Fá Maior', category: 'Providência' },
  { number: '041', name: 'Um Novo Dia', author: 'Renato Q. Costa', rhythm: 'Balada', tonality: 'Dó Maior', category: 'Esperança' },
  { number: '042', name: 'Vem Com Alegria', author: 'Sérgio R. Santos', rhythm: 'Marcha', tonality: 'Sol Maior', category: 'Alegria' },
  { number: '043', name: 'Xilogravura', author: 'Tiago S. Oliveira', rhythm: 'Balada', tonality: 'Mi Maior', category: 'Arte' },
  { number: '044', name: 'Yahweh', author: 'Ulisses T. Silva', rhythm: 'Marcha', tonality: 'Si Bemol Maior', category: 'Adoração' },
  { number: '045', name: 'Zion', author: 'Valdemir U. Lima', rhythm: 'Balada', tonality: 'Fá Maior', category: 'Esperança' },
  { number: '046', name: 'Abraão', author: 'Wagner V. Costa', rhythm: 'Balada', tonality: 'Dó Maior', category: 'História' },
  { number: '047', name: 'Benção', author: 'Xavier W. Santos', rhythm: 'Balada', tonality: 'Sol Maior', category: 'Benção' },
  { number: '048', name: 'Caminho Novo', author: 'Yuri X. Oliveira', rhythm: 'Balada', tonality: 'Ré Maior', category: 'Caminho' },
  { number: '049', name: 'Dia de Festa', author: 'Zaqueu Y. Silva', rhythm: 'Marcha', tonality: 'Fá Maior', category: 'Festa' },
  { number: '050', name: 'Eternamente', author: 'Adriano Z. Lima', rhythm: 'Balada', tonality: 'Dó Maior', category: 'Eternidade' },
];

const sampleLyrics = `Senhor, eu Te amo com todo o meu coração
E Te adoro com toda a minha alma
Tu és o meu Deus, o meu Salvador
Para sempre Te louvarei.

Aleluia, aleluia, aleluia!
Glória a Ti, ó Deus!
Aleluia, aleluia, glória!`;

function generateSQL(): string {
  const statements: string[] = [];

  for (const mk of materialKinds) {
    statements.push(`INSERT INTO material_kinds (id, name) VALUES ('${mk.id}', '${escapeSQLValue(mk.name)}');`);
  }

  for (const tag of tags) {
    statements.push(`INSERT INTO tags (id, name) VALUES ('${tag.id}', '${escapeSQLValue(tag.name)}');`);
  }

  for (const praise of praises) {
    const id = generateUUID();
    statements.push(`INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES ('${id}', '${escapeSQLValue(praise.name)}', '${escapeSQLValue(praise.number)}', '${escapeSQLValue(praise.author)}', '${escapeSQLValue(praise.rhythm)}', '${escapeSQLValue(praise.tonality)}', '${escapeSQLValue(praise.category)}', '${escapeSQLValue(sampleLyrics)}');`);

    const numTags = Math.floor(Math.random() * 3) + 1;
    const shuffledTags = [...tags].sort(() => Math.random() - 0.5);
    const selectedTags = shuffledTags.slice(0, numTags);

    for (const tag of selectedTags) {
      statements.push(`INSERT INTO praise_tags (praise_id, tag_id) VALUES ('${id}', '${tag.id}');`);
    }

    const numMaterials = Math.floor(Math.random() * 3) + 1;
    const shuffledKinds = [...materialKinds].sort(() => Math.random() - 0.5);
    const selectedKinds = shuffledKinds.slice(0, numMaterials);
    const materialTypes = ['mp3', 'pdf', 'chord'];

    for (let i = 0; i < selectedKinds.length; i++) {
      const matId = generateUUID();
      const kind = selectedKinds[i];
      const type = materialTypes[i % materialTypes.length];
      statements.push(`INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key) VALUES ('${matId}', '${id}', '${kind.id}', '${escapeSQLValue(type)}', 'praises/${escapeSQLValue(praise.number)}_${escapeSQLValue(praise.name.toLowerCase().replace(/ /g, '_'))}/${escapeSQLValue(type)}');`);
    }
  }

  return statements.join('\n');
}

const sql = generateSQL();
console.log(sql);