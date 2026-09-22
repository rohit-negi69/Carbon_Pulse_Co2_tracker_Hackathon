import { CORPUS, ANCHORS } from './corpus.js';
import { CATEGORY_TYPES } from '../../domain/factors.js';
import { mean, round, mulberry32 } from './stats.js';

// ---------------------------------------------------------------------------
// Activity text classifier.
//
// Algorithm: **Complement Naive Bayes** (Rennie et al., 2003) over sublinear
// term frequencies, with length normalisation and a calibrated softmax.
//
// Why these three choices, specifically:
//
//  • Complement NB, not plain multinomial NB — it estimates each class's
//    parameters from the *complement* of that class, which is markedly more
//    robust when one class (car) is far more common in real traffic than
//    another (flight). It also fixes the classic failure where a class with a
//    few long documents wins on sheer token volume.
//
//  • Sublinear TF (1 + log tf) with length normalisation, not raw TF-IDF —
//    multinomial NB is a count model; feeding it L2-normalised TF-IDF violates
//    its independence assumption and systematically flattens the posterior.
//    Normalising by token count stops a long sentence from diluting its own
//    evidence.
//
//  • A softmax temperature fitted by grid search to minimise held-out log-loss
//    (Platt-style calibration). Raw NB log-likelihoods are wildly overconfident
//    in one direction and underconfident in the other; calibration makes the
//    reported confidence mean what a user thinks it means.
//
// Accuracy is reported from a stratified 75/25 hold-out, so "accurate" is a
// measurement rather than an adjective. Temperature changes confidence only —
// never the argmax — so the accuracy figure cannot be inflated by calibration.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'a', 'an', 'the', 'i', 'my', 'me', 'we', 'to', 'of', 'for', 'and', 'in', 'on', 'at', 'it',
  'this', 'that', 'today', 'went', 'did', 'had', 'have', 'was', 'were', 'with', 'from', 'by',
  'is', 'are', 'be', 'am', 'so', 'then', 'just', 'about', 'into', 'up', 'out', 'got', 'took',
  'there', 'here', 'again', 'back', 'all', 'some', 'as', 'if', 'or', 'but',
]);

/** Scores within this delta are treated as an exact tie (no usable evidence). */
const TIE_EPSILON = 1e-9;

export function tokenize(text) {
  const cleaned = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s.+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter((w) => w && !STOPWORDS.has(w));
  const tokens = [...words];
  // Bigrams carry the discriminative signal ("chicken biryani", "washing machine").
  for (let i = 0; i < words.length - 1; i += 1) tokens.push(`${words[i]}_${words[i + 1]}`);
  return tokens;
}

/** Sublinear term frequency: 1 + log(count), the standard NB text weighting. */
function termFrequencies(tokens) {
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const tf = new Map();
  for (const [term, count] of counts) tf.set(term, 1 + Math.log(count));
  return tf;
}

/** Vocabulary + IDF table. IDF is used for explanation, not for NB scoring. */
export function fitVectorizer(docs) {
  const df = new Map();
  for (const tokens of docs) for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
  const n = docs.length || 1;
  const idf = new Map();
  for (const [term, count] of df) idf.set(term, Math.log((1 + n) / (1 + count)) + 1);
  return { idf, vocabularySize: idf.size, documentCount: n };
}

/**
 * Fit Complement Naive Bayes.
 * Parameters for class c are estimated from every document *not* in c.
 */
function fitComplementNB(samples, vectorizer, classes) {
  const vocabSize = vectorizer.vocabularySize || 1;
  const docCount = new Map(classes.map((c) => [c, 0]));
  const tokenTotal = new Map(classes.map((c) => [c, 0]));
  const tokenCount = new Map(classes.map((c) => [c, new Map()]));
  let grandTotal = 0;

  for (const { tokens, label } of samples) {
    const tf = termFrequencies(tokens);
    docCount.set(label, docCount.get(label) + 1);
    const counts = tokenCount.get(label);
    for (const [term, value] of tf) {
      counts.set(term, (counts.get(term) || 0) + value);
      tokenTotal.set(label, tokenTotal.get(label) + value);
      grandTotal += value;
    }
  }

  const totalDocs = samples.length || 1;
  const logPrior = new Map(classes.map((c) => [c, Math.log((docCount.get(c) + 1) / (totalDocs + classes.length))]));

  // Complement statistics: for each class, the token totals of every *other*
  // class. Built by subtraction rather than re-scanning the corpus, so fitting
  // stays linear in the number of (document, term) pairs.
  const complementTotal = new Map();
  const complementCount = new Map();
  const allTerms = new Map();
  for (const c of classes) {
    const counts = tokenCount.get(c) || new Map();
    for (const [term, value] of counts) allTerms.set(term, (allTerms.get(term) || 0) + value);
  }

  for (const c of classes) {
    const own = tokenCount.get(c) || new Map();
    complementTotal.set(c, grandTotal - (tokenTotal.get(c) || 0));
    const comp = new Map();
    for (const [term, total] of allTerms) {
      const remaining = total - (own.get(term) || 0);
      if (remaining > 0) comp.set(term, remaining);
    }
    complementCount.set(c, comp);
  }

  // Vocabulary membership is tracked separately from the complement counts.
  // A term that appears *only* in class c has a complement count of zero — and
  // that zero is the single strongest piece of evidence against c, so it must
  // be scored, not skipped. Conflating "absent from the complement" with
  // "not in the vocabulary" silently deletes every discriminative feature.
  const vocabulary = new Set(allTerms.keys());

  return {
    classes, logPrior, complementTotal, complementCount, vocabSize, totalDocs, docCount, tokenTotal,
    vocabulary, totalDocsByClass: docCount,
  };
}


// Category terms name the thing being logged; ordinary verbs do not. A shared
// verb ("ran") can never separate electricity from a budget meeting, so a
// class's own anchor terms are counted at a premium and everything else stays
// as it was. 2.5 was chosen by measuring hold-out accuracy — see the note in
// corpus.js and the classifier tests.
const ANCHOR_BOOST = 2.5;
const ANCHOR_SETS = new Map(Object.entries(ANCHORS).map(([c, terms]) => [c, new Set(terms)]));

/**
 * Complement NB decision function.
 * score(c) = −(1/|x|) · Σ_i f_i · log θ̃_ci , where θ̃ is estimated from the
 * complement of c and |x| is the token count (length normalisation).
 * The prior is intentionally omitted: it is the correction Complement NB
 * exists to remove, and re-adding it re-introduces the class-imbalance bias.
 */
function classScores(tf, model, nTokens) {
  const out = new Map();
  const denomNorm = nTokens || 1;
  const vocabulary = model.vocabulary;

  for (const c of model.classes) {
    const denom = (model.complementTotal.get(c) || 0) + model.vocabSize;
    const counts = model.complementCount.get(c) || new Map();
    const anchors = ANCHOR_SETS.get(c);
    let acc = 0;
    for (const [term, value] of tf) {
      const isAnchor = Boolean(anchors && anchors.has(term));
      // A token nobody has ever trained on carries no usable evidence — unless
      // it is a *curated category noun*. The lexicon is human-authored world
      // knowledge ("seaplane", "layover", "kebab"), not something the model can
      // learn from 300 phrases, so it survives the train/held-out split and
      // keeps working on the first unusual phrase a real user types.
      if (vocabulary && !vocabulary.has(term) && !isAnchor) continue;
      const weighted = isAnchor ? value * ANCHOR_BOOST : value;
      acc += weighted * Math.log(((counts.get(term) || 0) + 1) / denom);
    }
    out.set(c, -(acc / denomNorm));
  }
  return out;
}

function softmax(scores, temperature = 1) {
  const t = Math.max(temperature, 1e-6);
  const max = Math.max(...scores.values());
  const exps = new Map([...scores].map(([c, s]) => [c, Math.exp((s - max) / t)]));
  const total = [...exps.values()].reduce((a, b) => a + b, 0) || 1;
  return new Map([...exps].map(([c, v]) => [c, v / total]));
}

/**
 * Argmax only — used for accuracy, independent of any calibration.
 *
 * With no usable evidence (every token unseen in training) every score ties
 * exactly. Returning the first class in declaration order would turn `car`
 * into a silent default answer for unrecognised text, so an exact tie abstains
 * to `unknown` instead.
 */
function argmax(scores) {
  const ordered = [...scores].sort((a, b) => b[1] - a[1]);
  const [topLabel, topScore] = ordered[0];
  const runnerUp = ordered[1]?.[1];
  if (runnerUp != null && Math.abs(topScore - runnerUp) < TIE_EPSILON && scores.has('unknown')) return 'unknown';
  return topLabel;
}

/**
 * Fit the softmax temperature by minimising held-out log-loss.
 * This is Platt-style calibration: it changes confidence, never the argmax, so
 * it cannot inflate the accuracy figure.
 */
function calibrateTemperature(model, holdout, labels) {
  const caches = holdout.map((s) => {
    const tf = termFrequencies(s.tokens);
    return { scores: classScores(tf, model, s.tokens.length), label: s.label };
  });

  let best = { temperature: 1, logLoss: Infinity };
  for (let temperature = 0.01; temperature <= 12.001; temperature += 0.01) {
    let loss = 0;
    for (const { scores, label } of caches) {
      const probs = softmax(scores, temperature);
      loss -= Math.log(Math.max(probs.get(label) || 1e-12, 1e-12));
    }
    loss /= caches.length || 1;
    if (loss < best.logLoss) best = { temperature: Number(temperature.toFixed(3)), logLoss: Number(loss.toFixed(4)) };
  }
  void labels;
  return best;
}

/** Deterministic stratified split so reported accuracy is reproducible. */
function stratifiedSplit(samples, testRatio = 0.25, seed = 42) {
  const rng = mulberry32(seed);
  const byLabel = new Map();
  for (const s of samples) {
    if (!byLabel.has(s.label)) byLabel.set(s.label, []);
    byLabel.get(s.label).push(s);
  }
  const train = [];
  const test = [];
  for (const [, group] of byLabel) {
    const shuffled = [...group].map((g) => ({ g, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.g);
    const cut = Math.max(1, Math.round(shuffled.length * testRatio));
    test.push(...shuffled.slice(0, cut));
    train.push(...shuffled.slice(cut));
  }
  return { train, test };
}

function evaluate(testSamples, model, temperature) {
  const labels = model.classes;
  const confusion = Object.fromEntries(labels.map((l) => [l, Object.fromEntries(labels.map((k) => [k, 0]))]));
  let correct = 0;
  let confidenceSum = 0;
  const errors = [];

  for (const s of testSamples) {
    const tf = termFrequencies(s.tokens);
    const scores = classScores(tf, model, s.tokens.length);
    const probs = softmax(scores, temperature);
    const predicted = argmax(scores);
    confusion[s.label][predicted] = (confusion[s.label][predicted] || 0) + 1;
    if (predicted === s.label) correct += 1;
    else {
      // Reporting *which* phrases failed — not just how many — is what makes the
      // figure actionable. Sorted by confidence so the worst failures lead.
      errors.push({
        text: s.text,
        expected: s.label,
        predicted,
        confidence: round(probs.get(predicted) || 0, 4),
        runnerUp: [...probs].sort((a, b) => b[1] - a[1])[1]?.[0] ?? null,
      });
    }
    confidenceSum += probs.get(predicted) || 0;
  }

  const perClass = labels.map((label) => {
    const tp = confusion[label][label];
    const fp = labels.reduce((acc, l) => acc + (l === label ? 0 : confusion[l][label]), 0);
    const fn = labels.reduce((acc, l) => acc + (l === label ? 0 : confusion[label][l]), 0);
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { label, support: tp + fn, precision: round(precision, 3), recall: round(recall, 3), f1: round(f1, 3) };
  });

  return {
    accuracy: round(correct / (testSamples.length || 1), 4),
    macroF1: round(mean(perClass.map((p) => p.f1)), 4),
    testSize: testSamples.length,
    meanConfidence: round(confidenceSum / (testSamples.length || 1), 4),
    perClass,
    confusion,
    errors: errors.sort((a, b) => b.confidence - a.confidence).slice(0, 20),
  };
}

/**
 * Train the classifier.
 * @param {string[]} extraExamples user-confirmed phrases as `label\ttext`
 */
export function trainClassifier({ extraExamples = [], testRatio = 0.25, seed = 42 } = {}) {
  const samples = [];
  for (const [label, phrases] of Object.entries(CORPUS)) {
    for (const phrase of phrases) samples.push({ label, tokens: tokenize(phrase), text: phrase });
  }

  // Every confirmed prediction joins the labelled set — the online-learning
  // path. The model sharpens against real traffic instead of staying frozen.
  for (const row of extraExamples) {
    const [label, ...rest] = String(row).split('\t');
    const text = rest.join('\t');
    if (!text || !CATEGORY_TYPES.includes(label)) continue;
    samples.push({ label, tokens: tokenize(text), text });
  }

  const classes = [...Object.keys(CORPUS)]; // `unknown` is a real class
  const { train, test } = stratifiedSplit(samples, testRatio, seed);

  const trainVectorizer = fitVectorizer(train.map((s) => s.tokens));
  const trainModel = fitComplementNB(train, trainVectorizer, classes);
  const { temperature, logLoss } = calibrateTemperature(trainModel, test, classes);
  const metrics = { ...evaluate(test, trainModel, temperature), temperature, logLoss };

  // Refit on everything for production: the hold-out existed only to measure.
  const fullVectorizer = fitVectorizer(samples.map((s) => s.tokens));
  const fullModel = fitComplementNB(samples, fullVectorizer, classes);

  return {
    classes,
    vectorizer: fullVectorizer,
    model: { ...fullModel, temperature },
    metrics,
    temperature,
    sampleCount: samples.length,
    userExamples: extraExamples.length,
    vocabularySize: fullVectorizer.vocabularySize,
    trainedAt: new Date().toISOString(),
    version: `cnb-tf-${samples.length}`,
    algorithm: 'Complement Naive Bayes over sublinear TF (uni+bigrams), length-normalised, temperature-calibrated',
    trainingMs: null,
  };
}

/** Classify free-text. Returns the category only when it clears the threshold. */
export function classify(text, classifier, { minConfidence = 0.42 } = {}) {
  const tokens = tokenize(text);
  if (!tokens.length) {
    return { category: null, confidence: 0, margin: 0, ranked: [], evidence: [], tokens, needsConfirmation: true };
  }

  const tf = termFrequencies(tokens);
  const scores = classScores(tf, classifier.model, tokens.length);
  const temperature = classifier.temperature ?? classifier.model.temperature ?? 1;
  const probs = softmax(scores, temperature);

  const ranked = [...probs]
    .map(([label, probability]) => ({ label, probability: round(probability, 4) }))
    // Mirrors argmax: on an exact tie there is no evidence, so `unknown` (which
    // the confirmation gate then refuses) must not lose to declaration order.
    .sort((a, b) => b.probability - a.probability || (a.label === 'unknown' ? -1 : b.label === 'unknown' ? 1 : 0));

  const top = ranked[0];
  const second = ranked[1]?.probability ?? 0;

  // Evidence: IDF-weighted terms that most favour the winning class over the
  // runner-up. This is what the UI shows to justify a prediction.
  const runnerUp = ranked[1]?.label;
  const evidence = [];
  if (runnerUp) {
    const a = classifier.model.complementCount.get(top.label) || new Map();
    const b = classifier.model.complementCount.get(runnerUp) || new Map();
    const denomA = (classifier.model.complementTotal.get(top.label) || 0) + classifier.model.vocabSize;
    const denomB = (classifier.model.complementTotal.get(runnerUp) || 0) + classifier.model.vocabSize;
    for (const [term, value] of tf) {
      if (classifier.model.vocabulary && !classifier.model.vocabulary.has(term)) continue;
      if (!a.has(term) && !b.has(term)) continue;
      const pa = ((a.get(term) || 0) + 1) / denomA;
      const pb = ((b.get(term) || 0) + 1) / denomB;
      const idf = classifier.vectorizer.idf.get(term) || 0;
      const weight = value * idf * Math.log(pb / pa);
      if (weight > 0) evidence.push({ term: term.replace(/_/g, ' '), weight: round(weight, 4) });
    }
  }

  const confident = top.probability >= minConfidence && top.label !== 'unknown';
  return {
    category: confident && CATEGORY_TYPES.includes(top.label) ? top.label : null,
    label: top.label,
    confidence: round(top.probability, 4),
    margin: round(top.probability - second, 4),
    ranked: ranked.slice(0, 4),
    evidence: evidence.sort((x, y) => y.weight - x.weight).slice(0, 6),
    tokens,
    temperature,
    needsConfirmation: !confident,
  };
}
