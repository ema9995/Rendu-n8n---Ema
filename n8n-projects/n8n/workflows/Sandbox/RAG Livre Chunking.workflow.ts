const chunking_Trigger = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: { name: 'Chunking Trigger', parameters: { inputSource: 'passthrough' }, notes: 'Receives the embedding batches prepared by the main workflow, one item per batch.', notesInFlow: true }
});

const embed_Chunks = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embed Chunks', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ { requests: ($json.requests ?? $json.data?.requests ?? []).map((r) => r.request) } }}'), options: { batching: { batch: { batchSize: 1, batchInterval: 65000 } } } }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 3', 'Gw0Xy0Xm4LdynEhK') }, position: [200, 0], notes: 'Calls Gemini batchEmbedContents once per batch. Kept in its own workflow so the embedding step, which needs its own rate limit and its own credentials, can be retried without touching the rest of the pipeline.', notesInFlow: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }
});

const merge_Chunks_with_Vectors = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Merge Chunks with Vectors', parameters: { mode: 'runOnceForAllItems', jsCode: '\n// The Gemini response replaces the item, so the chunk metadata is read back from\n// the trigger input, matched by batch position.\nconst RAW = $input.all();\nconst batches = $(\'Chunking Trigger\').all();\n\nconst out = [];\n\nfor (let b = 0; b < RAW.length; b++) {\n  const body = RAW[b].json;\n  const vectors = body.embeddings ?? body.data?.embeddings ?? [];\n  const requests = batches[b]?.json.requests ?? [];\n\n  for (let i = 0; i < vectors.length; i++) {\n    const entry = requests[i];\n    if (!entry || !vectors[i]?.values) continue;\n    const group = entry.group ?? entry;\n    out.push({\n      json: {\n        content: group.text,\n        metadata: {\n          chunk: group.chunk,\n          from_page: group.fromPage,\n          to_page: group.toPage,\n          chars: group.chars,\n        },\n        embedding: vectors[i].values,\n      },\n    });\n  }\n}\n\nreturn out;\n' }, position: [400, 0], notes: 'Pairs each vector back to its chunk text and page metadata, one row per chunk, ready for the Supabase insert that happens in the main workflow.', notesInFlow: true }
});

const wf = workflow('PKkukOmsCvLdBFux', 'RAG Livre Chunking', { executionOrder: 'v1', availableInMCP: true });

export default wf
  .add(chunking_Trigger)
  .to(embed_Chunks)
  .to(merge_Chunks_with_Vectors)