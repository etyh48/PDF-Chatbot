# SEC Form 10-Q RAG Model

A RAG (Retrieval-Augmented Generation) model specifically designed for analyzing and querying SEC Form 10-Q documents. This application allows users to upload PDF documents of 10-Q forms and interact with them through natural language queries.

## Features

- PDF document processing and text extraction
- Natural language querying of 10-Q documents
- Vector storage using Supabase
- React-based frontend interface
- Document chat functionality

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Supabase account


## Supabase Setup

1. Create a new Supabase project at [https://app.supabase.com](https://app.supabase.com)

2. Enable Vector Storage:
   ```sql
   -- Enable the pgvector extension to work with embedding vectors
   create extension vector;
   ```

3. Create the required tables:
   ```sql
   -- Create documents table
   create table documents (
     id bigint primary key generated always as identity,
     filename text not null,
     file_url text not null,
     total_pages int4 not null,
     created_at timestamptz default now(),
     updated_at timestamptz default now(),
     file_type text,
     file_size int8,
     processed bool default false,
     processing_error text
   );

   -- Create document_chunks table
   create table document_chunks (
     id bigint primary key generated always as identity,
     document_id int8 references documents(id),
     content text not null,
     embedding vector(1536),
     page_number int4 not null,
     financial_metrics text,
     keywords text,
     created_at timestamptz default now(),
     updated_at timestamptz default now(),
     section_type document_section_type
   );

   -- Create chats table
   create table chats (
     id bigint primary key generated always as identity,
     created_at timestamptz default now(),
     title text,
     document_ids _int8
   );

   -- Create chat_messages table
   create table chat_messages (
     id bigint primary key generated always as identity,
     chat_id int8 references chats(id),
     query text,
     response text,
     type text,
     context jsonb,
     document_ids _int8,
     created_at timestamptz default now()
   );

   -- Create enum type for document sections
   create type document_section_type as enum ('statements',
    'notes',
    'debt',
    'assets',
    'accounting',
    'workingCapital',
    'equity',
    'obligations',
    'financial',
    'employee',
    'reporting',
    'currency',
    'tax',
    'operations',
    'investments',
    'transactions',
    'liquidity',
    'metrics',
    'table',
    'general');
   ```

4. Create a `.env` file in the root directory and add your Supabase credentials:
   ```
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

## Installation

1. Clone the repository:
   ```bash
   git clone [your-repository-url]
   cd [repository-name]
   ```

2. Install backend dependencies:
   ```bash
   npm install
   ```

3. Navigate to the frontend directory and install dependencies:
   ```bash
   cd frontend
   npm install
   ```

## Running the Application

1. Start the frontend development server:
   ```bash
   cd frontend
   npm start
   ```
   The application will be available at `http://localhost:3000`

2. In a separate terminal, start the backend server:
   ```bash
   # From the root directory
   npm run start
   ```

## Project Structure

```
├── frontend/               # React frontend application
├── functions/             # Serverless functions
├── src/                   # Source files
├── package.json          # Project dependencies
└── README.md            # This file
```

## Usage

1. Upload a Form 10-Q PDF document through the interface
2. Wait for the document to be processed and embedded
3. Create a new chat and select documents to query
4. Get AI-powered responses based on the document content

## Adjustment of Relevant Sources
To change the number of relevant sources shown at the end of each response, edit the following code on line 56 of the process-query edge function.
```
let { data: vectorChunks, error: searchError } = await supabase.rpc(
      "match_document_chunks",
      {
        query_embedding: queryEmbedding,
        match_document_ids: documentIds,
        match_threshold: similarityThreshold,
        match_count: 14
      }
    );
```
It is currently set to 14



## Acknowledgments

- Built with React
- Powered by Supabase
- Uses Gemini's text-embedding-004 and gemini-1.5-flash-8b
