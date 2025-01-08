import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.3";

async function handleRequest(req: Request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, documentIds } = await req.json();
    console.log("Received request with:", { query, documentIds });

    if (!query || !documentIds || !documentIds.length) {
      throw new Error("Query and at least one documentId are required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Enhance query for table matching
    let enhancedQuery = query;
    if (query.toLowerCase().includes('table') || query.toLowerCase().includes('tables')) {
      enhancedQuery = `[FINANCIAL TABLE] ${query}`;
    }

    // Generate embedding for enhanced query
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const embeddingResult = await model.batchEmbedContents({
      requests: [{
        model: "models/text-embedding-004",
        content: { role: "user", parts: [{ text: enhancedQuery }] },
        taskType: "RETRIEVAL_QUERY",
      }],
    });

    const queryEmbedding = embeddingResult.embeddings[0].values;

    // Adjust similarity threshold for table queries
    const similarityThreshold = query.toLowerCase().includes('table') ? 0.2 : 0.3;

    let { data: vectorChunks, error: searchError } = await supabase.rpc(
      "match_document_chunks",
      {
        query_embedding: queryEmbedding,
        match_document_ids: documentIds,
        match_threshold: similarityThreshold,
        match_count: 14
      }
    );

    if (searchError) {
      console.error("Search error:", searchError);
      throw searchError;
    }

    console.log("Retrieved chunks:", vectorChunks?.length || 0);

    // If no chunks found with vector search, try fallback
    if (!vectorChunks || vectorChunks.length === 0) {
      console.log("No vector chunks found, trying fallback query");
      const { data: fallbackChunks, error: fallbackError } = await supabase
        .from("document_chunks")
        .select("*")
        .in("document_id", documentIds)
        .limit(10);

      if (fallbackError) {
        console.error("Fallback error:", fallbackError);
        throw fallbackError;
      }

      console.log("Fallback chunks found:", fallbackChunks?.length || 0);
      vectorChunks = fallbackChunks;
    }

    if (!vectorChunks || vectorChunks.length === 0) {
      console.log("No chunks found at all");
      return new Response(
        JSON.stringify({
          answer: "I couldn't find any relevant information in the selected documents.",
          context: []
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // If the query is about tables, prioritize table sections in the results
    if (query.toLowerCase().includes('table') || query.toLowerCase().includes('tables')) {
      vectorChunks = vectorChunks.sort((a, b) => {
        if (a.section_type === 'table' && b.section_type !== 'table') return -1;
        if (a.section_type !== 'table' && b.section_type === 'table') return 1;
        return (b.similarity || 0) - (a.similarity || 0);
      });
    } else {
      // Sort chunks by similarity for non-table queries
      vectorChunks = vectorChunks.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    }

    const relevantContext = vectorChunks
      .map(chunk => `From document ${chunk.document_id}:\n${chunk.content}`)
      .join("\n\n");

    const chatModel = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-8b",
      generationConfig: {
        maxOutputTokens: 2000,
        temperature: 0.6,
      },
    });

    // Create appropriate prompt based on query type
    let prompt = `As a financial analyst, analyze the following from a financial document:

"${relevantContext}"

Question: ${query}

Please provide a detailed, sectioned response that:`;

    if (query.toLowerCase().includes('table')) {
      prompt += `
1. Focuses on analyzing and explaining the financial tables in the document.
2. Explains the relationships between different numbers in the tables.
3. Highlights any important trends or patterns visible in the tabular data.
`;
    } else {
      prompt += `
1. Directly answers the question using specific data from the provided context.
2. Presents exact figures without rounding off (e.g., if the data is in millions or billions, ensure this is clear and accurate).
3. Highlights important financial details or trends in sections.
4. Notes any discrepancies, missing data, or ambiguities in the context.
5. Does not include assumptions or extrapolated data unless explicitly instructed.`;
    }

    prompt += `

DO not hallucinate, know which company this document is about.
DO not present in table format.

Ensure the response gives full information.`;

    const result = await chatModel.generateContent(prompt);
    const answer = result.response.text();

    // Format context for response
    const formattedContext = vectorChunks.map(chunk => ({
      content: chunk.content,
      page_number: chunk.page_number,
      similarity: chunk.similarity || 0,
      documentId: chunk.document_id,
      section_type: chunk.section_type
    }));

    console.log("Returning response with context count:", formattedContext.length);

    return new Response(
      JSON.stringify({
        answer,
        context: formattedContext
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error) {
    console.error("Processing error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
}

serve(handleRequest);