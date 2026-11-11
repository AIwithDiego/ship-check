// "Does it sound like a machine wrote it": rule-based, no model. Same text, same
// score. Every flag names the tell and quotes the line. This is not an AI
// detector and never says who wrote the text.

export interface Rule {
  id: string;
  tell: string;
  why: string;
  weight: number;
  re: RegExp;
}

export interface CopyFlag {
  rule: string;
  tell: string;
  why: string;
  line: string;
  match: string;
}

export interface CopyResult {
  score: number;
  lang: "en" | "es";
  words: number;
  flags: CopyFlag[];
  note?: string;
}

const words = (list: string) => list.trim().split(" | ").join("|");

const EN: Rule[] = [
  {
    id: "contrast",
    tell: "Not X, but Y",
    why: "Sets up a claim nobody made just to knock it down.",
    weight: 3,
    re: /\b(?:not (?:just|only|merely|simply)\b[^.!?\n]{1,80}?(?:\bbut\b|[;,.—–-]\s*(?:it'?s|they'?re|we'?re|it is)\b)|more than (?:just )?an? [^.!?\n]{1,40}?[,.—–-]+\s*(?:it'?s|we'?re)\b|(?:isn'?t|aren'?t|is not|are not) (?:just |only |about )[^.!?\n]{1,60}?[.;,—–-]+\s*(?:it'?s|they'?re|it is)\b)/gi,
  },
  {
    id: "dash",
    tell: "Em dash",
    why: "Dashes in every other sentence are the most recognisable machine habit.",
    weight: 1,
    re: /\s?—\s?/g,
  },
  {
    id: "stock-word",
    tell: "Stock AI word",
    why: "A word that says nothing about this business in particular.",
    weight: 2,
    re: new RegExp(
      `\\b(?:${words(
        "delve[sd]? | tapestry | testament to | ever-evolving | fast-paced | seamless(?:ly)? | elevates? | elevating | unlock(?:s|ed|ing)? | unleash(?:es|ed|ing)? | empower(?:s|ed|ing)? | harness(?:es|ed|ing)? | leverag(?:e|es|ed|ing) | robust | cutting-edge | game-chang(?:er|ing) | revolutioni[sz](?:e|es|ed|ing) | transformative | supercharg(?:e|es|ed|ing) | streamlin(?:e|es|ed|ing) | holistic | synerg(?:y|ies) | paradigm | effortless(?:ly)? | world-class | next-level | state-of-the-art | bespoke | curated | meticulous(?:ly)? | intricate | pivotal | vibrant | bustling | nestled | embark(?:s|ed|ing)? | foster(?:s|ed|ing)? | underscore[sd]? | showcas(?:e|es|ed|ing) | realm | landscape of | journey | reimagin(?:e|es|ed|ing) | redefin(?:e|es|ed|ing) | best-in-class | unparalleled | unmatched | second to none | like never before | innovative solutions?",
      )})\\b`,
      "gi",
    ),
  },
  {
    id: "stock-phrase",
    tell: "Stock phrase",
    why: "A ready-made sentence that fits any website, so it describes none.",
    weight: 3,
    re: new RegExp(
      `(?:${words(
        "in today'?s (?:fast-paced |digital |modern |competitive )?(?:world|age|landscape|market) | welcome to a world of | a world of [a-z]+ | look no further | whether you'?re (?:an? |looking )[^.!?]{1,60}? or | we understand that | it'?s (?:important|worth) (?:to note|noting) | at the end of the day | when it comes to | rest assured | say goodbye to | to the next level | your one-stop | passionate about | we pride ourselves | committed to (?:excellence|providing|delivering) | tailored to your (?:needs|unique) | take the (?:first|next) step | experience the difference | where [a-z]+ meets [a-z]+ | designed with you in mind | so you can focus on what (?:really |truly )?matters | trusted by (?:thousands|millions|teams) | the future of [a-z]+ is here | the power of",
      )})`,
      "gi",
    ),
  },
  {
    id: "opener",
    tell: "Staged opener",
    why: "Announces that something is coming instead of saying it.",
    weight: 2,
    re: /(?:^|[.!?]\s+)(?:Here'?s the thing|Let'?s dive in|Let'?s be honest|Let'?s face it|The truth is|Imagine (?:a world|if)|Picture this|In conclusion|In summary|The bottom line|Simply put|Ready to [^.!?]{1,50}\?|Moreover|Furthermore|Additionally|Ultimately|In essence)\b/g,
  },
  {
    id: "self-answer",
    tell: "Question answered by itself",
    why: "A two-word question the next sentence answers. Nobody asks like this.",
    weight: 3,
    re: /\b(?:The|Our|Your) (?:[a-z]+ )?(?:result|best part|secret|catch|difference|answer|outcome|goal)\?\s+[A-Z]|\bWhy\? Because\b|\bThe best part\?/g,
  },
  {
    id: "drumbeat",
    tell: "No X. No Y. Just Z.",
    why: "The drumbeat fragment close. It reads as a template the moment you have seen it twice.",
    weight: 3,
    re: /\bNo [a-z][^.!?\n]{0,24}[.,] No [a-z][^.!?\n]{0,24}[.,](?: (?:Just|Only) [^.!?\n]{1,40}[.!])?|\b(?:That'?s it|Period|Full stop|It'?s that simple|Simple as that)\.(?=\s|$)/g,
  },
  {
    id: "emoji",
    tell: "Emoji as decoration",
    why: "An emoji in front of a heading or bullet is the default look of generated copy.",
    weight: 2,
    re: /^(?:\p{Emoji_Presentation}\uFE0F?\s*)+|(?:\p{Emoji_Presentation}\uFE0F?\s*){2,}/gu,
  },
];

const ES: Rule[] = [
  {
    id: "contrast",
    tell: "No es X, es Y",
    why: "Monta una idea que nadie dijo para tumbarla.",
    weight: 3,
    re: /\bno (?:es|son|se trata) (?:solo|sólo|solamente|únicamente|simplemente)?\s?[^.!?\n]{1,70}?(?:,\s*sino\b|[.;,—–-]\s*es\b)|\bno solo [^.!?\n]{1,60}?,?\s*sino (?:que )?(?:también)?|\bmás que (?:un|una) [^.!?\n]{1,40}?,\s*(?:es|somos)\b/gi,
  },
  { id: "dash", tell: "Raya", why: "Rayas por todas partes: la marca más reconocible.", weight: 1, re: /\s?—\s?/g },
  {
    id: "stock-word",
    tell: "Palabra de relleno",
    why: "No dice nada concreto de este negocio.",
    weight: 2,
    re: new RegExp(
      `(?<![\\p{L}])(?:${words(
        "sum[eé]rgete | descubre | desbloquea | potencia(?:r|mos)? | impulsa(?:r|mos)? | revoluciona(?:r|rio|ria)? | transforma(?:r|dor|dora)? | innovador(?:a|es|as)? | de vanguardia | vanguardista | integral(?:es)? | a (?:tu|su) medida | sin esfuerzo | de primer nivel | de clase mundial | un sinfín de | tapiz | robust[oa]s? | fluid[oa]s? | sinergias? | paradigma | holístic[oa] | inigualable | incomparable | experiencia única | soluciones | eleva(?:r|mos)? | aprovecha(?:r)? el poder | apasionad[oa]s | compromiso con la excelencia",
      )})(?![\\p{L}])`,
      "giu",
    ),
  },
  {
    id: "stock-phrase",
    tell: "Frase hecha",
    why: "Vale para cualquier web, así que no describe ninguna.",
    weight: 3,
    re: new RegExp(
      `(?:${words(
        "en el mundo actual | en la era digital | en un mundo donde | en el vertiginoso | cabe destacar | es importante (?:señalar|destacar|mencionar) | sin lugar a dudas | no busques más | ya seas? [^.!?]{1,60}? o | al siguiente nivel | bienvenid[oa]s? a un mundo | un mundo de [a-záéíóúñ]+ | a la hora de | en definitiva | dile adiós a | olvídate de | nos apasiona | pensad[oa] para ti | lo que realmente importa | el futuro de [a-záéíóúñ ]+ ya está aquí | el poder de | da el (?:primer|siguiente) paso | marca la diferencia | donde [a-záéíóúñ]+ se encuentra con",
      )})`,
      "gi",
    ),
  },
  {
    id: "opener",
    tell: "Entrada de manual",
    why: "Anuncia que va a decir algo en vez de decirlo.",
    weight: 2,
    re: /(?:^|[.!?]\s+)(?:En conclusión|En resumen|Imagina(?: un mundo)?|La verdad es que|Seamos honestos|Además|Asimismo|Por otro lado|En esencia|¿List[oa]s? para [^?]{1,50}\?)(?![\p{L}])/gu,
  },
  {
    id: "self-answer",
    tell: "Pregunta que se responde sola",
    why: "Nadie pregunta así.",
    weight: 3,
    re: /¿(?:El|La|Lo) (?:mejor|resultado|secreto|diferencia|clave)(?: de todo)?\?\s+[A-ZÁÉÍÓÚ¡]|¿Por qué\? Porque\b/g,
  },
  {
    id: "drumbeat",
    tell: "Sin X. Sin Y. Solo Z.",
    why: "El cierre de fragmentos en ráfaga se lee como plantilla.",
    weight: 3,
    re: /\bSin [a-záéíóúñ][^.!?\n]{0,24}[.,] Sin [a-záéíóúñ][^.!?\n]{0,24}[.,](?: Solo [^.!?\n]{1,40}[.!])?|\b(?:Así de simple|Así de fácil|Punto)\.(?=\s|$)/g,
  },
  EN.find((r) => r.id === "emoji")!,
];

const ES_HINTS = /(?<![\p{L}])(?:el|la|los|las|de|del|que|y|en|un|una|para|con|por|es|tu|nuestro|nuestra|más|cómo|qué)(?![\p{L}])/giu;
const EN_HINTS = /\b(?:the|of|and|to|in|a|is|for|with|your|our|that|you|we|more|how|what)\b/gi;

export function detectLang(text: string, htmlLang?: string): "en" | "es" {
  const es = (text.match(ES_HINTS) ?? []).length;
  const en = (text.match(EN_HINTS) ?? []).length;
  if (es + en < 12 && htmlLang) return htmlLang.toLowerCase().startsWith("es") ? "es" : "en";
  return es > en ? "es" : "en";
}

function sentenceAround(block: string, index: number, length: number): string {
  let start = 0;
  const before = block.slice(0, index);
  const m = /[.!?…]\s+(?=[^.!?…]*$)/.exec(before);
  if (m) start = m.index + m[0].length;
  const after = /[.!?…](?:\s|$)/.exec(block.slice(index + length));
  const end = after ? index + length + after.index + 1 : block.length;
  const s = block.slice(start, end).trim();
  return s.length > 220 ? `${s.slice(0, 217)}...` : s;
}

const MIN_WORDS = 40;
const MAX_FLAGS = 60;
const PER_RULE_CAP = 12;

/** blocks: the page's visible text, one entry per heading, paragraph or list item. */
export function checkCopy(blocks: string[], htmlLang?: string): CopyResult {
  const all = blocks.join("\n");
  const wordCount = (all.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
  const lang = detectLang(all, htmlLang);
  if (wordCount < MIN_WORDS) {
    return {
      score: 0,
      lang,
      words: wordCount,
      flags: [],
      note: "Under 40 words of text in the page's HTML. The copy is probably drawn by JavaScript, so it was not checked.",
    };
  }
  const rules = lang === "es" ? ES : EN;
  const flags: CopyFlag[] = [];
  let points = 0;
  for (const rule of rules) {
    let n = 0;
    for (const block of blocks) {
      rule.re.lastIndex = 0;
      for (const m of block.matchAll(rule.re)) {
        if (n >= PER_RULE_CAP) break;
        n++;
        points += rule.weight;
        if (flags.length < MAX_FLAGS) {
          flags.push({
            rule: rule.id,
            tell: rule.tell,
            why: rule.why,
            line: sentenceAround(block, m.index ?? 0, m[0].length),
            match: m[0].trim().slice(0, 80),
          });
        }
      }
    }
  }
  const density = (points / Math.max(wordCount, 80)) * 100;
  const score = Math.min(100, Math.round(100 * (1 - Math.exp(-density / 5))));
  return { score, lang, words: wordCount, flags };
}
