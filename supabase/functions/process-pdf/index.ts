//process-pdf edge function

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.3";

const BATCH_SIZE = 100;

// Define the type for document sections to match the database enum
type DocumentSectionType =
  | "statements"
  | "notes"
  | "debt"
  | "assets"
  | "accounting"
  | "workingCapital"
  | "equity"
  | "obligations"
  | "financial"
  | "employee"
  | "reporting"
  | "currency"
  | "tax"
  | "operations"
  | "investments"
  | "transactions"
  | "liquidity"
  | "metrics"
  | "table"
  | "general";

// Updated financial keywords object to match new section types
const FINANCIAL_KEYWORDS = {
  statements: [
    "financial statements?",
    "balance sheet",
    "income statement",
    "cash flow statement",
    "statement of financial position",
    "profit and loss",
    "comprehensive income",
  ],
  notes: [
    "notes to.*statements?",
    "financial footnotes",
    "disclosures",
    "accounting policies",
  ],
  debt: [
    "debt",
    "loans?",
    "borrowings?",
    "credit facilities",
    "bonds",
    "notes payable",
  ],
  assets: [
    "assets?",
    "property",
    "equipment",
    "inventory",
    "receivables",
    "intangible assets?",
  ],
  accounting: [
    "accounting policies",
    "accounting standards?",
    "accounting principles",
    "gaap",
    "ifrs",
  ],
  workingCapital: [
    "working capital",
    "current assets?",
    "current liabilities",
    "operating capital",
  ],
  equity: [
    "shareholders?['']? equity",
    "stock",
    "shares?",
    "capital stock",
    "retained earnings",
  ],
  obligations: [
    "obligations?",
    "commitments?",
    "contingent liabilities",
    "guarantees?",
  ],
  financial: ["financial", "financing", "monetary", "fiscal"],
  employee: [
    "employee benefits?",
    "compensation",
    "pension",
    "retirement",
    "stock options",
  ],
  reporting: ["reporting", "disclosure", "segment", "business units?"],
  currency: ["currency", "foreign exchange", "forex", "exchange rates?"],
  tax: [
    "tax(?:es|ation)?",
    "income tax",
    "deferred tax",
    "tax assets?",
    "tax liabilities",
  ],
  operations: ["operations?", "operating activities", "business operations?"],
  investments: [
    "investments?",
    "securities",
    "financial instruments?",
    "derivatives",
  ],
  transactions: [
    "transactions?",
    "business combinations?",
    "acquisitions?",
    "disposals?",
  ],
  liquidity: ["liquidity", "cash", "cash equivalents", "solvency"],
  metrics: [
    // Numbers with currency symbols
    "\\$\\d+(?:,\\d{3})*(?:\\.\\d{2})?(?:\\s*(?:million|billion|trillion|M|B|T))?",
    // Percentages
    "\\d+(?:\\.\\d{1,2})?\\s*%",
    // Large numbers without currency symbols
    "\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?\\s*(?:million|billion|trillion|M|B|T)",
    // Financial ratios
    "ratio",
    "margin",
    "return on",
    "ROI",
    "ROE",
    "ROA",
    "EPS",
    "P/E",
    "EBITDA",
  ],
};


function isFinancialTable(text: string): boolean {
  // Split text into lines and remove empty lines
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length < 3) return false;

  // Look for table title/header patterns
  const hasTableHeader = lines.some(line => 
    /^(?:The following table|.*summarizes|.*shows).*:/.test(line) ||
    /Three Months Ended|Year Ended|Nine Months Ended/.test(line)
  );

  // Check for financial column headers
  const hasColumnHeaders = lines.some(line =>
    /(19|20)\d{2}\s*(19|20)\d{2}/.test(line) ||  // Years
    /March|June|September|December/.test(line) ||  // Months
    /\$\s*\d+/.test(line)  // Dollar amounts
  );

  if (!hasTableHeader && !hasColumnHeaders) return false;

  // Count lines with proper financial data formatting
  const financialDataLines = lines.filter(line => {
    // Look for patterns common in these financial tables:
    // - Dollar amounts with proper alignment
    // - Parentheses for negative numbers
    // - Indented row labels with trailing numbers
    return (
      /^\s*\$\s*\d+,\d+/.test(line) ||  // Aligned dollar amounts
      /\(\$?\d+(?:,\d{3})*(?:\.\d+)?\)/.test(line) ||  // Parenthetical numbers
      /^\s*[A-Z].*\d+$/.test(line) ||  // Label with trailing number
      /^\s*[A-Z][a-zA-Z\s-]+\s+\$?\d/.test(line)  // Indented label with number
    );
  }).length;

  // Calculate the ratio of financial data lines to total lines
  const financialLineRatio = financialDataLines / lines.length;

  // Check for consistent column alignment using dollar signs or numbers
  const hasConsistentAlignment = (() => {
    const dollarPositions = new Set();
    const numberPositions = new Set();

    lines.forEach(line => {
      // Find positions of dollar signs
      let match = line.match(/\$\s*\d/);
      if (match) {
        dollarPositions.add(match.index);
      }
      // Find positions of aligned numbers
      match = line.match(/\d+,\d{3}/);
      if (match) {
        numberPositions.add(match.index);
      }
    });

    // If we have consistent alignment, we should have a small number of unique positions
    return dollarPositions.size > 0 && dollarPositions.size <= 3 &&
           numberPositions.size > 0 && numberPositions.size <= 4;
  })();

  // Check for common financial table rows
  const hasFinancialRowLabels = lines.some(line => 
    /(?:Total|Beginning|Ending|Net|Cost of|Sales|General|Operating|Income|Loss)/i.test(line)
  );

  // Final determination
  return (
    hasConsistentAlignment &&
    hasFinancialRowLabels &&
    financialLineRatio >= 0.3 && // At least 30% of lines should contain financial data
    (hasTableHeader || hasColumnHeaders)
  );
}

function extractCompleteTable(text: string): string {
  const lines = text.split('\n');
  let startIndex = -1;
  let endIndex = -1;

  // Find table start
  for (let i = 0; i < lines.length; i++) {
    if (
      /^(?:The following table|.*summarizes|.*shows).*:/.test(lines[i]) ||
      /Three Months Ended|Year Ended|Nine Months Ended/.test(lines[i]) ||
      /^\s*\$\s*\d+,\d+/.test(lines[i])
    ) {
      startIndex = Math.max(0, i - 1); // Include the line before for context
      break;
    }
  }

  // Find table end
  for (let i = lines.length - 1; i >= 0; i--) {
    if (
      /^\s*Total\s+(?:ending|assets|liabilities)/.test(lines[i]) ||
      /^={2,}$/.test(lines[i]) ||  // Double underline
      /\$\s*\d+,\d+\s*$/.test(lines[i]) // Last number in table
    ) {
      endIndex = Math.min(lines.length - 1, i + 2); // Include the line after for context
      break;
    }
  }

  if (startIndex === -1 || endIndex === -1) {
    return text;
  }

  return lines.slice(startIndex, endIndex + 1).join('\n');
}

// Updated function to identify financial sections
function identifyFinancialSection(text: string): DocumentSectionType {
  // First check for tables
  const tablePattern = /(\n[\s\t]*[\d$%(),.-]+(?:\s+[\d$%(),.-]+){2,}\s*\n)/;
  if (tablePattern.test(text)) {
    return "table";
  }

  // Check for section matches
  for (const [section, patterns] of Object.entries(FINANCIAL_KEYWORDS)) {
    const sectionPattern = new RegExp(patterns.join("|"), "i");
    if (sectionPattern.test(text)) {
      return section as DocumentSectionType;
    }
  }

  // Return 'general' if no specific section is identified
  return "general";
}

// Function to extract financial metrics
function extractFinancialMetrics(text: string): string[] {
  const metricsPattern = new RegExp(FINANCIAL_KEYWORDS.metrics.join("|"), "gi");
  return Array.from(new Set(text.match(metricsPattern) || []));
}

// Function to extract keywords based on all patterns
function extractKeywords(text: string): string[] {
  const allPatterns = Object.values(FINANCIAL_KEYWORDS).flat();
  const keywordPattern = new RegExp(allPatterns.join("|"), "gi");
  return Array.from(
    new Set(
      (text.match(keywordPattern) || [])
        .map((k) => k.toLowerCase())
        .filter((k) => k.length > 2) // Filter out very short matches
    )
  );
}


function cleanPageText(text: string): string {
  // Remove the Table of Contents link and any surrounding whitespace
  return text.replace(/Table of Contents\s*/, '').trim();
}

function enhanceTableContent(content: string): string {
  return `[FINANCIAL TABLE]\nThis is a financial data table containing numerical information and financial metrics.\n\n${content}`;
}

// Updated splitIntoFinancialChunks function remains the same but uses new types
function splitIntoFinancialChunks(text: string): Array<{
  content: string;
  section: DocumentSectionType;
  metrics: string[];
  keywords: string[];
}> {
  // Clean the text first
  const cleanedText = cleanPageText(text);

  // First check if the entire text is a financial table
  if (isFinancialTable(cleanedText)) {
    const tableContent = extractCompleteTable(cleanedText);
    return [{
      content: tableContent,
      section: "table",
      metrics: extractFinancialMetrics(tableContent),
      keywords: extractKeywords(tableContent)
    }];
  }

  // If not a table, split into sections
  const sections = cleanedText.split(/(?:\r?\n){2,}/);
  let chunks: Array<{
    content: string;
    section: DocumentSectionType;
    metrics: string[];
    keywords: string[];
  }> = [];

  // Function to get surrounding context
  const getSurroundingContext = (
    sections: string[],
    currentIndex: number,
    windowSize: number = 1
  ) => {
    const start = Math.max(0, currentIndex - windowSize);
    const end = Math.min(sections.length, currentIndex + windowSize + 1);
    return sections.slice(start, end).join("\n\n");
  };

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (section.trim().length === 0) continue;

    // Get surrounding context
    const contextualSection = getSurroundingContext(sections, i);
    
    // Check if this section is a table
    if (isFinancialTable(contextualSection)) {
      const tableContent = extractCompleteTable(contextualSection);
      const enhancedTableContent = enhanceTableContent(tableContent);
      chunks.push({
        content: enhancedTableContent,
        section: "table",
        metrics: extractFinancialMetrics(tableContent),
        keywords: [...extractKeywords(tableContent), "table", "tables", "financial table", "financial data"]
      });
      // Skip the next few sections that were part of the table
      i += contextualSection.split(/\n/).length - 1;
      continue;
    }

    // If not a table, process as regular text
    const sectionType = identifyFinancialSection(contextualSection);
    const metrics = extractFinancialMetrics(contextualSection);
    const keywords = extractKeywords(contextualSection);

    // Only create a chunk if we found relevant financial content
    if (metrics.length > 0 || keywords.length > 0) {
      chunks.push({
        content: contextualSection.trim(),
        section: sectionType,
        metrics: metrics,
        keywords: keywords,
      });
    }
  }

  return chunks;
}







async function processBatch(
  chunks: Array<{
    content: string;
    section: DocumentSectionType;
    metrics: string[];
    keywords: string[];
  }>,
  model: any,
  documentId: string,
  pageNumber: number,
  supabase: any
) {
  try {
    // Generate embeddings with enhanced context
    const embeddingResult = await model.batchEmbedContents({
      requests: chunks.map((chunk) => ({
        model: "models/text-embedding-004",
        content: {
          role: "user",
          parts: [
            {
              text: `
            SECTION: ${chunk.section}
            METRICS: ${chunk.metrics.join(", ")}
            KEYWORDS: ${chunk.keywords.join(", ")}
            CONTENT: ${chunk.content}
          `,
            },
          ],
        },
        taskType: "RETRIEVAL_DOCUMENT",
      })),
    });

    // Store chunks with enhanced metadata
    const chunksToInsert = chunks.map((chunk, idx) => ({
      document_id: documentId,
      content: chunk.content,
      embedding: embeddingResult.embeddings[idx].values,
      page_number: pageNumber,
      section_type: chunk.section,
      financial_metrics: chunk.metrics,
      keywords: chunk.keywords,
    }));

    const { error: insertError } = await supabase
      .from("document_chunks")
      .insert(chunksToInsert);

    if (insertError) throw insertError;
  } catch (error) {
    console.error("Error in processBatch:", error);
    throw error;
  }
}



async function handleRequest(req: Request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Declare documentId in outer scope
  let documentId: string | undefined = undefined;

  try {
    const { documentId: docId, pages } = await req.json();
    // Assign to outer scope variable
    documentId = docId;

    if (!documentId || !pages) {
      throw new Error("DocumentId and pages are required");
    }

    const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

    // Update document status to processing
    await supabase
      .from("documents")
      .update({ processed: false, processing_error: null })
      .eq("id", documentId);

      for (const page of pages) {
        // Clean the page text before processing
        const cleanedPageText = cleanPageText(page.text);
        
        // Split text into financially-aware chunks using cleaned text
        const chunks = splitIntoFinancialChunks(cleanedPageText);
    
        if (chunks.length === 0) continue;
    
        // Process chunks in batches
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          const batchChunks = chunks.slice(i, i + BATCH_SIZE);
          await processBatch(
            batchChunks,
            model,
            documentId,
            page.pageNumber,
            supabase
          );
        }
      }

    // Update document status to processed
    await supabase
      .from("documents")
      .update({ processed: true })
      .eq("id", documentId);

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Processing error:", error);

    // Check if documentId is defined before using it
    if (typeof documentId !== "undefined") {
      await supabase
        .from("documents")
        .update({
          processed: true,
          processing_error: error.message,
        })
        .eq("id", documentId);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
}

serve(handleRequest);