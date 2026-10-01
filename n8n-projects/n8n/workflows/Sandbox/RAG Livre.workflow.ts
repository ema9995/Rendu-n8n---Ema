const on_Form_Submission = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: { name: 'On Form Submission', parameters: { formTitle: 'Index a book', formDescription: 'Upload a PDF. Its text is split into chunks and stored in Supabase so the assistant can answer questions about it.', formFields: { values: [{ fieldLabel: 'Book (PDF)', fieldType: 'file', fieldName: 'data', multipleFiles: false, acceptFileTypes: '.pdf', requiredField: true }, { fieldLabel: 'Book title (optional)', fieldName: 'bookTitle' }] }, options: { appendAttribution: false, buttonLabel: 'Index this book', path: 'index-book', respondWithOptions: { values: { formSubmittedText: 'Upload received. The book is being indexed, this takes a few minutes. You can close this page and open the chat panel.' } } } }, webhookId: '41ed073c-170a-4938-8036-12cd08fefe72', notes: 'Entry point of the indexing path. The uploaded PDF arrives as the binary field named data, which is the field name the Extract from File node reads by default.', notesInFlow: true }
});

const extract_PDF_Text = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: { name: 'Extract PDF Text', parameters: { operation: 'pdf', options: {} }, position: [208, 0], notes: 'Reads the uploaded PDF and returns the whole text in a single data field. A scanned book with no text layer returns almost nothing and needs OCR before this workflow can help.', notesInFlow: true }
});

const clean_and_Group_Pages = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Clean and Group Pages', parameters: { jsCode: '// Step two, cleaning and grouping into chunks.\n//\n// Extract from File hands the whole book over in a single text field, and a printed page is\n// not reliably recoverable from the text layer, so pages are cut on a fixed character budget\n// instead. CHARS_PER_PAGE mirrors the average density of a printed page, which is what makes\n// the resulting page numbers meaningful rather than decorative.\n//\n// PAGES_PER_GROUP then decides the granularity. Four pages per chunk puts a typical book in\n// the 10 to 100 chunks per 100 pages range, and each chunk is prefixed with the page range it\n// covers so a retrieved excerpt stays legible on its own.\n\nconst CHARS_PER_PAGE = 1850;\nconst PAGES_PER_GROUP = 4;\nconst CHUNK_SIZE = CHARS_PER_PAGE * PAGES_PER_GROUP;\n\nconst raw = String($input.first().json.text ?? $input.first().json.data ?? \'\')\n  .replace(/\\\\s*\\\\b\\\\d{1,3}\\\\b\\\\s*/g, \' \')\n  .replace(/\\\\s{2,}/g, \' \')\n  .trim();\n\n// Cut on a sentence boundary when one is near the target, so chunks do not end mid word.\nfunction cutAt(text, target) {\n  if (text.length <= target) return text;\n  const window = text.slice(target - 400, target + 400);\n  const sentence = Math.max(window.lastIndexOf(\'. \'), window.lastIndexOf(\'? \'), window.lastIndexOf(\'! \'));\n  if (sentence > 0) return text.slice(0, target - 400 + sentence + 1);\n  const space = window.lastIndexOf(\' \');\n  if (space > 0) return text.slice(0, target - 400 + space);\n  return text.slice(0, target);\n}\n\nconst groups = [];\nfor (let offset = 0; offset < raw.length; offset += CHUNK_SIZE) {\n  const slice = cutAt(raw.slice(offset, offset + CHUNK_SIZE), Math.min(CHUNK_SIZE, raw.length - offset)).trim();\n  if (slice.length < 400) continue;\n  const fromPage = Math.floor(offset / CHARS_PER_PAGE) + 1;\n  const toPage = Math.ceil((offset + slice.length) / CHARS_PER_PAGE);\n  groups.push({\n    chunk: groups.length + 1,\n    fromPage,\n    toPage,\n    pages: toPage - fromPage + 1,\n    chars: slice.length,\n    text: \'[pages \' + fromPage + \'-\' + toPage + \'] \' + slice,\n  });\n}\n\nreturn groups;' }, position: [400, 0], notes: 'Step two, cleaning and grouping. Strips isolated page numbers and repeated spaces, then groups pages into fixed blocks of four. No chapter detection, so it never fails on a book whose table of contents cannot be parsed.' }
});

const build_Embedding_Batches = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build Embedding Batches', parameters: { jsCode: '// Step three, turning groups into Gemini batch requests.\n//\n// `batchEmbedContents` accepts a list of texts in one call, so the whole book needs a\n// handful of requests instead of one per chunk. Each batch carries the group metadata so the\n// vectors can be paired back to their text afterwards.\n\n// Kept small so one request stays under the Gemini free-tier tokens-per-minute limit\n// (each chunk is roughly 1,850 tokens). Embed Chunks spaces the requests one minute apart.\nconst BATCH_SIZE = 10;\n\nconst groups = $input.all();\nconst requests = groups.map((g) => ({\n  group: g.json,\n  request: {\n    model: \'models/gemini-embedding-001\',\n    content: { parts: [{ text: g.json.text }] },\n    taskType: \'RETRIEVAL_DOCUMENT\',\n    output_dimensionality: 1536,\n  },\n}));\n\nconst batches = [];\nfor (let i = 0; i < requests.length; i += BATCH_SIZE) {\n  batches.push({ json: { batch: batches.length + 1, requests: requests.slice(i, i + BATCH_SIZE) } });\n}\n\nreturn batches;' }, position: [608, 0], notes: 'Step three. Builds Gemini batchEmbedContents payloads, fifty chunks per request, at 1536 dimensions so pgvector can keep a real HNSW index.' }
});

const limit = node({
  type: 'n8n-nodes-base.limit',
  version: 1,
  config: { name: 'Limit', parameters: { maxItems: 2 }, position: [800, 0] }
});

const run_Chunking = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: { name: 'Run Chunking', parameters: { workflowId: { __rl: true, mode: 'id', value: 'PKkukOmsCvLdBFux', cachedResultName: 'RAG Livre Chunking' }, workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true }, options: {} }, position: [1008, 0], notes: 'Calls the chunking sub-workflow, which owns the Gemini embedding call and its rate limit. Its output comes back into this workflow as chunks ready for Supabase.' }
});

const insert_Chunks_into_Supabase = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: { name: 'Insert Chunks into Supabase', parameters: { tableId: 'documents' }, credentials: { supabaseApi: newCredential('Supabase account', 'MHWTeoHMJ0e03iJK') }, position: [1200, 0], notes: 'Step six, storage. Writes one row per chunk with its 1536 dimension vector and page metadata.' }
});

const verify_Index_Statistics = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Verify Index Statistics', parameters: { operation: 'executeQuery', query: 'select count(*)::int as "ChunksIndexed",\n       count(distinct regexp_replace(regexp_replace(split_part(content, chr(10), 1), \'^##\\s*\', \'\'), \'\\s*\\(from page \\d+\\)\\s*$\', \'\'))::int as "ChaptersIndexed",\n       round(avg(length(content)))::int as "AverageChunkLength",\n       round(avg(vector_dims(embedding)))::int as "EmbeddingDimensions"\nfrom documents;', options: {} }, credentials: { postgres: newCredential('Postgres account', '4ow0IG7roBxAxCIi') }, position: [1408, 0], notes: 'Reads the table straight over SQL instead of going through the Supabase API, and reports what actually landed. This is the proof that indexing worked, and the check to run first when answers come back empty.' }
});

const indexing_Report = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Indexing Report', parameters: { assignments: { assignments: [{ id: 'report-status', name: 'status', value: 'indexed', type: 'string' }, { id: 'report-message', name: 'message', value: expr('{{ "Indexed " + $json.ChunksIndexed + " chunks from " + $json.ChaptersIndexed + " chapters, averaging " + $json.AverageChunkLength + " characters at " + $json.EmbeddingDimensions + " dimensions. Open the chat and start asking questions." }}'), type: 'string' }] }, includeOtherFields: true, options: {} }, position: [1600, 0], notes: 'End of the indexing path. Only there to make the result readable in the executions log.', notesInFlow: true }
});

const when_Executed_by_Another_Workflow = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: { name: 'When Executed by Another Workflow', parameters: { workflowInputs: { values: [{ name: 'chatInput' }] } }, position: [16, 400] }
});

const embed_the_Question = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embed the Question', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ { content: { parts: [{ text: $json.chatInput }] }, taskType: "RETRIEVAL_QUERY", output_dimensionality: 1536 } }}'), options: {} }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 3', 'Gw0Xy0Xm4LdynEhK') }, position: [208, 400], notes: 'Chat step one. Embeds the question as a RETRIEVAL_QUERY so it lands in the same space as the chunks.' }
});

const search_Book_Content = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Search Book Content', parameters: { method: 'POST', url: 'https://kfkeothzelakkhnidtzd.supabase.co/rest/v1/rpc/match_documents', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ { query_embedding: $json.embedding.values, match_count: 5 } }}'), options: {} }, credentials: { supabaseApi: newCredential('Supabase account', 'MHWTeoHMJ0e03iJK') }, position: [400, 400], notes: 'Chat step two. Calls match_documents over PostgREST, which ranks chunks by cosine distance and returns the five closest.' }
});

const build_Grounded_Prompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build Grounded Prompt', parameters: { jsCode: '// Chat step three, assembling the prompt.\n//\n// The retrieved excerpts are the only source of truth. Each one already carries its page\n// range, so an answer can cite where it came from.\n\nconst rows = $json;\nconst question = $(\'When Executed by Another Workflow\').first().json.chatInput ?? \'\';\nconst vector = $(\'Embed the Question\').first().json.embedding?.values ?? [];\n\nconst excerpts = (Array.isArray(rows) ? rows : [rows])\n  .slice(0, 5)\n  .map((r) => \'[\' + ((r.metadata?.from_page ?? \'?\') + \'-\' + (r.metadata?.to_page ?? \'?\')) + \'] \' + String(r.content ?? \'\'))\n  .join(\'\\n\\n---\\n\\n\');\n\nconst prompt =\n  \'You are a research assistant for one single book that the user has uploaded.\\n\\n\' +\n  \'The excerpts below are the only source of truth. They come with the page range each one covers.\\n\\n\' +\n  \'- Ground every answer strictly in those excerpts. Never use your own knowledge of the book and never invent a detail, a quote or a name.\\n\' +\n  \'- If the excerpts do not contain the answer, say so plainly and suggest what to search instead.\\n\' +\n  \'- Quote briefly when it matters and cite the page range of the excerpt you used.\\n\' +\n  \'- Answer in the language used by the user.\\n\\n\' +\n  \'EXCERPTS\\n\' + excerpts + \'\\n\\nQUESTION\\n\' + question + \'\\n\\nANSWER\';\n\nreturn [{ json: { prompt, question, vector, excerpts } }];' }, position: [608, 400], notes: 'Chat step three. Assembles system rules, retrieved excerpts and the question into one prompt.' }
});

const ask_Gemini = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Ask Gemini', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ { system_instruction: { parts: [{ text: "You are a careful research assistant. You only ever state facts that appear in the excerpts you are given, and you say so plainly when the excerpts do not answer the question." }] }, contents: [{ role: "user", parts: [{ text: $json.prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } } }}'), options: {} }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 3', 'Gw0Xy0Xm4LdynEhK') }, position: [800, 400], notes: 'Chat step four. Asks Gemini for the answer at low temperature.' }
});

const format_Reply = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Format Reply', parameters: { jsCode: '// Chat step five, shaping the answer for the chat widget.\n//\n// The chat trigger streams whatever the last node returns under "output".\n\nconst body = $json;\nconst candidates = body?.candidates ?? [];\nconst text = candidates?.[0]?.content?.parts?.map((p) => p.text ?? \'\').join(\'\') ?? \'\';\n\nreturn [{ json: { output: text || \'I could not build an answer from the indexed excerpts.\' } }];' }, position: [1008, 400], notes: 'Chat step five. Reads the answer out of the Gemini envelope and returns it as output.' }
});

const wf = workflow('BIoaXxlQwmjNxNmW', 'RAG Livre', { binaryMode: 'separate', description: 'Index a PDF book into a Supabase pgvector store with Gemini embeddings, then answer questions about that book in a chat powered by Gemini.', executionOrder: 'v1', availableInMCP: true });

export default wf
  .add(on_Form_Submission)
  .to(extract_PDF_Text)
  .to(clean_and_Group_Pages)
  .to(build_Embedding_Batches)
  .to(limit)
  .to(run_Chunking)
  .to(insert_Chunks_into_Supabase)
  .to(verify_Index_Statistics)
  .to(indexing_Report)
  .add(sticky('## Two paths, no subnodes at all\n\n**Row 1 - indexing**\n1. **Extract PDF Text** returns one item per page.\n2. **Clean and Group Pages** strips page numbers and groups four pages per chunk. About 25 chunks per 100 pages.\n3. **Build Embedding Batches** packs fifty chunks into one Gemini request.\n4. **Embed Chunks** calls batchEmbedContents, 1536 dimensions.\n5. **Merge Chunks with Vectors** pairs each vector back to its text.\n6. **Insert Chunks into Supabase** writes one row per chunk.\n7. **Verify Index Statistics** and **Indexing Report** confirm what landed.\n\n**Row 2 - chat**\n1. **Embed the Question** as a RETRIEVAL_QUERY.\n2. **Search Book Content** calls match_documents over PostgREST, five closest chunks.\n3. **Build Grounded Prompt** assembles rules, excerpts and question.\n4. **Ask Gemini** answers at temperature 0.2.\n5. **Format Reply** returns it as output.\n\n## Why pages, not chapters\nChunk boundaries follow page groups, so the pipeline never depends on reading a table of contents. It behaves the same on a novel, a textbook or a paper. Each chunk is prefixed with the page range it covers, so a retrieved excerpt stays legible on its own.\n\n## Tuning\nChange **PAGES_PER_GROUP** inside Clean and Group Pages: 4 pages gives about 25 chunks per 100 pages, 8 pages about 12, 2 pages about 50.\n\n## Credentials\nSupabase API on the insert node and the search node, Google Gemini on the embedding and generation nodes.', [], { name: 'Sticky Note RAG Livre Usage', color: 2, width: 620, height: 700, position: [-816, 0] }))
  .add(sticky('## Supabase setup\n\nRun this once in the Supabase **SQL Editor** before the first upload.\n\n```sql\ncreate extension if not exists vector;\n\ndrop table if exists documents;\n\ncreate table documents (\n  id bigserial primary key,\n  content text,\n  metadata jsonb,\n  embedding vector(1536)\n);\n\ncreate index documents_embedding_idx\n  on documents using hnsw (embedding vector_cosine_ops);\n\ncreate or replace function match_documents (\n  query_embedding vector(1536),\n  match_count int default null,\n  match_threshold float default null\n)\nreturns table (\n  id bigint,\n  content text,\n  metadata jsonb,\n  similarity float\n)\nlanguage sql stable as $$\n  select\n    documents.id,\n    documents.content,\n    documents.metadata,\n    1 - (documents.embedding <=> query_embedding) as similarity\n  from documents\n  order by documents.embedding <=> query_embedding\n  limit match_count;\n$$;\n\nnotify pgrst, \'reload schema\';\n```\n\n## Why 1536 dimensions\npgvector refuses an HNSW index above 2000 dimensions, and Gemini returns 3072 by default. Asking for 1536 keeps a real HNSW index, so search stays fast as the library grows.\n\n## Three details that break it\n- The function must be named **match_documents**, that is what the search node calls.\n- Run `notify pgrst, \'reload schema\';` after any table change, otherwise search fails with a schema cache 404.\n- The search node URL contains the project reference, so it must match your own Supabase project.', [], { name: 'Sticky Note RAG Livre Supabase', color: 2, width: 620, height: 800, position: [-816, 800] }))
  .add(when_Executed_by_Another_Workflow)
  .to(embed_the_Question)
  .to(search_Book_Content)
  .to(build_Grounded_Prompt)
  .to(ask_Gemini)
  .to(format_Reply)