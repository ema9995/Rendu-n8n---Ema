const chunking_Trigger = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: { name: 'Chunking Trigger', parameters: { workflowInputs: { values: [{ name: 'content' }, { name: 'metadata' }] } }, position: [1344, -1872], notes: 'Entry point of this sub-workflow. It receives the embedding batches prepared by the parent workflow, one item per batch, and passes them through untouched.', notesInFlow: true }
});

const embed_Chunks = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embed Chunks', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ { requests: [ { model: "models/gemini-embedding-001", content: { parts: [ { text: $json.content } ] }, outputDimensionality: 1536 } ] } }}'), options: {} }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 6', 'moSLRmexWFT9Xmqf') }, position: [1568, -1872], notes: 'Vectorisation step. One Gemini batchEmbedContents call per batch, at 1536 dimensions so pgvector can keep a real HNSW index. One call per minute with small batches keeps under the Gemini tokens-per-minute quota. No automatic retry: a retry replays every batch from the start and burns the daily quota.', notesInFlow: true }
});

const merge_Chunks_with_Vectors = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Merge Chunks with Vectors', parameters: { assignments: { assignments: [{ id: 'emb', name: 'embeddingJson', type: 'string', value: expr('{{ JSON.stringify($json.embeddings[0].values) }}') }, { id: 'meta', name: 'metadataJson', type: 'string', value: expr('{{ $(\'Chunking Trigger\').item.json.metadata || "{}" }}') }] }, options: {} }, position: [1840, -1888] }
});

const insert_Chunks_with_SQL_Query = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Insert Chunks with SQL Query', parameters: { operation: 'executeQuery', query: 'insert into documents_v2 (content, metadata, embedding, keywords, book)\nvalues ($1, $2::jsonb, $3::vector, array(select jsonb_array_elements_text(coalesce($2::jsonb->\'keywords\', \'[]\'::jsonb))), nullif($2::jsonb->>\'book\', \'\'))\nreturning id;', options: { queryBatching: 'independently', queryReplacement: expr('{{ [ $(\'Chunking Trigger\').item.json.content, $json.metadataJson, $json.embeddingJson ] }}') } }, credentials: { postgres: newCredential('Postgres account', '4ow0IG7roBxAxCIi') }, position: [2400, -1968], notes: 'Writes the chunks with a plain SQL insert, one prepared statement per chunk, so the vector and the metadata travel as parameters instead of being pasted into the query string. Returning id gives the parent workflow one row per stored chunk, which is what the indexing report counts. Needs the documents_v2 table from the setup note.', notesInFlow: true }
});

const on_form_submission = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: { name: 'On form submission', parameters: { formTitle: 'Upload du livre', formFields: { values: [{ fieldLabel: 'Titre du livre', placeholder: 'Ex : An Internet in Your Head (Daniel Graham)', requiredField: true }, { fieldLabel: 'PDF', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.pdf', requiredField: true }] }, options: {} }, position: [-16, -2128], webhookId: '67c62303-a0d9-4c1e-9a54-f1869942b4fa' }
});

const extract_from_File = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: { name: 'Extract from File', parameters: { operation: 'pdf', binaryPropertyName: expr('{{ Object.keys($binary ?? {})[0] ?? "data" }}'), options: {} }, position: [240, -2128] }
});

const edit_Fields = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Edit Fields', parameters: { options: {} }, position: [464, -2128] }
});

const clean = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Clean', parameters: { jsCode: '// Cleans the raw PDF text: fixes hyphenated line breaks, removes control characters,\n// page numbers, roman numerals and running headers (short lines repeated on many pages).\nconst out = [];\nconst inputs = $(\'Extract from File\').all();\n\nfor (const item of inputs) {\n  let text = String(item.json.text ?? \'\');\n  text = text\n    .replace(/\\r\\n?/g, \'\\n\')\n    .replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]/g, \'\')\n    .replace(/(\\w)-\\n(\\w)/g, \'$1$2\');\n\n  const lines = text.split(\'\\n\').map((l) => l.replace(/[ \\t]+/g, \' \').trim());\n  const counts = {};\n  for (const l of lines) if (l && l.length <= 80) counts[l] = (counts[l] || 0) + 1;\n\n  const kept = lines.filter((l) => {\n    if (/^\\d+$/.test(l)) return false;\n    if (/^[ivxlc]{1,6}$/.test(l)) return false;\n    if (l && counts[l] >= 5 && !/[.!?]$/.test(l)) return false;\n    return true;\n  });\n\n  text = kept.join(\'\\n\').replace(/\\n{3,}/g, \'\\n\\n\').trim();\n  out.push({ json: { text, chars: text.length, pages: Number(item.json.numpages) || 0 } });\n}\n\nreturn out;' }, position: [688, -2128] }
});

const chunking = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Chunking', parameters: { jsCode: '// One chunk per chapter. Chapter headings are detected as short lines written in\n// capitals (or "Chapter 3: ...", "Chapitre 3", "Part II"...). Figures, tables and\n// spaced letters are ignored. Very short sections are merged into the next one.\n// Back matter (notes, bibliography, index...) is kept as one chunk per section,\n// without splitting inside it. If no chapter structure is found, falls back to\n// size-based chunks (about 1 every 2 pages).\nconst MIN_SECTION_CHARS = 2000;\nconst START = \'Début\';\nconst BACK_MATTER = /^(notes|bibliography|bibliographie|references|références|index|glossary|glossaire|appendix|annexes?|sources)$/i;\n\nfunction isHeadingLine(t) {\n  if (!t || t.length > 80) return false;\n  if (/^(figure|fig\\.|table|tableau|image|source)\\b/i.test(t)) return false;\n  if (/^(chapter|chapitre|partie|part)\\s+(\\d+|[ivxlc]+)\\s*([:.\\-—–]\\s*\\S.*)?$/i.test(t) && !/[.,;]$/.test(t)) return true;\n  const tokens = t.split(/\\s+/);\n  const singles = tokens.filter((w) => w.replace(/[^A-Za-zÀ-ÿ]/g, \'\').length === 1).length;\n  if (tokens.length >= 3 && singles / tokens.length > 0.5) return false;\n  const letters = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, \'\');\n  if (letters.length < 4) return false;\n  if (t !== t.toUpperCase()) return false;\n  if (/[.;]$/.test(t)) return false;\n  return true;\n}\n\nfunction splitByChapters(text) {\n  const lines = text.split(\'\\n\').map((l) => l.trim());\n  const heading = lines.map((l) => isHeadingLine(l));\n  // A heading line ending with a comma or colon only counts when the next line is a heading too.\n  for (let i = 0; i < lines.length; i++) {\n    if (heading[i] && /[,:]$/.test(lines[i]) && !heading[i + 1]) heading[i] = false;\n  }\n\n  const sections = [];\n  let current = { title: START, lines: [] };\n  let backMatter = false;\n  let i = 0;\n  while (i < lines.length) {\n    if (heading[i]) {\n      const parts = [];\n      while (i < lines.length && heading[i]) {\n        parts.push(lines[i]);\n        i++;\n      }\n      const isBack = parts.some((p) => BACK_MATTER.test(p));\n      if (backMatter && !isBack) {\n        current.lines.push(...parts);\n        continue;\n      }\n      if (isBack) backMatter = true;\n      if (current.lines.join(\'\').trim()) sections.push(current);\n      current = { title: parts.join(\' \'), lines: [] };\n      continue;\n    }\n    current.lines.push(lines[i]);\n    i++;\n  }\n  if (current.lines.join(\'\').trim()) sections.push(current);\n\n  const withText = sections.map((s) => {\n    const body = s.lines.join(\'\\n\').trim();\n    return { title: s.title, text: s.title === START ? body : s.title + \'\\n\\n\' + body };\n  });\n\n  const merged = [];\n  let carry = \'\';\n  let carryTitle = \'\';\n  for (let k = 0; k < withText.length; k++) {\n    const s = withText[k];\n    const t = carry ? carry + \'\\n\\n\' + s.text : s.text;\n    const title = carry && carryTitle !== START ? carryTitle : s.title;\n    if (t.length < MIN_SECTION_CHARS && k < withText.length - 1) {\n      carry = t;\n      carryTitle = title;\n      continue;\n    }\n    carry = \'\';\n    carryTitle = \'\';\n    if (t.length < MIN_SECTION_CHARS && merged.length) {\n      merged[merged.length - 1].text += \'\\n\\n\' + t;\n    } else {\n      merged.push({ title, text: t });\n    }\n  }\n  return merged;\n}\n\nfunction splitBySize(text, pages) {\n  const target = Math.max(1, Math.round(pages * 0.5));\n  const size = Math.max(200, Math.ceil(text.length / target));\n  const res = [];\n  let start = 0;\n  while (start < text.length) {\n    let end = Math.min(start + size, text.length);\n    if (end < text.length) {\n      const slice = text.slice(start, end);\n      const cut = Math.max(slice.lastIndexOf(\'\\n\\n\'), slice.lastIndexOf(\'. \'));\n      if (cut > size * 0.5) end = start + cut + 1;\n    }\n    res.push({ title: \'\', text: text.slice(start, end).trim() });\n    start = end;\n  }\n  return res.filter((r) => r.text);\n}\n\n// Embedding models only read a limited input (Gemini: 2048 tokens, about 8000 chars).\n// Chapters longer than MAX_CHARS are split into parts at paragraph or sentence\n// boundaries, with a small overlap that starts at a sentence, and each part keeps\n// the chapter title at the top.\nconst MAX_CHARS = 6000;\nconst OVERLAP_CHARS = 300;\n\nfunction splitLong(title, text) {\n  if (text.length <= MAX_CHARS) return [text];\n  const header = title ? title + \'\\n\\n\' : \'\';\n  const body = title && text.startsWith(title) ? text.slice(title.length).trim() : text;\n  const room = MAX_CHARS - header.length;\n  const parts = [];\n  let start = 0;\n  while (start < body.length) {\n    let end = Math.min(start + room, body.length);\n    if (end < body.length) {\n      const slice = body.slice(start, end);\n      let cut = slice.lastIndexOf(\'\\n\\n\');\n      if (cut < room * 0.5) cut = Math.max(slice.lastIndexOf(\'. \'), slice.lastIndexOf(\'.\\n\'));\n      if (cut < room * 0.5) cut = slice.lastIndexOf(\' \');\n      if (cut > 0) end = start + cut + 1;\n    }\n    parts.push(header + body.slice(start, end).trim());\n    if (end >= body.length) break;\n    // Overlap: go back a little, then move forward to the next sentence start.\n    let next = Math.max(start + 1, end - OVERLAP_CHARS);\n    const window = body.slice(next, end);\n    const m = window.search(/[.!?]\\s+\\S/);\n    if (m >= 0) {\n      next = next + m + 1;\n      while (next < end && /\\s/.test(body[next])) next++;\n    } else {\n      next = end;\n    }\n    start = next;\n  }\n  return parts.filter((p) => p.trim());\n}\n\n// Keywords: the most frequent meaningful words of the chunk (stop words removed).\nconst STOP = new Set((\'the and for that with this from have are was were they their them there which what when where who whom will would could should about into than then also been being more most some such only other over very just your you our its his her she him not but can all any each how why may might must does did done one two out own same too few off per via le la les des une un et est que qui dans pour par sur pas plus avec son ses ces cette mais ont aux elle il ils nous vous leur leurs comme tout tous être sont été fait faire peut entre sans sous chapter chapitre\').split(\' \'));\nfunction topKeywords(t, max) {\n  const counts = {};\n  for (const w of t.toLowerCase().split(/[^a-zà-ÿ]+/)) {\n    if (w.length < 4 || STOP.has(w)) continue;\n    counts[w] = (counts[w] || 0) + 1;\n  }\n  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, max || 12);\n}\n\nconst out = [];\nfor (const item of $input.all()) {\n  const text = String(item.json.text ?? \'\');\n  const pages = Number(item.json.pages) || Math.max(1, Math.round(text.length / 2500));\n  let sections = splitByChapters(text);\n  let method = \'chapter\';\n  if (sections.length < 2) {\n    sections = splitBySize(text, pages);\n    method = \'size\';\n  }\n  let n = 0;\n  sections.forEach((s, idx) => {\n    const parts = splitLong(s.title, s.text);\n    parts.forEach((p, pi) => {\n      n++;\n      out.push({\n        json: {\n          chunk: n,\n          chapterIndex: idx + 1,\n          chapter: s.title,\n          part: pi + 1,\n          parts: parts.length,\n          text: p,\n          keywords: topKeywords(p, 12),\n          chars: p.length,\n          pages,\n          method,\n        },\n      });\n    });\n  });\n}\n\nreturn out;' }, position: [912, -2128] }
});

const limit = node({
  type: 'n8n-nodes-base.limit',
  version: 1,
  config: { name: 'Limit', parameters: { maxItems: 5 }, position: [1136, -2128] }
});

const call_RAG_Livre_2_Chunking = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: { name: 'Call \'RAG Livre 2 Chunking\'', parameters: { workflowId: { __rl: true, value: 'Abd2yYNGh1GHfMIR', mode: 'list', cachedResultUrl: '/workflow/Abd2yYNGh1GHfMIR', cachedResultName: 'RAG Livre 2 Chunking' }, workflowInputs: { mappingMode: 'defineBelow', value: { content: expr('{{ $json.text }}'), metadata: expr('{{ JSON.stringify({ chunk: $json.chunk, chapter: $json.chapter, chapterIndex: $json.chapterIndex, part: $json.part, parts: $json.parts, method: $json.method, keywords: $json.keywords || [], book: String($("On form submission").first().json["Titre du livre"] || "").trim() }) }}') }, matchingColumns: ['content'], schema: [{ id: 'content', displayName: 'content', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false }, { id: 'metadata', displayName: 'metadata', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false }], attemptToConvertTypes: false, convertFieldsToString: true }, mode: 'each', options: {} }, position: [1360, -2128] }
});

const when_chat_message_received = trigger({
  type: '@n8n/n8n-nodes-langchain.chatTrigger',
  version: 1.5,
  config: { name: 'When chat message received', parameters: { options: { responseMode: 'lastNode' } }, position: [-208, -1840], webhookId: '21641aa6-d7b6-4131-b516-762c71e0d7f6' }
});

const load_History = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Load History', parameters: { operation: 'executeQuery', query: 'select role, content from (select role, content, created_at from chat_history where session_id = $1 order by created_at desc limit 8) t order by created_at asc;', options: { queryReplacement: expr('{{ [ $json.sessionId ] }}') } }, credentials: { postgres: newCredential('Postgres account', '4ow0IG7roBxAxCIi') }, position: [-16, -1856], notes: 'Reads the last 8 messages of this chat session so follow-ups like yes or continue are understood.', notesInFlow: true, alwaysOutputData: true }
});

const list_Books = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'List Books', parameters: { operation: 'executeQuery', query: 'select book, max(id) as last_id from documents_v2 where book is not null group by book order by last_id desc;', options: {} }, credentials: { postgres: newCredential('Postgres account', '4ow0IG7roBxAxCIi') }, position: [320, -1856], notes: 'Lists the indexed books, most recently uploaded first. The chat answers from the book you name, otherwise from the latest one.', notesInFlow: true, executeOnce: true, alwaysOutputData: true }
});

const extract_Question_Keywords = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Extract Question Keywords', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ { systemInstruction: { parts: [ { text: "You turn the last user message into a standalone search question about one book of a library (the books can be in any language). Available books, most recently uploaded first: " + $("List Books").all().map(i => i.json.book).filter(b => b).join(" | ") + ". Choose the target book: the book the LAST user message names or clearly refers to (title, author, or topic); otherwise the first book of the list (the latest upload). Do not pick a book only because earlier messages talked about it. Never add a title or an author to the question that the user did not write in the last message. Use the conversation history to resolve follow-ups (yes, ok, go on, continue, tell me more, and pronouns): if the assistant proposed something and the user agrees, the standalone question is exactly that proposal. Write the question in the language of the user. Also give up to 10 single lowercase keywords, no stop words: give each important keyword both in English and in French, since the books can be in either language. For a greeting or thanks with no topic, keep the message as the question and give an empty keyword list. Reply only with a JSON object with the keys book (exact title copied from the list), question (string) and keywords (array of strings)." } ] }, contents: [ { role: "user", parts: [ { text: "Conversation history:\\n" + ($("Load History").all().filter(i => i.json.role).map(i => (i.json.role === "user" ? "User" : "Assistant") + ": " + String(i.json.content).slice(0, 1500)).join("\\n") || "(none)") + "\\n\\nLast user message: " + $("When chat message received").first().json.chatInput } ] } ], generationConfig: { temperature: 0, responseMimeType: "application/json" } } }}'), options: {} }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 6', 'moSLRmexWFT9Xmqf') }, position: [192, -1856], executeOnce: true, retryOnFail: true, maxTries: 4, waitBetweenTries: 5000 }
});

const parse_Keywords = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Parse Keywords', parameters: { assignments: { assignments: [{ id: 'q', name: 'question', type: 'string', value: expr('{{ (() => { const msg = $("When chat message received").first().json.chatInput; const t = (($json.candidates || [])[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || "").join("").trim().replace(/^```(json)?/, "").replace(/```$/, ""); try { return String(JSON.parse(t).question || "").trim() || msg; } catch (e) { return msg; } })() }}') }, { id: 'b', name: 'book', type: 'string', value: expr('{{ (() => { const books = $("List Books").all().map(i => i.json.book).filter(b => b); const t = (($json.candidates || [])[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || "").join("").trim().replace(/^```(json)?/, "").replace(/```$/, ""); let b = ""; try { b = String(JSON.parse(t).book || "").trim(); } catch (e) {} const hit = books.find(x => x.toLowerCase() === b.toLowerCase()) || books.find(x => b && (x.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(x.toLowerCase()))); return hit || books[0] || ""; })() }}') }, { id: 'k', name: 'keywords', type: 'array', value: expr('{{ (() => { const t = (($json.candidates || [])[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || "").join("").trim().replace(/^```(json)?/, "").replace(/```$/, ""); try { return (JSON.parse(t).keywords || []).map(s => String(s).toLowerCase().trim()).filter(s => s && !s.includes(" ")); } catch (e) { return []; } })() }}') }] }, options: {} }, position: [544, -1856] }
});

const embed_Question = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embed Question', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ { requests: [ { model: "models/gemini-embedding-001", content: { parts: [ { text: $json.question } ] }, outputDimensionality: 1536 } ] } }}'), options: {} }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 6', 'moSLRmexWFT9Xmqf') }, position: [768, -1856] }
});

const route_and_Search = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Route and Search', parameters: { operation: 'executeQuery', query: 'select id, content, metadata, book,\n  1 - (embedding <=> $1::vector) as similarity,\n  cardinality(array(select unnest(coalesce(keywords, \'{}\')) intersect select jsonb_array_elements_text($2::jsonb))) as keyword_hits\nfrom documents_v2\nwhere book = $3\norder by (embedding <=> $1::vector) - 0.05 * cardinality(array(select unnest(coalesce(keywords, \'{}\')) intersect select jsonb_array_elements_text($2::jsonb)))\nlimit 6;', options: { queryReplacement: expr('{{ [ JSON.stringify($("Embed Question").item.json.embeddings[0].values), JSON.stringify($("Parse Keywords").item.json.keywords), $("Parse Keywords").item.json.book ] }}') } }, credentials: { postgres: newCredential('Postgres account', '4ow0IG7roBxAxCIi') }, position: [912, -1856], notes: 'Routing by keywords: chunks sharing keywords with the question get a bonus. With no keywords (greeting, vague question) the bonus is 0, so it is a pure vector search.', notesInFlow: true, alwaysOutputData: true }
});

const build_Context = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Build Context', parameters: { assignments: { assignments: [{ id: 'q', name: 'question', type: 'string', value: expr('{{ $("Parse Keywords").first().json.question }}') }, { id: 'bk', name: 'book', type: 'string', value: expr('{{ $("Parse Keywords").first().json.book }}') }, { id: 'm', name: 'message', type: 'string', value: expr('{{ $("When chat message received").first().json.chatInput }}') }, { id: 'h', name: 'history', type: 'string', value: expr('{{ $("Load History").all().filter(i => i.json.role).map(i => (i.json.role === "user" ? "Utilisateur" : "Assistant") + " : " + String(i.json.content).slice(0, 2000)).join("\\n") || "(début de conversation)" }}') }, { id: 'n', name: 'passages', type: 'number', value: expr('{{ $input.all().filter(i => i.json.content).length }}') }, { id: 'c', name: 'context', type: 'string', value: expr('{{ $input.all().filter(i => i.json.content).map((i, n) => "[Extrait " + (n + 1) + " | Livre : " + (i.json.book || (i.json.metadata || {}).book || "inconnu") + " | Chapitre : " + ((i.json.metadata || {}).chapter || "") + " | similarité " + Number(i.json.similarity).toFixed(2) + "]\\n" + i.json.content).join("\\n\\n---\\n\\n") || "AUCUN EXTRAIT TROUVÉ" }}') }] }, options: {} }, position: [1440, -1680], executeOnce: true }
});

const generate_Answer = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Generate Answer', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ { systemInstruction: { parts: [ { text: "Tu es un assistant qui aide à comprendre les livres d\'une bibliothèque. Chaque extrait indique le livre et le chapitre dont il vient. Règles : 1) Appuie-toi sur les extraits fournis et cite le livre et les chapitres utilisés. Tous les extraits viennent du livre interrogé : réponds uniquement sur ce livre, même si l\'historique parlait d\'un autre livre. 2) Tiens compte de l\'historique : un message court comme oui, ok, vas-y, continue ou plus de détails répond à ta dernière proposition ; réalise-la directement, sans jamais répondre que ce n\'est pas une question. La question reformulée indique ce qui est demandé. 3) Réponds uniquement avec ce que contiennent les extraits, sans inventer. Ne mentionne jamais ce qui manque, ce que les extraits ne couvrent pas, ni les limites des extraits. 4) Pour une salutation ou un remerciement, réponds brièvement et propose ton aide sur le livre. 5) Réponds dans la langue de l\'utilisateur, de façon claire et structurée. 6) Ne propose une suite que si elle est réellement couverte par les livres." } ] }, contents: [ { role: "user", parts: [ { text: "Historique récent :\\n" + $json.history + "\\n\\nDernier message de l\'utilisateur : " + $json.message + "\\n\\nLivre interrogé : " + $json.book + "\\n\\nDemande reformulée : " + $json.question + "\\n\\nExtraits du livre :\\n" + $json.context } ] } ], generationConfig: { temperature: 0.3, maxOutputTokens: 2048 } } }}'), options: {} }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 6', 'moSLRmexWFT9Xmqf') }, position: [1664, -1680], retryOnFail: true, maxTries: 5, waitBetweenTries: 5000 }
});

const format_Reply = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Format Reply', parameters: { assignments: { assignments: [{ id: 'o', name: 'output', type: 'string', value: expr('{{ (($json.candidates || [])[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || "").join("").trim() || "Désolé, je n\'ai pas pu générer de réponse." }}') }] }, options: {} }, position: [1856, -1664] }
});

const save_History = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Save History', parameters: { operation: 'executeQuery', query: 'insert into chat_history (session_id, role, content) values ($1, \'user\', $2), ($1, \'assistant\', $3) returning id;', options: { queryReplacement: expr('{{ [ $("When chat message received").first().json.sessionId, $("When chat message received").first().json.chatInput, $json.output ] }}') } }, credentials: { postgres: newCredential('Postgres account', '4ow0IG7roBxAxCIi') }, position: [2080, -1648], notes: 'Stores the question and the answer for the next turn of this chat session.', notesInFlow: true }
});

const send_Reply = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Send Reply', parameters: { assignments: { assignments: [{ id: 'o', name: 'output', type: 'string', value: expr('{{ $("Format Reply").first().json.output }}') }] }, options: {} }, position: [2288, -1616], executeOnce: true }
});

const wf = workflow('Abd2yYNGh1GHfMIR', 'Chat livre', { executionOrder: 'v1', availableInMCP: true, description: 'Chunking sub-workflow of the second book pipeline: receives embedding batches from its parent, turns them into Gemini vectors and writes each chunk into the documents_v2 table with a SQL insert.', binaryMode: 'separate' });

export default wf
  .add(chunking_Trigger)
  .to(embed_Chunks)
  .to(merge_Chunks_with_Vectors)
  .to(insert_Chunks_with_SQL_Query)
  .add(sticky('## What this sub-workflow owns\n\n1. **Chunking Trigger** receives the batches built by the parent.\n2. **Embed Chunks** calls Gemini batchEmbedContents, one call per minute, 1536 dimensions.\n3. **Merge Chunks with Vectors** pairs every vector back to its chunk and turns it into JSON text.\n4. **Insert Chunks with SQL Query** stores one row per chunk with prepared statements.\n5. **Store Report** returns a short confirmation to the parent.\n\n## Why a SQL insert and not the Supabase node\nThe Supabase node only does row create, read, update and delete. There is no execute query operation on it, so the insert runs through the Postgres connection instead. The benefit is real: the vector and the metadata travel as prepared statement parameters, so chunk text containing an apostrophe or a dollar sign can never break the statement.\n\n## Two details that break it\n- The vector must reach the query as text, not as an array. The Postgres driver turns a raw array into a Postgres array literal, and the cast to vector then fails. **Merge Chunks with Vectors** is what serializes it.\n- Query batching is set to independently, so one insert runs per chunk instead of one statement for the whole batch.', [], { name: 'Sticky Note Chunking Usage', color: 2, width: 620, height: 640, position: [48, -1552] }))
  .add(on_form_submission)
  .to(extract_from_File)
  .to(edit_Fields)
  .to(clean)
  .to(chunking)
  .to(limit)
  .to(call_RAG_Livre_2_Chunking)
  .add(when_chat_message_received)
  .to(load_History)
  .to(list_Books)
  .to(extract_Question_Keywords)
  .to(parse_Keywords)
  .to(embed_Question)
  .to(route_and_Search)
  .to(build_Context)
  .to(generate_Answer)
  .to(format_Reply)
  .to(save_History)
  .to(send_Reply)